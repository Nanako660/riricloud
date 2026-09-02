package poll

import (
	"encoding/json"
	"testing"
)

func TestPollJSONIncludesSplitRates(t *testing.T) {
	payload, err := json.Marshal(pollPayload{BandwidthRate: 768, UploadRate: 256, DownloadRate: 512, TrafficRecords: []pollTrafficRecord{}})
	if err != nil {
		t.Fatalf("marshal poll payload: %v", err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal poll payload: %v", err)
	}
	var uploadRate, downloadRate, bandwidthRate float64
	if err := json.Unmarshal(decoded["uploadRate"], &uploadRate); err != nil {
		t.Fatalf("decode upload rate: %v", err)
	}
	if err := json.Unmarshal(decoded["downloadRate"], &downloadRate); err != nil {
		t.Fatalf("decode download rate: %v", err)
	}
	if err := json.Unmarshal(decoded["bandwidthRate"], &bandwidthRate); err != nil {
		t.Fatalf("decode bandwidth rate: %v", err)
	}
	if uploadRate != 256 || downloadRate != 512 || bandwidthRate != 768 {
		t.Fatalf("unexpected split rates: %#v", decoded)
	}
}

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
