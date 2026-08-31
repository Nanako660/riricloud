// Package probe 实现 Agent 接收的轻量网络诊断任务。
package probe

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Type string

const (
	TCP  Type = "tcp"
	DNS  Type = "dns"
	ICMP Type = "icmp"
)

type Request struct {
	Type      Type
	Target    string
	Port      int
	TimeoutMs int
}

type Result struct {
	Type              Type     `json:"type"`
	Target            string   `json:"target"`
	Success           bool     `json:"success"`
	LatencyMs         int64    `json:"latencyMs,omitempty"`
	Addresses         []string `json:"addresses,omitempty"`
	PacketLossPercent int      `json:"packetLossPercent"`
	Message           string   `json:"message,omitempty"`
}

func Run(ctx context.Context, requests []Request) []Result {
	results := make([]Result, 0, len(requests))
	for _, request := range requests {
		results = append(results, runOne(ctx, request))
	}
	return results
}

func runOne(parent context.Context, request Request) Result {
	result := Result{Type: request.Type, Target: request.Target}
	result.PacketLossPercent = 100
	if strings.TrimSpace(request.Target) == "" {
		result.Message = "probe target is required"
		return result
	}
	timeout := time.Duration(request.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	started := time.Now()

	var err error
	var addresses []string
	switch request.Type {
	case TCP:
		err = runTCP(ctx, request.Target, request.Port)
	case DNS:
		addresses, err = runDNS(ctx, request.Target)
	case ICMP:
		err = runICMP(ctx, request.Target, timeout)
	default:
		err = fmt.Errorf("unsupported probe type %q", request.Type)
	}
	if err != nil {
		result.Message = err.Error()
		return result
	}
	result.Success = true
	result.LatencyMs = time.Since(started).Milliseconds()
	result.Addresses = addresses
	result.PacketLossPercent = 0
	return result
}

func runTCP(ctx context.Context, target string, port int) error {
	address := target
	if port > 0 {
		address = net.JoinHostPort(target, strconv.Itoa(port))
	} else if _, _, err := net.SplitHostPort(target); err != nil {
		return fmt.Errorf("tcp probe requires port")
	}
	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("tcp handshake: %w", err)
	}
	if err := conn.Close(); err != nil {
		return fmt.Errorf("close tcp probe: %w", err)
	}
	return nil
}

func runDNS(ctx context.Context, target string) ([]string, error) {
	addresses, err := net.DefaultResolver.LookupHost(ctx, target)
	if err != nil {
		return nil, fmt.Errorf("dns lookup: %w", err)
	}
	return addresses, nil
}

func runICMP(ctx context.Context, target string, timeout time.Duration) error {
	path, err := exec.LookPath("ping")
	if err != nil {
		return fmt.Errorf("ping command unavailable: %w", err)
	}
	var args []string
	if runtime.GOOS == "windows" {
		args = []string{"-n", "1", "-w", strconv.FormatInt(timeout.Milliseconds(), 10), target}
	} else {
		args = []string{"-c", "1", "-W", strconv.FormatInt(maxInt64(1, int64(timeout.Seconds())), 10), target}
	}
	if output, err := exec.CommandContext(ctx, path, args...).CombinedOutput(); err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("icmp ping: %s", message)
	}
	return nil
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
