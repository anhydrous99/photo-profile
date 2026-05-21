package image

import "testing"

func TestDerivativeWidthsReturnsCopy(t *testing.T) {
	widths := DerivativeWidths()
	if len(widths) != 4 || widths[0] != 300 || widths[3] != 2400 {
		t.Fatalf("unexpected widths: %#v", widths)
	}
	widths[0] = 1
	if DerivativeWidths()[0] != 300 {
		t.Fatal("expected derivative widths copy")
	}
}

func TestProcessedKey(t *testing.T) {
	if got := ProcessedKey("photo-1", 300, "webp"); got != "processed/photo-1/300w.webp" {
		t.Fatalf("unexpected processed key: %s", got)
	}
}
