package tui

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	accent = lipgloss.NewStyle().Foreground(lipgloss.Color("205")).Bold(true)
	muted  = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	ok     = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	warn   = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	bad    = lipgloss.NewStyle().Foreground(lipgloss.Color("203"))

	panelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("63")).
			Padding(1, 2)
	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("205")).
			Bold(true)
	fieldStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder(), false, false, false, true).
			BorderForeground(lipgloss.Color("205")).
			PaddingLeft(1)
)

type Action func(context.Context, io.Writer) error

type InstallForm struct {
	AgentToken string
	MasterURL  string
	Mode       string
}

type Actions struct {
	Install   func(context.Context, InstallForm, io.Writer) error
	Status    Action
	Start     Action
	Stop      Action
	Doctor    Action
	Logs      Action
	Uninstall Action
}

func IsInteractive() bool {
	if os.Getenv("RIRICLOUD_NON_INTERACTIVE") == "1" || os.Getenv("CI") != "" {
		return false
	}
	info, err := os.Stdin.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0 && os.Getenv("TERM") != "dumb"
}

func Banner(version string) string {
	version = strings.TrimSpace(version)
	if version == "" {
		version = "dev"
	}
	if version != "dev" && !strings.HasPrefix(version, "v") {
		version = "v" + version
	}
	return accent.Render("R I R I C L O U D") + "\n" +
		muted.Render("Edge Agent  ·  "+version)
}

func RunInteractive(ctx context.Context, input io.Reader, output io.Writer, actions Actions, version string, forms ...InstallForm) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if input == nil {
		input = os.Stdin
	}
	if output == nil {
		output = io.Discard
	}
	var form InstallForm
	if len(forms) > 0 {
		form = forms[0]
	}
	program := tea.NewProgram(
		newModel(ctx, actions, version, form),
		tea.WithContext(ctx),
		tea.WithInput(input),
		tea.WithOutput(output),
		tea.WithAltScreen(),
	)
	_, err := program.Run()
	return err
}

type page uint8

const (
	pageMenu page = iota
	pageInstall
	pageUninstallConfirm
	pageWorking
	pageResult
)

var menuItems = []string{
	"安装 / 配置 Agent",
	"查看状态",
	"启动服务",
	"停止服务",
	"Doctor 体检",
	"查看日志",
	"卸载 Agent",
	"退出",
}

type actionDoneMsg struct {
	id     uint64
	label  string
	output string
	err    error
}

type model struct {
	ctx          context.Context
	actions      Actions
	version      string
	form         InstallForm
	cursor       [3]int
	field        int
	selected     int
	page         page
	width        int
	height       int
	actionID     uint64
	running      bool
	cancel       context.CancelFunc
	result       string
	resultErr    error
	resultTitle  string
	resultOffset int
}

func newModel(ctx context.Context, actions Actions, version string, form InstallForm) model {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(form.Mode) == "" {
		form.Mode = "ws"
	}
	return model{
		ctx:     ctx,
		actions: actions,
		version: version,
		form:    form,
		cursor: [3]int{
			len([]rune(form.AgentToken)),
			len([]rune(form.MasterURL)),
			len([]rune(form.Mode)),
		},
		width:  80,
		height: 24,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch message := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = message.Width
		m.height = message.Height
		return m, nil
	case actionDoneMsg:
		if message.id != m.actionID {
			return m, nil
		}
		m.running = false
		if m.cancel != nil {
			m.cancel()
			m.cancel = nil
		}
		m.resultTitle = message.label
		m.result = strings.TrimSpace(message.output)
		m.resultErr = message.err
		m.resultOffset = 0
		m.page = pageResult
		return m, nil
	case tea.KeyMsg:
		return m.updateKey(message)
	default:
		return m, nil
	}
}

