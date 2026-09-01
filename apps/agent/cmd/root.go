package cmd

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/doctor"
	"github.com/Nanako660/riricloud/apps/agent/internal/install"
	"github.com/Nanako660/riricloud/apps/agent/internal/runner"
	"github.com/Nanako660/riricloud/apps/agent/internal/system"
	"github.com/Nanako660/riricloud/apps/agent/internal/telemetry"
	"github.com/Nanako660/riricloud/apps/agent/internal/tui"
)

type Options struct {
	Version string
	Out     io.Writer
	ErrOut  io.Writer
	Run     func(context.Context, string, string) error
}

func NewRootCommand(options Options) *cobra.Command {
	if options.Out == nil {
		options.Out = os.Stdout
	}
	if options.ErrOut == nil {
		options.ErrOut = os.Stderr
	}
	if options.Run == nil {
		options.Run = runner.Run
	}
	var configPath string

	root := &cobra.Command{
		Use:           "riri-agent",
		Short:         "RiriCloud edge node Agent",
		Version:       options.Version,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(command *cobra.Command, _ []string) error {
			if tui.IsInteractive() {
				return runTUI(command.Context(), options, configPath)
			}
			return options.Run(command.Context(), configPath, options.Version)
		},
	}
	root.SetOut(options.Out)
	root.SetErr(options.ErrOut)
	root.PersistentFlags().StringVar(&configPath, "config", "", "Agent YAML 配置文件路径")
	root.AddCommand(
		newInstallCommand(options, &configPath),
		newUninstallCommand(options, &configPath),
		newServiceCommand("start", &configPath, func(manager *system.Manager) error { return manager.Start() }),
		newServiceCommand("stop", &configPath, func(manager *system.Manager) error { return manager.Stop() }),
		newServiceCommand("restart", &configPath, func(manager *system.Manager) error { return manager.Restart() }),
		newStatusCommand(options, &configPath),
		newDoctorCommand(options, &configPath),
		newLogsCommand(options, &configPath),
		newRunCommand(options, &configPath),
		newVersionCommand(options),
	)
	return root
}

func newVersionCommand(options Options) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "显示 Agent 版本",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			_, err := fmt.Fprintf(options.Out, "riri-agent %s\n", options.Version)
			return err
		},
	}
}

func newInstallCommand(options Options, configPath *string) *cobra.Command {
	var token, master, mode, dataDir, source, singboxURL, singboxVersion string
	var noStart bool
	command := &cobra.Command{
		Use:   "install",
		Short: "下载内核、写入配置并注册系统服务",
		RunE: func(command *cobra.Command, _ []string) error {
			cfg, err := install.Run(command.Context(), install.Options{
				Token: token, Master: master, Mode: mode, ConfigPath: *configPath,
				DataDir: dataDir, SingboxSource: source, SingboxURL: singboxURL,
				SingboxVersion: singboxVersion, NoStart: noStart,
			})
			if err != nil {
				return err
			}
			fmt.Fprintf(options.Out, "Agent 安装完成：%s（%s）\n", cfg.ConfigPath, cfg.Mode)
			return nil
		},
	}
	command.Flags().StringVar(&token, "token", os.Getenv("AGENT_TOKEN"), "节点 AgentToken")
	command.Flags().StringVar(&master, "master", firstNonEmpty(os.Getenv("MASTER_URL"), os.Getenv("MASTER_WS_URL")), "Master URL")
	command.Flags().StringVar(&mode, "mode", os.Getenv("AGENT_MODE"), "通信模式：ws 或 http")
	command.Flags().StringVar(&dataDir, "data-dir", "", "Agent 运行时目录")
	command.Flags().StringVar(&source, "singbox-source", "auto", "Sing-box 来源：auto、master 或 github")
	command.Flags().StringVar(&singboxURL, "singbox-url", "", "自定义 Sing-box 下载地址")
	command.Flags().StringVar(&singboxVersion, "singbox-version", "", "GitHub Sing-box 版本")
	command.Flags().BoolVar(&noStart, "no-start", false, "只安装服务，不立即启动")
	return command
}

func newUninstallCommand(options Options, configPath *string) *cobra.Command {
	var purge, yes bool
	var dataDir string
	command := &cobra.Command{
		Use:   "uninstall",
		Short: "注销 Agent 系统服务",
		RunE: func(command *cobra.Command, _ []string) error {
			return uninstallAgent(options, *configPath, dataDir, purge, yes, command.InOrStdin())
		},
	}
	command.Flags().BoolVar(&purge, "purge", false, "删除配置、内核、日志和运行时目录")
	command.Flags().StringVar(&dataDir, "data-dir", "", "Agent 运行时目录")
	command.Flags().BoolVarP(&yes, "yes", "y", false, "跳过卸载确认")
	return command
}

