package tunnel

import (
	"context"
	"fmt"
	"io"
	"net"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

func TestTunnelEndToEnd(t *testing.T) {
	logger := logrus.New()
	logger.SetLevel(logrus.DebugLevel)
	log := logrus.NewEntry(logger)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. 模拟落地端 Sing-box 目标服务 (监听 127.0.0.1:0 随机端口)
	targetListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen mock target: %v", err)
	}
	defer targetListener.Close()
	targetPort := targetListener.Addr().(*net.TCPAddr).Port

	// Target Echo Server
	go func() {
		for {
			conn, err := targetListener.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 1024)
				n, err := c.Read(buf)
				if err != nil && err != io.EOF {
					return
				}
				// 响应 "ECHO:" + 输入
				resp := append([]byte("ECHO:"), buf[:n]...)
				_, _ = c.Write(resp)
			}(conn)
		}
	}()

	// 2. 选择可用的 ListenPort (隧道服务端口) 与 BridgePort (本地桥接端口)
	tunnelListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve tunnel port: %v", err)
	}
	tunnelPort := tunnelListener.Addr().(*net.TCPAddr).Port
	tunnelListener.Close()

	bridgeListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve bridge port: %v", err)
	}
	bridgePort := bridgeListener.Addr().(*net.TCPAddr).Port
	bridgeListener.Close()

	tunnelID := "test-entry:test-landing"
	secret := "test-high-entropy-secret-12345"

	// 3. 启动 TunnelServer
	serverCfg := Config{
		ID:         tunnelID,
		Role:       RoleServer,
		ListenPort: tunnelPort,
		Secret:     secret,
		Mappings: []PortMapping{
			{
				LineID:     "line-1",
				LocalPort:  bridgePort,
				TargetPort: targetPort,
			},
		},
	}
	server, err := NewServer(serverCfg, log)
	if err != nil {
		t.Fatalf("failed to create tunnel server: %v", err)
	}
	if err := server.Start(ctx); err != nil {
		t.Fatalf("failed to start tunnel server: %v", err)
	}
	defer server.Close()

	// 4. 启动 TunnelClient
	clientCfg := Config{
		ID:         tunnelID,
		Role:       RoleClient,
		ServerAddr: fmt.Sprintf("127.0.0.1:%d", tunnelPort),
		Secret:     secret,
		Mappings: []PortMapping{
			{
				LineID:     "line-1",
				LocalPort:  bridgePort,
				TargetPort: targetPort,
			},
		},
	}
	client, err := NewClient(clientCfg, log)
	if err != nil {
		t.Fatalf("failed to create tunnel client: %v", err)
	}
	if err := client.Start(ctx); err != nil {
		t.Fatalf("failed to start tunnel client: %v", err)
	}
	defer client.Close()

	// 等待客户端连接并就绪
	time.Sleep(500 * time.Millisecond)

	// 5. 模拟用户流量进入入口 VPS 的 BridgePort (127.0.0.1:bridgePort)
	bridgeAddr := fmt.Sprintf("127.0.0.1:%d", bridgePort)
	conn, err := net.DialTimeout("tcp", bridgeAddr, 3*time.Second)
	if err != nil {
		t.Fatalf("failed to connect bridge port: %v", err)
	}
	defer conn.Close()

	testMsg := []byte("Hello RiriCloud Reverse Tunnel!")
	if _, err := conn.Write(testMsg); err != nil {
		t.Fatalf("failed to write to bridge: %v", err)
	}

	buf := make([]byte, 1024)
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	n, err := conn.Read(buf)
	if err != nil {
		t.Fatalf("failed to read echo from bridge: %v", err)
	}

	expected := "ECHO:Hello RiriCloud Reverse Tunnel!"
	if string(buf[:n]) != expected {
		t.Fatalf("unexpected response: got %q, want %q", string(buf[:n]), expected)
	}

	t.Logf("Tunnel end-to-end verified successfully: %s", string(buf[:n]))
}

func TestTunnelConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{
			name:    "empty id",
			cfg:     Config{Role: RoleServer, Secret: "s", ListenPort: 1000},
			wantErr: true,
		},
		{
			name:    "empty secret",
			cfg:     Config{ID: "t1", Role: RoleServer, ListenPort: 1000},
			wantErr: true,
		},
		{
			name:    "invalid server port",
			cfg:     Config{ID: "t1", Role: RoleServer, Secret: "s", ListenPort: 99999},
			wantErr: true,
		},
		{
			name:    "empty client server addr",
			cfg:     Config{ID: "t1", Role: RoleClient, Secret: "s"},
			wantErr: true,
		},
		{
			name:    "valid server",
			cfg:     Config{ID: "t1", Role: RoleServer, Secret: "s", ListenPort: 29000},
			wantErr: false,
		},
		{
			name:    "valid client",
			cfg:     Config{ID: "t1", Role: RoleClient, Secret: "s", ServerAddr: "1.2.3.4:29000"},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
