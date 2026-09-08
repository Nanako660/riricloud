package mirror

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultTimeout        = 10 * time.Minute
	DefaultMaxBytes int64 = 256 * 1024 * 1024
	MaxRedirects          = 5
	MaxConcurrent         = 4
)

type Request struct {
	Method       string
	URL          string
	AllowedHosts []string
	Headers      map[string]string
	TimeoutMs    int
	MaxBytes     int64
}

type Headers struct {
	StatusCode    int
	Headers       map[string]string
	ContentLength int64
	FinalHost     string
}

type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

type Executor struct {
	client *http.Client
	sem    chan struct{}
}

func NewExecutor() *Executor {
	transport := &http.Transport{
		Proxy:             nil,
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
		DialContext:       safeDialContext,
		DisableKeepAlives: false,
	}
	return &Executor{
		client: &http.Client{Transport: transport},
		sem:    make(chan struct{}, MaxConcurrent),
	}
}

func (e *Executor) Do(ctx context.Context, request Request, onHeaders func(Headers) error, onChunk func([]byte) error) (int64, error) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		return 0, &Error{Code: "METHOD_NOT_ALLOWED", Message: "mirror only supports GET and HEAD"}
	}
	target, err := validateURL(ctx, request.URL, request.AllowedHosts)
	if err != nil {
		return 0, err
	}
	if request.MaxBytes <= 0 || request.MaxBytes > DefaultMaxBytes {
		request.MaxBytes = DefaultMaxBytes
	}
	timeout := DefaultTimeout
	if request.TimeoutMs > 0 && time.Duration(request.TimeoutMs)*time.Millisecond < timeout {
		timeout = time.Duration(request.TimeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	select {
	case e.sem <- struct{}{}:
		defer func() { <-e.sem }()
	case <-ctx.Done():
		return 0, &Error{Code: "CANCELED", Message: "mirror request canceled"}
	}

	redirects := 0
	client := *e.client
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		redirects++
		if redirects > MaxRedirects {
			return &Error{Code: "REDIRECT_LIMIT", Message: "mirror redirect limit exceeded"}
		}
		if _, err := validateURL(req.Context(), req.URL.String(), request.AllowedHosts); err != nil {
			return err
		}
		return nil
	}
	httpRequest, err := http.NewRequestWithContext(ctx, request.Method, target.String(), nil)
	if err != nil {
		return 0, &Error{Code: "INVALID_URL", Message: "mirror URL is invalid"}
	}
	for key, value := range request.Headers {
		if allowedRequestHeader(key) {
			httpRequest.Header.Set(key, value)
		}
	}
	httpRequest.Header.Set("User-Agent", "riri-agent-mirror/1")
	response, err := client.Do(httpRequest)
	if err != nil {
		if ctx.Err() != nil {
			return 0, &Error{Code: "CANCELED", Message: "mirror request canceled"}
		}
		var typed *Error
		if errors.As(err, &typed) {
			return 0, typed
		}
		return 0, &Error{Code: "UPSTREAM_ERROR", Message: "upstream request failed"}
	}
	defer response.Body.Close()
	if response.ContentLength > request.MaxBytes {
		return 0, &Error{Code: "RESPONSE_TOO_LARGE", Message: "upstream response exceeds size limit"}
	}
	contentLength := response.ContentLength
	if contentLength < 0 {
		contentLength = 0
	}
	if err := onHeaders(Headers{
		StatusCode:    response.StatusCode,
		Headers:       safeResponseHeaders(response.Header),
		ContentLength: contentLength,
		FinalHost:     strings.ToLower(response.Request.URL.Hostname()),
	}); err != nil {
		return 0, err
	}
	if request.Method == http.MethodHead || response.Body == nil {
		return 0, nil
	}
	var total int64
	buffer := make([]byte, 32*1024)
	for {
		read, readErr := response.Body.Read(buffer)
		if read > 0 {
			total += int64(read)
			if total > request.MaxBytes {
				return total, &Error{Code: "RESPONSE_TOO_LARGE", Message: "upstream response exceeds size limit"}
			}
			if err := onChunk(buffer[:read]); err != nil {
				return total, err
			}
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			if ctx.Err() != nil {
				return total, &Error{Code: "CANCELED", Message: "mirror request canceled"}
			}
			return total, &Error{Code: "UPSTREAM_READ_ERROR", Message: "upstream response read failed"}
		}
	}
}

func validateURL(ctx context.Context, raw string, allowedHosts []string) (*url.URL, error) {
	target, err := url.Parse(raw)
	if err != nil || target.Scheme != "http" && target.Scheme != "https" || target.User != nil || target.Hostname() == "" {
		return nil, &Error{Code: "INVALID_URL", Message: "upstream URL must use http or https without credentials"}
	}
	host := strings.ToLower(strings.TrimSuffix(target.Hostname(), "."))
	if !hostAllowed(host, allowedHosts) {
		return nil, &Error{Code: "REDIRECT_BLOCKED", Message: "upstream host is not allowed"}
	}
	if err := validateHost(ctx, host); err != nil {
		return nil, err
	}
	return target, nil
}

func hostAllowed(host string, allowedHosts []string) bool {
	for _, raw := range allowedHosts {
		allowed := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(raw), "."))
		if allowed != "" && (host == allowed || strings.HasSuffix(host, "."+allowed)) {
			return true
		}
	}
	return false
}

func validateHost(ctx context.Context, host string) error {
	if ip := net.ParseIP(host); ip != nil {
		if blockedIP(ip) {
			return &Error{Code: "PRIVATE_ADDRESS", Message: "upstream address is not public"}
		}
		return nil
	}
	addresses, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return &Error{Code: "DNS_ERROR", Message: "upstream DNS lookup failed"}
	}
	for _, address := range addresses {
		if blockedIP(address) {
			return &Error{Code: "PRIVATE_ADDRESS", Message: "upstream resolves to a non-public address"}
		}
	}
	return nil
}

func safeDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("invalid upstream address")
	}
	addresses := []net.IP{}
	if parsed := net.ParseIP(host); parsed != nil {
		addresses = append(addresses, parsed)
	} else {
		addresses, err = net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil || len(addresses) == 0 {
			return nil, fmt.Errorf("upstream DNS lookup failed")
		}
	}
	dialer := net.Dialer{Timeout: 15 * time.Second}
	for _, ip := range addresses {
		if blockedIP(ip) {
			continue
		}
		connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return connection, nil
		}
	}
	return nil, fmt.Errorf("upstream address is not reachable")
}

func blockedIP(ip net.IP) bool {
	if ip4 := ip.To4(); ip4 != nil {
		return ip4[0] == 0 || ip4[0] == 10 || ip4[0] == 127 || ip4[0] == 169 && ip4[1] == 254 || ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 || ip4[0] == 192 && ip4[1] == 168 || ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 || ip4[0] >= 224
	}
	ip16 := ip.To16()
	return ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip16 != nil && ip16[0]&0xfe == 0xfc
}

func allowedRequestHeader(key string) bool {
	switch strings.ToLower(key) {
	case "range", "if-none-match", "if-modified-since", "if-range", "accept", "accept-encoding":
		return true
	default:
		return false
	}
}

func safeResponseHeaders(header http.Header) map[string]string {
	allowed := []string{"content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control", "expires", "vary", "content-encoding"}
	result := make(map[string]string, len(allowed))
	for _, key := range allowed {
		if value := header.Get(key); value != "" {
			result[key] = value
		}
	}
	return result
}

func FormatContentLength(value int64) string {
	if value <= 0 {
		return ""
	}
	return strconv.FormatInt(value, 10)
}
