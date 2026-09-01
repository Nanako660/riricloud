package doctor

import "testing"

func TestAllOK(t *testing.T) {
	if !AllOK([]Check{{Name: "one", OK: true}, {Name: "two", OK: true}}) {
		t.Fatal("expected all checks to pass")
	}
	if AllOK([]Check{{Name: "one", OK: true}, {Name: "two", OK: false}}) {
		t.Fatal("expected a failed check")
	}
}
