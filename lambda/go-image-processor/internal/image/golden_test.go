package image

import (
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	exifpipeline "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/exif"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
	"github.com/davidbyttow/govips/v2/vips"
)

func TestNativeCapabilitiesRequiredEncoders(t *testing.T) {
	report, err := CheckCapabilities()
	if err != nil {
		t.Fatalf("required native encoders unavailable: %v", err)
	}
	if !report.WebP || !report.AVIF {
		t.Fatalf("expected WebP and AVIF encoders, got %#v", report)
	}
}

func TestNativeCapabilitiesAcceptedInputDecoders(t *testing.T) {
	requireCodecs(t)
	fixtures := acceptedInputFixtures(t, 640, 360)

	expectedMIMEs := []string{"image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"}
	if got := sortedKeys(fixtures); !reflect.DeepEqual(got, expectedMIMEs) {
		t.Fatalf("accepted decoder coverage drifted: got %#v want %#v", got, expectedMIMEs)
	}

	expectedFormats := map[string]vips.ImageType{
		"image/jpeg": vips.ImageTypeJPEG,
		"image/png":  vips.ImageTypePNG,
		"image/webp": vips.ImageTypeWEBP,
		"image/heic": vips.ImageTypeHEIF,
		"image/heif": vips.ImageTypeHEIF,
	}
	for _, mimeType := range expectedMIMEs {
		t.Run(mimeType, func(t *testing.T) {
			img, err := vips.NewImageFromFile(fixtures[mimeType])
			if err != nil {
				t.Fatalf("decode accepted %s fixture failed: %v", mimeType, err)
			}
			defer img.Close()
			if img.Metadata().Format != expectedFormats[mimeType] {
				t.Fatalf("unexpected decoded format for %s: %v", mimeType, img.Metadata().Format)
			}
			if img.Width() != 640 || img.Height() != 360 {
				t.Fatalf("unexpected decoded dimensions for %s: %dx%d", mimeType, img.Width(), img.Height())
			}
		})
	}
}

func TestGoldenDerivativeParityHarness(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 2600, 1300, 1)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}

	expected := []struct {
		width       int
		height      int
		format      string
		imageType   vips.ImageType
		contentType string
	}{
		{300, 150, FormatWebP, vips.ImageTypeWEBP, "image/webp"},
		{300, 150, FormatAVIF, vips.ImageTypeAVIF, "image/avif"},
		{600, 300, FormatWebP, vips.ImageTypeWEBP, "image/webp"},
		{600, 300, FormatAVIF, vips.ImageTypeAVIF, "image/avif"},
		{1200, 600, FormatWebP, vips.ImageTypeWEBP, "image/webp"},
		{1200, 600, FormatAVIF, vips.ImageTypeAVIF, "image/avif"},
		{2400, 1200, FormatWebP, vips.ImageTypeWEBP, "image/webp"},
		{2400, 1200, FormatAVIF, vips.ImageTypeAVIF, "image/avif"},
	}

	if len(derivatives) != len(expected) {
		t.Fatalf("expected %d derivatives, got %d: %#v", len(expected), len(derivatives), derivatives)
	}
	for index, want := range expected {
		got := derivatives[index]
		if got.Width != want.width || got.Format != want.format || got.ContentType != want.contentType {
			t.Fatalf("unexpected derivative metadata at %d: %#v", index, got)
		}
		if got.Filename != ProcessedFilename(want.width, want.format) || filepath.Base(got.Path) != got.Filename {
			t.Fatalf("unexpected derivative filename at %d: %#v", index, got)
		}
		assertGoldenImage(t, got.Path, want.width, want.height, want.imageType)
	}
}

func TestGoldenNoUpscaleBehavior(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 250, 125, 1)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}
	if len(derivatives) != 0 {
		t.Fatalf("expected no derivatives below the smallest frozen width, got %#v", derivatives)
	}
	files, err := os.ReadDir(outputDir)
	if err != nil {
		t.Fatalf("read output dir failed: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected empty output dir for no-upscale fixture, got %#v", files)
	}
}

