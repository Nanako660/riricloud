package devices

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

const (
	pollInterval       = 2 * time.Second
	requestTimeout     = 1500 * time.Millisecond
	maxConnectionsBody = 4 << 20
	maxReports         = 1024
	staleFirstSeen     = 5 * time.Minute
	defaultBlockFor    = 60 * time.Second
)

var ignoredUsers = map[string]struct{}{
	"__riricloud_relay_transit__":          {},
	"00000000-0000-4000-8000-000000000002": {},
	"__riricloud_speedtest_probe__":        {},
	"00000000-0000-4000-8000-000000000003": {},
}

// ReportItem is one user's active client IP on this node and line.
type ReportItem struct {
	UserUUID    string `json:"userUuid"`
	IP          string `json:"ip"`
	LineID      string `json:"lineId,omitempty"`
	Connections int    `json:"connections"`
	LastSeenAt  int64  `json:"lastSeenAt"`
}

// KickItem identifies one user's device to disconnect. An empty IP means all devices.
type KickItem struct {
	UserUUID          string `json:"userUuid"`
	IP                string `json:"ip,omitempty"`
	BlockDurationSecs int    `json:"blockDurationSecs,omitempty"`
}

// API exposes the loopback Clash API address from the currently applied Sing-box config.
type API interface {
	ClashAPIAddress() (string, error)
}

type connectionSnapshot struct {
	Connections []connection `json:"connections"`
}

type connection struct {
	ID       string `json:"id"`
	Metadata struct {
		InboundUser string `json:"inboundUser"`
		SourceIP    string `json:"sourceIP"`
	} `json:"metadata"`
}

type activeConnection struct {
	id     string
	user   string
	ip     string
	lineID string
}

type Tracker struct {
	api    API
	client *http.Client
	log    *logrus.Entry

	mu         sync.RWMutex
	limits     map[string]int
	reports    []ReportItem
	firstSeen  map[string]time.Time
	lastActive map[string]time.Time
	blocked    map[string]time.Time

	lastErrorLog time.Time
}

func NewTracker(api API, log *logrus.Entry) *Tracker {
	return &Tracker{
		api: api,
		client: &http.Client{
			Timeout: requestTimeout,
			Transport: &http.Transport{
				Proxy: nil, // Never route a privileged local-control request through a proxy.
			},
		},
		log:        log,
		limits:     make(map[string]int),
		firstSeen:  make(map[string]time.Time),
		lastActive: make(map[string]time.Time),
		blocked:    make(map[string]time.Time),
	}
}

// SetLimits atomically replaces local per-user active-device limits. Missing/zero values are unlimited.
func (t *Tracker) SetLimits(limits map[string]int) {
	copy := make(map[string]int, len(limits))
	for user, limit := range limits {
		user = strings.TrimSpace(user)
		if user != "" && limit > 0 {
			copy[user] = limit
		}
	}
	t.mu.Lock()
	t.limits = copy
	t.mu.Unlock()
}

// ReportItems returns a detached snapshot for WS heartbeat or HTTP poll payloads.
func (t *Tracker) ReportItems() []ReportItem {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return append([]ReportItem(nil), t.reports...)
}

// Run polls the loopback Clash API until ctx is cancelled. Poll failures leave the last successful
// snapshot intact so the Master naturally expires it using its configured online window.
func (t *Tracker) Run(ctx context.Context) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		if err := t.pollOnce(ctx); err != nil {
			t.logPollError(err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (t *Tracker) logPollError(err error) {
	if t.log == nil {
		return
	}
	now := time.Now()
	t.mu.Lock()
	shouldLog := now.Sub(t.lastErrorLog) >= time.Minute
	if shouldLog {
		t.lastErrorLog = now
	}
	t.mu.Unlock()
	if shouldLog {
		t.log.WithError(err).Warn("poll local sing-box device API failed")
	}
}

func (t *Tracker) pollOnce(ctx context.Context) error {
	if t.api == nil {
		return nil
	}
	baseURL, err := t.api.ClashAPIAddress()
	if err != nil {
		return err
	}
	if baseURL == "" {
		return nil
	}
	connections, err := t.fetchConnections(ctx, baseURL)
	if err != nil {
		return err
	}
	now := time.Now()
	return t.applySnapshot(ctx, baseURL, connections, now)
}

func (t *Tracker) attachAuthHeader(req *http.Request) {
	if provider, ok := t.api.(interface{ ClashAPISecret() string }); ok {
		if secret := strings.TrimSpace(provider.ClashAPISecret()); secret != "" {
			req.Header.Set("Authorization", "Bearer "+secret)
		}
	}
}

func (t *Tracker) fetchConnections(ctx context.Context, baseURL string) ([]connection, error) {
	endpoint, err := apiEndpoint(baseURL, "/connections")
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create Clash API request: %w", err)
	}
	t.attachAuthHeader(req)
	resp, err := t.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request Clash API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Clash API returned %s", resp.Status)
	}
	var snapshot connectionSnapshot
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxConnectionsBody)).Decode(&snapshot); err != nil {
		return nil, fmt.Errorf("decode Clash API connections: %w", err)
	}
	return snapshot.Connections, nil
}

