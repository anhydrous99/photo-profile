package processor

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	workerconfig "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/config"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/ddb"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/exif"
	imagepipeline "github.com/arxherre/photo-profile/lambda/go-image-processor/internal/image"
	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/storage"
)

func NewFromEnvironment(ctx context.Context) (Processor, error) {
	cfg, err := workerconfig.Load()
	if err != nil {
		return Processor{}, err
	}

	awsConfig, err := awscfg.LoadDefaultConfig(ctx, awscfg.WithRegion(cfg.AWSRegion))
	if err != nil {
		return Processor{}, err
	}

	s3Client := s3.NewFromConfig(awsConfig)
	dynamoClient := dynamodb.NewFromConfig(awsConfig, func(options *dynamodb.Options) {
		if cfg.DynamoDBEndpoint != "" {
			options.BaseEndpoint = aws.String(cfg.DynamoDBEndpoint)
		}
	})

	return New(
		storage.NewS3Adapter(cfg.S3Bucket, s3Client),
		imagepipeline.NewTransformer(),
		exif.Extract,
		ddb.NewPhotoUpdater(cfg.PhotosTableName(), dynamoClient),
		nil,
	), nil
}
