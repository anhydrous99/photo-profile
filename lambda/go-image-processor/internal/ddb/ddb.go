package ddb

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

type PhotoStatus string

const (
	PhotoStatusProcessing PhotoStatus = "processing"
	PhotoStatusReady      PhotoStatus = "ready"
	PhotoStatusError      PhotoStatus = "error"
)

func TableName(prefix, base string) string {
	return prefix + base
}

type DynamoDBClient interface {
	UpdateItem(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
}

type PhotoUpdater struct {
	tableName string
	client    DynamoDBClient
}

func NewPhotoUpdater(tableName string, client DynamoDBClient) PhotoUpdater {
	return PhotoUpdater{tableName: tableName, client: client}
}

func (updater PhotoUpdater) MarkProcessed(ctx context.Context, result jobs.ImageJobResult, updatedAtMillis int64) error {
	status := string(PhotoStatusReady)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(updater.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: result.PhotoID},
		},
		UpdateExpression: aws.String("SET #status = :status, blurDataUrl = :blurDataUrl, exifData = :exifData, width = :width, height = :height, updatedAt = :updatedAt"),
		ExpressionAttributeNames: map[string]string{
			"#status": "status",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status":      &types.AttributeValueMemberS{Value: status},
			":blurDataUrl": &types.AttributeValueMemberS{Value: result.BlurDataURL},
			":exifData":    exifAttributeValue(result.ExifData),
			":width":       &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", result.Width)},
			":height":      &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", result.Height)},
			":updatedAt":   &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", updatedAtMillis)},
		},
	}

	if _, err := updater.client.UpdateItem(ctx, input); err != nil {
		return fmt.Errorf("update photo result %s in DynamoDB table %s: %w", result.PhotoID, updater.tableName, err)
	}
	return nil
}

func (updater PhotoUpdater) MarkError(ctx context.Context, photoID string, updatedAtMillis int64) error {
	status := string(PhotoStatusError)
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(updater.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: photoID},
		},
		UpdateExpression: aws.String("SET #status = :status, updatedAt = :updatedAt"),
		ExpressionAttributeNames: map[string]string{
			"#status": "status",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status":    &types.AttributeValueMemberS{Value: status},
			":updatedAt": &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", updatedAtMillis)},
		},
	}

	if _, err := updater.client.UpdateItem(ctx, input); err != nil {
		return fmt.Errorf("mark photo %s error in DynamoDB table %s: %w", photoID, updater.tableName, err)
	}
	return nil
}

func exifAttributeValue(exif *jobs.ExifData) types.AttributeValue {
	if exif == nil {
		return &types.AttributeValueMemberNULL{Value: true}
	}

	fields := map[string]types.AttributeValue{
		"cameraMake":   stringOrNull(exif.CameraMake),
		"cameraModel":  stringOrNull(exif.CameraModel),
		"lens":         stringOrNull(exif.Lens),
		"focalLength":  floatOrNull(exif.FocalLength),
		"aperture":     floatOrNull(exif.Aperture),
		"shutterSpeed": stringOrNull(exif.ShutterSpeed),
		"iso":          intOrNull(exif.ISO),
		"dateTaken":    stringOrNull(exif.DateTaken),
		"whiteBalance": stringOrNull(exif.WhiteBalance),
		"meteringMode": stringOrNull(exif.MeteringMode),
		"flash":        stringOrNull(exif.Flash),
	}
	return &types.AttributeValueMemberM{Value: fields}
}

func stringOrNull(value *string) types.AttributeValue {
	if value == nil {
		return &types.AttributeValueMemberNULL{Value: true}
	}
	return &types.AttributeValueMemberS{Value: *value}
}

func floatOrNull(value *float64) types.AttributeValue {
	if value == nil {
		return &types.AttributeValueMemberNULL{Value: true}
	}
	return &types.AttributeValueMemberN{Value: fmt.Sprintf("%g", *value)}
}

func intOrNull(value *int) types.AttributeValue {
	if value == nil {
		return &types.AttributeValueMemberNULL{Value: true}
	}
	return &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", *value)}
}
