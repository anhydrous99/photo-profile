package exif

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/arxherre/photo-profile/lambda/go-image-processor/internal/jobs"
)

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

var meteringModeMap = map[uint32]string{
	0: "Unknown",
	1: "Average",
	2: "Center-weighted average",
	3: "Spot",
	4: "Multi-spot",
	5: "Pattern",
	6: "Partial",
}

var whiteBalanceMap = map[uint32]string{
	0: "Auto",
	1: "Manual",
}

var flashMap = map[uint32]string{
	0x00: "Did not fire",
	0x01: "Fired",
	0x05: "Fired, return not detected",
	0x07: "Fired, return detected",
	0x08: "Did not fire, compulsory",
	0x09: "Fired, compulsory",
	0x0d: "Fired, compulsory, return not detected",
	0x0f: "Fired, compulsory, return detected",
	0x10: "Did not fire, compulsory suppression",
	0x18: "Did not fire, auto",
	0x19: "Fired, auto",
	0x1d: "Fired, auto, return not detected",
	0x1f: "Fired, auto, return detected",
	0x20: "No flash function",
	0x41: "Fired, red-eye reduction",
	0x45: "Fired, red-eye reduction, return not detected",
	0x47: "Fired, red-eye reduction, return detected",
	0x49: "Fired, compulsory, red-eye reduction",
	0x4d: "Fired, compulsory, red-eye, return not detected",
	0x4f: "Fired, compulsory, red-eye, return detected",
	0x59: "Fired, auto, red-eye reduction",
	0x5d: "Fired, auto, red-eye, return not detected",
	0x5f: "Fired, auto, red-eye, return detected",
}

const (
	markerSOI  = 0xffd8
	markerAPP1 = 0xffe1
	markerSOS  = 0xffda

	tagMake             = 0x010f
	tagModel            = 0x0110
	tagExifIFDPointer   = 0x8769
	tagExposureTime     = 0x829a
	tagFNumber          = 0x829d
	tagISOSpeedRatings  = 0x8827
	tagDateTimeOriginal = 0x9003
	tagFocalLength      = 0x920a
	tagMeteringMode     = 0x9207
	tagFlash            = 0x9209
	tagWhiteBalance     = 0xa403
	tagLensModel        = 0xa434

	typeASCII    = 2
	typeShort    = 3
	typeLong     = 4
	typeRational = 5
)

type ifdEntry struct {
	tag        uint16
	fieldType  uint16
	count      uint32
	valueBytes []byte
}

