package logging

import (
	"sync"

	"github.com/sirupsen/logrus"
)

// LogItem 单条上报日志结构（与主控 agent-message.ts 中 AgentLogItem 契约一致）
type LogItem struct {
	Level    string                 `json:"level"`
	Module   string                 `json:"module"`
	Source   string                 `json:"source,omitempty"`
	Message  string                 `json:"message"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// Collector 线程安全非阻塞有界环形日志收集器
type Collector struct {
	mu          sync.Mutex
	items       []LogItem
	capacity    int
	notifyError chan struct{}
}

// NewCollector 创建指定容量的有界日志收集器
func NewCollector(capacity int) *Collector {
	if capacity <= 0 {
		capacity = 500
	}
	return &Collector{
		items:       make([]LogItem, 0, capacity),
		capacity:    capacity,
		notifyError: make(chan struct{}, 1),
	}
}

// Push 向缓冲区插入一条日志；超出容量时丢弃最旧日志，永不阻塞
func (c *Collector) Push(item LogItem) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.items) >= c.capacity {
		c.items = c.items[1:]
	}
	c.items = append(c.items, item)

	if item.Level == "ERROR" {
		select {
		case c.notifyError <- struct{}{}:
		default:
		}
	}
}

// Drain 原子取出至多 maxCount 条缓冲日志
func (c *Collector) Drain(maxCount int) []LogItem {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.items) == 0 {
		return nil
	}
	if maxCount <= 0 || maxCount >= len(c.items) {
		out := c.items
		c.items = make([]LogItem, 0, c.capacity)
		return out
	}
	out := c.items[:maxCount]
	c.items = append([]LogItem(nil), c.items[maxCount:]...)
	return out
}

// NotifyError 返回一个通道，当发生 ERROR 日志时触发通知以支持秒级快速上报
func (c *Collector) NotifyError() <-chan struct{} {
	return c.notifyError
}

// Hook 实现 logrus.Hook 接口，用于拦截 logger 输出并按策略推入 Collector
type Hook struct {
	collector *Collector
}

// NewHook 创建 logrus Hook
func NewHook(collector *Collector) *Hook {
	return &Hook{collector: collector}
}

// Levels 监听全部 logrus 日志级别
func (h *Hook) Levels() []logrus.Level {
	return logrus.AllLevels
}

// Fire 处理拦截到的每条日志
func (h *Hook) Fire(entry *logrus.Entry) error {
	if h.collector == nil {
		return nil
	}

	source := "AGENT"
	if s, ok := entry.Data["source"].(string); ok && s != "" {
		source = s
	} else if m, ok := entry.Data["module"].(string); ok && m == "Singbox" {
		source = "SINGBOX"
	}

	// 分级过滤策略：
	// 1. Sing-box 日常仅上报 WARN/ERROR，过滤海量普通连接日志以防冲击数据库与带宽
	// 2. Agent 运行日志上报 INFO/WARN/ERROR
	if source == "SINGBOX" {
		if entry.Level > logrus.WarnLevel {
			return nil
		}
	} else {
		if entry.Level > logrus.InfoLevel {
			return nil
		}
	}

	var levelStr string
	switch entry.Level {
	case logrus.PanicLevel, logrus.FatalLevel, logrus.ErrorLevel:
		levelStr = "ERROR"
	case logrus.WarnLevel:
		levelStr = "WARN"
	case logrus.InfoLevel:
		levelStr = "INFO"
	default:
		levelStr = "DEBUG"
	}

	moduleStr := "Agent"
	if m, ok := entry.Data["module"].(string); ok && m != "" {
		moduleStr = m
	}

	var metadata map[string]interface{}
	if len(entry.Data) > 0 {
		metadata = make(map[string]interface{}, len(entry.Data))
		for k, v := range entry.Data {
			if k == "source" || k == "module" {
				continue
			}
			metadata[k] = v
		}
	}

	h.collector.Push(LogItem{
		Level:    levelStr,
		Module:   moduleStr,
		Source:   source,
		Message:  entry.Message,
		Metadata: metadata,
	})

	return nil
}
