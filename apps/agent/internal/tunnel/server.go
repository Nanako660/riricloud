package tunnel

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"sync"
	"time"

	"github.com/hashicorp/yamux"
	"github.com/sirupsen/logrus"
)

// Server 运行于入口 VPS 端：监听公网穿透端口，并为每条线路在本地 127.0.0.1 开启桥接监听
type Server struct {
	cfg       Config
	log       *logrus.Entry
	tlsCert   tls.Certificate
	listener  net.Listener
	bridges   map[int]net.Listener // localPort -> Listener
	session   *yamux.Session
	sessionMu sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// NewServer 创建穿透服务端
func NewServer(cfg Config, log *logrus.Entry) (*Server, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	cert, err := GenerateSelfSignedCert()
	if err != nil {
		return nil, fmt.Errorf("generate self-signed cert: %w", err)
	}
	return &Server{
		cfg:     cfg,
		log:     log.WithField("tunnel_server", cfg.ID),
		tlsCert: cert,
		bridges: make(map[int]net.Listener),
	}, nil
}

// Start 启动公网穿透监听与所有本地线路桥接监听
func (s *Server) Start(parent context.Context) error {
	s.ctx, s.cancel = context.WithCancel(parent)

	// 1. 启动公网 TLS 穿透端口监听
	tlsCfg := DefaultServerTLSConfig(s.tlsCert)
	addr := fmt.Sprintf("0.0.0.0:%d", s.cfg.ListenPort)
	listener, err := tls.Listen("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("listen tunnel port %s: %w", addr, err)
	}
	s.listener = listener
	s.log.Infof("tunnel server listening on %s", addr)

	// 2. 启动各线路本地 Bridge 监听 (127.0.0.1:localPort)
	for _, m := range s.cfg.Mappings {
		bridgeAddr := fmt.Sprintf("127.0.0.1:%d", m.LocalPort)
		bListener, err := net.Listen("tcp", bridgeAddr)
		if err != nil {
			s.Close()
			return fmt.Errorf("listen bridge port %s: %w", bridgeAddr, err)
		}
		s.bridges[m.LocalPort] = bListener
		s.log.Infof("tunnel bridge listening on %s -> remote:%d (line=%s)", bridgeAddr, m.TargetPort, m.LineID)

		s.wg.Add(1)
		go s.acceptBridge(bListener, m.TargetPort)
	}

	s.wg.Add(1)
	go s.acceptTunnelClients()

	return nil
}

// acceptTunnelClients 处理来自落地端的穿透长连接
func (s *Server) acceptTunnelClients() {
	defer s.wg.Done()
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.ctx.Done():
				return
			default:
				s.log.WithError(err).Warn("accept tunnel client error")
				time.Sleep(100 * time.Millisecond)
				continue
			}
		}

		go s.handleClientHandshake(conn)
	}
}

