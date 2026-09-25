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
	for _, lo := range []string{"127.0.0.1", "::1", "0.0.0.0", "::"} {
		if _, ok := normalizeIP(lo); ok {
			t.Fatalf("expected loopback/unspecified IP %q to be ignored", lo)
		}
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
		makeConnection("5", "user@example.com::line-a", "127.0.0.1"),
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

func TestBlockedDeviceRetryDoesNotLockOutLegitimateNewDevice(t *testing.T) {
	var deleted []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(connectionSnapshot{Connections: []connection{
				makeConnection("old-conn", "user@example.com::line-a", "192.0.2.1"),
			}})
		case http.MethodDelete:
			deleted = append(deleted, r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer server.Close()

	tracker := NewTracker(fakeAPI(server.URL), nil)
	tracker.SetLimits(map[string]int{"user@example.com": 1})
	baseNow := time.Now()

	// Step 1: 192.0.2.1 connects first.
	if err := tracker.applySnapshot(context.Background(), server.URL, []connection{
		makeConnection("old-conn", "user@example.com::line-a", "192.0.2.1"),
	}, baseNow); err != nil {
		t.Fatal(err)
	}

	// Step 2: Admin kicks 192.0.2.1; report is immediately evicted and firstSeen is cleared.
	if _, err := tracker.Kick(context.Background(), []KickItem{{UserUUID: "user@example.com", IP: "192.0.2.1", BlockDurationSecs: 60}}); err != nil {
		t.Fatal(err)
	}
	if got := tracker.ReportItems(); len(got) != 0 {
		t.Fatalf("expected kicked device to be evicted from reports immediately, got %#v", got)
	}

	// Step 3: While 192.0.2.1 is still blocked and retrying, legitimate new device 192.0.2.2 connects.
	deleted = nil
	nextNow := baseNow.Add(5 * time.Second)
	if err := tracker.applySnapshot(context.Background(), server.URL, []connection{
		makeConnection("retry-blocked", "user@example.com::line-a", "192.0.2.1"),
		makeConnection("new-valid", "user@example.com::line-a", "192.0.2.2"),
	}, nextNow); err != nil {
		t.Fatal(err)
	}

	// Only retry-blocked should be closed; 192.0.2.2 must remain online and unblocked!
	if !reflect.DeepEqual(deleted, []string{"/connections/retry-blocked"}) {
		t.Fatalf("expected only blocked retry connection to be closed, got %#v", deleted)
	}
	got := tracker.ReportItems()
	want := []ReportItem{{UserUUID: "user@example.com", IP: "192.0.2.2", LineID: "line-a", Connections: 1, LastSeenAt: nextNow.Unix()}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected legitimate new device to be reported online, got %#v", got)
	}

	// Step 4: After block expires (65s later), 192.0.2.1 reconnects while 192.0.2.2 is still active;
	// because 192.0.2.1's old firstSeen was cleared when kicked, 192.0.2.2 stays allowed and 192.0.2.1 is excess.
	deleted = nil
	afterBlock := baseNow.Add(65 * time.Second)
	if err := tracker.applySnapshot(context.Background(), server.URL, []connection{
		makeConnection("reconnected-old", "user@example.com::line-a", "192.0.2.1"),
		makeConnection("still-active-new", "user@example.com::line-a", "192.0.2.2"),
	}, afterBlock); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(deleted, []string{"/connections/reconnected-old"}) {
		t.Fatalf("expected reconnecting kicked device to be treated as newer excess, got %#v", deleted)
	}
}

func TestContinuouslyActiveDeviceRetainsFirstSeenPastStaleWindow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	tracker := NewTracker(fakeAPI(server.URL), nil)
	tracker.SetLimits(map[string]int{"user@example.com": 1})
	t0 := time.Now()

	// Device 1 connects at t0 and stays active at t0 + 25h.
	if err := tracker.applySnapshot(context.Background(), server.URL, []connection{
		makeConnection("c1", "user@example.com::line-a", "192.0.2.10"),
	}, t0); err != nil {
		t.Fatal(err)
	}
	t1 := t0.Add(25 * time.Hour)
	tracker.mu.Lock()
	tracker.lastActive[deviceKey("user@example.com", "192.0.2.10")] = t1.Add(-2 * time.Second)
	tracker.mu.Unlock()

	if err := tracker.applySnapshot(context.Background(), server.URL, []connection{
		makeConnection("c1", "user@example.com::line-a", "192.0.2.10"),
		makeConnection("c2", "user@example.com::line-a", "192.0.2.20"),
	}, t1); err != nil {
		t.Fatal(err)
	}
	got := tracker.ReportItems()
	if len(got) != 1 || got[0].IP != "192.0.2.10" {
		t.Fatalf("expected continuously active device 192.0.2.10 to retain priority past 24h, got %#v", got)
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

type fakeSecretAPI struct {
	addr   string
	secret string
}

func (f fakeSecretAPI) ClashAPIAddress() (string, error) { return f.addr, nil }
func (f fakeSecretAPI) ClashAPISecret() string           { return f.secret }

func TestKickBlocksAndClosesMatchingConnections(t *testing.T) {
	var deleted []string
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
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
	tracker := NewTracker(fakeSecretAPI{addr: server.URL, secret: "s3cr3t"}, nil)
	kicked, err := tracker.Kick(context.Background(), []KickItem{{UserUUID: "user@example.com", IP: "192.0.2.2", BlockDurationSecs: 30}})
	if err != nil {
		t.Fatal(err)
	}
	if authHeader != "Bearer s3cr3t" {
		t.Fatalf("expected Authorization Bearer header, got %q", authHeader)
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

func TestTrackerReportItemsAlwaysReturnsNonNilSlice(t *testing.T) {
	tracker := NewTracker(fakeAPI(""), nil)
	initial := tracker.ReportItems()
	if initial == nil {
		t.Fatalf("expected initial ReportItems() to be non-nil slice")
	}
	raw, err := json.Marshal(struct {
		OnlineDevices []ReportItem `json:"onlineDevices"`
	}{OnlineDevices: initial})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if string(raw) != `{"onlineDevices":[]}` {
		t.Fatalf("expected empty JSON array, got %s", string(raw))
	}

	if err := tracker.applySnapshot(context.Background(), "http://127.0.0.1:10086", nil, time.Now()); err != nil {
		t.Fatalf("applySnapshot failed: %v", err)
	}
	afterEmpty := tracker.ReportItems()
	if afterEmpty == nil {
		t.Fatalf("expected ReportItems() after empty snapshot to be non-nil slice")
	}
}
