package security

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ValidateHTTPURL validates URLs used for Master downloads and upgrade assets.
// Public production traffic must use HTTPS; loopback HTTP remains available for local development.
func ValidateHTTPURL(rawURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("download URL must be an absolute http or https URL")
	}
	if parsed.User != nil {
		return fmt.Errorf("download URL must not contain embedded credentials")
	}
	if productionLike() && parsed.Scheme != "https" && !isLoopback(parsed.Hostname()) {
		return fmt.Errorf("production downloads require HTTPS")
	}
	return nil
}

// NewHTTPClient prevents redirects from downgrading production transport or
// forwarding an AgentToken to another origin.
func NewHTTPClient(timeout time.Duration, preserveToken bool) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: validatingTransport{base: http.DefaultTransport},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if err := ValidateHTTPURL(req.URL.String()); err != nil {
				return err
			}
			if preserveToken && len(via) > 0 {
				previous := via[len(via)-1].URL
				if !sameOrigin(previous, req.URL) {
					return fmt.Errorf("refusing to redirect authenticated request to another origin")
				}
			}
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

type validatingTransport struct {
	base http.RoundTripper
}

func (t validatingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req == nil || req.URL == nil {
		return nil, fmt.Errorf("download request URL is required")
	}
	if err := ValidateHTTPURL(req.URL.String()); err != nil {
		return nil, err
	}
	return t.base.RoundTrip(req)
}

func productionLike() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("RIRICLOUD_ENV")), "production") ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("NODE_ENV")), "production")
}

func isLoopback(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func sameOrigin(left, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}
