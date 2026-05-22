package handler

import (
	"context"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/logging"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/processor"
)

type ProcessedRecord struct {
	MessageID   string
	PhotoID     string
	OriginalKey string
}

type Processor func(context.Context, jobs.ImageJobData, events.SQSMessage) error

type Handler struct {
	processor Processor
	logger    logging.Logger
}

func New(processor Processor, logger logging.Logger) Handler {
	if processor == nil {
		processor = acceptJob
	}
	return Handler{processor: processor, logger: logger}
}

func Handle(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	imageProcessor, err := processor.NewFromEnvironment(ctx)
	if err != nil {
		return events.SQSEventResponse{}, err
	}
	return New(func(ctx context.Context, job jobs.ImageJobData, _ events.SQSMessage) error {
		return imageProcessor.Process(ctx, job)
	}, logging.New(os.Stdout)).Handle(ctx, event)
}

func HandleWithProcessor(ctx context.Context, event events.SQSEvent, processor Processor) (events.SQSEventResponse, error) {
	return New(processor, logging.New(os.Stdout)).Handle(ctx, event)
}

func (handler Handler) Handle(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	failures := make([]events.SQSBatchItemFailure, 0)
	handler.logInfo("Lambda image processing batch started", logging.Fields{
		"operation":   "sqs_batch",
		"recordCount": len(event.Records),
	})

	for _, record := range event.Records {
		startedAt := time.Now()
		job, err := jobs.ParseImageJobData(record.Body)
		if err != nil {
			handler.logError("Invalid SQS message body", logging.Fields{
				"operation":  "parse_sqs_record",
				"messageId":  record.MessageId,
				"durationMs": elapsedMillis(startedAt),
				"error":      err,
			})
			continue
		}

		fields := recordFields(record, job, startedAt, "process_sqs_record")
		handler.logInfo("Lambda image processing record started", fields)

		if err := handler.processor(ctx, job, record); err != nil {
			if isRetryable(err) {
				failures = append(failures, events.SQSBatchItemFailure{ItemIdentifier: record.MessageId})
			}
			failureFields := recordFields(record, job, startedAt, "process_sqs_record")
			failureFields["error"] = err
			handler.logError("Lambda image processing failed", failureFields)
			continue
		}

		handler.logInfo("Lambda image processing record completed", recordFields(record, job, startedAt, "process_sqs_record"))
	}

	handler.logInfo("Lambda image processing batch completed", logging.Fields{
		"operation":   "sqs_batch",
		"recordCount": len(event.Records),
		"failedCount": len(failures),
	})

	return events.SQSEventResponse{BatchItemFailures: failures}, nil
}

func (handler Handler) logInfo(message string, fields logging.Fields) {
	_ = handler.logger.Info(message, fields)
}

func (handler Handler) logError(message string, fields logging.Fields) {
	_ = handler.logger.Error(message, fields)
}

func recordFields(record events.SQSMessage, job jobs.ImageJobData, startedAt time.Time, operation string) logging.Fields {
	return logging.Fields{
		"operation":   operation,
		"messageId":   record.MessageId,
		"photoId":     job.PhotoID,
		"originalKey": job.OriginalKey,
		"durationMs":  elapsedMillis(startedAt),
	}
}

func elapsedMillis(startedAt time.Time) int64 {
	return time.Since(startedAt).Milliseconds()
}

func acceptJob(context.Context, jobs.ImageJobData, events.SQSMessage) error {
	return nil
}

type retryableError interface {
	Retryable() bool
}

func isRetryable(err error) bool {
	classified, ok := err.(retryableError)
	if !ok {
		return true
	}
	return classified.Retryable()
}
