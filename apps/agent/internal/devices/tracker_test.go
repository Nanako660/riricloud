package devices

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

type fakeAPI string

func (f fakeAPI) ClashAPIAddress() (string, error) { return string(f), nil }

func makeConnection(id, user, ip string) connection {
	item := connection{ID: id}
	item.Metadata.InboundUser = user
	item.Metadata.SourceIP = ip
	return item
}

func TestParseInboundUserAndNormalizeIP(t *testing.T) {
	user, line, ok := parseInboundUser("user@example.com::line-1")
	if !ok || user != "user@example.com" || line != "line-1" {
		t.Fatalf("unexpected parsed user: %q %q %v", user, line, ok)
	}
	for _, raw := range []string{"pk_secret", "__riricloud_relay_transit__", "00000000-0000-4000-8000-000000000003", ""} {
		if _, _, ok := parseInboundUser(raw); ok {
			t.Errorf("expected %q to be ignored", raw)
		}
	}
	ip, ok := normalizeIP("fe80::1%eth0")
	if !ok || ip != "fe80::1" {
		t.Fatalf("unexpected normalized IP: %q %v", ip, ok)
	}
}

func TestApplySnapshotGroupsAndEnforcesOldestDevice(t *testing.T) {
	var deleted []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("unexpected request method %s", r.Method)
		}
		deleted = append(deleted, r.URL.Path)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	tracker := NewTracker(fakeAPI(server.URL), nil)
	tracker.SetLimits(map[string]int{"user@example.com": 1})
	now := time.Now()
	tracker.mu.Lock()
	tracker.firstSeen[deviceKey("user@example.com", "192.0.2.1")] = now.Add(-time.Minute)
	tracker.firstSeen[deviceKey("user@example.com", "192.0.2.2")] = now
	tracker.mu.Unlock()
	connections := []connection{
		makeConnection("1", "user@example.com::line-a", "192.0.2.1"),
		makeConnection("2", "user@example.com::line-a", "192.0.2.1"),
		makeConnection("3", "user@example.com::line-b", "192.0.2.2"),
		makeConnection("4", "__riricloud_relay_transit__", "192.0.2.3"),
	}
	if err := tracker.applySnapshot(context.Background(), server.URL, connections, now); err != nil {
		t.Fatal(err)
	}
	got := tracker.ReportItems()
	want := []ReportItem{{UserUUID: "user@example.com", IP: "192.0.2.1", LineID: "line-a", Connections: 2, LastSeenAt: now.Unix()}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected reports: %#v", got)
	}
	if !reflect.DeepEqual(deleted, []string{"/connections/3"}) {
		t.Fatalf("unexpected disconnected connections: %#v", deleted)
	}
}

func TestPollSnapshotFailureKeepsLastReport(t *testing.T) {
	tracker := NewTracker(fakeAPI(""), nil)
	now := time.Unix(1_700_000_000, 0)
	tracker.reports = []ReportItem{{UserUUID: "user", IP: "192.0.2.1", Connections: 1, LastSeenAt: now.Unix()}}
	before := tracker.ReportItems()
	tracker.SetLimits(map[string]int{})
	if got := tracker.ReportItems(); !reflect.DeepEqual(got, before) {
		t.Fatalf("setting limits unexpectedly changed report: %#v", got)
	}
}

func TestKickBlocksAndClosesMatchingConnections(t *testing.T) {
	var deleted []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(connectionSnapshot{Connections: []connection{
				makeConnection("one", "user@example.com::line", "192.0.2.1"),
				makeConnection("two", "user@example.com::line", "192.0.2.2"),
			}})
		case http.MethodDelete:
			deleted = append(deleted, r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected method %s", r.Method)
		}
	}))
	defer server.Close()
	tracker := NewTracker(fakeAPI(server.URL), nil)
	kicked, err := tracker.Kick(context.Background(), []KickItem{{UserUUID: "user@example.com", IP: "192.0.2.2", BlockDurationSecs: 30}})
	if err != nil {
		t.Fatal(err)
	}
	if kicked != 1 || !reflect.DeepEqual(deleted, []string{"/connections/two"}) {
		t.Fatalf("unexpected kick result count=%d deleted=%#v", kicked, deleted)
	}
	tracker.mu.RLock()
	blockedUntil := tracker.blocked[deviceKey("user@example.com", "192.0.2.2")]
	tracker.mu.RUnlock()
	if !blockedUntil.After(time.Now().Add(20 * time.Second)) {
		t.Fatalf("expected device block to remain active, got %v", blockedUntil)
	}
}