func (m model) updateKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if msg.Type == tea.KeyCtrlC {
		if m.running {
			m.cancelRunning()
		}
		return m, tea.Quit
	}
	if m.running {
		if msg.Type == tea.KeyEsc {
			m.cancelRunning()
			m.page = pageMenu
			m.resultErr = nil
			m.result = "操作已取消。"
		}
		return m, nil
	}

	switch m.page {
	case pageMenu:
		return m.updateMenuKey(msg)
	case pageInstall:
		return m.updateInstallKey(msg)
	case pageUninstallConfirm:
		return m.updateConfirmKey(msg)
	case pageResult:
		switch {
		case msg.Type == tea.KeyUp:
			if m.resultOffset > 0 {
				m.resultOffset--
			}
		case msg.Type == tea.KeyDown:
			m.resultOffset++
		case msg.Type == tea.KeyPgUp:
			m.resultOffset -= m.resultPageSize()
			if m.resultOffset < 0 {
				m.resultOffset = 0
			}
		case msg.Type == tea.KeyPgDown:
			m.resultOffset += m.resultPageSize()
		case msg.Type == tea.KeyEnter || msg.Type == tea.KeyEsc || isRune(msg, "q"):
			m.page = pageMenu
		}
	}
	return m, nil
}

func (m model) updateMenuKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case msg.Type == tea.KeyUp || isRune(msg, "k"):
		m.selected = (m.selected + len(menuItems) - 1) % len(menuItems)
	case msg.Type == tea.KeyDown || isRune(msg, "j"):
		m.selected = (m.selected + 1) % len(menuItems)
	case msg.Type == tea.KeyEnter:
		return m.activateMenuItem()
	case msg.Type == tea.KeyEsc || msg.Type == tea.KeyCtrlC || isRune(msg, "q"):
		return m, tea.Quit
	}
	return m, nil
}

func (m model) activateMenuItem() (tea.Model, tea.Cmd) {
	switch m.selected {
	case 0:
		m.page = pageInstall
		m.field = 0
	case 1:
		return m.startAction("Agent 状态", m.actions.Status)
	case 2:
		return m.startAction("启动服务", m.actions.Start)
	case 3:
		return m.startAction("停止服务", m.actions.Stop)
	case 4:
		return m.startAction("Doctor 体检", m.actions.Doctor)
	case 5:
		return m.startAction("Agent 日志", m.actions.Logs)
	case 6:
		m.page = pageUninstallConfirm
	case 7:
		return m, tea.Quit
	}
	return m, nil
}

func (m model) updateInstallKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		m.page = pageMenu
		return m, nil
	case tea.KeyUp, tea.KeyShiftTab:
		m.field = (m.field + 2) % 3
		return m, nil
	case tea.KeyDown, tea.KeyTab:
		m.field = (m.field + 1) % 3
		return m, nil
	case tea.KeyEnter:
		if m.field < 2 {
			m.field++
			return m, nil
		}
		return m.startInstall()
	case tea.KeyLeft, tea.KeyRight:
		if m.field == 2 {
			m.form.Mode = toggleMode(m.form.Mode)
			m.cursor[2] = len([]rune(m.form.Mode))
			return m, nil
		}
		if msg.Type == tea.KeyLeft && m.cursor[m.field] > 0 {
			m.cursor[m.field]--
		}
		if msg.Type == tea.KeyRight {
			if length := len([]rune(m.formValue())); m.cursor[m.field] < length {
				m.cursor[m.field]++
			}
		}
		return m, nil
	case tea.KeyBackspace, tea.KeyDelete:
		m.deleteFormRune(msg.Type == tea.KeyDelete)
		return m, nil
	}

	if msg.Type == tea.KeyRunes && len(msg.Runes) > 0 && !msg.Paste {
		if m.field == 2 {
			value := strings.ToLower(string(msg.Runes))
			if value == "w" || value == "h" {
				m.form.Mode = toggleMode(m.form.Mode)
				m.cursor[2] = len([]rune(m.form.Mode))
			}
			return m, nil
		}
		m.insertFormRunes(msg.Runes)
	}
	return m, nil
}

func (m model) startInstall() (tea.Model, tea.Cmd) {
	if m.actions.Install == nil {
		m.resultTitle = "安装 Agent"
		m.result = "安装操作暂不可用。"
		m.page = pageResult
		return m, nil
	}
	form := m.form
	return m.startActionWith("安装 Agent", func(ctx context.Context, output io.Writer) error {
		return m.actions.Install(ctx, form, output)
	})
}

func (m model) startAction(label string, action Action) (tea.Model, tea.Cmd) {
	if action == nil {
		m.resultTitle = label
		m.result = "此操作暂不可用，请先完成安装配置。"
		m.resultErr = nil
		m.page = pageResult
		return m, nil
	}
	return m.startActionWith(label, action)
}

