package jobs

import (
	"encoding/json"
	"errors"
	"strings"
)

type ImageJobData struct {
	PhotoID     string `json:"photoId"`
	OriginalKey string `json:"originalKey"`
}

type ImageJobResult struct {
	PhotoID     string            `json:"photoId"`
	Derivatives []string          `json:"derivatives"`
	BlurDataURL string            `json:"blurDataUrl"`
	ExifData    map[string]string `json:"exifData,omitempty"`
	Width       int               `json:"width"`
	Height      int               `json:"height"`
}

func ParseImageJobData(body string) (ImageJobData, error) {
	var job ImageJobData
	if err := json.Unmarshal([]byte(body), &job); err != nil {
		return ImageJobData{}, err
	}

	job.PhotoID = strings.TrimSpace(job.PhotoID)
	job.OriginalKey = strings.TrimSpace(job.OriginalKey)
	if job.PhotoID == "" {
		return ImageJobData{}, errors.New("photoId is required")
	}
	if job.OriginalKey == "" {
		return ImageJobData{}, errors.New("originalKey is required")
	}

	return job, nil
}
