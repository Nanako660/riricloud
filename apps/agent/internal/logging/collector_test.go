package logging

import (
	"io"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

func TestCollector_PushAndDrain(t *testing.T) {
	c := NewCollector(3)
	c.Push(LogItem{Message: "msg1"})
	c.Push(LogItem{Message: "msg2"})
	c.Push(LogItem{Message: "msg3"})
	c.Push(LogItem{Message: "msg4"}) // msg1 should be dropped

	items := c.Drain(2)
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].Message != "msg2" || items[1].Message != "msg3" {
		t.Fatalf("unexpected items: %+v", items)
	}

	remaining := c.Drain(10)
	if len(remaining) != 1 || remaining[0].Message != "msg4" {
		t.Fatalf("unexpected remaining: %+v", remaining)
	}

	empty := c.Drain(10)
	if empty != nil {
		t.Fatalf("expected nil when empty, got %+v", empty)
	}
}

func TestCollector_NotifyError(t *testing.T) {
	c := NewCollector(10)
	c.Push(LogItem{Level: "INFO", Message: "info msg"})

	select {
	case <-c.NotifyError():
		t.Fatal("should not notify on INFO")
	default:
	}

	c.Push(LogItem{Level: "ERROR", Message: "err msg"})

	select {
	case <-c.NotifyError():
		// ok
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected error notification")
	}
}

func TestHook_FilterStrategy(t *testing.T) {
	collector := NewCollector(100)
	hook := NewHook(collector)

	logger := logrus.New()
	logger.SetOutput(io.Discard)
	logger.SetLevel(logrus.TraceLevel)
	logger.AddHook(hook)

	// 1. Agent 日志：INFO 采集，DEBUG 过滤
	logger.WithField("module", "Test").Info("agent info log")
	logger.WithField("module", "Test").Debug("agent debug log")

	// 2. Sing-box 日志：INFO 过滤，WARN 与 ERROR 采集
	logger.WithFields(logrus.Fields{"source": "SINGBOX", "module": "Singbox"}).Info("singbox connection info")
	logger.WithFields(logrus.Fields{"source": "SINGBOX", "module": "Singbox"}).Warn("singbox warning log")
	logger.WithFields(logrus.Fields{"source": "SINGBOX", "module": "Singbox"}).Error("singbox error log")

	items := collector.Drain(50)
	if len(items) != 3 {
		t.Fatalf("expected exactly 3 logs captured, got %d: %+v", len(items), items)
	}

	// 验证捕获结果
	if items[0].Source != "AGENT" || items[0].Level != "INFO" || items[0].Message != "agent info log" {
		t.Errorf("item 0 mismatch: %+v", items[0])
	}
	if items[1].Source != "SINGBOX" || items[1].Level != "WARN" || items[1].Message != "singbox warning log" {
		t.Errorf("item 1 mismatch: %+v", items[1])
	}
	if items[2].Source != "SINGBOX" || items[2].Level != "ERROR" || items[2].Message != "singbox error log" {
		t.Errorf("item 2 mismatch: %+v", items[2])
	}
}
