package main

import (
	"github.com/aws/aws-lambda-go/lambda"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/handler"
)

func main() {
	lambda.Start(handler.Handle)
}