func (t *Tracker) blockedUntilLocked(user, ip string) time.Time {
	blockedUntil := t.blocked[deviceKey(user, ip)]
	if allBlocked := t.blocked[deviceKey(user, "*")]; allBlocked.After(blockedUntil) {
		blockedUntil = allBlocked
	}
	return blockedUntil
}

func (t *Tracker) applySnapshot(ctx context.Context, baseURL string, raw []connection, now time.Time) error {
	active := make([]activeConnection, 0, len(raw))
	for _, item := range raw {
		user, lineID, ok := parseInboundUser(item.Metadata.InboundUser)
		if !ok || item.ID == "" {
			continue
		}
		ip, ok := normalizeIP(item.Metadata.SourceIP)
		if !ok {
			continue
		}
		active = append(active, activeConnection{id: item.ID, user: user, ip: ip, lineID: lineID})
	}

	t.mu.Lock()
	t.pruneStateLocked(now)
	unblockedActive := make([]activeConnection, 0, len(active))
	for _, item := range active {
		if t.blockedUntilLocked(item.user, item.ip).After(now) {
			continue
		}
		key := deviceKey(item.user, item.ip)
		if _, exists := t.firstSeen[key]; !exists {
			t.firstSeen[key] = now
		}
		t.lastActive[key] = now
		unblockedActive = append(unblockedActive, item)
	}

	allowed := t.allowedDevicesLocked(unblockedActive)
	grouped := make(map[string]*ReportItem)
	toClose := make([]string, 0)
	for _, item := range active {
		key := deviceKey(item.user, item.ip)
		blockedUntil := t.blockedUntilLocked(item.user, item.ip)
		_, overLimit := allowed[item.user][item.ip]
		if overLimit && !blockedUntil.After(now) {
			blockedUntil = now.Add(defaultBlockFor)
			t.blocked[key] = blockedUntil
			delete(t.firstSeen, key)
			delete(t.lastActive, key)
		}
		if blockedUntil.After(now) {
			toClose = append(toClose, item.id)
			continue
		}
		groupKey := item.user + "\x00" + item.ip + "\x00" + item.lineID
		report := grouped[groupKey]
		if report == nil {
			report = &ReportItem{UserUUID: item.user, IP: item.ip, LineID: item.lineID}
			grouped[groupKey] = report
		}
		report.Connections++
		report.LastSeenAt = now.Unix()
	}

	reports := make([]ReportItem, 0, len(grouped))
	for _, report := range grouped {
		reports = append(reports, *report)
	}
	sort.Slice(reports, func(i, j int) bool {
		if reports[i].UserUUID != reports[j].UserUUID {
			return reports[i].UserUUID < reports[j].UserUUID
		}
		if reports[i].IP != reports[j].IP {
			return reports[i].IP < reports[j].IP
		}
		return reports[i].LineID < reports[j].LineID
	})
	if len(reports) > maxReports {
		reports = reports[:maxReports]
	}
	t.reports = reports
	t.mu.Unlock()

	for _, id := range toClose {
		if err := t.closeConnection(ctx, baseURL, id); err != nil && t.log != nil {
			t.log.WithError(err).Debug("disconnect excess device connection failed")
		}
	}
	return nil
}

// allowedDevicesLocked returns excess user/IP pairs when the locally observed number exceeds a limit.
func (t *Tracker) allowedDevicesLocked(active []activeConnection) map[string]map[string]struct{} {
	byUser := make(map[string]map[string]time.Time)
	for _, item := range active {
		if byUser[item.user] == nil {
			byUser[item.user] = make(map[string]time.Time)
		}
		byUser[item.user][item.ip] = t.firstSeen[deviceKey(item.user, item.ip)]
	}
	excess := make(map[string]map[string]struct{})
	for user, ips := range byUser {
		limit := t.limits[user]
		if limit <= 0 || len(ips) <= limit {
			continue
		}
		ordered := make([]string, 0, len(ips))
		for ip := range ips {
			ordered = append(ordered, ip)
		}
		sort.Slice(ordered, func(i, j int) bool {
			left, right := ips[ordered[i]], ips[ordered[j]]
			if left.Equal(right) {
				return ordered[i] < ordered[j]
			}
			return left.Before(right)
		})
		for _, ip := range ordered[limit:] {
			if excess[user] == nil {
				excess[user] = make(map[string]struct{})
			}
			excess[user][ip] = struct{}{}
		}
	}
	return excess
}

func (t *Tracker) closeConnection(ctx context.Context, baseURL, id string) error {
	endpoint, err := apiEndpoint(baseURL, "/connections/"+url.PathEscape(id))
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create disconnect request: %w", err)
	}
	t.attachAuthHeader(req)
	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("disconnect connection: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("disconnect connection returned %s", resp.Status)
	}
	return nil
}

func matchesKickTarget(user, ip string, items []KickItem) bool {
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item.UserUUID), strings.TrimSpace(user)) &&
			(strings.TrimSpace(item.IP) == "" || normalizeIPEqual(item.IP, ip)) {
			return true
		}
	}
	return false
}