func (m model) startActionWith(label string, action Action) (tea.Model, tea.Cmd) {
	ctx, cancel := context.WithCancel(m.ctx)
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.cancel = cancel
	m.actionID++
	id := m.actionID
	m.running = true
	m.page = pageWorking
	m.resultTitle = label
	m.result = ""
	m.resultErr = nil
	m.resultOffset = 0
	return m, func() tea.Msg {
		var output strings.Builder
		err := action(ctx, &output)
		return actionDoneMsg{id: id, label: label, output: output.String(), err: err}
	}
}

func (m *model) cancelRunning() {
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.actionID++
	m.running = false
}

func (m *model) insertFormRunes(runes []rune) {
	value := []rune(m.formValue())
	cursor := m.cursor[m.field]
	if cursor < 0 || cursor > len(value) {
		cursor = len(value)
	}
	value = append(value[:cursor], append(append([]rune(nil), runes...), value[cursor:]...)...)
	m.setFormValue(string(value))
	m.cursor[m.field] = cursor + len(runes)
}

func (m *model) deleteFormRune(deleteAtCursor bool) {
	value := []rune(m.formValue())
	cursor := m.cursor[m.field]
	if deleteAtCursor {
		if cursor >= len(value) {
			return
		}
		value = append(value[:cursor], value[cursor+1:]...)
	} else {
		if cursor == 0 {
			return
		}
		value = append(value[:cursor-1], value[cursor:]...)
		cursor--
	}
	m.setFormValue(string(value))
	m.cursor[m.field] = cursor
}

func (m model) formValue() string {
	switch m.field {
	case 0:
		return m.form.AgentToken
	case 1:
		return m.form.MasterURL
	default:
		return m.form.Mode
	}
}

func (m *model) setFormValue(value string) {
	switch m.field {
	case 0:
		m.form.AgentToken = value
	case 1:
		m.form.MasterURL = value
	case 2:
		m.form.Mode = value
	}
}

func (m model) updateConfirmKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if msg.Type == tea.KeyEsc || isRune(msg, "n") {
		m.page = pageMenu
		return m, nil
	}
	if msg.Type == tea.KeyEnter || isRune(msg, "y") {
		return m.startAction("卸载 Agent", m.actions.Uninstall)
	}
	return m, nil
}

func (m model) View() string {
	var content string
	switch m.page {
	case pageMenu:
		content = m.renderMenu()
	case pageInstall:
		content = m.renderInstall()
	case pageUninstallConfirm:
		content = m.renderConfirm()
	case pageWorking:
		content = m.renderWorking()
	case pageResult:
		content = m.renderResult()
	}
	return m.fitScreen(content)
}

func (m model) renderMenu() string {
	var lines []string
	for index, item := range menuItems {
		marker := "  "
		label := item
		if index == m.selected {
			marker = "> "
			label = selectedStyle.Render(item)
		}
		lines = append(lines, marker+label)
	}
	body := panelStyle.Render(strings.Join(lines, "\n"))
	return strings.Join([]string{
		Banner(m.version),
		"",
		body,
		"",
		muted.Render("↑/↓ 导航   Enter 执行   q 退出"),
	}, "\n")
}

func (m model) renderInstall() string {
	fields := []string{
		m.renderField("AgentToken", m.form.AgentToken, 0, true),
		m.renderField("Master URL", m.form.MasterURL, 1, false),
		m.renderModeField(),
	}
	return strings.Join([]string{
		accent.Render("安装 / 配置 Agent"),
		muted.Render("填写连接参数，Enter 在字段间前进；最后一项 Enter 开始安装"),
		"",
		panelStyle.Render(strings.Join(fields, "\n\n")),
		"",
		muted.Render("↑/↓ 或 Tab 切换   ←/→ 移动光标或切换模式   Esc 返回"),
	}, "\n")
}

func (m model) renderField(label, value string, index int, secret bool) string {
	display := value
	if secret {
		display = maskValue(value)
	}
	if display == "" {
		display = muted.Render("未填写")
	}
	if m.field == index {
		display += "_"
		return fieldStyle.Render(fmt.Sprintf("%-12s %s", label, display))
	}
	return fmt.Sprintf("%-12s %s", label, display)
}

func (m model) renderModeField() string {
	display := "[ " + m.form.Mode + " ]"
	if m.field == 2 {
		return fieldStyle.Render(fmt.Sprintf("%-12s %s", "通信模式", selectedStyle.Render(display)))
	}
	return fmt.Sprintf("%-12s %s", "通信模式", display)
}

