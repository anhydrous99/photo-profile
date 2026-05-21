package ddb

type PhotoStatus string

const (
	PhotoStatusProcessing PhotoStatus = "processing"
	PhotoStatusReady      PhotoStatus = "ready"
	PhotoStatusError      PhotoStatus = "error"
)

func TableName(prefix, base string) string {
	return prefix + base
}
