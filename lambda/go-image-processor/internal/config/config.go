package config

import "os"

type Config struct {
	S3Bucket            string
	CloudFrontDomain    string
	DynamoDBTablePrefix string
	StorageBackend      string
}

type LookupEnv func(string) string

func Load() Config {
	return LoadFrom(os.Getenv)
}

func LoadFrom(lookup LookupEnv) Config {
	return Config{
		S3Bucket:            lookup("AWS_S3_BUCKET"),
		CloudFrontDomain:    lookup("AWS_CLOUDFRONT_DOMAIN"),
		DynamoDBTablePrefix: lookup("DYNAMODB_TABLE_PREFIX"),
		StorageBackend:      lookup("STORAGE_BACKEND"),
	}
}

func (cfg Config) PhotosTableName() string {
	return cfg.DynamoDBTablePrefix + "Photos"
}
