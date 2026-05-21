package storage

import "testing"

func TestObjectRefTrimsInput(t *testing.T) {
	ref := NewObjectRef(" photos ", " originals/photo.jpg ")
	if ref.Bucket != "photos" || ref.Key != "originals/photo.jpg" {
		t.Fatalf("unexpected ref: %#v", ref)
	}
	if ref.IsZero() {
		t.Fatal("expected complete ref")
	}
}

func TestObjectRefIsZero(t *testing.T) {
	if !NewObjectRef("photos", "").IsZero() {
		t.Fatal("expected empty key to be zero")
	}
}
