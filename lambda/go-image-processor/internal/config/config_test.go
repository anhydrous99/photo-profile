package config

import "testing"

func TestLoadFrom(t *testing.T) {
	values := map[string]string{
		"AWS_S3_BUCKET":         "photos",
		"AWS_CLOUDFRONT_DOMAIN": "cdn.example.com",
		"DYNAMODB_TABLE_PREFIX": "dev_",
		"STORAGE_BACKEND":       "s3",
	}

	cfg := LoadFrom(func(key string) string { return values[key] })
	if cfg.S3Bucket != "photos" || cfg.CloudFrontDomain != "cdn.example.com" || cfg.StorageBackend != "s3" {
		t.Fatalf("unexpected config: %#v", cfg)
	}
	if cfg.PhotosTableName() != "dev_Photos" {
		t.Fatalf("unexpected table name: %s", cfg.PhotosTableName())
	}
}
