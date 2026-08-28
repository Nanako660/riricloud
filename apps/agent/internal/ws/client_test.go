package ws

import (
	"testing"
	"time"
)

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
