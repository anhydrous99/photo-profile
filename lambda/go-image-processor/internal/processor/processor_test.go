package processor

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	imagepipeline "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/image"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

func TestProcessImageJobSuccessComposesPipelineAndMarksReady(t *testing.T) {
	storage := newFakeStorage()
	storage.objects["originals/photo-1/original.jpg"] = []byte("original bytes")
	transformer := &fakeTransformer{}
	updater := &fakeUpdater{}
	cameraMake := "Nikon"
	processor := New(storage, transformer, func(imagePath string) (*jobs.ExifData, error) {
		assertFileContains(t, imagePath, "original bytes")
		return &jobs.ExifData{CameraMake: &cameraMake}, nil
	}, updater, fixedClock)

	err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg")
	if err != nil {
		t.Fatalf("process image job failed: %v", err)
	}

	if transformer.originalPath == "" || pathExists(transformer.originalPath) {
		t.Fatalf("expected temp original to be cleaned up, path=%q exists=%v", transformer.originalPath, pathExists(transformer.originalPath))
	}
	if len(storage.puts) != 2 {
		t.Fatalf("expected two uploads, got %#v", storage.puts)
	}
	assertPut(t, storage.puts[0], "processed/photo-1/300w.webp", "image/webp", "webp bytes")
	assertPut(t, storage.puts[1], "processed/photo-1/300w.avif", "image/avif", "avif bytes")
	if updater.ready == nil {
		t.Fatal("expected ready update")
	}
	if updater.ready.PhotoID != "photo-1" || updater.ready.BlurDataURL != "data:image/webp;base64,blur" || updater.ready.Width != 1200 || updater.ready.Height != 800 {
		t.Fatalf("unexpected ready result: %#v", updater.ready)
	}
	if updater.ready.ExifData == nil || updater.ready.ExifData.CameraMake == nil || *updater.ready.ExifData.CameraMake != "Nikon" {
		t.Fatalf("expected mapped exif in ready update: %#v", updater.ready.ExifData)
	}
	if updater.updatedAt != 1710000000000 {
		t.Fatalf("unexpected updatedAt: %d", updater.updatedAt)
	}
	if len(updater.errorPhotoIDs) != 0 {
		t.Fatalf("did not expect error update: %#v", updater.errorPhotoIDs)
	}
}

func TestProcessImageJobMissingOriginalMarksErrorWithoutRetry(t *testing.T) {
	storage := newFakeStorage()
	storage.getErr = errors.New("not found")
	updater := &fakeUpdater{}
	processor := New(storage, &fakeTransformer{}, nilExif, updater, fixedClock)

	err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg")
	assertProcessingError(t, err, ErrorKindMissingOriginal, false)
	if updater.ready != nil {
		t.Fatalf("missing original must not mark ready: %#v", updater.ready)
	}
	if len(updater.errorPhotoIDs) != 1 || updater.errorPhotoIDs[0] != "photo-1" {
		t.Fatalf("expected photo error update: %#v", updater.errorPhotoIDs)
	}
	if len(storage.puts) != 0 {
		t.Fatalf("missing original should not upload derivatives: %#v", storage.puts)
	}
}

func TestProcessImageJobCorruptedImageMarksErrorWithoutReady(t *testing.T) {
	storage := newFakeStorage()
	storage.objects["originals/photo-1/original.jpg"] = []byte("not an image")
	updater := &fakeUpdater{}
	processor := New(storage, &fakeTransformer{derivativeErr: errors.New("decode failed")}, nilExif, updater, fixedClock)

	err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg")
	assertProcessingError(t, err, ErrorKindCorruptedImage, false)
	if updater.ready != nil {
		t.Fatalf("corrupted image must not mark ready: %#v", updater.ready)
	}
	if len(updater.errorPhotoIDs) != 1 {
		t.Fatalf("expected error status update: %#v", updater.errorPhotoIDs)
	}
}

func TestProcessImageJobUploadFailureDoesNotMarkReady(t *testing.T) {
	storage := newFakeStorage()
	storage.objects["originals/photo-1/original.jpg"] = []byte("original bytes")
	storage.putErr = errors.New("s3 unavailable")
	updater := &fakeUpdater{}
	processor := New(storage, &fakeTransformer{}, nilExif, updater, fixedClock)

	err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg")
	assertProcessingError(t, err, ErrorKindUploadFailed, true)
	if updater.ready != nil {
		t.Fatalf("upload failure must not mark ready: %#v", updater.ready)
	}
	if len(updater.errorPhotoIDs) != 0 {
		t.Fatalf("upload failure should remain retryable without terminal error status: %#v", updater.errorPhotoIDs)
	}
}

func TestProcessImageJobDynamoDBFailureDoesNotMarkReady(t *testing.T) {
	storage := newFakeStorage()
	storage.objects["originals/photo-1/original.jpg"] = []byte("original bytes")
	updater := &fakeUpdater{markProcessedErr: errors.New("throttled")}
	processor := New(storage, &fakeTransformer{}, nilExif, updater, fixedClock)

	err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg")
	assertProcessingError(t, err, ErrorKindDynamoDBFailed, true)
	if updater.ready != nil {
		t.Fatalf("failed ready write should not be recorded as ready: %#v", updater.ready)
	}
	if len(storage.puts) != 2 {
		t.Fatalf("expected derivative uploads before DynamoDB failure: %#v", storage.puts)
	}
}

