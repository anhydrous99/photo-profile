package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type ImageJobData struct {
	PhotoID     string `json:"photoId"`
	OriginalKey string `json:"originalKey"`
}

type ExifData struct {
	CameraMake   *string  `json:"cameraMake"`
	CameraModel  *string  `json:"cameraModel"`
	Lens         *string  `json:"lens"`
	FocalLength  *float64 `json:"focalLength"`
	Aperture     *float64 `json:"aperture"`
	ShutterSpeed *string  `json:"shutterSpeed"`
	ISO          *int     `json:"iso"`
	DateTaken    *string  `json:"dateTaken"`
	WhiteBalance *string  `json:"whiteBalance"`
	MeteringMode *string  `json:"meteringMode"`
	Flash        *string  `json:"flash"`
}

type ImageJobResult struct {
	PhotoID     string    `json:"photoId"`
	Derivatives []string  `json:"derivatives"`
	BlurDataURL string    `json:"blurDataUrl"`
	ExifData    *ExifData `json:"exifData"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
}

type DerivativeMetadata struct {
	Key         string `json:"key"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Format      string `json:"format"`
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"sizeBytes"`
}

type PhotoStatus string

const (
	PhotoStatusProcessing PhotoStatus = "processing"
	PhotoStatusReady      PhotoStatus = "ready"
	PhotoStatusError      PhotoStatus = "error"
)

type PhotoUpdate struct {
	Status          *PhotoStatus `json:"status,omitempty"`
	BlurDataURL     *string      `json:"blurDataUrl,omitempty"`
	ExifData        *ExifData    `json:"exifData,omitempty"`
	Width           *int         `json:"width,omitempty"`
	Height          *int         `json:"height,omitempty"`
	UpdatedAtMillis *int64       `json:"updatedAt,omitempty"`
}

type MalformedJSONError struct {
	Err error
}

func (err MalformedJSONError) Error() string {
	return "malformed job JSON: " + err.Err.Error()
}

func (err MalformedJSONError) Unwrap() error {
	return err.Err
}

type ValidationError struct {
	FieldErrors map[string]string
}

func (err ValidationError) Error() string {
	return "invalid job message schema"
}

func ParseImageJobData(body string) (ImageJobData, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(body), &raw); err != nil {
		return ImageJobData{}, MalformedJSONError{Err: err}
	}
	if raw == nil {
		return ImageJobData{}, ValidationError{FieldErrors: map[string]string{"body": "must be a JSON object"}}
	}

	fieldErrors := make(map[string]string)
	photoID := readRequiredString(raw, "photoId", fieldErrors)
	originalKey := readRequiredString(raw, "originalKey", fieldErrors)
	if len(fieldErrors) > 0 {
		return ImageJobData{}, ValidationError{FieldErrors: fieldErrors}
	}

	return ImageJobData{PhotoID: photoID, OriginalKey: originalKey}, nil
}

func IsMalformedJSON(err error) bool {
	var malformed MalformedJSONError
	return errors.As(err, &malformed)
}

func IsValidationError(err error) bool {
	var validation ValidationError
	return errors.As(err, &validation)
}

func readRequiredString(raw map[string]json.RawMessage, field string, fieldErrors map[string]string) string {
	value, ok := raw[field]
	if !ok {
		fieldErrors[field] = "is required"
		return ""
	}

	var parsed string
	if err := json.Unmarshal(value, &parsed); err != nil {
		fieldErrors[field] = fmt.Sprintf("must be a string: %v", err)
		return ""
	}

	parsed = strings.TrimSpace(parsed)
	if parsed == "" {
		fieldErrors[field] = "must be a non-empty string"
	}
	return parsed
}
