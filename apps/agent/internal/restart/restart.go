// Package restart 提供 Agent 升级后的进程接管策略：系统服务重启优先，自拉起兜底。
//
// 背景：旧实现仅自拉起（spawn 新进程后 os.Exit），spawn 失败时旧进程带旧版本继续运行，
// 主控升级任务却已标记成功，画像版本永远不更新；服务化部署下自拉起还会让 systemd
// 以 RestartSec=120 空等。服务重启优先可让 systemd/SCM 立即从磁盘新二进制拉起并恢复监管。
package restart

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/system"
)

// restartDelayMs 为升级回执与日志报文预留的发送窗口：两条重启路径都会很快终止当前进程。
const restartDelayMs = 250

// Restarter 抽象系统服务管理能力（*system.Manager 天然满足），供测试注入。
type Restarter interface {
	Status() (string, error)
	Restart() error
}

// ServiceFactory 惰性构建服务管理器；返回错误表示当前环境不可用服务路径（如容器无 systemd）。
type ServiceFactory func() (Restarter, error)

// Manager 编排重启决策：服务重启优先，自拉起兜底。
type Manager struct {
	service   ServiceFactory
	selfSpawn func() error
	delay     time.Duration
	log       *logrus.Entry
}

// NewManager 构建重启管理器；service/selfSpawn 均可注入以便单测。
// 默认实现依赖启动时传入的 executable，均为空时两条路径都会失败并返回聚合错误。
func NewManager(service ServiceFactory, selfSpawn func() error, log *logrus.Entry) *Manager {
	if service == nil {
		service = NewSystemServiceFactory("", "")
	}
	if selfSpawn == nil {
		selfSpawn = NewSelfSpawn("")
	}
	return &Manager{service: service, selfSpawn: selfSpawn, delay: restartDelayMs * time.Millisecond, log: log}
}

// NewSystemServiceFactory 返回基于 system.Manager 的服务重启工厂。
// executable 应传入启动时解析的进程路径：升级原子替换后 /proc/self/exe 会反映改名后的
// .riri-old 陈旧路径，重启时再解析会得到已删除的备份文件。传空时退化为即时解析。
// 已知边界：若存在手动前台运行的 Agent 与系统服务实例并存，服务路径会重启服务实例而非
// 当前前台进程；该进程随后落入自拉起兜底，短暂双实例由主控同节点连接顶替逻辑收敛。
func NewSystemServiceFactory(executable, configPath string) ServiceFactory {
	return func() (Restarter, error) {
		exe := executable
		if exe == "" {
			resolved, err := os.Executable()
			if err != nil {
				return nil, fmt.Errorf("resolve agent executable: %w", err)
			}
			exe = resolved
		}
		return system.NewServiceManager(exe, configPath), nil
	}
}

// NewSelfSpawn 返回自拉起实现：以启动时解析的可执行路径 spawn 新进程并退出当前进程。
// 同 NewSystemServiceFactory，路径必须在二进制替换前解析，避免 exec 已删除的 .riri-old。
func NewSelfSpawn(executable string) func() error {
	return func() error {
		if executable == "" {
			return errors.New("agent executable path unavailable")
		}
		cmd := exec.Command(executable, os.Args[1:]...)
		cmd.Env = os.Environ()
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("spawn replacement process: %w", err)
		}
		os.Exit(0)
		return nil
	}
}

// RestartAndExit 执行进程接管，成功路径函数不返回（进程被服务管理器终止或 os.Exit）。
// 仅当自拉起也失败时返回聚合错误，此时旧进程继续运行，依赖主控升级版本对账兜底发现。
func (m *Manager) RestartAndExit() error {
	time.Sleep(m.delay)
	var errs []error
	if restarter, err := m.service(); err != nil {
		m.log.WithError(err).Debug("service restarter unavailable, fallback to self spawn")
		errs = append(errs, err)
	} else if status, err := restarter.Status(); err != nil {
		m.log.WithError(err).Warn("service status check failed, fallback to self spawn")
		errs = append(errs, err)
	} else if status == "running" {
		m.log.Info("restarting agent via system service manager")
		if err := restarter.Restart(); err != nil {
			m.log.WithError(err).Warn("service restart failed, fallback to self spawn")
			errs = append(errs, err)
		}
		// svc.Restart() 正常会终止当前进程；若仍存活（异常环境），继续自拉起兜底。
	} else {
		m.log.WithField("status", status).Debug("service not running, fallback to self spawn")
	}
	if err := m.selfSpawn(); err != nil {
		errs = append(errs, err)
		return errors.Join(errs...)
	}
	return nil
}
