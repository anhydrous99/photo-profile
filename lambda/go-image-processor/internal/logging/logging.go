package logging

import (
	"encoding/json"
	"io"
	"time"
)

type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

type Fields map[string]any

type Logger struct {
	writer    io.Writer
	component string
	minLevel  Level
	now       func() time.Time
}

type ErrorFields struct {
	Message string `json:"message"`
}

func New(writer io.Writer) Logger {
	return NewWithOptions(writer, "lambda-image-processor", LevelDebug)
}

func NewWithOptions(writer io.Writer, component string, minLevel Level) Logger {
	if component == "" {
		component = "lambda-image-processor"
	}
	if !validLevel(minLevel) {
		minLevel = LevelInfo
	}
	return Logger{
		writer:    writer,
		component: component,
		minLevel:  minLevel,
		now:       time.Now,
	}
}

func (logger Logger) WithClock(now func() time.Time) Logger {
	logger.now = now
	return logger
}

func (logger Logger) Debug(message string, fields Fields) error {
	return logger.log(LevelDebug, message, fields)
}

func (logger Logger) Info(message string, fields Fields) error {
	return logger.log(LevelInfo, message, fields)
}

func (logger Logger) Warn(message string, fields Fields) error {
	return logger.log(LevelWarn, message, fields)
}

func (logger Logger) Error(message string, fields Fields) error {
	return logger.log(LevelError, message, fields)
}

func (logger Logger) log(level Level, message string, fields Fields) error {
	if levelPriority(level) < levelPriority(logger.minLevel) {
		return nil
	}
	entry := Fields{
		"level":     string(level),
		"timestamp": logger.now().UTC().Format(time.RFC3339Nano),
		"component": logger.component,
		"message":   message,
	}
	for key, value := range fields {
		if err, ok := value.(error); ok {
			entry[key] = ErrorFields{Message: err.Error()}
			continue
		}
		entry[key] = value
	}

	encoded, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	_, err = logger.writer.Write(append(encoded, byte('\n')))
	return err
}

func validLevel(level Level) bool {
	switch level {
	case LevelDebug, LevelInfo, LevelWarn, LevelError:
		return true
	default:
		return false
	}
}

func levelPriority(level Level) int {
	switch level {
	case LevelDebug:
		return 0
	case LevelInfo:
		return 1
	case LevelWarn:
		return 2
	case LevelError:
		return 3
	default:
		return 1
	}
}
