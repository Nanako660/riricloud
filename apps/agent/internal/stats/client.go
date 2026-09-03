// Package stats 读取 Sing-box V2Ray API 的按用户流量计数。
package stats

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const DefaultAddress = "127.0.0.1:10085"

// Record 是 Sing-box 返回的用户累计流量快照。
type Record struct {
	UserID        string
	UploadTotal   uint64
	DownloadTotal uint64
}

// Counter 是 V2Ray API 返回的单个计数，单独定义便于测试解析逻辑。
type Counter struct {
	Name  string
	Value int64
}

type queryFunc func(context.Context, string) ([]Counter, error)

// Collector 通过 reset=false 读取 Sing-box 累计计数，Master 负责计算增量。
type Collector struct {
	log   *logrus.Entry
	query queryFunc
}

func NewCollector(log *logrus.Entry) *Collector {
	return &Collector{log: log, query: queryStats}
}

func (c *Collector) Collect(ctx context.Context, address string) ([]Record, error) {
	if strings.TrimSpace(address) == "" {
		address = DefaultAddress
	}
	counters, err := c.query(ctx, address)
	if err != nil {
		return nil, err
	}
	return recordsFromCounters(counters), nil
}

func queryStats(parent context.Context, address string) ([]Counter, error) {
	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()
	conn, err := grpc.DialContext(
		ctx,
		address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("dial sing-box stats API: %w", err)
	}
	defer conn.Close()

	response, err := NewStatsServiceClient(conn).QueryStats(ctx, &QueryStatsRequest{
		Patterns: []string{"user>>>"},
		Reset_:   false,
	})
	if err != nil {
		return nil, fmt.Errorf("query sing-box stats: %w", err)
	}
	counters := make([]Counter, 0, len(response.GetStat()))
	for _, item := range response.GetStat() {
		if item == nil {
			continue
		}
		counters = append(counters, Counter{Name: item.GetName(), Value: item.GetValue()})
	}
	return counters, nil
}

func recordsFromCounters(counters []Counter) []Record {
	byUser := make(map[string]*Record)
	for _, counter := range counters {
		parts := strings.Split(counter.Name, ">>>")
		if len(parts) != 4 || parts[0] != "user" || parts[2] != "traffic" || counter.Value <= 0 {
			continue
		}
		userID := parts[1]
		if userID == "" || (parts[3] != "uplink" && parts[3] != "downlink") {
			continue
		}
		record := byUser[userID]
		if record == nil {
			record = &Record{UserID: userID}
			byUser[userID] = record
		}
		value := uint64(counter.Value)
		if parts[3] == "uplink" {
			record.UploadTotal += value
		} else {
			record.DownloadTotal += value
		}
	}

	userIDs := make([]string, 0, len(byUser))
	for userID := range byUser {
		userIDs = append(userIDs, userID)
	}
	sort.Strings(userIDs)
	records := make([]Record, 0, len(userIDs))
	for _, userID := range userIDs {
		records = append(records, *byUser[userID])
	}
	return records
}