func newServiceCommand(name string, configPath *string, action func(*system.Manager) error) *cobra.Command {
	return &cobra.Command{
		Use:   name,
		Short: name + " Agent 系统服务",
		RunE: func(_ *cobra.Command, _ []string) error {
			path := resolveConfigPath(*configPath)
			executable, err := os.Executable()
			if err != nil {
				return err
			}
			return action(system.NewServiceManager(executable, path))
		},
	}
}

func newStatusCommand(options Options, configPath *string) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "查看服务、内核和系统资源状态",
		RunE: func(_ *cobra.Command, _ []string) error {
			path := resolveConfigPath(*configPath)
			cfg, err := config.LoadFrom(path)
			if err != nil {
				return err
			}
			executable, err := os.Executable()
			if err != nil {
				return err
			}
			manager := system.NewServiceManager(executable, path)
			serviceState, serviceErr := manager.Status()
			if serviceErr != nil {
				serviceState = "unknown"
			}
			kernelState, kernelErr := system.ProcessRunning(cfg.SingboxBinPath)
			if kernelErr != nil {
				kernelState = false
			}
			sample := telemetry.Collect()
			fmt.Fprintln(options.Out, tui.RenderStatus(tui.StatusView{
				Service: serviceState, Master: cfg.MasterURL, Mode: string(cfg.Mode),
				Kernel: boolLabel(kernelState), CPU: sample.CPUUsage, Memory: sample.MemoryUsage,
				Config: cfg.ConfigPath,
			}))
			return nil
		},
	}
}

func newDoctorCommand(options Options, configPath *string) *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "诊断 Master、通信、Sing-box 和端口",
		RunE: func(command *cobra.Command, _ []string) error {
			cfg, err := config.LoadFrom(resolveConfigPath(*configPath))
			if err != nil {
				return err
			}
			checks := doctor.Run(command.Context(), cfg)
			for _, check := range checks {
				marker := "✓"
				if !check.OK {
					marker = "✗"
				}
				fmt.Fprintf(options.Out, "%s %-14s %s\n", marker, check.Name, check.Detail)
			}
			if !doctor.AllOK(checks) {
				return fmt.Errorf("doctor 发现异常")
			}
			return nil
		},
	}
}

func newLogsCommand(options Options, configPath *string) *cobra.Command {
	var follow bool
	var lines int
	command := &cobra.Command{
		Use:   "logs",
		Short: "查看 Agent 日志",
		RunE: func(command *cobra.Command, _ []string) error {
			path := resolveConfigPath(*configPath)
			cfg, err := config.LoadFrom(path)
			if err != nil {
				return err
			}
			return streamLogs(command.Context(), options.Out, cfg.LogPath, lines, follow)
		},
	}
	command.Flags().BoolVarP(&follow, "follow", "f", false, "持续跟踪日志")
	command.Flags().IntVarP(&lines, "lines", "n", 100, "初始显示行数")
	return command
}

func newRunCommand(options Options, configPath *string) *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "以前台方式运行 Agent 守护进程",
		RunE: func(command *cobra.Command, _ []string) error {
			return options.Run(command.Context(), *configPath, options.Version)
		},
	}
}

func runTUI(ctx context.Context, options Options, configPath string) error {
	form := tui.InstallForm{
		AgentToken: os.Getenv("AGENT_TOKEN"),
		MasterURL:  firstNonEmpty(os.Getenv("MASTER_URL"), os.Getenv("MASTER_WS_URL")),
		Mode:       firstNonEmpty(os.Getenv("AGENT_MODE"), "ws"),
	}
	return tui.RunInteractive(ctx, os.Stdin, options.Out, tui.Actions{
		Install: func(actionCtx context.Context, values tui.InstallForm, output io.Writer) error {
			cfg, err := install.Run(actionCtx, install.Options{
				Token: values.AgentToken, Master: values.MasterURL, Mode: values.Mode,
				ConfigPath: configPath,
			})
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(output, "Agent 安装完成：%s（%s）\n", cfg.ConfigPath, cfg.Mode)
			return err
		},
		Status: func(actionCtx context.Context, output io.Writer) error {
			commandOptions := options
			commandOptions.Out = output
			command := newStatusCommand(commandOptions, &configPath)
			command.SetContext(actionCtx)
			return command.RunE(command, nil)
		},
		Start: func(_ context.Context, _ io.Writer) error {
			return runServiceAction(configPath, func(manager *system.Manager) error { return manager.Start() })
		},
		Stop: func(_ context.Context, _ io.Writer) error {
			return runServiceAction(configPath, func(manager *system.Manager) error { return manager.Stop() })
		},
		Doctor: func(actionCtx context.Context, output io.Writer) error {
			commandOptions := options
			commandOptions.Out = output
			command := newDoctorCommand(commandOptions, &configPath)
			command.SetContext(actionCtx)
			return command.RunE(command, nil)
		},
		Logs: func(actionCtx context.Context, output io.Writer) error {
			commandOptions := options
			commandOptions.Out = output
			command := newLogsCommand(commandOptions, &configPath)
			command.SetContext(actionCtx)
			return command.RunE(command, nil)
		},
		Uninstall: func(_ context.Context, output io.Writer) error {
			commandOptions := options
			commandOptions.Out = output
			return uninstallAgent(commandOptions, configPath, "", true, true, strings.NewReader(""))
		},
	}, options.Version, form)
}

