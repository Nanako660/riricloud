package mirror

import (
	"context"
	"net"
	"testing"
)

func TestValidateURLRejectsPrivateAndUntrustedHosts(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1/file", "http://10.0.0.1/file", "http://user:pass@example.com/file"} {
		if _, err := validateURL(context.Background(), raw, []string{"example.com"}); err == nil {
			t.Fatalf("expected %s to be rejected", raw)
		}
	}
	if _, err := validateURL(context.Background(), "https://github.com/file", []string{"example.com"}); err == nil {
		t.Fatal("expected untrusted host to be rejected")
	}
}

func TestBlockedIPIncludesMappedPrivateAddresses(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:192.168.1.1"} {
		if !blockedIP(parseIP(raw)) {
			t.Fatalf("expected %s to be blocked", raw)
		}
	}
}

func TestExecutorRejectsUnsupportedMethodBeforeNetwork(t *testing.T) {
	executor := NewExecutor()
	_, err := executor.Do(context.Background(), Request{Method: "POST", URL: "https://example.com", AllowedHosts: []string{"example.com"}}, func(Headers) error { return nil }, func([]byte) error { return nil })
	if err == nil || err.(*Error).Code != "METHOD_NOT_ALLOWED" {
		t.Fatalf("expected method error, got %v", err)
	}
}

func parseIP(raw string) net.IP { return net.ParseIP(raw) }