func TestGoldenOrientationCorrection(t *testing.T) {
	requireCodecs(t)
	inputPath := writeJPEGFixture(t, 800, 1200, 6)
	outputDir := t.TempDir()

	derivatives, err := NewTransformer().GenerateDerivatives(inputPath, outputDir)
	if err != nil {
		t.Fatalf("generate derivatives failed: %v", err)
	}
	if len(derivatives) != 4 {
		t.Fatalf("expected 300w and 600w derivative pairs, got %#v", derivatives)
	}
	for _, derivative := range derivatives {
		img, err := vips.NewImageFromFile(derivative.Path)
		if err != nil {
			t.Fatalf("load derivative failed: %v", err)
		}
		width, height := img.Width(), img.Height()
		img.Close()
		if width != derivative.Width || height*3 != width*2 {
			t.Fatalf("expected autorotated 3:2 landscape at width %d, got %dx%d", derivative.Width, width, height)
		}
	}
}

func TestGoldenBlurPlaceholderShape(t *testing.T) {
	requireCodecs(t)
	placeholder, err := NewTransformer().GenerateBlurPlaceholder(writeJPEGFixture(t, 640, 360, 1))
	if err != nil {
		t.Fatalf("generate blur placeholder failed: %v", err)
	}
	if !strings.HasPrefix(placeholder, "data:image/webp;base64,") {
		t.Fatalf("unexpected blur prefix: %s", placeholder)
	}
	payload := strings.TrimPrefix(placeholder, "data:image/webp;base64,")
	buf, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("decode blur base64 failed: %v", err)
	}
	if len(placeholder) >= 500 {
		t.Fatalf("expected compact blur placeholder, got %d bytes", len(placeholder))
	}
	img, err := vips.NewImageFromBuffer(buf)
	if err != nil {
		t.Fatalf("decode blur webp failed: %v", err)
	}
	defer img.Close()
	if img.Metadata().Format != vips.ImageTypeWEBP || img.Width() != BlurWidth {
		t.Fatalf("unexpected blur image shape: format=%v size=%dx%d", img.Metadata().Format, img.Width(), img.Height())
	}
}

func TestGoldenExifAllowlistBehavior(t *testing.T) {
	text := "allowed"
	number := 35.0
	iso := 400
	exifData := &jobs.ExifData{
		CameraMake:   &text,
		CameraModel:  &text,
		Lens:         &text,
		FocalLength:  &number,
		Aperture:     &number,
		ShutterSpeed: &text,
		ISO:          &iso,
		DateTaken:    &text,
		WhiteBalance: &text,
		MeteringMode: &text,
		Flash:        &text,
	}
	encoded, err := json.Marshal(exifData)
	if err != nil {
		t.Fatalf("marshal exif failed: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal exif failed: %v", err)
	}
	wantFields := append([]string(nil), exifpipeline.AllowedFields()...)
	sort.Strings(wantFields)
	if got := sortedKeys(decoded); !reflect.DeepEqual(got, wantFields) {
		t.Fatalf("unexpected EXIF fields: got %#v want %#v", got, wantFields)
	}
	for _, forbidden := range []string{"gpsLatitude", "gpsLongitude", "software", "bodySerialNumber", "cameraSerialNumber", "rawExif"} {
		if _, ok := decoded[forbidden]; ok {
			t.Fatalf("forbidden EXIF field serialized: %s in %s", forbidden, encoded)
		}
		if exifpipeline.IsAllowedField(forbidden) {
			t.Fatalf("forbidden EXIF field is allowlisted: %s", forbidden)
		}
	}
}

