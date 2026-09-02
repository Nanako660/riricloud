package ws

import (
	"encoding/json"
	"testing"
	"time"
)

func TestHeartbeatJSONIncludesSplitRates(t *testing.T) {
	payload, err := json.Marshal(heartbeatData{BandwidthRate: 768, UploadRate: 256, DownloadRate: 512, TrafficRecords: []heartbeatTraffic{}})
	if err != nil {
		t.Fatalf("marshal heartbeat: %v", err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal heartbeat: %v", err)
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

func TestJitterStaysWithinBounds(t *testing.T) {
	base := 8 * time.Second
	spread := 2 * time.Second // ±25%
	for i := 0; i < 1000; i++ {
		got := jitter(base)
		if got < base-spread || got > base+spread {
			t.Fatalf("jitter out of bounds: %v (base=%v)", got, base)
		}
	}
}

func TestMinDuration(t *testing.T) {
	cases := []struct {
		a, b, want time.Duration
	}{
		{time.Second, 2 * time.Second, time.Second},
		{60 * time.Second, 120 * time.Second, 60 * time.Second},
	}
	for _, c := range cases {
		if got := min(c.a, c.b); got != c.want {
			t.Fatalf("min(%v,%v)=%v, want %v", c.a, c.b, got, c.want)
		}
	}
}