func TestProcessImageJobDuplicateDeliveryOverwritesDeterministicKeys(t *testing.T) {
	storage := newFakeStorage()
	storage.objects["originals/photo-1/original.jpg"] = []byte("original bytes")
	updater := &fakeUpdater{}
	processor := New(storage, &fakeTransformer{}, nilExif, updater, fixedClock)

	for i := 0; i < 2; i++ {
		if err := processor.ProcessImageJob(context.Background(), "photo-1", "originals/photo-1/original.jpg"); err != nil {
			t.Fatalf("process duplicate delivery %d failed: %v", i, err)
		}
	}

	if len(storage.objects) != 3 {
		t.Fatalf("expected original plus two deterministic processed keys, got %#v", storage.objects)
	}
	if string(storage.objects["processed/photo-1/300w.webp"]) != "webp bytes" || string(storage.objects["processed/photo-1/300w.avif"]) != "avif bytes" {
		t.Fatalf("expected deterministic derivative keys to be overwritten: %#v", storage.objects)
	}
	if updater.readyCount != 2 {
		t.Fatalf("expected duplicate delivery to update status twice, got %d", updater.readyCount)
	}
}

type fakeStorage struct {
	objects map[string][]byte
	puts    []putRecord
	getErr  error
	putErr  error
}

type putRecord struct {
	key         string
	body        []byte
	contentType string
}

func newFakeStorage() *fakeStorage {
	return &fakeStorage{objects: make(map[string][]byte)}
}

func (storage *fakeStorage) GetObject(ctx context.Context, key string) ([]byte, error) {
	if storage.getErr != nil {
		return nil, storage.getErr
	}
	body, ok := storage.objects[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return append([]byte(nil), body...), nil
}

func (storage *fakeStorage) PutObject(ctx context.Context, key string, body []byte, contentType string) error {
	if storage.putErr != nil {
		return storage.putErr
	}
	copied := append([]byte(nil), body...)
	storage.puts = append(storage.puts, putRecord{key: key, body: copied, contentType: contentType})
	storage.objects[key] = copied
	return nil
}

type fakeTransformer struct {
	originalPath  string
	derivativeErr error
}

func (transformer *fakeTransformer) GenerateDerivatives(inputPath string, outputDir string) ([]imagepipeline.Derivative, error) {
	transformer.originalPath = inputPath
	if transformer.derivativeErr != nil {
		return nil, transformer.derivativeErr
	}
	webpPath := filepath.Join(outputDir, "300w.webp")
	avifPath := filepath.Join(outputDir, "300w.avif")
	if err := os.WriteFile(webpPath, []byte("webp file bytes"), 0o600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(avifPath, []byte("avif file bytes"), 0o600); err != nil {
		return nil, err
	}
	return []imagepipeline.Derivative{
		{Width: 300, Format: imagepipeline.FormatWebP, Path: webpPath, ContentType: "image/webp", Bytes: []byte("webp bytes")},
		{Width: 300, Format: imagepipeline.FormatAVIF, Path: avifPath, ContentType: "image/avif", Bytes: []byte("avif bytes")},
	}, nil
}

func (transformer *fakeTransformer) GenerateBlurPlaceholder(inputPath string) (string, error) {
	return "data:image/webp;base64,blur", nil
}

func (transformer *fakeTransformer) Dimensions(inputPath string) (imagepipeline.Dimensions, error) {
	return imagepipeline.Dimensions{Width: 1200, Height: 800}, nil
}

type fakeUpdater struct {
	ready            *jobs.ImageJobResult
	readyCount       int
	updatedAt        int64
	errorPhotoIDs    []string
	markProcessedErr error
}

func (updater *fakeUpdater) MarkProcessed(ctx context.Context, result jobs.ImageJobResult, updatedAtMillis int64) error {
	if updater.markProcessedErr != nil {
		return updater.markProcessedErr
	}
	updater.ready = &result
	updater.readyCount++
	updater.updatedAt = updatedAtMillis
	return nil
}

func (updater *fakeUpdater) MarkError(ctx context.Context, photoID string, updatedAtMillis int64) error {
	updater.errorPhotoIDs = append(updater.errorPhotoIDs, photoID)
	updater.updatedAt = updatedAtMillis
	return nil
}

func fixedClock() time.Time {
	return time.UnixMilli(1710000000000).UTC()
}

func nilExif(string) (*jobs.ExifData, error) {
	return nil, nil
}

func assertProcessingError(t *testing.T, err error, kind string, retryable bool) {
	t.Helper()
	var processingErr ProcessingError
	if !errors.As(err, &processingErr) {
		t.Fatalf("expected ProcessingError, got %T %v", err, err)
	}
	if processingErr.Kind != kind || processingErr.Retryable() != retryable {
		t.Fatalf("unexpected processing error: %#v", processingErr)
	}
}

func assertPut(t *testing.T, got putRecord, key string, contentType string, body string) {
	t.Helper()
	if got.key != key || got.contentType != contentType || string(got.body) != body {
		t.Fatalf("unexpected put: %#v", got)
	}
}

func assertFileContains(t *testing.T, path string, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(data) != want {
		t.Fatalf("unexpected file body: %q", string(data))
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
