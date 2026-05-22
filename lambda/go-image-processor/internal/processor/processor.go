package processor

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	imagepipeline "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/image"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

const (
	ErrorKindMissingOriginal = "missing_original"
	ErrorKindCorruptedImage  = "corrupted_image"
	ErrorKindTransformFailed = "transform_failed"
	ErrorKindUploadFailed    = "upload_failed"
	ErrorKindDynamoDBFailed  = "dynamodb_failed"
)

type Storage interface {
	GetObject(ctx context.Context, key string) ([]byte, error)
	PutObject(ctx context.Context, key string, body []byte, contentType string) error
}

type Transformer interface {
	GenerateDerivatives(inputPath string, outputDir string) ([]imagepipeline.Derivative, error)
	GenerateBlurPlaceholder(inputPath string) (string, error)
	Dimensions(inputPath string) (imagepipeline.Dimensions, error)
}

type PhotoUpdater interface {
	MarkProcessed(ctx context.Context, result jobs.ImageJobResult, updatedAtMillis int64) error
	MarkError(ctx context.Context, photoID string, updatedAtMillis int64) error
}

type ExifExtractor func(imagePath string) (*jobs.ExifData, error)
type Clock func() time.Time

type Processor struct {
	storage       Storage
	transformer   Transformer
	exifExtractor ExifExtractor
	updater       PhotoUpdater
	clock         Clock
}

type ProcessingError struct {
	Kind      string
	Retry     bool
	PhotoID   string
	Operation string
	Err       error
}

func (err ProcessingError) Error() string {
	if err.Err == nil {
		return fmt.Sprintf("%s failed for photo %s", err.Operation, err.PhotoID)
	}
	return fmt.Sprintf("%s failed for photo %s: %v", err.Operation, err.PhotoID, err.Err)
}

func (err ProcessingError) Unwrap() error {
	return err.Err
}

func (err ProcessingError) Retryable() bool {
	return err.Retry
}

func New(storage Storage, transformer Transformer, exifExtractor ExifExtractor, updater PhotoUpdater, clock Clock) Processor {
	if clock == nil {
		clock = func() time.Time { return time.Now().UTC() }
	}
	return Processor{storage: storage, transformer: transformer, exifExtractor: exifExtractor, updater: updater, clock: clock}
}

func (processor Processor) ProcessImageJob(ctx context.Context, photoID string, originalKey string) error {
	job := jobs.ImageJobData{PhotoID: photoID, OriginalKey: originalKey}
	return processor.Process(ctx, job)
}

func (processor Processor) Process(ctx context.Context, job jobs.ImageJobData) error {
	tempDir, err := os.MkdirTemp("", "photo-worker-"+safeTempName(job.PhotoID)+"-")
	if err != nil {
		return processor.retryable(job.PhotoID, ErrorKindTransformFailed, "create temp dir", err)
	}
	defer os.RemoveAll(tempDir)

	originalBytes, err := processor.storage.GetObject(ctx, job.OriginalKey)
	if err != nil {
		return processor.markError(ctx, job.PhotoID, ErrorKindMissingOriginal, "download original", err)
	}

	originalPath := filepath.Join(tempDir, originalFilename(job.OriginalKey))
	if err := os.WriteFile(originalPath, originalBytes, 0o600); err != nil {
		return processor.retryable(job.PhotoID, ErrorKindTransformFailed, "write temp original", err)
	}

	derivatives, err := processor.transformer.GenerateDerivatives(originalPath, tempDir)
	if err != nil {
		return processor.markError(ctx, job.PhotoID, ErrorKindCorruptedImage, "generate derivatives", err)
	}

	dimensions, err := processor.transformer.Dimensions(originalPath)
	if err != nil {
		return processor.markError(ctx, job.PhotoID, ErrorKindCorruptedImage, "read image dimensions", err)
	}

	exifData, err := processor.exifExtractor(originalPath)
	if err != nil {
		return processor.markError(ctx, job.PhotoID, ErrorKindCorruptedImage, "extract exif", err)
	}

	blurDataURL, err := processor.transformer.GenerateBlurPlaceholder(originalPath)
	if err != nil {
		return processor.markError(ctx, job.PhotoID, ErrorKindCorruptedImage, "generate blur placeholder", err)
	}

	keys := make([]string, 0, len(derivatives))
	for _, derivative := range derivatives {
		key := imagepipeline.ProcessedKey(job.PhotoID, derivative.Width, derivative.Format)
		body := derivative.Bytes
		if len(body) == 0 && derivative.Path != "" {
			body, err = os.ReadFile(derivative.Path)
			if err != nil {
				return processor.retryable(job.PhotoID, ErrorKindUploadFailed, "read derivative", err)
			}
		}
		if err := processor.storage.PutObject(ctx, key, body, derivative.ContentType); err != nil {
			return processor.retryable(job.PhotoID, ErrorKindUploadFailed, "upload derivative", err)
		}
		keys = append(keys, key)
	}

	result := jobs.ImageJobResult{
		PhotoID:     job.PhotoID,
		Derivatives: keys,
		BlurDataURL: blurDataURL,
		ExifData:    exifData,
		Width:       dimensions.Width,
		Height:      dimensions.Height,
	}
	if err := processor.updater.MarkProcessed(ctx, result, processor.nowMillis()); err != nil {
		return processor.retryable(job.PhotoID, ErrorKindDynamoDBFailed, "mark processed", err)
	}
	return nil
}

func (processor Processor) markError(ctx context.Context, photoID string, kind string, operation string, cause error) error {
	if err := processor.updater.MarkError(ctx, photoID, processor.nowMillis()); err != nil {
		return processor.retryable(photoID, ErrorKindDynamoDBFailed, "mark error", errors.Join(cause, err))
	}
	return ProcessingError{Kind: kind, Retry: false, PhotoID: photoID, Operation: operation, Err: cause}
}

func (processor Processor) retryable(photoID string, kind string, operation string, err error) ProcessingError {
	return ProcessingError{Kind: kind, Retry: true, PhotoID: photoID, Operation: operation, Err: err}
}

func (processor Processor) nowMillis() int64 {
	return processor.clock().UnixMilli()
}

func originalFilename(originalKey string) string {
	filename := filepath.Base(strings.TrimSpace(originalKey))
	if filename == "." || filename == string(filepath.Separator) || filename == "" {
		return "original"
	}
	return filename
}

func safeTempName(value string) string {
	replacer := strings.NewReplacer("/", "-", "\\", "-", " ", "-")
	return replacer.Replace(strings.TrimSpace(value))
}
