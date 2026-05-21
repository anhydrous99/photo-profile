package ddb

import "testing"

func TestTableName(t *testing.T) {
	if got := TableName("prod_", "Photos"); got != "prod_Photos" {
		t.Fatalf("unexpected table name: %s", got)
	}
}

func TestPhotoStatuses(t *testing.T) {
	statuses := []PhotoStatus{PhotoStatusProcessing, PhotoStatusReady, PhotoStatusError}
	if len(statuses) != 3 {
		t.Fatalf("unexpected statuses: %#v", statuses)
	}
}
