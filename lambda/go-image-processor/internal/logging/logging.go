package logging

import (
	"encoding/json"
	"io"
)

type Logger struct {
	writer io.Writer
}

func New(writer io.Writer) Logger {
	return Logger{writer: writer}
}

func (logger Logger) Info(message string, fields map[string]string) error {
	entry := map[string]string{"level": "info", "message": message}
	for key, value := range fields {
		entry[key] = value
	}
	encoded, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	_, err = logger.writer.Write(append(encoded, byte(10)))
	return err
}
