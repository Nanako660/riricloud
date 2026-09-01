package tui

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestRunInteractiveRendersFullScreenMenuAndExits(t *testing.T) {
	var output bytes.Buffer
	err := RunInteractive(context.Background(), strings.NewReader("q"), &output, Actions{}, "test", InstallForm{})
	if err != nil {
		t.Fatalf("RunInteractive: %v", err)
	}
	for _, expected := range []string{"R I R I C L O U D", "安装 / 配置 Agent", "退出"} {
		if !strings.Contains(output.String(), expected) {
			t.Fatalf("output missing %q: %s", expected, output.String())
		}
	}
	if strings.Contains(output.String(), "1  安装") {
		t.Fatalf("menu should not depend on numbered input: %s", output.String())
	}
}

func TestBannerRendersSemanticVersion(t *testing.T) {
	for _, test := range []struct {
		name    string
		version string
		want    string
	}{
		{name: "plain version", version: "0.4.5", want: "Edge Agent  ·  v0.4.5"},
		{name: "prefixed version", version: "v0.4.5", want: "Edge Agent  ·  v0.4.5"},
		{name: "development build", version: "dev", want: "Edge Agent  ·  dev"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := Banner(test.version); !strings.Contains(got, test.want) {
				t.Fatalf("Banner(%q) = %q, want %q", test.version, got, test.want)
			}
		})
	}
}

func TestMenuUsesBubbleTeaArrowMessages(t *testing.T) {
	m := newModel(context.Background(), Actions{}, "test", InstallForm{})

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
	m = updated.(model)
	if m.selected != 1 {
		t.Fatalf("down should select the second item, got %d", m.selected)
	}

	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyUp})
	m = updated.(model)
	if m.selected != 0 {
		t.Fatalf("up should select the first item, got %d", m.selected)
	}
}

func TestInstallFormSupportsFocusEditingAndAsyncResult(t *testing.T) {
	var received InstallForm
	m := newModel(context.Background(), Actions{
		Install: func(_ context.Context, form InstallForm, output io.Writer) error {
			received = form
			_, err := fmt.Fprint(output, "installation complete")
			return err
		},
	}, "test", InstallForm{Mode: "ws"})

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(model)
	if m.page != pageInstall || m.field != 0 {
		t.Fatalf("enter should open the install form, page=%d field=%d", m.page, m.field)
	}

	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("secret")})
	m = updated.(model)
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(model)
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("ws://master.example.com")})
	m = updated.(model)
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(model)
	updated, command := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(model)
	if command == nil {
		t.Fatal("final enter should start the install action")
	}

	message := command()
	updated, _ = m.Update(message)
	m = updated.(model)
	if m.page != pageResult || m.result != "installation complete" {
		t.Fatalf("unexpected action result: page=%d result=%q", m.page, m.result)
	}
	if received.AgentToken != "secret" || received.MasterURL != "ws://master.example.com" || received.Mode != "ws" {
		t.Fatalf("unexpected install form: %+v", received)
	}
}
