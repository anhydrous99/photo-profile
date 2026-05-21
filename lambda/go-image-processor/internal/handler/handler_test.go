package handler

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

func TestHandleAcceptsValidSQSRecord(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{{MessageId: "msg-1", Body: `{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`}}}

	response, err := Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 0 {
		t.Fatalf("expected no failures: %#v", response.BatchItemFailures)
	}
}

func TestHandleSkipsSchemaInvalidSQSRecordWithoutBatchFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{{MessageId: "msg-1", Body: `{"photoId":"photo-1"}`}}}
	called := false
	processor := func(context.Context, jobs.ImageJobData, events.SQSMessage) error {
		called = true
		return nil
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 0 {
		t.Fatalf("expected schema-invalid message to be skipped without failure: %#v", response.BatchItemFailures)
	}
	if called {
		t.Fatal("expected schema-invalid message not to reach processor")
	}
}

func TestHandleReportsMalformedJSONRecordFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{{MessageId: "msg-1", Body: `{"photoId":"photo-1"`}}}

	response, err := Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 1 || response.BatchItemFailures[0].ItemIdentifier != "msg-1" {
		t.Fatalf("expected msg-1 failure: %#v", response.BatchItemFailures)
	}
}

func TestHandleReportsProcessorFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{{MessageId: "msg-1", Body: `{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`}}}
	processor := func(context.Context, jobs.ImageJobData, events.SQSMessage) error {
		return errors.New("processing failed")
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 1 || response.BatchItemFailures[0].ItemIdentifier != "msg-1" {
		t.Fatalf("expected msg-1 failure: %#v", response.BatchItemFailures)
	}
}
