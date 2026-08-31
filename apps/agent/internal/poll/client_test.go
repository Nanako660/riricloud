package poll

import (
	"testing"
)

func TestResolvePollURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "root", in: "https://master.example.com", want: "https://master.example.com/api/v1/agent/poll"},
		{name: "root slash", in: "http://localhost:3000/", want: "http://localhost:3000/api/v1/agent/poll"},
		{name: "legacy path", in: "https://master.example.com/ws/agent", want: "https://master.example.com/api/v1/agent/poll"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolvePollURL(tt.in)
			if err != nil {
				t.Fatalf("resolvePollURL: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolvePollURL(%q)=%q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestResolvePollURLRejectsWS(t *testing.T) {
	if _, err := resolvePollURL("wss://master.example.com/ws/agent"); err == nil {
		t.Fatal("expected WS URL to be rejected by HTTP client")
	}
}
