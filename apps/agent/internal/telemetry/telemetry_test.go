package telemetry

import "testing"

func TestCounterRate(t *testing.T) {
	tests := []struct {
		name          string
		after, before uint64
		want          float64
	}{
		{name: "positive delta", after: 150, before: 100, want: 50},
		{name: "zero delta", after: 100, before: 100, want: 0},
		{name: "counter wrap", after: 10, before: 100, want: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := counterRate(tt.after, tt.before); got != tt.want {
				t.Fatalf("counterRate(%d, %d) = %v, want %v", tt.after, tt.before, got, tt.want)
			}
		})
	}
}

func TestCounterRatesStayIndependent(t *testing.T) {
	upload, download := counterRate(125, 100), counterRate(90, 80)
	if upload != 25 || download != 10 {
		t.Fatalf("unexpected rates: upload=%v download=%v", upload, download)
	}
}