// Kick blocks matching devices for a bounded interval, then closes all matching current connections.
func (t *Tracker) Kick(ctx context.Context, items []KickItem) (int, error) {
	if t.api == nil {
		return 0, fmt.Errorf("local Clash API is unavailable")
	}
	baseURL, err := t.api.ClashAPIAddress()
	if err != nil {
		return 0, err
	}
	if baseURL == "" {
		return 0, fmt.Errorf("local Clash API is not configured")
	}
	if len(items) == 0 {
		return 0, fmt.Errorf("kick request is empty")
	}
	normalizedItems := make([]KickItem, 0, len(items))
	for _, item := range items {
		user := strings.TrimSpace(item.UserUUID)
		if user == "" {
			return 0, fmt.Errorf("kick target user is empty")
		}
		ip := ""
		if strings.TrimSpace(item.IP) != "" {
			var ok bool
			ip, ok = normalizeIP(item.IP)
			if !ok {
				return 0, fmt.Errorf("invalid kick target IP")
			}
		}
		duration := time.Duration(item.BlockDurationSecs) * time.Second
		if duration <= 0 {
			duration = defaultBlockFor
		}
		if duration > 24*time.Hour {
			duration = 24 * time.Hour
		}
		normalizedItems = append(normalizedItems, KickItem{
			UserUUID: user, IP: ip, BlockDurationSecs: int(duration / time.Second),
		})
	}
	items = normalizedItems
	now := time.Now()
	t.mu.Lock()
	for _, item := range items {
		keyIP := item.IP
		if keyIP == "" {
			keyIP = "*"
			prefix := item.UserUUID + "\x00"
			for key := range t.firstSeen {
				if strings.HasPrefix(key, prefix) || strings.HasPrefix(strings.ToLower(key), strings.ToLower(prefix)) {
					delete(t.firstSeen, key)
					delete(t.lastActive, key)
				}
			}
		} else {
			key := deviceKey(item.UserUUID, keyIP)
			delete(t.firstSeen, key)
			delete(t.lastActive, key)
		}
		t.blocked[deviceKey(item.UserUUID, keyIP)] = now.Add(time.Duration(item.BlockDurationSecs) * time.Second)
	}
	if len(t.reports) > 0 {
		filtered := make([]ReportItem, 0, len(t.reports))
		for _, report := range t.reports {
			if matchesKickTarget(report.UserUUID, report.IP, items) {
				continue
			}
			filtered = append(filtered, report)
		}
		t.reports = filtered
	}
	t.mu.Unlock()

	connections, err := t.fetchConnections(ctx, baseURL)
	if err != nil {
		return 0, err
	}
	kicked := 0
	var firstErr error
	for _, connection := range connections {
		user, _, ok := parseInboundUser(connection.Metadata.InboundUser)
		if !ok {
			continue
		}
		ip, validIP := normalizeIP(connection.Metadata.SourceIP)
		if !validIP {
			continue
		}
		if !matchesKickTarget(user, ip, items) || connection.ID == "" {
			continue
		}
		if err := t.closeConnection(ctx, baseURL, connection.ID); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		kicked++
	}
	if firstErr != nil {
		return kicked, firstErr
	}
	return kicked, nil
}

func parseInboundUser(raw string) (string, string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(strings.ToLower(value), "pk_") {
		return "", "", false
	}
	user, lineID, _ := strings.Cut(value, "::")
	user = strings.TrimSpace(user)
	if user == "" || strings.HasPrefix(strings.ToLower(user), "pk_") {
		return "", "", false
	}
	if _, ignored := ignoredUsers[strings.ToLower(user)]; ignored {
		return "", "", false
	}
	return user, strings.TrimSpace(lineID), true
}

func normalizeIP(raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if zone := strings.LastIndexByte(value, '%'); zone >= 0 {
		value = value[:zone]
	}
	ip := net.ParseIP(value)
	if ip == nil || ip.IsLoopback() || ip.IsUnspecified() {
		return "", false
	}
	return ip.String(), true
}

func normalizeIPEqual(left, right string) bool {
	normalized, ok := normalizeIP(left)
	return ok && normalized == right
}

func apiEndpoint(baseURL, endpointPath string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" || parsed.User != nil {
		return "", fmt.Errorf("invalid local Clash API address")
	}
	ip := net.ParseIP(parsed.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return "", fmt.Errorf("Clash API address must use a loopback IP literal")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + endpointPath
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func deviceKey(user, ip string) string { return user + "\x00" + ip }

func (t *Tracker) pruneStateLocked(now time.Time) {
	for key, seen := range t.firstSeen {
		lastSeen := t.lastActive[key]
		if lastSeen.IsZero() {
			lastSeen = seen
		}
		if now.Sub(lastSeen) > staleFirstSeen {
			delete(t.firstSeen, key)
			delete(t.lastActive, key)
		}
	}
	for key, until := range t.blocked {
		if !until.After(now) {
			delete(t.blocked, key)
		}
	}
}
