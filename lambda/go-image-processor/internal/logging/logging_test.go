package logging

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestInfoWritesJSON(t *testing.T) {
	var output bytes.Buffer
	logger := New(&output)

	if err := logger.Info("processed", map[string]string{"photoId": "photo-1"}); err != nil {
		t.Fatalf("expected log write: %v", err)
	}

	var entry map[string]string
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatalf("expected JSON log: %v", err)
	}
	if entry["level"] != "info" || entry["message"] != "processed" || entry["photoId"] != "photo-1" {
		t.Fatalf("unexpected log entry: %#v", entry)
	}
}
