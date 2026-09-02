// Package telemetry 采集本机 CPU / 内存 / 网络指标（gopsutil）。
package telemetry

import (
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// Sample 单次采样结果（百分比 0~100；带宽为采样周期内的速率 bytes/s）
type Sample struct {
	CPUUsage      float64
	MemoryUsage   float64
	UploadRate    float64
	DownloadRate  float64
	BandwidthRate float64
}

// Collect 采集一次系统指标：CPU 取 1 秒均值，带宽取 1 秒差分
func Collect() Sample {
	cpuPct, err := cpu.Percent(time.Second, false)
	cpuUsage := 0.0
	if err == nil && len(cpuPct) > 0 {
		cpuUsage = cpuPct[0]
	}

	memUsage := 0.0
	if vm, err := mem.VirtualMemory(); err == nil {
		memUsage = vm.UsedPercent
	}

	uploadRate, downloadRate := netRate()
	return Sample{
		CPUUsage:      cpuUsage,
		MemoryUsage:   memUsage,
		UploadRate:    uploadRate,
		DownloadRate:  downloadRate,
		BandwidthRate: uploadRate + downloadRate,
	}
}

// netRate 以 1 秒差分估算全机上行与下行吞吐。
func netRate() (float64, float64) {
	beforeSent, beforeRecv, beforeOK := totalNetBytes()
	time.Sleep(time.Second)
	afterSent, afterRecv, afterOK := totalNetBytes()
	if !beforeOK || !afterOK {
		return 0, 0
	}
	return counterRate(afterSent, beforeSent), counterRate(afterRecv, beforeRecv)
}

func totalNetBytes() (uint64, uint64, bool) {
	counters, err := net.IOCounters(false)
	if err != nil || len(counters) == 0 {
		return 0, 0, false
	}
	c := counters[0]
	return c.BytesSent, c.BytesRecv, true
}

// counterRate 处理单个累计计数器的 1 秒差分；回绕或异常值不参与统计。
func counterRate(after, before uint64) float64 {
	if after < before {
		return 0
	}
	return float64(after - before)
}