func (m model) renderConfirm() string {
	return strings.Join([]string{
		accent.Render("卸载 Agent"),
		"",
		panelStyle.Render(strings.Join([]string{
			bad.Render("这是一个破坏性操作。"),
			"它会停止并注销系统服务，且删除配置、内核和运行时目录。",
		}, "\n")),
		"",
		warn.Render("Enter 确认卸载"),
		muted.Render("y 确认   n / Esc 取消"),
	}, "\n")
}

func (m model) renderWorking() string {
	return strings.Join([]string{
		accent.Render(m.resultTitle),
		"",
		panelStyle.Render(warn.Render("正在执行，请稍候...")),
		"",
		muted.Render("Esc 可取消当前操作"),
	}, "\n")
}

func (m model) renderResult() string {
	lines := []string{accent.Render(m.resultTitle), ""}
	if m.resultErr != nil {
		lines = append(lines, bad.Render("操作失败: "+m.resultErr.Error()))
	} else if m.result == "" {
		lines = append(lines, ok.Render("操作已完成。"))
	}
	if m.result != "" {
		lines = append(lines, panelStyle.Render(m.visibleResult()))
	}
	lines = append(lines, "", muted.Render("↑/↓ 滚动   Enter / Esc 返回菜单"))
	return strings.Join(lines, "\n")
}

func (m model) visibleResult() string {
	resultLines := strings.Split(m.result, "\n")
	pageSize := m.resultPageSize()
	offset := m.resultOffset
	if offset < 0 {
		offset = 0
	}
	if maxOffset := len(resultLines) - pageSize; offset > maxOffset {
		offset = maxOffset
	}
	if offset < 0 {
		offset = 0
	}
	end := offset + pageSize
	if end > len(resultLines) {
		end = len(resultLines)
	}
	return strings.Join(resultLines[offset:end], "\n")
}

func (m model) resultPageSize() int {
	size := m.height - 10
	if size < 3 {
		return 3
	}
	return size
}

func (m model) fitScreen(content string) string {
	width := m.width
	if width <= 0 {
		return content
	}
	contentWidth := width - 8
	if contentWidth < 32 {
		contentWidth = width - 2
	}
	if contentWidth < 1 {
		contentWidth = 1
	}
	content = lipgloss.NewStyle().Width(contentWidth).Render(content)
	if m.height <= 0 {
		return content
	}
	lines := strings.Split(content, "\n")
	if len(lines) >= m.height {
		return strings.Join(lines[:m.height], "\n")
	}
	return content + strings.Repeat("\n", m.height-len(lines)-1)
}

func maskValue(value string) string {
	if value == "" {
		return ""
	}
	return strings.Repeat("*", len([]rune(value)))
}

func toggleMode(mode string) string {
	if strings.EqualFold(mode, "http") {
		return "ws"
	}
	return "http"
}

func isRune(msg tea.KeyMsg, value string) bool {
	return msg.Type == tea.KeyRunes && strings.EqualFold(string(msg.Runes), value)
}

type StatusView struct {
	Service string
	Master  string
	Mode    string
	Kernel  string
	CPU     float64
	Memory  float64
	Config  string
}

func RenderStatus(view StatusView) string {
	rows := []string{
		accent.Render("Agent 状态"),
		fmt.Sprintf("服务       %s", state(view.Service)),
		fmt.Sprintf("Master     %s", view.Master),
		fmt.Sprintf("通信模式   %s", view.Mode),
		fmt.Sprintf("Sing-box   %s", state(view.Kernel)),
		fmt.Sprintf("CPU        %.1f%%", view.CPU),
		fmt.Sprintf("内存       %.1f%%", view.Memory),
		fmt.Sprintf("配置       %s", view.Config),
	}
	return panelStyle.Render(strings.Join(rows, "\n"))
}

func ColorizeLogLine(line string) string {
	lower := strings.ToLower(line)
	switch {
	case strings.Contains(lower, "error") || strings.Contains(lower, "fatal"):
		return bad.Render(line)
	case strings.Contains(lower, "warn"):
		return warn.Render(line)
	case strings.Contains(lower, "info"):
		return ok.Render(line)
	default:
		return line
	}
}

func state(value string) string {
	switch strings.ToLower(value) {
	case "running", "active", "ok", "online":
		return ok.Render(value)
	case "stopped", "inactive", "failed", "offline":
		return bad.Render(value)
	default:
		return warn.Render(value)
	}
}
