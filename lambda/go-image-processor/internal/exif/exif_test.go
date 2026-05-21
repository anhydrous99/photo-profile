package exif

import (
	"reflect"
	"testing"
)

func TestAllowedFields(t *testing.T) {
	if !IsAllowedField("cameraMake") {
		t.Fatal("expected cameraMake to be allowed")
	}
	if IsAllowedField("gpsLatitude") {
		t.Fatal("expected GPS field to be disallowed")
	}
}

func TestAllowedFieldsReturnsExpectedContractCopy(t *testing.T) {
	expected := []string{
		"cameraMake",
		"cameraModel",
		"lens",
		"focalLength",
		"aperture",
		"shutterSpeed",
		"iso",
		"dateTaken",
		"whiteBalance",
		"meteringMode",
		"flash",
	}

	fields := AllowedFields()
	if !reflect.DeepEqual(fields, expected) {
		t.Fatalf("unexpected allowed fields: %#v", fields)
	}

	fields[0] = "gpsLatitude"
	if AllowedFields()[0] != "cameraMake" {
		t.Fatal("expected allowed fields copy")
	}
}