// handleClientHandshake 鉴权并协商 Yamux 会话
func (s *Server) handleClientHandshake(conn net.Conn) {
	defer func() {
		if r := recover(); r != nil {
			s.log.Errorf("panic in handleClientHandshake: %v", r)
			_ = conn.Close()
		}
	}()

	_ = conn.SetDeadline(time.Now().Add(DefaultConnectionTimeout))

	var req HandshakeRequest
	if err := json.NewDecoder(conn).Decode(&req); err != nil {
		s.log.WithError(err).Warn("invalid handshake request from client")
		_ = conn.Close()
		return
	}

	// 鉴权校验
	if req.Magic != ProtocolMagic || req.Version != ProtocolVersion {
		s.sendHandshakeResponse(conn, "ERROR", "unsupported protocol")
		_ = conn.Close()
		return
	}
	if req.TunnelID != s.cfg.ID || req.Secret != s.cfg.Secret {
		s.log.Warn("handshake unauthorized: secret or tunnel id mismatch")
		s.sendHandshakeResponse(conn, "ERROR", "unauthorized")
		_ = conn.Close()
		return
	}
	now := time.Now().Unix()
	if math.Abs(float64(now-req.Timestamp)) > float64(MaxClockSkew/time.Second) {
		s.log.Warn("handshake timestamp expired")
		s.sendHandshakeResponse(conn, "ERROR", "timestamp skew too large")
		_ = conn.Close()
		return
	}

	if err := s.sendHandshakeResponse(conn, "OK", ""); err != nil {
		_ = conn.Close()
		return
	}

	// 清除超时限制，升级为 Yamux Session
	_ = conn.SetDeadline(time.Time{})

	yConfig := yamux.DefaultConfig()
	yConfig.EnableKeepAlive = true
	yConfig.KeepAliveInterval = DefaultKeepAliveInterval
	yConfig.LogOutput = io.Discard

	session, err := yamux.Server(conn, yConfig)
	if err != nil {
		s.log.WithError(err).Error("failed to create yamux server session")
		_ = conn.Close()
		return
	}

	s.sessionMu.Lock()
	if s.session != nil && !s.session.IsClosed() {
		s.log.Info("closing previous active session for new client connection")
		_ = s.session.Close()
	}
	s.session = session
	s.sessionMu.Unlock()

	s.log.Infof("tunnel client authenticated and session established: remote=%s", conn.RemoteAddr())

	// 阻塞等待该会话退出
	<-session.CloseChan()
	s.sessionMu.Lock()
	if s.session == session {
		s.session = nil
	}
	s.sessionMu.Unlock()
	s.log.Infof("tunnel client session closed: remote=%s", conn.RemoteAddr())
}

func (s *Server) sendHandshakeResponse(conn net.Conn, status, message string) error {
	resp := HandshakeResponse{Status: status, Message: message}
	return json.NewEncoder(conn).Encode(resp)
}

// acceptBridge 接收来自本地 Sing-box 的代理中继请求，通过 Yamux Stream 穿透至落地端
func (s *Server) acceptBridge(listener net.Listener, targetPort int) {
	defer s.wg.Done()
	for {
		localConn, err := listener.Accept()
		if err != nil {
			select {
			case <-s.ctx.Done():
				return
			default:
				s.log.WithError(err).Warn("accept local bridge connection error")
				time.Sleep(100 * time.Millisecond)
				continue
			}
		}

		go s.dispatchStream(localConn, targetPort)
	}
}

// dispatchStream 将本地连接转发至远端 Stream
func (s *Server) dispatchStream(localConn net.Conn, targetPort int) {
	defer localConn.Close()

	s.sessionMu.RLock()
	session := s.session
	s.sessionMu.RUnlock()

	if session == nil || session.IsClosed() {
		s.log.Warn("dropping bridge connection: tunnel client is offline")
		return
	}

	stream, err := session.OpenStream()
	if err != nil {
		s.log.WithError(err).Warn("failed to open yamux stream to landing host")
		return
	}
	defer stream.Close()

	// 写入 4 字节的目标端口头 (BigEndian)
	var portBuf [4]byte
	binary.BigEndian.PutUint32(portBuf[:], uint32(targetPort))
	if _, err := stream.Write(portBuf[:]); err != nil {
		s.log.WithError(err).Warn("failed to write target port to stream")
		return
	}

	// 双向零拷贝数据泵
	relay(localConn, stream)
}

// Close 平滑关闭服务端及所有监听
func (s *Server) Close() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.listener != nil {
		_ = s.listener.Close()
	}
	for _, b := range s.bridges {
		_ = b.Close()
	}
	s.sessionMu.Lock()
	if s.session != nil {
		_ = s.session.Close()
		s.session = nil
	}
	s.sessionMu.Unlock()
	s.wg.Wait()
}

// relay 双向拷贝数据
func relay(c1, c2 io.ReadWriteCloser) {
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		_, _ = io.Copy(c1, c2)
		_ = c1.Close()
	}()

	go func() {
		defer wg.Done()
		_, _ = io.Copy(c2, c1)
		_ = c2.Close()
	}()

	wg.Wait()
}
