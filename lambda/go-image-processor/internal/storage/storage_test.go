package storage

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type recordingS3Client struct {
	putInput    *s3.PutObjectInput
	putError    error
	getInput    *s3.GetObjectInput
	getOutput   *s3.GetObjectOutput
	getError    error
	headInput   *s3.HeadObjectInput
	headError   error
	listInputs  []*s3.ListObjectsV2Input
	listOutputs []*s3.ListObjectsV2Output
	listError   error
	deleteInput *s3.DeleteObjectsInput
	deleteError error
}

func (client *recordingS3Client) PutObject(ctx context.Context, input *s3.PutObjectInput, opts ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	client.putInput = input
	return &s3.PutObjectOutput{}, client.putError
}

func (client *recordingS3Client) GetObject(ctx context.Context, input *s3.GetObjectInput, opts ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	client.getInput = input
	return client.getOutput, client.getError
}

func (client *recordingS3Client) HeadObject(ctx context.Context, input *s3.HeadObjectInput, opts ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	client.headInput = input
	return &s3.HeadObjectOutput{}, client.headError
}

func (client *recordingS3Client) ListObjectsV2(ctx context.Context, input *s3.ListObjectsV2Input, opts ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	client.listInputs = append(client.listInputs, input)
	if client.listError != nil {
		return nil, client.listError
	}
	if len(client.listOutputs) == 0 {
		return &s3.ListObjectsV2Output{}, nil
	}
	output := client.listOutputs[0]
	client.listOutputs = client.listOutputs[1:]
	return output, nil
}

func (client *recordingS3Client) DeleteObjects(ctx context.Context, input *s3.DeleteObjectsInput, opts ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
	client.deleteInput = input
	return &s3.DeleteObjectsOutput{}, client.deleteError
}

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

func TestS3PutObjectUsesBucketKeyBodyAndContentType(t *testing.T) {
	client := &recordingS3Client{}
	adapter := NewS3Adapter(" photos ", client)

	err := adapter.PutObject(context.Background(), " originals/photo.jpg ", []byte("image bytes"), "image/jpeg")
	if err != nil {
		t.Fatalf("put object failed: %v", err)
	}

	if *client.putInput.Bucket != "photos" || *client.putInput.Key != "originals/photo.jpg" {
		t.Fatalf("unexpected put target: %#v", client.putInput)
	}
	if *client.putInput.ContentType != "image/jpeg" {
		t.Fatalf("unexpected content type: %s", *client.putInput.ContentType)
	}
	body, err := io.ReadAll(client.putInput.Body)
	if err != nil {
		t.Fatalf("read put body: %v", err)
	}
	if string(body) != "image bytes" {
		t.Fatalf("unexpected body: %q", string(body))
	}
}

func TestS3GetObjectReturnsBytes(t *testing.T) {
	client := &recordingS3Client{getOutput: &s3.GetObjectOutput{Body: io.NopCloser(strings.NewReader("original"))}}
	adapter := NewS3Adapter("photos", client)

	body, err := adapter.GetObject(context.Background(), " originals/photo.jpg ")
	if err != nil {
		t.Fatalf("get object failed: %v", err)
	}

	if *client.getInput.Bucket != "photos" || *client.getInput.Key != "originals/photo.jpg" {
		t.Fatalf("unexpected get target: %#v", client.getInput)
	}
	if string(body) != "original" {
		t.Fatalf("unexpected body: %q", string(body))
	}
}

func TestStorageProcessedWebPUsesDeterministicKeyAndExactContentType(t *testing.T) {
	client := &recordingS3Client{}
	adapter := NewS3Adapter("photos", client)

	key, err := adapter.PutProcessedWebP(context.Background(), "photo-1", 300, []byte("webp"))
	if err != nil {
		t.Fatalf("put processed webp failed: %v", err)
	}

	if key != "processed/photo-1/300w.webp" || *client.putInput.Key != key {
		t.Fatalf("unexpected processed key: returned=%s input=%s", key, *client.putInput.Key)
	}
	if *client.putInput.ContentType != ContentTypeWebP {
		t.Fatalf("unexpected content type: %s", *client.putInput.ContentType)
	}
}