func TestGoldenCorruptedAndUnsupportedInputsFailClosed(t *testing.T) {
	requireCodecs(t)
	for name, body := range map[string][]byte{
		"corrupted-jpeg.jpg": {0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 'b', 'a', 'd'},
		"unsupported.txt":    []byte("this is not an accepted image input"),
	} {
		t.Run(name, func(t *testing.T) {
			inputPath := filepath.Join(t.TempDir(), name)
			if err := os.WriteFile(inputPath, body, 0o644); err != nil {
				t.Fatalf("write bad fixture failed: %v", err)
			}
			if _, err := NewTransformer().GenerateDerivatives(inputPath, t.TempDir()); err == nil {
				t.Fatal("expected derivative generation to reject invalid input")
			}
			if _, err := NewTransformer().GenerateBlurPlaceholder(inputPath); err == nil {
				t.Fatal("expected blur generation to reject invalid input")
			}
			if _, err := NewTransformer().Dimensions(inputPath); err == nil {
				t.Fatal("expected dimensions to reject invalid input")
			}
		})
	}
}

func acceptedInputFixtures(t *testing.T, width int, height int) map[string]string {
	t.Helper()
	jpegPath := writeJPEGFixture(t, width, height, 1)
	pngPath := writePNGFixture(t, width, height)
	return map[string]string{
		"image/jpeg": jpegPath,
		"image/png":  pngPath,
		"image/webp": writeVipsExportFixture(t, jpegPath, "accepted.webp", func(img *vips.ImageRef) ([]byte, error) {
			buf, _, err := img.ExportWebp(&vips.WebpExportParams{Quality: WebPQuality, ReductionEffort: WebPEffort})
			return buf, err
		}),
		"image/heic": writeVipsExportFixture(t, jpegPath, "accepted.heic", func(img *vips.ImageRef) ([]byte, error) {
			buf, _, err := img.ExportHeif(vips.NewHeifExportParams())
			return buf, err
		}),
		"image/heif": writeVipsExportFixture(t, jpegPath, "accepted.heif", func(img *vips.ImageRef) ([]byte, error) {
			buf, _, err := img.ExportHeif(vips.NewHeifExportParams())
			return buf, err
		}),
	}
}

func writePNGFixture(t *testing.T, width int, height int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 251), G: uint8(y % 241), B: uint8((x + y) % 239), A: 255})
		}
	}
	path := filepath.Join(t.TempDir(), "accepted.png")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create png fixture failed: %v", err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		t.Fatalf("encode png fixture failed: %v", err)
	}
	return path
}

func writeVipsExportFixture(t *testing.T, sourcePath string, filename string, export func(*vips.ImageRef) ([]byte, error)) string {
	t.Helper()
	img, err := vips.NewImageFromFile(sourcePath)
	if err != nil {
		t.Fatalf("load source fixture for %s failed: %v", filename, err)
	}
	defer img.Close()
	buf, err := export(img)
	if err != nil {
		t.Fatalf("export %s fixture failed: %v", filename, err)
	}
	path := filepath.Join(t.TempDir(), filename)
	if err := os.WriteFile(path, buf, 0o644); err != nil {
		t.Fatalf("write %s fixture failed: %v", filename, err)
	}
	return path
}

func assertGoldenImage(t *testing.T, path string, wantWidth int, wantHeight int, wantFormat vips.ImageType) {
	t.Helper()
	img, err := vips.NewImageFromFile(path)
	if err != nil {
		t.Fatalf("load golden image %s failed: %v", path, err)
	}
	defer img.Close()
	if img.Metadata().Format != wantFormat {
		t.Fatalf("expected format %v for %s, got %v", wantFormat, path, img.Metadata().Format)
	}
	if img.Width() != wantWidth || img.Height() != wantHeight {
		t.Fatalf("expected %dx%d for %s, got %dx%d", wantWidth, wantHeight, path, img.Width(), img.Height())
	}
	if img.Interpretation() != vips.InterpretationSRGB {
		t.Fatalf("expected sRGB interpretation for %s, got %v", path, img.Interpretation())
	}
	point, err := img.GetPoint(img.Width()/2, img.Height()/2)
	if err != nil {
		t.Fatalf("read color sample for %s failed: %v", path, err)
	}
	if len(point) < 3 || point[0] < 0 || point[0] > 255 || point[1] < 0 || point[1] > 255 || point[2] < 0 || point[2] > 255 {
		t.Fatalf("unexpected sRGB color sample for %s: %#v", path, point)
	}
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
