package security

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewHTTPClientRejectsAuthenticatedCrossOriginRedirect(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	request, err := http.NewRequest(http.MethodGet, redirect.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = NewHTTPClient(0, true).Do(request)
	if err == nil {
		t.Fatal("expected authenticated cross-origin redirect to be rejected")
	}
}

func TestNewHTTPClientRejectsProductionHTTPSDowngrade(t *testing.T) {
	t.Setenv("RIRICLOUD_ENV", "production")
	request, err := http.NewRequest(http.MethodGet, "http://example.com/file", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewHTTPClient(0, false).Do(request); err == nil {
		t.Fatal("expected production HTTP download to be rejected")
	}
}