func TestStorageProcessedAVIFUsesDeterministicKeyAndExactContentType(t *testing.T) {
	client := &recordingS3Client{}
	adapter := NewS3Adapter("photos", client)

	key, err := adapter.PutProcessedAVIF(context.Background(), "photo-1", 600, []byte("avif"))
	if err != nil {
		t.Fatalf("put processed avif failed: %v", err)
	}

	if key != "processed/photo-1/600w.avif" || *client.putInput.Key != key {
		t.Fatalf("unexpected processed key: returned=%s input=%s", key, *client.putInput.Key)
	}
	if *client.putInput.ContentType != ContentTypeAVIF {
		t.Fatalf("unexpected content type: %s", *client.putInput.ContentType)
	}
}

func TestS3PutFailureIncludesObjectContext(t *testing.T) {
	client := &recordingS3Client{putError: errors.New("denied")}
	adapter := NewS3Adapter("photos", client)

	_, err := adapter.PutProcessedWebP(context.Background(), "photo-1", 300, []byte("webp"))
	if err == nil {
		t.Fatal("expected put failure")
	}
	message := err.Error()
	if !strings.Contains(message, "put processed webp processed/photo-1/300w.webp") || !strings.Contains(message, "put S3 object processed/photo-1/300w.webp") || !strings.Contains(message, "denied") {
		t.Fatalf("missing error context: %v", err)
	}
}

func TestS3ListFilesReturnsKeysAcrossPages(t *testing.T) {
	client := &recordingS3Client{listOutputs: []*s3.ListObjectsV2Output{
		{
			Contents: []s3types.Object{
				{Key: aws.String("processed/photo-1/300w.webp")},
				{Key: aws.String("")},
			},
			NextContinuationToken: aws.String("next-page"),
		},
		{
			Contents: []s3types.Object{{Key: aws.String("processed/photo-1/600w.avif")}},
		},
	}}
	adapter := NewS3Adapter("photos", client)

	keys, err := adapter.ListFiles(context.Background(), " processed/photo-1/ ")
	if err != nil {
		t.Fatalf("list files failed: %v", err)
	}

	if len(keys) != 2 || keys[0] != "processed/photo-1/300w.webp" || keys[1] != "processed/photo-1/600w.avif" {
		t.Fatalf("unexpected keys: %#v", keys)
	}
	if len(client.listInputs) != 2 {
		t.Fatalf("expected two list calls, got %d", len(client.listInputs))
	}
	if *client.listInputs[0].Bucket != "photos" || *client.listInputs[0].Prefix != "processed/photo-1/" {
		t.Fatalf("unexpected first list input: %#v", client.listInputs[0])
	}
	if *client.listInputs[1].ContinuationToken != "next-page" {
		t.Fatalf("unexpected continuation token: %#v", client.listInputs[1].ContinuationToken)
	}
}

func TestS3DeleteFilesDeletesListedKeys(t *testing.T) {
	client := &recordingS3Client{listOutputs: []*s3.ListObjectsV2Output{
		{Contents: []s3types.Object{
			{Key: aws.String("processed/photo-1/300w.webp")},
			{Key: aws.String("processed/photo-1/300w.avif")},
		}},
	}}
	adapter := NewS3Adapter("photos", client)

	err := adapter.DeleteFiles(context.Background(), "processed/photo-1/")
	if err != nil {
		t.Fatalf("delete files failed: %v", err)
	}

	if client.deleteInput == nil {
		t.Fatal("expected DeleteObjects call")
	}
	if *client.deleteInput.Bucket != "photos" {
		t.Fatalf("unexpected delete bucket: %s", *client.deleteInput.Bucket)
	}
	objects := client.deleteInput.Delete.Objects
	if len(objects) != 2 || *objects[0].Key != "processed/photo-1/300w.webp" || *objects[1].Key != "processed/photo-1/300w.avif" {
		t.Fatalf("unexpected delete objects: %#v", objects)
	}
	if client.deleteInput.Delete.Quiet == nil || !*client.deleteInput.Delete.Quiet {
		t.Fatalf("expected quiet delete: %#v", client.deleteInput.Delete.Quiet)
	}
}

