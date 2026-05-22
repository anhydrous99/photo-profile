package ddb

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

type recordingDynamoDBClient struct {
	updateInput *dynamodb.UpdateItemInput
	updateError error
}

func (client *recordingDynamoDBClient) UpdateItem(ctx context.Context, input *dynamodb.UpdateItemInput, opts ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	client.updateInput = input
	return &dynamodb.UpdateItemOutput{}, client.updateError
}

func TestTableName(t *testing.T) {
	if got := TableName("prod_", "Photos"); got != "prod_Photos" {
		t.Fatalf("unexpected table name: %s", got)
	}
}

func TestPhotoStatuses(t *testing.T) {
	statuses := []PhotoStatus{PhotoStatusProcessing, PhotoStatusReady, PhotoStatusError}
	if len(statuses) != 3 {
		t.Fatalf("unexpected statuses: %#v", statuses)
	}
}

func TestDynamoPhotoResultUpdateUsesUpdateItemAndPreservesUnrelatedFields(t *testing.T) {
	client := &recordingDynamoDBClient{}
	updater := NewPhotoUpdater("prod_Photos", client)
	cameraMake := "Nikon"
	focalLength := 50.0
	iso := 200

	err := updater.MarkProcessed(context.Background(), jobs.ImageJobResult{
		PhotoID:     "photo-1",
		BlurDataURL: "data:image/webp;base64,abc",
		ExifData: &jobs.ExifData{
			CameraMake:  &cameraMake,
			FocalLength: &focalLength,
			ISO:         &iso,
		},
		Width:  1200,
		Height: 800,
	}, 1710000000000)
	if err != nil {
		t.Fatalf("mark processed failed: %v", err)
	}

	input := client.updateInput
	if input == nil {
		t.Fatal("expected UpdateItem input")
	}
	if *input.TableName != "prod_Photos" {
		t.Fatalf("unexpected table: %s", *input.TableName)
	}
	if id := input.Key["id"].(*types.AttributeValueMemberS).Value; id != "photo-1" {
		t.Fatalf("unexpected key id: %s", id)
	}
	if strings.Contains(*input.UpdateExpression, "slug") || strings.Contains(*input.UpdateExpression, "title") || strings.Contains(*input.UpdateExpression, "description") || strings.Contains(*input.UpdateExpression, "originalFilename") || strings.Contains(*input.UpdateExpression, "createdAt") || strings.Contains(*input.UpdateExpression, "_type") {
		t.Fatalf("update expression touches unrelated fields: %s", *input.UpdateExpression)
	}
	if input.ExpressionAttributeNames["#status"] != "status" {
		t.Fatalf("expected status attribute name mapping: %#v", input.ExpressionAttributeNames)
	}
	if status := input.ExpressionAttributeValues[":status"].(*types.AttributeValueMemberS).Value; status != "ready" {
		t.Fatalf("unexpected status: %s", status)
	}
	if blur := input.ExpressionAttributeValues[":blurDataUrl"].(*types.AttributeValueMemberS).Value; blur != "data:image/webp;base64,abc" {
		t.Fatalf("unexpected blur value: %s", blur)
	}
	if width := input.ExpressionAttributeValues[":width"].(*types.AttributeValueMemberN).Value; width != "1200" {
		t.Fatalf("unexpected width: %s", width)
	}
	if height := input.ExpressionAttributeValues[":height"].(*types.AttributeValueMemberN).Value; height != "800" {
		t.Fatalf("unexpected height: %s", height)
	}
	if updatedAt := input.ExpressionAttributeValues[":updatedAt"].(*types.AttributeValueMemberN).Value; updatedAt != "1710000000000" {
		t.Fatalf("unexpected updatedAt: %s", updatedAt)
	}
	exif := input.ExpressionAttributeValues[":exifData"].(*types.AttributeValueMemberM).Value
	if exif["cameraMake"].(*types.AttributeValueMemberS).Value != "Nikon" {
		t.Fatalf("unexpected cameraMake: %#v", exif["cameraMake"])
	}
	if exif["focalLength"].(*types.AttributeValueMemberN).Value != "50" {
		t.Fatalf("unexpected focalLength: %#v", exif["focalLength"])
	}
	if exif["iso"].(*types.AttributeValueMemberN).Value != "200" {
		t.Fatalf("unexpected iso: %#v", exif["iso"])
	}
	if !exif["cameraModel"].(*types.AttributeValueMemberNULL).Value {
		t.Fatalf("expected nullable EXIF fields to remain explicit nulls: %#v", exif["cameraModel"])
	}
}

func TestDynamoPhotoResultUpdateCanWriteNullExif(t *testing.T) {
	client := &recordingDynamoDBClient{}
	updater := NewPhotoUpdater("prod_Photos", client)

	err := updater.MarkProcessed(context.Background(), jobs.ImageJobResult{PhotoID: "photo-1"}, 1710000000000)
	if err != nil {
		t.Fatalf("mark processed failed: %v", err)
	}
	if !client.updateInput.ExpressionAttributeValues[":exifData"].(*types.AttributeValueMemberNULL).Value {
		t.Fatalf("expected null exif value: %#v", client.updateInput.ExpressionAttributeValues[":exifData"])
	}
}

func TestDynamoUpdateFailureIncludesPhotoAndTableContext(t *testing.T) {
	client := &recordingDynamoDBClient{updateError: errors.New("throttled")}
	updater := NewPhotoUpdater("prod_Photos", client)

	err := updater.MarkProcessed(context.Background(), jobs.ImageJobResult{PhotoID: "photo-1"}, 1710000000000)
	if err == nil {
		t.Fatal("expected update failure")
	}
	message := err.Error()
	if !strings.Contains(message, "update photo result photo-1 in DynamoDB table prod_Photos") || !strings.Contains(message, "throttled") {
		t.Fatalf("missing error context: %v", err)
	}
}

func TestDynamoMarkErrorSetsOnlyStatusAndUpdatedAt(t *testing.T) {
	client := &recordingDynamoDBClient{}
	updater := NewPhotoUpdater("prod_Photos", client)

	err := updater.MarkError(context.Background(), "photo-1", 1710000000000)
	if err != nil {
		t.Fatalf("mark error failed: %v", err)
	}

	input := client.updateInput
	if input == nil {
		t.Fatal("expected UpdateItem input")
	}
	if expression := *input.UpdateExpression; expression != "SET #status = :status, updatedAt = :updatedAt" {
		t.Fatalf("unexpected update expression: %s", expression)
	}
	if status := input.ExpressionAttributeValues[":status"].(*types.AttributeValueMemberS).Value; status != "error" {
		t.Fatalf("unexpected status: %s", status)
	}
	if updatedAt := input.ExpressionAttributeValues[":updatedAt"].(*types.AttributeValueMemberN).Value; updatedAt != "1710000000000" {
		t.Fatalf("unexpected updatedAt: %s", updatedAt)
	}
	if _, ok := input.ExpressionAttributeValues[":blurDataUrl"]; ok {
		t.Fatalf("error update should not write ready fields: %#v", input.ExpressionAttributeValues)
	}
}
