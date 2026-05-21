package jobs

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestJobMessageParsesValidSQSBody(t *testing.T) {
	job, err := ParseImageJobData(`{"photoId":" photo-1 ","originalKey":" originals/photo-1.jpg "}`)
	if err != nil {
		t.Fatalf("expected valid job: %v", err)
	}
	if job.PhotoID != "photo-1" || job.OriginalKey != "originals/photo-1.jpg" {
		t.Fatalf("unexpected job: %#v", job)
	}
}

func TestJobMessageMalformedJSONIsDistinguishable(t *testing.T) {
	_, err := ParseImageJobData(`{"photoId":"photo-1"`)
	if err == nil {
		t.Fatal("expected malformed JSON to fail")
	}
	if !IsMalformedJSON(err) || IsValidationError(err) {
		t.Fatalf("expected malformed JSON error only: %T %v", err, err)
	}
}

func TestJobMessageSchemaInvalidIsDistinguishable(t *testing.T) {
	_, err := ParseImageJobData(`{"photoId":"photo-1"}`)
	if err == nil {
		t.Fatal("expected missing originalKey to fail")
	}
	if !IsValidationError(err) || IsMalformedJSON(err) {
		t.Fatalf("expected validation error only: %T %v", err, err)
	}

	var validation ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected validation error: %T", err)
	}
	if validation.FieldErrors["originalKey"] != "is required" {
		t.Fatalf("unexpected field errors: %#v", validation.FieldErrors)
	}
}

func TestJobMessageRejectsInvalidFieldTypes(t *testing.T) {
	_, err := ParseImageJobData(`{"photoId":123,"originalKey":"originals/photo-1.jpg"}`)
	if err == nil || !IsValidationError(err) || IsMalformedJSON(err) {
		t.Fatalf("expected field type validation error: %T %v", err, err)
	}
}

func TestImageJobResultUsesTypedExifData(t *testing.T) {
	make := "Canon"
	iso := 400
	result := ImageJobResult{
		PhotoID:     "photo-1",
		Derivatives: []string{"processed/photo-1/300w.webp"},
		BlurDataURL: "data:image/webp;base64,abc",
		ExifData:    &ExifData{CameraMake: &make, ISO: &iso},
		Width:       1200,
		Height:      800,
	}

	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("expected result JSON: %v", err)
	}
	var decoded struct {
		ExifData ExifData `json:"exifData"`
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("expected typed exif JSON: %v", err)
	}
	if decoded.ExifData.CameraMake == nil || *decoded.ExifData.CameraMake != "Canon" {
		t.Fatalf("unexpected exif data: %s", encoded)
	}
	if decoded.ExifData.ISO == nil || *decoded.ExifData.ISO != 400 {
		t.Fatalf("unexpected ISO: %s", encoded)
	}
}

func TestPhotoUpdateStatusTypes(t *testing.T) {
	status := PhotoStatusReady
	width := 1200
	update := PhotoUpdate{Status: &status, Width: &width}
	encoded, err := json.Marshal(update)
	if err != nil {
		t.Fatalf("expected photo update JSON: %v", err)
	}
	if string(encoded) != `{"status":"ready","width":1200}` {
		t.Fatalf("unexpected update JSON: %s", encoded)
	}
}

func TestDerivativeMetadataShape(t *testing.T) {
	metadata := DerivativeMetadata{
		Key:         "processed/photo-1/300w.webp",
		Width:       300,
		Height:      200,
		Format:      "webp",
		ContentType: "image/webp",
		SizeBytes:   1234,
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("expected metadata JSON: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("expected metadata object: %v", err)
	}
	for _, key := range []string{"key", "width", "height", "format", "contentType", "sizeBytes"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("expected derivative metadata field %s in %s", key, encoded)
		}
	}
}