type parser struct {
	data  []byte
	order binary.ByteOrder
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

func Extract(imagePath string) (*jobs.ExifData, error) {
	imageBytes, err := os.ReadFile(imagePath)
	if err != nil {
		return nil, fmt.Errorf("read image for exif: %w", err)
	}
	return ExtractFromBytes(imageBytes)
}

func ExtractFromBytes(imageBytes []byte) (*jobs.ExifData, error) {
	exifPayload, ok := findExifPayload(imageBytes)
	if !ok {
		return nil, nil
	}

	parsed, err := parseTIFF(exifPayload)
	if err != nil {
		return nil, nil
	}
	return parsed, nil
}

func findExifPayload(imageBytes []byte) ([]byte, bool) {
	if bytes.HasPrefix(imageBytes, []byte("Exif\x00\x00")) {
		return imageBytes[6:], true
	}
	if len(imageBytes) < 4 || binary.BigEndian.Uint16(imageBytes[0:2]) != markerSOI {
		return nil, false
	}

	for offset := 2; offset+4 <= len(imageBytes); {
		if imageBytes[offset] != 0xff {
			return nil, false
		}
		marker := binary.BigEndian.Uint16(imageBytes[offset : offset+2])
		if marker == markerSOS {
			return nil, false
		}
		segmentLength := int(binary.BigEndian.Uint16(imageBytes[offset+2 : offset+4]))
		if segmentLength < 2 || offset+2+segmentLength > len(imageBytes) {
			return nil, false
		}
		segment := imageBytes[offset+4 : offset+2+segmentLength]
		if marker == markerAPP1 && bytes.HasPrefix(segment, []byte("Exif\x00\x00")) {
			return segment[6:], true
		}
		offset += 2 + segmentLength
	}
	return nil, false
}

func parseTIFF(data []byte) (*jobs.ExifData, error) {
	if len(data) < 8 {
		return nil, errors.New("exif tiff header too short")
	}

	p := parser{data: data}
	switch string(data[0:2]) {
	case "II":
		p.order = binary.LittleEndian
	case "MM":
		p.order = binary.BigEndian
	default:
		return nil, errors.New("unsupported exif byte order")
	}
	if p.order.Uint16(data[2:4]) != 42 {
		return nil, errors.New("invalid exif tiff marker")
	}

	ifd0Offset := p.order.Uint32(data[4:8])
	ifd0, err := p.readIFD(ifd0Offset)
	if err != nil {
		return nil, err
	}

	result := &jobs.ExifData{
		CameraMake:  p.stringField(ifd0[tagMake]),
		CameraModel: p.stringField(ifd0[tagModel]),
	}

	exifOffset := p.integerField(ifd0[tagExifIFDPointer])
	if exifOffset == nil {
		return result, nil
	}
	exifIFD, err := p.readIFD(*exifOffset)
	if err != nil {
		return result, nil
	}

	result.Lens = p.stringField(exifIFD[tagLensModel])
	result.FocalLength = p.rationalField(exifIFD[tagFocalLength])
	result.Aperture = p.rationalField(exifIFD[tagFNumber])
	result.ShutterSpeed = formatShutterSpeed(p.rationalField(exifIFD[tagExposureTime]))
	result.ISO = intField(p.integerField(exifIFD[tagISOSpeedRatings]))
	result.DateTaken = formatDateTaken(p.stringField(exifIFD[tagDateTimeOriginal]))
	result.WhiteBalance = mappedField(p.integerField(exifIFD[tagWhiteBalance]), whiteBalanceMap)
	result.MeteringMode = mappedField(p.integerField(exifIFD[tagMeteringMode]), meteringModeMap)
	result.Flash = mapFlash(p.integerField(exifIFD[tagFlash]))

	return result, nil
}

func (p parser) readIFD(offset uint32) (map[uint16]ifdEntry, error) {
	start := int(offset)
	if start < 0 || start+2 > len(p.data) {
		return nil, errors.New("ifd offset out of bounds")
	}
	entryCount := int(p.order.Uint16(p.data[start : start+2]))
	entriesStart := start + 2
	entriesEnd := entriesStart + entryCount*12
	if entriesEnd > len(p.data) {
		return nil, errors.New("ifd entries out of bounds")
	}

	entries := make(map[uint16]ifdEntry, entryCount)
	for index := 0; index < entryCount; index++ {
		raw := p.data[entriesStart+index*12 : entriesStart+(index+1)*12]
		entry := ifdEntry{
			tag:       p.order.Uint16(raw[0:2]),
			fieldType: p.order.Uint16(raw[2:4]),
			count:     p.order.Uint32(raw[4:8]),
		}
		valueBytes, ok := p.entryValue(raw[8:12], entry.fieldType, entry.count)
		if !ok {
			continue
		}
		entry.valueBytes = valueBytes
		entries[entry.tag] = entry
	}
	return entries, nil
}

func (p parser) entryValue(inlineValue []byte, fieldType uint16, count uint32) ([]byte, bool) {
	valueLength, ok := valueByteLength(fieldType, count)
	if !ok {
		return nil, false
	}
	if valueLength <= 4 {
		return inlineValue[:valueLength], true
	}

	offset := int(p.order.Uint32(inlineValue))
	if offset < 0 || offset+valueLength > len(p.data) {
		return nil, false
	}
	return p.data[offset : offset+valueLength], true
}

func valueByteLength(fieldType uint16, count uint32) (int, bool) {
	var unitSize uint32
	switch fieldType {
	case typeASCII:
		unitSize = 1
	case typeShort:
		unitSize = 2
	case typeLong:
		unitSize = 4
	case typeRational:
		unitSize = 8
	default:
		return 0, false
	}
	if count > math.MaxInt32/unitSize {
		return 0, false
	}
	return int(unitSize * count), true
}

func (p parser) stringField(entry ifdEntry) *string {
	if entry.fieldType != typeASCII || entry.count == 0 || len(entry.valueBytes) == 0 {
		return nil
	}
	value := strings.TrimRight(string(entry.valueBytes), "\x00")
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func (p parser) integerField(entry ifdEntry) *uint32 {
	if entry.count == 0 || len(entry.valueBytes) == 0 {
		return nil
	}
	switch entry.fieldType {
	case typeShort:
		if len(entry.valueBytes) < 2 {
			return nil
		}
		value := uint32(p.order.Uint16(entry.valueBytes[0:2]))
		return &value
	case typeLong:
		if len(entry.valueBytes) < 4 {
			return nil
		}
		value := p.order.Uint32(entry.valueBytes[0:4])
		return &value
	default:
		return nil
	}
}

func (p parser) rationalField(entry ifdEntry) *float64 {
	if entry.fieldType != typeRational || entry.count == 0 || len(entry.valueBytes) < 8 {
		return nil
	}
	numerator := p.order.Uint32(entry.valueBytes[0:4])
	denominator := p.order.Uint32(entry.valueBytes[4:8])
	if denominator == 0 {
		return nil
	}
	value := float64(numerator) / float64(denominator)
	return &value
}

func formatShutterSpeed(exposureTime *float64) *string {
	if exposureTime == nil || *exposureTime <= 0 {
		return nil
	}
	var value string
	if *exposureTime >= 1 {
		value = fmt.Sprintf("%gs", *exposureTime)
	} else {
		value = fmt.Sprintf("1/%.0f", math.Round(1 / *exposureTime))
	}
	return &value
}

func formatDateTaken(raw *string) *string {
	if raw == nil {
		return nil
	}
	parsed, err := time.ParseInLocation("2006:01:02 15:04:05", *raw, time.UTC)
	if err != nil {
		return nil
	}
	value := parsed.UTC().Format("2006-01-02T15:04:05.000Z")
	return &value
}

func mappedField(raw *uint32, labels map[uint32]string) *string {
	if raw == nil {
		return nil
	}
	value, ok := labels[*raw]
	if !ok {
		return nil
	}
	return &value
}

func mapFlash(raw *uint32) *string {
	if raw == nil {
		return nil
	}
	if value, ok := flashMap[*raw]; ok {
		return &value
	}
	value := "Did not fire"
	if *raw&0x01 == 1 {
		value = "Fired"
	}
	return &value
}

func intField(raw *uint32) *int {
	const maxInt = int(^uint(0) >> 1)
	if raw == nil || uint64(*raw) > uint64(maxInt) {
		return nil
	}
	value := int(*raw)
	return &value
}
