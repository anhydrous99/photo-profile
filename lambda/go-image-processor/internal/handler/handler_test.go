package handler

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/logging"
)

func TestHandlerAcceptsValidSQSRecord(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{message("msg-1", `{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`)}}

	response, err := Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 0 {
		t.Fatalf("expected no failures: %#v", response.BatchItemFailures)
	}
}

func TestHandlerSkipsSchemaInvalidSQSRecordWithoutBatchFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{message("msg-1", `{"photoId":"photo-1"}`)}}
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

func TestHandlerSkipsMalformedJSONRecordWithoutBatchFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{message("msg-1", `{"photoId":"photo-1"`)}}
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
		t.Fatalf("expected malformed JSON to be skipped without retry: %#v", response.BatchItemFailures)
	}
	if called {
		t.Fatal("expected malformed JSON not to reach processor")
	}
}

func TestHandlerReportsProcessorFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{message("msg-1", `{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`)}}
	processor := func(context.Context, jobs.ImageJobData, events.SQSMessage) error {
		return errors.New("processing failed")
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	assertFailures(t, response, "msg-1")
}

func TestHandlerProcessesMultiRecordBatchWithSchemaInvalidRecord(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{
		message("msg-ok", `{"photoId":"photo-ok","originalKey":"originals/photo-ok.jpg"}`),
		message("msg-invalid", `{"photoId":"photo-invalid"}`),
	}}
	processed := make([]jobs.ImageJobData, 0)
	processor := func(_ context.Context, job jobs.ImageJobData, _ events.SQSMessage) error {
		processed = append(processed, job)
		return nil
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 0 {
		t.Fatalf("expected invalid schema to be skipped without retry: %#v", response.BatchItemFailures)
	}
	if len(processed) != 1 || processed[0].PhotoID != "photo-ok" {
		t.Fatalf("expected only valid record to be processed: %#v", processed)
	}
}

func TestHandlerProcessesMultiRecordBatchWithMalformedJSONRecord(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{
		message("msg-ok", `{"photoId":"photo-ok","originalKey":"originals/photo-ok.jpg"}`),
		message("msg-malformed", `{"photoId":"photo-malformed"`),
	}}
	processed := make([]jobs.ImageJobData, 0)
	processor := func(_ context.Context, job jobs.ImageJobData, _ events.SQSMessage) error {
		processed = append(processed, job)
		return nil
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	if len(response.BatchItemFailures) != 0 {
		t.Fatalf("expected malformed JSON to be skipped without retry: %#v", response.BatchItemFailures)
	}
	if len(processed) != 1 || processed[0].PhotoID != "photo-ok" {
		t.Fatalf("expected only valid record to be processed: %#v", processed)
	}
}

func TestHandlerProcessesMultiRecordBatchWithProcessingFailure(t *testing.T) {
	event := events.SQSEvent{Records: []events.SQSMessage{
		message("msg-ok", `{"photoId":"photo-ok","originalKey":"originals/photo-ok.jpg"}`),
		message("msg-fail", `{"photoId":"photo-fail","originalKey":"originals/photo-fail.jpg"}`),
	}}
	processed := make([]string, 0)
	processor := func(_ context.Context, job jobs.ImageJobData, _ events.SQSMessage) error {
		processed = append(processed, job.PhotoID)
		if job.PhotoID == "photo-fail" {
			return errors.New("processing failed")
		}
		return nil
	}

	response, err := HandleWithProcessor(context.Background(), event, processor)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	assertFailures(t, response, "msg-fail")
	if strings.Join(processed, ",") != "photo-ok,photo-fail" {
		t.Fatalf("expected both valid records to be attempted: %#v", processed)
	}
}

func TestHandlerLogsPerRecordContext(t *testing.T) {
	var output bytes.Buffer
	event := events.SQSEvent{Records: []events.SQSMessage{message("msg-1", `{"photoId":"photo-1","originalKey":"originals/photo-1.jpg"}`)}}
	processor := func(context.Context, jobs.ImageJobData, events.SQSMessage) error {
		return errors.New("processing failed")
	}
	handler := New(processor, logging.New(&output))

	response, err := handler.Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("expected no handler error: %v", err)
	}
	assertFailures(t, response, "msg-1")
	logs := output.String()
	for _, want := range []string{`"messageId":"msg-1"`, `"photoId":"photo-1"`, `"originalKey":"originals/photo-1.jpg"`, `"operation":"process_sqs_record"`, `"durationMs":`, `"error":{"message":"processing failed"}`} {
		if !strings.Contains(logs, want) {
			t.Fatalf("expected logs to contain %s; logs:\n%s", want, logs)
		}
	}
}

func message(messageID string, body string) events.SQSMessage {
	return events.SQSMessage{MessageId: messageID, Body: body}
}

func assertFailures(t *testing.T, response events.SQSEventResponse, messageIDs ...string) {
	t.Helper()
	if len(response.BatchItemFailures) != len(messageIDs) {
		t.Fatalf("expected %d failures: %#v", len(messageIDs), response.BatchItemFailures)
	}
	for index, messageID := range messageIDs {
		if response.BatchItemFailures[index].ItemIdentifier != messageID {
			t.Fatalf("expected failure %d to be %s: %#v", index, messageID, response.BatchItemFailures)
		}
	}
}
