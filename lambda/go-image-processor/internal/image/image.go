package image

import (
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/davidbyttow/govips/v2/vips"
)

var derivativeWidths = []int{300, 600, 1200, 2400}

const (
	FormatAVIF = "avif"
	FormatWebP = "webp"

	AVIFQuality = 80
	AVIFEffort  = 4
	WebPQuality = 82
	WebPEffort  = 4

	BlurWidth   = 10
	BlurQuality = 20
)

type Derivative struct {
	Width       int
	Format      string
	Filename    string
	Path        string
	ContentType string
	Bytes       []byte
}

type Dimensions struct {
	Width  int
	Height int
}

type Transformer struct{}

type CapabilityReport struct {
	WebP bool
	AVIF bool
}

type CapabilityError struct {
	Missing []string
	Err     error
}

func (e CapabilityError) Error() string {
	if e.Err == nil {
		return fmt.Sprintf("libvips missing required codec support: %s", strings.Join(e.Missing, ", "))
	}
	return fmt.Sprintf("libvips missing required codec support: %s: %v", strings.Join(e.Missing, ", "), e.Err)
}

func (e CapabilityError) Unwrap() error {
	return e.Err
}

func DerivativeWidths() []int {
	widths := make([]int, len(derivativeWidths))
	copy(widths, derivativeWidths)
	return widths
}

func ProcessedFilename(width int, format string) string {
	return fmt.Sprintf("%dw.%s", width, format)
}

func ProcessedKey(photoID string, width int, format string) string {
	return fmt.Sprintf("processed/%s/%s", photoID, ProcessedFilename(width, format))
}

func NewTransformer() Transformer {
	return Transformer{}
}

func CheckCapabilities() (CapabilityReport, error) {
	if err := vips.Startup(nil); err != nil {
		return CapabilityReport{}, err
	}

	img, err := vips.Black(1, 1)
	if err != nil {
		return CapabilityReport{}, err
	}
	defer img.Close()

	report := CapabilityReport{}
	missing := make([]string, 0, 2)
	var codecErr error

	if _, _, err := img.ExportWebp(&vips.WebpExportParams{Quality: WebPQuality, ReductionEffort: WebPEffort}); err != nil {
		missing = append(missing, FormatWebP)
		codecErr = errors.Join(codecErr, err)
	} else {
		report.WebP = true
	}

	if _, _, err := img.ExportAvif(&vips.AvifExportParams{Quality: AVIFQuality, Effort: AVIFEffort}); err != nil {
		missing = append(missing, FormatAVIF)
		codecErr = errors.Join(codecErr, err)
	} else {
		report.AVIF = true
	}

	if len(missing) > 0 {
		return report, CapabilityError{Missing: missing, Err: codecErr}
	}
	return report, nil
}

func (Transformer) GenerateDerivatives(inputPath string, outputDir string) ([]Derivative, error) {
	if _, err := CheckCapabilities(); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, err
	}

	metadata, err := readMetadata(inputPath)
	if err != nil {
		return nil, err
	}

	derivatives := make([]Derivative, 0, len(derivativeWidths)*2)
	for _, width := range derivativeWidths {
		if metadata.Width < width {
			continue
		}

		img, err := loadTransform(inputPath, width)
		if err != nil {
			return nil, err
		}

		webp, _, err := img.ExportWebp(&vips.WebpExportParams{Quality: WebPQuality, ReductionEffort: WebPEffort})
		if err != nil {
			img.Close()
			return nil, fmt.Errorf("export %dw webp: %w", width, err)
		}
		avif, _, err := img.ExportAvif(&vips.AvifExportParams{Quality: AVIFQuality, Effort: AVIFEffort})
		if err != nil {
			img.Close()
			return nil, fmt.Errorf("export %dw avif: %w", width, err)
		}
		img.Close()

		webpDerivative, err := writeDerivative(outputDir, width, FormatWebP, "image/webp", webp)
		if err != nil {
			return nil, err
		}
		derivatives = append(derivatives, webpDerivative)

		avifDerivative, err := writeDerivative(outputDir, width, FormatAVIF, "image/avif", avif)
		if err != nil {
			return nil, err
		}
		derivatives = append(derivatives, avifDerivative)
	}

	return derivatives, nil
}

func (Transformer) GenerateBlurPlaceholder(inputPath string) (string, error) {
	if _, err := CheckCapabilities(); err != nil {
		return "", err
	}
	img, err := loadTransform(inputPath, BlurWidth)
	if err != nil {
		return "", err
	}
	defer img.Close()

	buf, _, err := img.ExportWebp(&vips.WebpExportParams{Quality: BlurQuality, ReductionEffort: WebPEffort})
	if err != nil {
		return "", fmt.Errorf("export blur webp: %w", err)
	}
	return "data:image/webp;base64," + base64.StdEncoding.EncodeToString(buf), nil
}

func (Transformer) Dimensions(inputPath string) (Dimensions, error) {
	img, err := vips.NewImageFromFile(inputPath)
	if err != nil {
		return Dimensions{}, fmt.Errorf("load image dimensions: %w", err)
	}
	defer img.Close()

	if err := img.AutoRotate(); err != nil {
		return Dimensions{}, fmt.Errorf("autorotate image dimensions: %w", err)
	}
	if img.Width() <= 0 || img.Height() <= 0 {
		return Dimensions{}, fmt.Errorf("invalid image dimensions: %dx%d", img.Width(), img.Height())
	}
	return Dimensions{Width: img.Width(), Height: img.Height()}, nil
}

func readMetadata(inputPath string) (*vips.ImageMetadata, error) {
	img, err := vips.NewImageFromFile(inputPath)
	if err != nil {
		return nil, fmt.Errorf("load image metadata: %w", err)
	}
	defer img.Close()
	return img.Metadata(), nil
}

func loadTransform(inputPath string, width int) (*vips.ImageRef, error) {
	img, err := vips.NewImageFromFile(inputPath)
	if err != nil {
		return nil, fmt.Errorf("load image: %w", err)
	}

	if err := img.AutoRotate(); err != nil {
		img.Close()
		return nil, fmt.Errorf("autorotate image: %w", err)
	}
	if err := img.TransformICCProfile(vips.SRGBIEC6196621ICCProfilePath); err != nil {
		img.Close()
		return nil, fmt.Errorf("convert image to srgb: %w", err)
	}

	scale := math.Min(1, float64(width)/float64(img.Width()))
	if scale < 1 {
		if err := img.Resize(scale, vips.KernelLanczos3); err != nil {
			img.Close()
			return nil, fmt.Errorf("resize image to %dw: %w", width, err)
		}
	}

	return img, nil
}

func writeDerivative(outputDir string, width int, format string, contentType string, buf []byte) (Derivative, error) {
	filename := ProcessedFilename(width, format)
	path := filepath.Join(outputDir, filename)
	if err := os.WriteFile(path, buf, 0o644); err != nil {
		return Derivative{}, fmt.Errorf("write derivative %s: %w", filename, err)
	}
	return Derivative{
		Width:       width,
		Format:      format,
		Filename:    filename,
		Path:        path,
		ContentType: contentType,
		Bytes:       buf,
	}, nil
}