func runServiceAction(configPath string, action func(*system.Manager) error) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	return action(system.NewServiceManager(executable, resolveConfigPath(configPath)))
}

func streamLogs(ctx context.Context, output io.Writer, path string, lines int, follow bool) error {
	if lines < 1 {
		return fmt.Errorf("--lines must be positive")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	content := strings.TrimSuffix(string(data), "\n")
	allLines := strings.Split(content, "\n")
	start := len(allLines) - lines
	if start < 0 {
		start = 0
	}
	for _, line := range allLines[start:] {
		fmt.Fprintln(output, tui.ColorizeLogLine(line))
	}
	if !follow {
		return nil
	}
	offset := int64(len(data))
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			if int64(len(data)) < offset {
				offset = 0
			}
			if int64(len(data)) == offset {
				continue
			}
			for _, line := range strings.Split(string(data[offset:]), "\n") {
				if line != "" {
					fmt.Fprintln(output, tui.ColorizeLogLine(line))
				}
			}
			offset = int64(len(data))
		}
	}
}

func resolveConfigPath(path string) string {
	if strings.TrimSpace(path) != "" {
		return path
	}
	return config.DefaultPaths().ConfigPath
}

func resolvePaths(configPath, dataDir string) (string, string) {
	path := resolveConfigPath(configPath)
	data := strings.TrimSpace(dataDir)
	if data == "" {
		data = config.DefaultPaths().DataDir
		if path != config.DefaultPaths().ConfigPath {
			data = filepath.Dir(path)
		}
	}
	return path, data
}

func removeManagedPath(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	clean := filepath.Clean(abs)
	if clean == filepath.VolumeName(clean)+string(os.PathSeparator) || clean == "." || clean == filepath.Dir(clean) {
		return fmt.Errorf("拒绝删除不安全路径：%s", clean)
	}
	return os.RemoveAll(clean)
}

func uninstallAgent(options Options, configPath, dataDir string, purge, yes bool, input io.Reader) error {
	if !purge {
		fmt.Fprintln(options.Out, "Agent 服务已注销；保留配置与运行时文件。使用 --purge 完全清理。")
	}
	if purge && !yes {
		fmt.Fprint(options.Out, "确认删除配置、内核和运行时目录？输入 yes 继续：")
		answer, err := bufio.NewReader(input).ReadString('\n')
		if err != nil {
			return err
		}
		if strings.TrimSpace(strings.ToLower(answer)) != "yes" {
			return fmt.Errorf("已取消卸载")
		}
	}
	path, data := resolvePaths(configPath, dataDir)
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	manager := system.NewServiceManager(executable, path)
	serviceState, statusErr := manager.Status()
	if statusErr != nil {
		return statusErr
	}
	if serviceState != "not-installed" {
		if err := manager.Stop(); err != nil && serviceState == "running" {
			return err
		}
		if err := manager.Uninstall(); err != nil {
			return err
		}
	}
	if !purge {
		return nil
	}
	killed, err := manager.KillManagedProcesses(filepath.Join(data, executableName("sing-box")))
	if err != nil {
		return err
	}
	if err := removeManagedPath(data); err != nil {
		return err
	}
	if err := removeManagedPath(filepath.Dir(path)); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		if err := manager.RemoveInstalledBinary(); err != nil {
			return err
		}
	}
	fmt.Fprintf(options.Out, "Agent 已彻底卸载，清理进程：%d。\n", killed)
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func boolLabel(value bool) string {
	if value {
		return "running"
	}
	return "stopped"
}

func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
