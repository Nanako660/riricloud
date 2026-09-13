package runner

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestAgentProgramStartIsNonBlockingAndStopCancels(t *testing.T) {
	runStarted := make(chan struct{})
	p := &agentProgram{
		options: Options{Version: "test"},
		run: func(ctx context.Context, _ Options) error {
			close(runStarted)
			<-ctx.Done()
			return ctx.Err()
		},
	}
	if err := p.Start(nil); err != nil {
		t.Fatalf("Start: %v", err)
	}
	select {
	case <-runStarted:
	case <-time.After(time.Second):
		t.Fatal("run goroutine did not start")
	}
	if p.cancel == nil {
		t.Fatal("expected cancel func to be captured")
	}
	done := p.done
	if err := p.Stop(nil); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	select {
	case <-done:
	default:
		t.Fatal("expected done channel closed after Stop")
	}
}

func TestAgentProgramRunErrorDoesNotBlockStop(t *testing.T) {
	p := &agentProgram{
		run: func(context.Context, Options) error {
			return errors.New("boom")
		},
	}
	if err := p.Start(nil); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := p.Stop(nil); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	select {
	case <-p.done:
	default:
		t.Fatal("expected done channel closed after Stop")
	}
}

func TestAgentProgramStopWithoutStartIsNoop(t *testing.T) {
	p := &agentProgram{}
	if err := p.Stop(nil); err != nil {
		t.Fatalf("Stop: %v", err)
	}
}
