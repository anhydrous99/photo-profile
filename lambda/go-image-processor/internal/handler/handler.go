package handler

import (
	"context"

	"github.com/aws/aws-lambda-go/events"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

type ProcessedRecord struct {
	MessageID   string
	PhotoID     string
	OriginalKey string
}

type Processor func(context.Context, jobs.ImageJobData, events.SQSMessage) error

func Handle(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	return HandleWithProcessor(ctx, event, acceptJob)
}

func HandleWithProcessor(ctx context.Context, event events.SQSEvent, processor Processor) (events.SQSEventResponse, error) {
	failures := make([]events.SQSBatchItemFailure, 0)

	for _, record := range event.Records {
		job, err := jobs.ParseImageJobData(record.Body)
		if err != nil {
			if jobs.IsMalformedJSON(err) {
				failures = append(failures, events.SQSBatchItemFailure{ItemIdentifier: record.MessageId})
			}
			continue
		}
		if err := processor(ctx, job, record); err != nil {
			failures = append(failures, events.SQSBatchItemFailure{ItemIdentifier: record.MessageId})
		}
	}

	return events.SQSEventResponse{BatchItemFailures: failures}, nil
}

func acceptJob(context.Context, jobs.ImageJobData, events.SQSMessage) error {
	return nil
}
