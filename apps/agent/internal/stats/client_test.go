package stats

import (
	"context"
	"testing"
)

func TestRecordsFromCountersAggregatesUserTraffic(t *testing.T) {
	records := recordsFromCounters([]Counter{
		{Name: "user>>>z@example.com>>>traffic>>>downlink", Value: 200},
		{Name: "user>>>z@example.com>>>traffic>>>uplink", Value: 100},
		{Name: "user>>>a@example.com>>>traffic>>>uplink", Value: 50},
		{Name: "inbound>>>line>>>traffic>>>uplink", Value: 999},
		{Name: "user>>>a@example.com>>>traffic>>>unknown", Value: 999},
		{Name: "user>>>a@example.com>>>traffic>>>downlink", Value: -1},
	})

	if len(records) != 2 {
		t.Fatalf("got %d records, want 2", len(records))
	}
	if records[0] != (Record{UserID: "a@example.com", UploadTotal: 50}) {
		t.Fatalf("unexpected first record: %+v", records[0])
	}
	if records[1] != (Record{UserID: "z@example.com", UploadTotal: 100, DownloadTotal: 200}) {
		t.Fatalf("unexpected second record: %+v", records[1])
	}
}

func TestCollectorUsesConfiguredQuery(t *testing.T) {
	collector := &Collector{
		query: func(context.Context, string) ([]Counter, error) {
			return []Counter{{Name: "user>>>user-1>>>traffic>>>uplink", Value: 64}}, nil
		},
	}
	records, err := collector.Collect(context.Background(), "127.0.0.1:1")
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if len(records) != 1 || records[0].UserID != "user-1" || records[0].UploadTotal != 64 {
		t.Fatalf("unexpected records: %+v", records)
	}
}
