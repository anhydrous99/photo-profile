package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type StorageBackend string

const (
	StorageBackendS3 StorageBackend = "s3"
)

type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type Config struct {
	StorageBackend      StorageBackend
	AWSRegion           string
	S3Bucket            string
	CloudFrontDomain    string
	DynamoDBTablePrefix string
	DynamoDBEndpoint    string
	LogLevel            LogLevel
	LogComponent        string
}

type LookupEnv func(string) string

type ValidationError struct {
	FieldErrors map[string]string
}

func (err ValidationError) Error() string {
	return "invalid worker config"
}

func Load() (Config, error) {
	return LoadFrom(os.Getenv)
}

func LoadFrom(lookup LookupEnv) (Config, error) {
	cfg := Config{
		StorageBackend:      StorageBackend(strings.TrimSpace(lookup("STORAGE_BACKEND"))),
		AWSRegion:           strings.TrimSpace(lookup("AWS_REGION")),
		S3Bucket:            strings.TrimSpace(lookup("AWS_S3_BUCKET")),
		CloudFrontDomain:    strings.TrimSpace(lookup("AWS_CLOUDFRONT_DOMAIN")),
		DynamoDBTablePrefix: strings.TrimSpace(lookup("DYNAMODB_TABLE_PREFIX")),
		DynamoDBEndpoint:    strings.TrimSpace(lookup("DYNAMODB_ENDPOINT")),
		LogLevel:            LogLevel(strings.TrimSpace(lookup("LOG_LEVEL"))),
		LogComponent:        strings.TrimSpace(lookup("LOG_COMPONENT")),
	}
	if cfg.LogLevel == "" {
		cfg.LogLevel = LogLevelInfo
	}
	if cfg.LogComponent == "" {
		cfg.LogComponent = "lambda-image-processor"
	}

	fieldErrors := cfg.validate()
	if len(fieldErrors) > 0 {
		return Config{}, ValidationError{FieldErrors: fieldErrors}
	}
	return cfg, nil
}

func (cfg Config) PhotosTableName() string {
	return cfg.DynamoDBTablePrefix + "Photos"
}

func IsValidationError(err error) bool {
	var validation ValidationError
	return errors.As(err, &validation)
}

func (cfg Config) validate() map[string]string {
	fieldErrors := make(map[string]string)
	if cfg.StorageBackend == "" {
		fieldErrors["STORAGE_BACKEND"] = "STORAGE_BACKEND is required for the Go image worker"
	} else if cfg.StorageBackend != StorageBackendS3 {
		fieldErrors["STORAGE_BACKEND"] = "STORAGE_BACKEND must be s3 for the Go image worker"
	}
	if cfg.AWSRegion == "" {
		fieldErrors["AWS_REGION"] = "AWS_REGION is required for the Go image worker"
	}
	if cfg.S3Bucket == "" {
		fieldErrors["AWS_S3_BUCKET"] = "AWS_S3_BUCKET is required when STORAGE_BACKEND is s3"
	}
	if cfg.DynamoDBTablePrefix == "" {
		fieldErrors["DYNAMODB_TABLE_PREFIX"] = "DYNAMODB_TABLE_PREFIX is required for the Go image worker"
	}
	if !isValidLogLevel(cfg.LogLevel) {
		fieldErrors["LOG_LEVEL"] = fmt.Sprintf("LOG_LEVEL must be one of debug, info, warn, error; got %q", cfg.LogLevel)
	}
	return fieldErrors
}

func isValidLogLevel(level LogLevel) bool {
	switch level {
	case LogLevelDebug, LogLevelInfo, LogLevelWarn, LogLevelError:
		return true
	default:
		return false
	}
}
