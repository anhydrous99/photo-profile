package jobs

import "testing"

func TestParseImageJobData(t *testing.T) {
	job, err := ParseImageJobData(`{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`)
	if err != nil {
		t.Fatalf("expected valid job: %v", err)
	}
	if job.PhotoID != "photo-1" || job.OriginalKey != "originals/photo-1.jpg" {
		t.Fatalf("unexpected job: %#v", job)
	}
}

func TestParseImageJobDataRequiresFields(t *testing.T) {
	if _, err := ParseImageJobData(`{"photoId":"photo-1"}`); err == nil {
		t.Fatal("expected missing originalKey to fail")
	}
	if _, err := ParseImageJobData(`{"originalKey":"originals/photo-1.jpg"}`); err == nil {
		t.Fatal("expected missing photoId to fail")
	}
}