func TestS3DeleteFilesSkipsEmptyList(t *testing.T) {
	client := &recordingS3Client{}
	adapter := NewS3Adapter("photos", client)

	err := adapter.DeleteFiles(context.Background(), "processed/photo-1/")
	if err != nil {
		t.Fatalf("delete empty prefix failed: %v", err)
	}
	if client.deleteInput != nil {
		t.Fatalf("expected no DeleteObjects call: %#v", client.deleteInput)
	}
}

func TestS3FileExistsReturnsTrue(t *testing.T) {
	client := &recordingS3Client{}
	adapter := NewS3Adapter("photos", client)

	exists, err := adapter.FileExists(context.Background(), " originals/photo.jpg ")
	if err != nil {
		t.Fatalf("file exists failed: %v", err)
	}
	if !exists {
		t.Fatal("expected file to exist")
	}
	if *client.headInput.Bucket != "photos" || *client.headInput.Key != "originals/photo.jpg" {
		t.Fatalf("unexpected head target: %#v", client.headInput)
	}
}

func TestS3FileExistsReturnsFalseForNotFound(t *testing.T) {
	client := &recordingS3Client{headError: &smithy.GenericAPIError{Code: "NotFound", Message: "missing"}}
	adapter := NewS3Adapter("photos", client)

	exists, err := adapter.FileExists(context.Background(), "missing.jpg")
	if err != nil {
		t.Fatalf("file exists should ignore not found: %v", err)
	}
	if exists {
		t.Fatal("expected missing file to return false")
	}
}

func TestS3ListFailureIncludesPrefixContext(t *testing.T) {
	client := &recordingS3Client{listError: errors.New("s3 unavailable")}
	adapter := NewS3Adapter("photos", client)

	_, err := adapter.ListFiles(context.Background(), "processed/photo-1/")
	if err == nil {
		t.Fatal("expected list failure")
	}
	message := err.Error()
	if !strings.Contains(message, "list S3 objects with prefix processed/photo-1/") || !strings.Contains(message, "s3 unavailable") {
		t.Fatalf("missing list error context: %v", err)
	}
}

func TestS3DeleteFailureIncludesPrefixContext(t *testing.T) {
	client := &recordingS3Client{
		listOutputs: []*s3.ListObjectsV2Output{{Contents: []s3types.Object{{Key: aws.String("processed/photo-1/300w.webp")}}}},
		deleteError: errors.New("access denied"),
	}
	adapter := NewS3Adapter("photos", client)

	err := adapter.DeleteFiles(context.Background(), "processed/photo-1/")
	if err == nil {
		t.Fatal("expected delete failure")
	}
	message := err.Error()
	if !strings.Contains(message, "delete S3 objects with prefix processed/photo-1/") || !strings.Contains(message, "access denied") {
		t.Fatalf("missing delete error context: %v", err)
	}
}

func TestS3HeadFailureIncludesKeyContext(t *testing.T) {
	client := &recordingS3Client{headError: errors.New("network down")}
	adapter := NewS3Adapter("photos", client)

	_, err := adapter.FileExists(context.Background(), "originals/photo.jpg")
	if err == nil {
		t.Fatal("expected head failure")
	}
	message := err.Error()
	if !strings.Contains(message, "head S3 object originals/photo.jpg") || !strings.Contains(message, "network down") {
		t.Fatalf("missing head error context: %v", err)
	}
}
