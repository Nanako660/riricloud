package system

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/kardianos/service"
	"github.com/shirou/gopsutil/v3/process"
)

const ServiceName = "riri-agent"

type Manager struct {
	executable    string
	configPath    string
	serviceConfig *service.Config
}

type noopProgram struct{}

func (noopProgram) Start(service.Service) error { return nil }
func (noopProgram) Stop(service.Service) error  { return nil }
func (noopProgram) Run([]string) error          { return nil }

func NewServiceManager(executable, configPath string) *Manager {
	if executable == "" {
		resolved, err := os.Executable()
		if err == nil {
			executable = resolved
		}
	}
	return &Manager{
		executable: executable,
		configPath: configPath,
		serviceConfig: &service.Config{
			Name:             ServiceName,
			DisplayName:      "RiriCloud Agent",
			Description:      "RiriCloud edge node Agent",
			Executable:       executable,
			Arguments:        []string{"run", "--config", configPath},
			WorkingDirectory: filepath.Dir(executable),
		},
	}
}

func (m *Manager) Install() error {
	svc, err := m.open()
	if err != nil {
		return fmt.Errorf("create service handle: %w", err)
	}
	if err := svc.Install(); err != nil {
		return fmt.Errorf("install %s service: %w", ServiceName, err)
	}
	return nil
}

func (m *Manager) Uninstall() error {
	svc, err := m.open()
	if err != nil {
		return fmt.Errorf("create service handle: %w", err)
	}
	if err := svc.Uninstall(); err != nil {
		return fmt.Errorf("uninstall %s service: %w", ServiceName, err)
	}
	return nil
}

func (m *Manager) Start() error {
	svc, err := m.open()
	if err != nil {
		return fmt.Errorf("create service handle: %w", err)
	}
	if err := svc.Start(); err != nil {
		return fmt.Errorf("start %s service: %w", ServiceName, err)
	}
	return nil
}

func (m *Manager) Stop() error {
	svc, err := m.open()
	if err != nil {
		return fmt.Errorf("create service handle: %w", err)
	}
	if err := svc.Stop(); err != nil {
		return fmt.Errorf("stop %s service: %w", ServiceName, err)
	}
	return nil
}

func (m *Manager) Restart() error {
	svc, err := m.open()
	if err != nil {
		return fmt.Errorf("create service handle: %w", err)
	}
	if err := svc.Restart(); err != nil {
		return fmt.Errorf("restart %s service: %w", ServiceName, err)
	}
	return nil
}

func (m *Manager) Status() (string, error) {
	svc, err := m.open()
	if err != nil {
		return "unknown", fmt.Errorf("create service handle: %w", err)
	}
	state, err := svc.Status()
	if err != nil {
		return "not-installed", nil
	}
	switch state {
	case service.StatusRunning:
		return "running", nil
	case service.StatusStopped:
		return "stopped", nil
	case service.StatusUnknown:
		return "unknown", nil
	default:
		return fmt.Sprintf("status-%d", state), nil
	}
}

func (m *Manager) KillManagedProcesses(binaryPath string) (int, error) {
	path := strings.TrimSpace(binaryPath)
	if path == "" {
		return 0, nil
	}
	if !filepath.IsAbs(path) {
		if resolved, err := exec.LookPath(path); err == nil {
			path = resolved
		}
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return 0, fmt.Errorf("resolve managed process path: %w", err)
	}
	path = absolute
	all, err := process.Processes()
	if err != nil {
		return 0, fmt.Errorf("list processes: %w", err)
	}
	killed := 0
	var killErrors []error
	for _, candidate := range all {
		if int(candidate.Pid) == os.Getpid() {
			continue
		}
		executable, err := candidate.Exe()
		if err != nil {
			continue
		}
		if !sameExecutable(executable, path) {
			continue
		}
		if err := candidate.Kill(); err != nil {
			killErrors = append(killErrors, fmt.Errorf("kill pid %d: %w", candidate.Pid, err))
			continue
		}
		killed++
	}
	return killed, errors.Join(killErrors...)
}

func ProcessRunning(binaryPath string) (bool, error) {
	path := strings.TrimSpace(binaryPath)
	if path == "" {
		return false, nil
	}
	if !filepath.IsAbs(path) {
		if resolved, err := exec.LookPath(path); err == nil {
			path = resolved
		}
	}
	processes, err := process.Processes()
	if err != nil {
		return false, fmt.Errorf("list processes: %w", err)
	}
	for _, candidate := range processes {
		executable, err := candidate.Exe()
		if err != nil {
			continue
		}
		if sameExecutable(executable, path) {
			return true, nil
		}
	}
	return false, nil
}

func sameExecutable(candidatePath, expectedPath string) bool {
	candidate, err := filepath.Abs(candidatePath)
	if err != nil {
		return false
	}
	expected, err := filepath.Abs(expectedPath)
	if err != nil {
		return false
	}
	if strings.EqualFold(filepath.Clean(candidate), filepath.Clean(expected)) {
		return true
	}
	candidate, err = filepath.EvalSymlinks(candidate)
	if err != nil {
		return false
	}
	expected, err = filepath.EvalSymlinks(expected)
	if err != nil {
		return false
	}
	return strings.EqualFold(filepath.Clean(candidate), filepath.Clean(expected))
}

func (m *Manager) RemoveInstalledBinary() error {
	if m.executable == "" {
		return nil
	}
	if err := os.Remove(m.executable); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove Agent binary: %w", err)
	}
	return nil
}

func (m *Manager) open() (service.Service, error) {
	return service.New(noopProgram{}, m.serviceConfig)
}
