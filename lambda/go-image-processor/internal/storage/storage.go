package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	imagepipeline "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/image"
)

const (
	ContentTypeAVIF = "image/avif"
	ContentTypeWebP = "image/webp"
)

type ObjectRef struct {
	Bucket string
	Key    string
}

type S3Client interface {
	PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	ListObjectsV2(context.Context, *s3.ListObjectsV2Input, ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	DeleteObjects(context.Context, *s3.DeleteObjectsInput, ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
}

type S3Adapter struct {
	bucket string
	client S3Client
}

func NewObjectRef(bucket, key string) ObjectRef {
	return ObjectRef{Bucket: strings.TrimSpace(bucket), Key: strings.TrimSpace(key)}
}

func (ref ObjectRef) IsZero() bool {
	return ref.Bucket == "" || ref.Key == ""
}

func NewS3Adapter(bucket string, client S3Client) S3Adapter {
	return S3Adapter{bucket: strings.TrimSpace(bucket), client: client}
}

func (adapter S3Adapter) PutObject(ctx context.Context, key string, body []byte, contentType string) error {
	key = strings.TrimSpace(key)
	_, err := adapter.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(adapter.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("put S3 object %s: %w", key, err)
	}
	return nil
}

func (adapter S3Adapter) GetObject(ctx context.Context, key string) ([]byte, error) {
	key = strings.TrimSpace(key)
	output, err := adapter.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(adapter.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, fmt.Errorf("S3 object not found %s: %w", key, err)
		}
		return nil, fmt.Errorf("get S3 object %s: %w", key, err)
	}
	if output.Body == nil {
		return nil, fmt.Errorf("get S3 object %s: empty response body", key)
	}
	defer output.Body.Close()

	data, err := io.ReadAll(output.Body)
	if err != nil {
		return nil, fmt.Errorf("read S3 object %s: %w", key, err)
	}
	return data, nil
}

func (adapter S3Adapter) ListFiles(ctx context.Context, prefix string) ([]string, error) {
	objects, err := adapter.listObjects(ctx, prefix)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(objects))
	for _, object := range objects {
		if object.Key != nil && *object.Key != "" {
			keys = append(keys, *object.Key)
		}
	}
	return keys, nil
}

func (adapter S3Adapter) DeleteFiles(ctx context.Context, prefix string) error {
	objects, err := adapter.listObjects(ctx, prefix)
	if err != nil {
		return err
	}
	if len(objects) == 0 {
		return nil
	}

	identifiers := make([]types.ObjectIdentifier, 0, len(objects))
	for _, object := range objects {
		if object.Key != nil && *object.Key != "" {
			identifiers = append(identifiers, types.ObjectIdentifier{Key: object.Key})
		}
	}
	if len(identifiers) == 0 {
		return nil
	}

	_, err = adapter.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(adapter.bucket),
		Delete: &types.Delete{
			Objects: identifiers,
			Quiet:   aws.Bool(true),
		},
	})
	if err != nil {
		return fmt.Errorf("delete S3 objects with prefix %s: %w", strings.TrimSpace(prefix), err)
	}
	return nil
}

func (adapter S3Adapter) FileExists(ctx context.Context, key string) (bool, error) {
	key = strings.TrimSpace(key)
	_, err := adapter.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(adapter.bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		return true, nil
	}
	if isNotFound(err) {
		return false, nil
	}
	return false, fmt.Errorf("head S3 object %s: %w", key, err)
}

func (adapter S3Adapter) PutProcessedWebP(ctx context.Context, photoID string, width int, body []byte) (string, error) {
	return adapter.putProcessed(ctx, photoID, width, "webp", ContentTypeWebP, body)
}

func (adapter S3Adapter) PutProcessedAVIF(ctx context.Context, photoID string, width int, body []byte) (string, error) {
	return adapter.putProcessed(ctx, photoID, width, "avif", ContentTypeAVIF, body)
}

func (adapter S3Adapter) putProcessed(ctx context.Context, photoID string, width int, format string, contentType string, body []byte) (string, error) {
	key := imagepipeline.ProcessedKey(photoID, width, format)
	if err := adapter.PutObject(ctx, key, body, contentType); err != nil {
		return "", fmt.Errorf("put processed %s %s: %w", format, key, err)
	}
	return key, nil
}

func (adapter S3Adapter) listObjects(ctx context.Context, prefix string) ([]types.Object, error) {
	prefix = strings.TrimSpace(prefix)
	objects := make([]types.Object, 0)
	var continuationToken *string

	for {
		output, err := adapter.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(adapter.bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return nil, fmt.Errorf("list S3 objects with prefix %s: %w", prefix, err)
		}

		objects = append(objects, output.Contents...)
		if output.NextContinuationToken == nil || *output.NextContinuationToken == "" {
			return objects, nil
		}
		continuationToken = output.NextContinuationToken
	}
}

func isNotFound(err error) bool {
	var apiError smithy.APIError
	if !errors.As(err, &apiError) {
		return false
	}
	switch apiError.ErrorCode() {
	case "NotFound", "NoSuchKey":
		return true
	default:
		return false
	}
}
