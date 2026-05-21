package logging

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestLoggerWritesStructuredJSON(t *testing.T) {
	var output bytes.Buffer
	logger := NewWithOptions(&output, "worker-test", LevelDebug).WithClock(func() time.Time {
		return time.Date(2026, 5, 21, 12, 30, 0, 123, time.UTC)
	})

	if err := logger.Info("processed", Fields{
		"photoId":     "photo-1",
		"originalKey": "originals/photo-1.jpg",
		"messageId":   "msg-1",
		"durationMs":  42,
		"operation":   "processImageJob",
	}); err != nil {
		t.Fatalf("expected log write: %v", err)
	}

	entry := decodeLogEntry(t, output.Bytes())
	if entry["level"] != "info" || entry["message"] != "processed" || entry["component"] != "worker-test" {
		t.Fatalf("unexpected log entry: %#v", entry)
	}
	if entry["timestamp"] != "2026-05-21T12:30:00.000000123Z" {
		t.Fatalf("unexpected timestamp: %#v", entry)
	}
	if entry["photoId"] != "photo-1" || entry["originalKey"] != "originals/photo-1.jpg" || entry["messageId"] != "msg-1" {
		t.Fatalf("missing job fields: %#v", entry)
	}
	if entry["durationMs"] != float64(42) || entry["operation"] != "processImageJob" {
		t.Fatalf("missing operation fields: %#v", entry)
	}
}

func TestLoggerSerializesErrorFields(t *testing.T) {
	var output bytes.Buffer
	logger := New(&output).WithClock(func() time.Time { return time.Unix(0, 0).UTC() })

	if err := logger.Error("failed", Fields{"error": errors.New("boom")}); err != nil {
		t.Fatalf("expected error log write: %v", err)
	}

	entry := decodeLogEntry(t, output.Bytes())
	errorField, ok := entry["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected serialized error object: %#v", entry)
	}
	if errorField["message"] != "boom" {
		t.Fatalf("unexpected error field: %#v", errorField)
	}
}

func TestLoggerLevelFiltering(t *testing.T) {
	var output bytes.Buffer
	logger := NewWithOptions(&output, "worker-test", LevelWarn)
	if err := logger.Debug("debug", nil); err != nil {
		t.Fatalf("expected no debug write error: %v", err)
	}
	if err := logger.Info("info", nil); err != nil {
		t.Fatalf("expected no info write error: %v", err)
	}
	if output.Len() != 0 {
		t.Fatalf("expected logs below warn to be filtered, got %q", output.String())
	}
	if err := logger.Warn("warn", nil); err != nil {
		t.Fatalf("expected warn write: %v", err)
	}
	if output.Len() == 0 {
		t.Fatal("expected warn log")
	}
}

func decodeLogEntry(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("expected JSON log: %v", err)
	}
	return entry
}
