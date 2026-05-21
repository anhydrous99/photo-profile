package config

import (
	"errors"
	"testing"
)

func TestConfigLoadsWorkerOnlyEnv(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND":       "s3",
		"AWS_REGION":            "us-east-1",
		"AWS_S3_BUCKET":         "photos",
		"AWS_CLOUDFRONT_DOMAIN": "cdn.example.com",
		"DYNAMODB_TABLE_PREFIX": "dev_",
		"DYNAMODB_ENDPOINT":     "http://localhost:8000",
		"LOG_LEVEL":             "debug",
		"LOG_COMPONENT":         "worker-test",
	}

	cfg, err := LoadFrom(func(key string) string { return values[key] })
	if err != nil {
		t.Fatalf("expected valid config: %v", err)
	}
	if cfg.S3Bucket != "photos" || cfg.CloudFrontDomain != "cdn.example.com" || cfg.StorageBackend != StorageBackendS3 {
		t.Fatalf("unexpected config: %#v", cfg)
	}
	if cfg.AWSRegion != "us-east-1" || cfg.DynamoDBEndpoint != "http://localhost:8000" {
		t.Fatalf("unexpected AWS config: %#v", cfg)
	}
	if cfg.LogLevel != LogLevelDebug || cfg.LogComponent != "worker-test" {
		t.Fatalf("unexpected log config: %#v", cfg)
	}
	if cfg.PhotosTableName() != "dev_Photos" {
		t.Fatalf("unexpected table name: %s", cfg.PhotosTableName())
	}
}

func TestConfigDoesNotRequireAppWideEnv(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND":       "s3",
		"AWS_REGION":            "us-east-1",
		"AWS_S3_BUCKET":         "photos",
		"DYNAMODB_TABLE_PREFIX": "dev_",
	}

	if _, err := LoadFrom(func(key string) string { return values[key] }); err != nil {
		t.Fatalf("expected config without auth/admin/upstash/next env vars: %v", err)
	}
}

func TestConfigMissingS3BucketMessageIsDeterministic(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND":       "s3",
		"AWS_REGION":            "us-east-1",
		"DYNAMODB_TABLE_PREFIX": "dev_",
	}

	_, err := LoadFrom(func(key string) string { return values[key] })
	if err == nil {
		t.Fatal("expected missing S3 bucket to fail")
	}
	var validation ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected validation error: %T", err)
	}
	want := "AWS_S3_BUCKET is required when STORAGE_BACKEND is s3"
	if validation.FieldErrors["AWS_S3_BUCKET"] != want {
		t.Fatalf("unexpected bucket error: %#v", validation.FieldErrors)
	}
}

func TestConfigMissingDynamoDBTablePrefixMessageIsDeterministic(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND": "s3",
		"AWS_REGION":      "us-east-1",
		"AWS_S3_BUCKET":   "photos",
	}

	_, err := LoadFrom(func(key string) string { return values[key] })
	if err == nil {
		t.Fatal("expected missing table prefix to fail")
	}
	var validation ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected validation error: %T", err)
	}
	want := "DYNAMODB_TABLE_PREFIX is required for the Go image worker"
	if validation.FieldErrors["DYNAMODB_TABLE_PREFIX"] != want {
		t.Fatalf("unexpected table prefix error: %#v", validation.FieldErrors)
	}
}

func TestConfigRequiresExplicitNonEmptyTablePrefix(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND":       "s3",
		"AWS_REGION":            "us-east-1",
		"AWS_S3_BUCKET":         "photos",
		"DYNAMODB_TABLE_PREFIX": "   ",
	}

	_, err := LoadFrom(func(key string) string { return values[key] })
	if err == nil || !IsValidationError(err) {
		t.Fatalf("expected explicit non-empty table prefix requirement: %T %v", err, err)
	}
}

func TestConfigInvalidStorageBackend(t *testing.T) {
	values := map[string]string{
		"STORAGE_BACKEND":       "filesystem",
		"AWS_REGION":            "us-east-1",
		"AWS_S3_BUCKET":         "photos",
		"DYNAMODB_TABLE_PREFIX": "dev_",
	}
	_, err := LoadFrom(func(key string) string { return values[key] })
	if err == nil {
		t.Fatal("expected filesystem backend to fail for worker")
	}
}
