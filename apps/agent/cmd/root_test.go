package cmd

import (
	"bytes"
	"context"
	"testing"

	"github.com/Nanako660/riricloud/apps/agent/internal/runner"
)

func TestVersionCommand(t *testing.T) {
	var output bytes.Buffer
	root := NewRootCommand(Options{
		Version: "0.4.1",
		Out:     &output,
		ErrOut:  &output,
		Run: func(context.Context, runner.Options) error {
			return nil
		},
	})
	root.SetArgs([]string{"version"})

	if err := root.Execute(); err != nil {
		t.Fatalf("version command: %v", err)
	}
	if got := output.String(); got != "riri-agent 0.4.1\n" {
		t.Fatalf("unexpected version output: %q", got)
	}
}
