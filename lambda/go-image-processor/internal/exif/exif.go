package exif

type Data map[string]string

var allowedFields = []string{
	"cameraMake",
	"cameraModel",
	"lens",
	"focalLength",
	"aperture",
	"shutterSpeed",
	"iso",
	"dateTaken",
	"whiteBalance",
	"meteringMode",
	"flash",
}

func AllowedFields() []string {
	fields := make([]string, len(allowedFields))
	copy(fields, allowedFields)
	return fields
}

func IsAllowedField(field string) bool {
	for _, allowed := range allowedFields {
		if field == allowed {
			return true
		}
	}
	return false
}
