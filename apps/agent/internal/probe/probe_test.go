package probe

import (
	"context"
	"fmt"
	"net"
	"testing"
)

func TestRunTCPAndDNS(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	portNumber := 0
	if _, err := fmt.Sscanf(port, "%d", &portNumber); err != nil {
		t.Fatal(err)
	}
	results := Run(context.Background(), []Request{
		{Type: TCP, Target: "127.0.0.1", Port: portNumber},
		{Type: DNS, Target: "localhost"},
	})
	if len(results) != 2 || !results[0].Success || !results[1].Success {
		t.Fatalf("unexpected probe results: %+v", results)
	}
	if results[0].PacketLossPercent != 0 || results[1].PacketLossPercent != 0 || len(results[1].Addresses) == 0 {
		t.Fatalf("unexpected probe detail: %+v", results)
	}
}
