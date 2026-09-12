package tunnel

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"github.com/hashicorp/yamux"
	"github.com/sirupsen/logrus"
)

// Client 运行于内网落地端：主动连接入口 VPS，接收反向穿透流并泵入本地 Sing-box
type Client struct {
	cfg            Config
	log            *logrus.Entry
	allowedTargets map[int]struct{}
	session        *yamux.Session
	sessionMu      sync.RWMutex
	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
}

// NewClient 创建穿透客户端
func NewClient(cfg Config, log *logrus.Entry) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	allowed := make(map[int]struct{})
	for _, m := range cfg.Mappings {
		allowed[m.TargetPort] = struct{}{}
	}
	return &Client{
		cfg:            cfg,
		log:            log.WithField("tunnel_client", cfg.ID),
		allowedTargets: allowed,
	}, nil
}

// Start 启动自愈长连接协程
func (c *Client) Start(parent context.Context) error {
	c.ctx, c.cancel = context.WithCancel(parent)
	c.wg.Add(1)
	go c.supervise()
	return nil
}

// supervise 指数退避自愈状态机：保证即使 PPPoE 重拨或网络闪断也能秒级自愈
func (c *Client) supervise() {
	defer c.wg.Done()

	backoff := 1 * time.Second
	const maxBackoff = 30 * time.Second

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		c.log.Infof("connecting to tunnel server: %s", c.cfg.ServerAddr)
		session, err := c.dialAndHandshake()
		if err != nil {
			c.log.WithError(err).Warnf("failed to connect tunnel server, retrying in %v...", backoff)
			select {
			case <-c.ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			continue
		}

		// 连接成功，重置退避时间
		backoff = 1 * time.Second
		c.log.Infof("tunnel session established with %s", c.cfg.ServerAddr)

		c.sessionMu.Lock()
		c.session = session
		c.sessionMu.Unlock()

		// 处理传入流，阻塞直至会话关闭
		c.acceptStreams(session)

		c.sessionMu.Lock()
		if c.session == session {
			c.session = nil
		}
		c.sessionMu.Unlock()
		_ = session.Close()

		c.log.Warn("tunnel session disconnected, attempting self-healing reconnect...")
	}
}

// dialAndHandshake 拨号建立 TLS 长连接并完成鉴权握手
func (c *Client) dialAndHandshake() (*yamux.Session, error) {
	dialer := &net.Dialer{Timeout: DefaultConnectionTimeout}
	tlsCfg := DefaultClientTLSConfig()

	conn, err := tls.DialWithDialer(dialer, "tcp", c.cfg.ServerAddr, tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("tls dial %s: %w", c.cfg.ServerAddr, err)
	}

	_ = conn.SetDeadline(time.Now().Add(DefaultConnectionTimeout))

	// 发送握手鉴权请求
	req := HandshakeRequest{
		Magic:     ProtocolMagic,
		Version:   ProtocolVersion,
		TunnelID:  c.cfg.ID,
		Secret:    c.cfg.Secret,
		Timestamp: time.Now().Unix(),
	}
	if err := json.NewEncoder(conn).Encode(req); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("send handshake: %w", err)
	}

	// 接收握手响应
	var resp HandshakeResponse
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("receive handshake response: %w", err)
	}
	if resp.Status != "OK" {
		_ = conn.Close()
		return nil, fmt.Errorf("handshake rejected by server: status=%s message=%s", resp.Status, resp.Message)
	}

	// 握手成功，清空超时，包装为 Yamux Client Session
	_ = conn.SetDeadline(time.Time{})

	yConfig := yamux.DefaultConfig()
	yConfig.EnableKeepAlive = true
	yConfig.KeepAliveInterval = DefaultKeepAliveInterval
	yConfig.LogOutput = io.Discard

	session, err := yamux.Client(conn, yConfig)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("create yamux client: %w", err)
	}

	return session, nil
}

// acceptStreams 循环接收服务端分配的穿透 Stream
func (c *Client) acceptStreams(session *yamux.Session) {
	for {
		stream, err := session.AcceptStream()
		if err != nil {
			select {
			case <-c.ctx.Done():
				return
			default:
				c.log.WithError(err).Debug("yamux session accept closed")
				return
			}
		}

		go c.handleIncomingStream(stream)
	}
}

// handleIncomingStream 读取目标端口并将数据泵入本地落地 Sing-box
func (c *Client) handleIncomingStream(stream io.ReadWriteCloser) {
	defer stream.Close()

	// 读取 4 字节目标端口头
	var portBuf [4]byte
	if _, err := io.ReadFull(stream, portBuf[:]); err != nil {
		c.log.WithError(err).Warn("failed to read target port header from stream")
		return
	}
	targetPort := int(binary.BigEndian.Uint32(portBuf[:]))

	// 安全校验：该端口必须在允许的落地端口集合中
	if _, ok := c.allowedTargets[targetPort]; !ok {
		c.log.Warnf("rejected unauthorized target port: %d", targetPort)
		return
	}

	// 建立到本地 Sing-box 目标端口的 TCP 连接 (127.0.0.1:targetPort)
	localAddr := fmt.Sprintf("127.0.0.1:%d", targetPort)
	localConn, err := net.DialTimeout("tcp", localAddr, 5*time.Second)
	if err != nil {
		c.log.WithError(err).Warnf("failed to dial local landing singbox at %s", localAddr)
		return
	}
	defer localConn.Close()

	// 双向零拷贝数据泵
	relay(localConn, stream)
}

// Close 平滑关闭客户端
func (c *Client) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	c.sessionMu.Lock()
	if c.session != nil {
		_ = c.session.Close()
		c.session = nil
	}
	c.sessionMu.Unlock()
	c.wg.Wait()
}
