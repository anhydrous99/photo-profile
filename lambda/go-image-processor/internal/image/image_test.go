package image

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	stdimage "image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/davidbyttow/govips/v2/vips"
)

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

func TestProcessedFilename(t *testing.T) {
	if got := ProcessedFilename(1200, FormatAVIF); got != "1200w.avif" {
		t.Fatalf("unexpected processed filename: %s", got)
	}
}

func TestImageTransformerGeneratesLargeLandscapeDerivatives(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 2600, 1400, 1)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}

	expected := []struct {
		width       int
		format      string
		contentType string
	}{
		{300, FormatWebP, "image/webp"},
		{300, FormatAVIF, "image/avif"},
		{600, FormatWebP, "image/webp"},
		{600, FormatAVIF, "image/avif"},
		{1200, FormatWebP, "image/webp"},
		{1200, FormatAVIF, "image/avif"},
		{2400, FormatWebP, "image/webp"},
		{2400, FormatAVIF, "image/avif"},
	}
	if len(derivatives) != len(expected) {
		t.Fatalf("expected %d derivatives, got %d: %#v", len(expected), len(derivatives), derivatives)
	}

	for i, want := range expected {
		got := derivatives[i]
		if got.Width != want.width || got.Format != want.format || got.ContentType != want.contentType {
			t.Fatalf("unexpected derivative at %d: %#v", i, got)
		}
		if got.Filename != ProcessedFilename(want.width, want.format) || filepath.Base(got.Path) != got.Filename {
			t.Fatalf("unexpected filename/path for derivative: %#v", got)
		}
		if _, err := os.Stat(filepath.Join(outputDir, got.Filename)); err != nil {
			t.Fatalf("expected derivative file %s: %v", got.Filename, err)
		}
		assertImageDimensions(t, got.Path, want.width, 0)
	}
}

func TestImageTransformerDoesNotUpscaleSmallImages(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 500, 333, 1)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}
	if len(derivatives) != 2 {
		t.Fatalf("expected only 300w webp and avif, got %d: %#v", len(derivatives), derivatives)
	}
	for _, derivative := range derivatives {
		if derivative.Width != 300 {
			t.Fatalf("unexpected upscaled derivative: %#v", derivative)
		}
		assertImageDimensions(t, derivative.Path, 300, 0)
	}
	if _, err := os.Stat(filepath.Join(outputDir, "600w.webp")); !os.IsNotExist(err) {
		t.Fatalf("expected 600w.webp to be skipped, stat err=%v", err)
	}
}

func TestImageTransformerAppliesPortraitOrientationCorrection(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 800, 1200, 6)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}
	if len(derivatives) != 4 {
		t.Fatalf("expected 300w and 600w pairs based on original width, got %#v", derivatives)
	}

	for _, derivative := range derivatives {
		width, height := imageDimensions(t, derivative.Path)
		if width != derivative.Width {
			t.Fatalf("expected width %d after resize, got %dx%d", derivative.Width, width, height)
		}
		if height >= width {
			t.Fatalf("expected autorotated landscape output, got %dx%d", width, height)
		}
	}
}

func TestBlurPlaceholder(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 500, 333, 1)

	placeholder, err := NewTransformer().GenerateBlurPlaceholder(inputPath)
	if err != nil {
		t.Fatalf("generate blur placeholder failed: %v", err)
	}
	if !strings.HasPrefix(placeholder, "data:image/webp;base64,") {
		t.Fatalf("unexpected blur placeholder prefix: %s", placeholder)
	}

	encoded := strings.TrimPrefix(placeholder, "data:image/webp;base64,")
	buf, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decode blur placeholder failed: %v", err)
	}
	img, err := vips.NewImageFromBuffer(buf)
	if err != nil {
		t.Fatalf("load blur placeholder failed: %v", err)
	}
	defer img.Close()
	if img.Width() != BlurWidth {
		t.Fatalf("expected blur width %d, got %d", BlurWidth, img.Width())
	}
	if img.Format() != vips.ImageTypeWEBP {
		t.Fatalf("expected webp blur, got %v", img.Format())
	}
}

func TestImageTransformerReportsMissingCodecs(t *testing.T) {
	report, err := CheckCapabilities()
	if err != nil {
		var capabilityErr CapabilityError
		if !strings.Contains(err.Error(), "libvips missing required codec support") || !errors.As(err, &capabilityErr) || len(capabilityErr.Missing) == 0 {
			t.Fatalf("expected explicit capability error, got %T %v", err, err)
		}
		return
	}
	if !report.WebP || !report.AVIF {
		t.Fatalf("expected both codecs reported available when error is nil: %#v", report)
	}
}

func requireCodecs(t *testing.T) {
	t.Helper()
	if _, err := CheckCapabilities(); err != nil {
		t.Fatalf("required libvips codecs unavailable: %v", err)
	}
}

func writeJPEGFixture(t *testing.T, width int, height int, orientation uint16) string {
	t.Helper()
	img := stdimage.NewRGBA(stdimage.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 251), G: uint8(y % 241), B: uint8((x + y) % 239), A: 255})
		}
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg fixture failed: %v", err)
	}
	data := buf.Bytes()
	if orientation != 1 {
		data = injectExifOrientation(t, data, orientation)
	}

	path := filepath.Join(t.TempDir(), "fixture.jpg")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write jpeg fixture failed: %v", err)
	}
	return path
}

func injectExifOrientation(t *testing.T, jpegBytes []byte, orientation uint16) []byte {
	t.Helper()
	if len(jpegBytes) < 2 || jpegBytes[0] != 0xff || jpegBytes[1] != 0xd8 {
		t.Fatal("expected jpeg SOI marker")
	}

	payload := bytes.NewBufferString("Exif\x00\x00")
	payload.WriteString("MM")
	mustWrite(t, payload, uint16(42))
	mustWrite(t, payload, uint32(8))
	mustWrite(t, payload, uint16(1))
	mustWrite(t, payload, uint16(0x0112))
	mustWrite(t, payload, uint16(3))
	mustWrite(t, payload, uint32(1))
	mustWrite(t, payload, orientation)
	mustWrite(t, payload, uint16(0))
	mustWrite(t, payload, uint32(0))

	segment := bytes.NewBuffer([]byte{0xff, 0xe1})
	if payload.Len()+2 > 0xffff {
		t.Fatal("exif payload too large")
	}
	mustWrite(t, segment, uint16(payload.Len()+2))
	segment.Write(payload.Bytes())

	out := make([]byte, 0, len(jpegBytes)+segment.Len())
	out = append(out, jpegBytes[:2]...)
	out = append(out, segment.Bytes()...)
	out = append(out, jpegBytes[2:]...)
	return out
}

func mustWrite(t *testing.T, buf *bytes.Buffer, value interface{}) {
	t.Helper()
	if err := binary.Write(buf, binary.BigEndian, value); err != nil {
		t.Fatalf("write binary fixture failed: %v", err)
	}
}

func assertImageDimensions(t *testing.T, path string, wantWidth int, wantHeight int) {
	t.Helper()
	width, height := imageDimensions(t, path)
	if width != wantWidth {
		t.Fatalf("expected width %d for %s, got %d", wantWidth, path, width)
	}
	if wantHeight != 0 && height != wantHeight {
		t.Fatalf("expected height %d for %s, got %d", wantHeight, path, height)
	}
}

func imageDimensions(t *testing.T, path string) (int, int) {
	t.Helper()
	img, err := vips.NewImageFromFile(path)
	if err != nil {
		t.Fatalf("load derivative %s failed: %v", path, err)
	}
	defer img.Close()
	return img.Width(), img.Height()
}
