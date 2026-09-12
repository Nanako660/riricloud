package tunnel

import (
	"context"
	"fmt"
	"reflect"
	"sync"

	"github.com/sirupsen/logrus"
)

// Manager 统一纳管当前 Agent 运行的所有反向穿透隧道实例（包括服务端与客户端）
type Manager struct {
	mu      sync.Mutex
	log     *logrus.Entry
	servers map[string]*Server
	clients map[string]*Client
	configs map[string]Config
	ctx     context.Context
	cancel  context.CancelFunc
}

// NewManager 创建隧道管理器
func NewManager(ctx context.Context, log *logrus.Entry) *Manager {
	mCtx, mCancel := context.WithCancel(ctx)
	return &Manager{
		log:     log.WithField("subsystem", "tunnel_mgr"),
		servers: make(map[string]*Server),
		clients: make(map[string]*Client),
		configs: make(map[string]Config),
		ctx:     mCtx,
		cancel:  mCancel,
	}
}

// ApplyConfigs 根据 Master 下发的 config_sync 动态增删与更新隧道
func (m *Manager) ApplyConfigs(configs []Config) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	desiredMap := make(map[string]Config)
	for _, c := range configs {
		if err := c.Validate(); err != nil {
			return fmt.Errorf("invalid tunnel config %s: %w", c.ID, err)
		}
		desiredMap[c.ID] = c
	}

	// 1. 清理被移除或配置变更的旧隧道
	for id, oldCfg := range m.configs {
		newCfg, exists := desiredMap[id]
		if !exists || !reflect.DeepEqual(oldCfg, newCfg) {
			m.stopTunnelLocked(id)
			delete(m.configs, id)
		}
	}

	// 2. 启动新添加或更新后的隧道
	for id, newCfg := range desiredMap {
		if _, running := m.configs[id]; running {
			continue
		}

		m.log.Infof("starting tunnel %s (role=%s)", id, newCfg.Role)
		switch newCfg.Role {
		case RoleServer:
			srv, err := NewServer(newCfg, m.log)
			if err != nil {
				m.log.WithError(err).Errorf("failed to initialize tunnel server %s", id)
				continue
			}
			if err := srv.Start(m.ctx); err != nil {
				m.log.WithError(err).Errorf("failed to start tunnel server %s", id)
				continue
			}
			m.servers[id] = srv
			m.configs[id] = newCfg

		case RoleClient:
			cli, err := NewClient(newCfg, m.log)
			if err != nil {
				m.log.WithError(err).Errorf("failed to initialize tunnel client %s", id)
				continue
			}
			if err := cli.Start(m.ctx); err != nil {
				m.log.WithError(err).Errorf("failed to start tunnel client %s", id)
				continue
			}
			m.clients[id] = cli
			m.configs[id] = newCfg
		}
	}

	return nil
}

func (m *Manager) stopTunnelLocked(id string) {
	if srv, ok := m.servers[id]; ok {
		m.log.Infof("stopping tunnel server %s", id)
		srv.Close()
		delete(m.servers, id)
	}
	if cli, ok := m.clients[id]; ok {
		m.log.Infof("stopping tunnel client %s", id)
		cli.Close()
		delete(m.clients, id)
	}
}

// Shutdown 平滑停止所有隧道
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cancel != nil {
		m.cancel()
	}

	for id, srv := range m.servers {
		srv.Close()
		delete(m.servers, id)
	}
	for id, cli := range m.clients {
		cli.Close()
		delete(m.clients, id)
	}
	m.configs = make(map[string]Config)
	m.log.Info("tunnel manager stopped")
}
