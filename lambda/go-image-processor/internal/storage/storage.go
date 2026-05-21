package storage

import "strings"

type ObjectRef struct {
	Bucket string
	Key    string
}

func NewObjectRef(bucket, key string) ObjectRef {
	return ObjectRef{Bucket: strings.TrimSpace(bucket), Key: strings.TrimSpace(key)}
}

func (ref ObjectRef) IsZero() bool {
	return ref.Bucket == "" || ref.Key == ""
}
