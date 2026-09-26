package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/Nanako660/riricloud/apps/agent/cmd"
	"github.com/Nanako660/riricloud/apps/agent/internal/runner"
)

// Version 由构建时通过 -ldflags 注入；未注入时保留源码运行的 dev 标识。
var Version = "dev"

// BuildMarker 供主控上传裸二进制时直接从文件字节嗅探 Agent 版本号。
var BuildMarker = "RIRICLOUD_AGENT_VERSION:dev"

func main() {
	if len(BuildMarker) == 0 {
		return
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	root := cmd.NewRootCommand(cmd.Options{Version: Version, Run: runner.Run})
	if err := root.ExecuteContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
