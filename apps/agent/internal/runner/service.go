package runner

import (
	"context"
	"fmt"
	"time"

	"github.com/kardianos/service"

	"github.com/Nanako660/riricloud/apps/agent/internal/system"
)

// serviceStopTimeout 为 SCM 停止请求预留的优雅退出上限。
const serviceStopTimeout = 10 * time.Second

// agentProgram 把前台守护进程包装为系统服务程序。
// Start 必须非阻塞：SCM 要求尽快上报 Running，实际工作在 goroutine 中执行。
type agentProgram struct {
	options Options
	// run 仅供测试注入；为空时使用 runForeground。
	run    func(context.Context, Options) error
	cancel context.CancelFunc
	done   chan struct{}
	logger service.Logger
}

func (p *agentProgram) Start(s service.Service) error {
	if s != nil {
		if logger, err := s.Logger(nil); err == nil {
			p.logger = logger
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	p.done = make(chan struct{})
	run := p.run
	if run == nil {
		run = runForeground
	}
	go func() {
		defer close(p.done)
		if err := run(ctx, p.options); err != nil && p.logger != nil {
			p.logger.Errorf("agent run failed: %v", err)
		}
	}()
	return nil
}

func (p *agentProgram) Stop(_ service.Service) error {
	if p.cancel == nil {
		return nil
	}
	p.cancel()
	select {
	case <-p.done:
	case <-time.After(serviceStopTimeout):
	}
	return nil
}

// runAsService 以 Windows 服务身份运行 Agent：对接 SCM 控制通道，
// 由服务管理器驱动 Start/Stop，避免启动/停止请求超时（1053）。
func runAsService(options Options) error {
	program := &agentProgram{options: options}
	svc, err := service.New(program, &service.Config{Name: system.ServiceName})
	if err != nil {
		return fmt.Errorf("create service program: %w", err)
	}
	return svc.Run()
}
