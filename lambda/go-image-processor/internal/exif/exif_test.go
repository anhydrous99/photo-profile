package exif

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"reflect"
	"testing"
)

func TestAllowedFields(t *testing.T) {
	if !IsAllowedField("cameraMake") {
		t.Fatal("expected cameraMake to be allowed")
	}
	if IsAllowedField("gpsLatitude") {
		t.Fatal("expected GPS field to be disallowed")
	}
}

func TestAllowedFieldsReturnsExpectedContractCopy(t *testing.T) {
	expected := []string{
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

	fields := AllowedFields()
	if !reflect.DeepEqual(fields, expected) {
		t.Fatalf("unexpected allowed fields: %#v", fields)
	}

	fields[0] = "gpsLatitude"
	if AllowedFields()[0] != "cameraMake" {
		t.Fatal("expected allowed fields copy")
	}
}

func TestExifExtractsAllowedFieldsFromJPEG(t *testing.T) {
	data, err := ExtractFromBytes(testJPEGWithExif())
	if err != nil {
		t.Fatalf("expected exif extraction: %v", err)
	}
	if data == nil {
		t.Fatal("expected exif data")
	}

	assertString(t, "cameraMake", data.CameraMake, "AllowedMake")
	assertString(t, "cameraModel", data.CameraModel, "AllowedModel")
	assertString(t, "lens", data.Lens, "AllowedLens")
	assertFloat(t, "focalLength", data.FocalLength, 35)
	assertFloat(t, "aperture", data.Aperture, 2.8)
	assertString(t, "shutterSpeed", data.ShutterSpeed, "1/250")
	assertInt(t, "iso", data.ISO, 400)
	assertString(t, "dateTaken", data.DateTaken, "2025-01-02T03:04:05.000Z")
	assertString(t, "whiteBalance", data.WhiteBalance, "Manual")
	assertString(t, "meteringMode", data.MeteringMode, "Pattern")
	assertString(t, "flash", data.Flash, "Fired")
}

func TestExifJSONSerializationUsesOnlyAllowlist(t *testing.T) {
	data, err := ExtractFromBytes(testJPEGWithExif())
	if err != nil {
		t.Fatalf("expected exif extraction: %v", err)
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("expected json: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("expected json object: %v", err)
	}
	for _, field := range AllowedFields() {
		if _, ok := decoded[field]; !ok {
			t.Fatalf("expected allowed field %s in %s", field, encoded)
		}
	}
	if len(decoded) != len(AllowedFields()) {
		t.Fatalf("expected only allowlist fields in %s", encoded)
	}

	for _, forbidden := range []string{
		"gps",
		"gpsLatitude",
		"gpsLongitude",
		"GPSInfo",
		"serialNumber",
		"bodySerialNumber",
		"cameraSerialNumber",
		"software",
		"Software",
		"HostComputer",
		"rawExif",
	} {
		if _, ok := decoded[forbidden]; ok {
			t.Fatalf("forbidden field %s serialized in %s", forbidden, encoded)
		}
	}
}

func TestExifUnsupportedFieldsRemainNil(t *testing.T) {
	data, err := ExtractFromBytes(jpegFromExifPayload(minimalExifPayload()))
	if err != nil {
		t.Fatalf("expected exif extraction: %v", err)
	}
	if data == nil {
		t.Fatal("expected nullable exif data")
	}
	if data.CameraMake != nil || data.FocalLength != nil || data.Flash != nil {
		t.Fatalf("expected missing fields to stay nil: %#v", data)
	}
}

func TestExifReturnsNilForImagesWithoutEXIF(t *testing.T) {
	data, err := ExtractFromBytes([]byte{0xff, 0xd8, 0xff, 0xda, 0x00, 0x02})
	if err != nil {
		t.Fatalf("expected no error for missing exif: %v", err)
	}
	if data != nil {
		t.Fatalf("expected nil exif data: %#v", data)
	}
}

func assertString(t *testing.T, field string, got *string, want string) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("unexpected %s: got %#v want %q", field, got, want)
	}
}

func assertFloat(t *testing.T, field string, got *float64, want float64) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("unexpected %s: got %#v want %f", field, got, want)
	}
}

func assertInt(t *testing.T, field string, got *int, want int) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("unexpected %s: got %#v want %d", field, got, want)
	}
}

func testJPEGWithExif() []byte {
	return jpegFromExifPayload(testExifPayload())
}

func jpegFromExifPayload(payload []byte) []byte {
	segment := append([]byte("Exif\x00\x00"), payload...)
	jpeg := bytes.NewBuffer([]byte{0xff, 0xd8, 0xff, 0xe1})
	_ = binary.Write(jpeg, binary.BigEndian, uint16(len(segment)+2))
	jpeg.Write(segment)
	jpeg.Write([]byte{0xff, 0xda, 0x00, 0x02})
	return jpeg.Bytes()
}

func minimalExifPayload() []byte {
	builder := newExifBuilder()
	builder.ifd0 = []testEntry{{tag: tagExifIFDPointer, fieldType: typeLong, values: []uint32{0}}}
	return builder.bytes()
}

func testExifPayload() []byte {
	builder := newExifBuilder()
	builder.ifd0 = []testEntry{
		{tag: tagMake, fieldType: typeASCII, text: "AllowedMake"},
		{tag: tagModel, fieldType: typeASCII, text: "AllowedModel"},
		{tag: tagExifIFDPointer, fieldType: typeLong, values: []uint32{0}},
		{tag: 0x0131, fieldType: typeASCII, text: "ForbiddenEditor"},
		{tag: 0x013c, fieldType: typeASCII, text: "ForbiddenHost"},
		{tag: 0x8825, fieldType: typeLong, values: []uint32{0}},
	}
	builder.exifIFD = []testEntry{
		{tag: tagLensModel, fieldType: typeASCII, text: "AllowedLens"},
		{tag: tagFocalLength, fieldType: typeRational, values: []uint32{35, 1}},
		{tag: tagFNumber, fieldType: typeRational, values: []uint32{28, 10}},
		{tag: tagExposureTime, fieldType: typeRational, values: []uint32{1, 250}},
		{tag: tagISOSpeedRatings, fieldType: typeShort, values: []uint32{400}},
		{tag: tagDateTimeOriginal, fieldType: typeASCII, text: "2025:01:02 03:04:05"},
		{tag: tagWhiteBalance, fieldType: typeShort, values: []uint32{1}},
		{tag: tagMeteringMode, fieldType: typeShort, values: []uint32{5}},
		{tag: tagFlash, fieldType: typeShort, values: []uint32{1}},
		{tag: 0xa431, fieldType: typeASCII, text: "ForbiddenBodySerial"},
		{tag: 0xc62f, fieldType: typeASCII, text: "ForbiddenCameraSerial"},
	}
	return builder.bytes()
}

type testEntry struct {
	tag       uint16
	fieldType uint16
	text      string
	values    []uint32
}

type exifBuilder struct {
	ifd0    []testEntry
	exifIFD []testEntry
}

func newExifBuilder() exifBuilder {
	return exifBuilder{}
}

func (builder exifBuilder) bytes() []byte {
	data := bytes.NewBuffer(nil)
	data.Write([]byte{'I', 'I'})
	_ = binary.Write(data, binary.LittleEndian, uint16(42))
	_ = binary.Write(data, binary.LittleEndian, uint32(8))

	ifd0Offset := uint32(data.Len())
	exifIFDOffset := ifd0Offset + uint32(serializedIFDLength(builder.ifd0))
	for index := range builder.ifd0 {
		if builder.ifd0[index].tag == tagExifIFDPointer {
			builder.ifd0[index].values = []uint32{exifIFDOffset}
		}
	}
	writeIFD(data, builder.ifd0)
	writeIFD(data, builder.exifIFD)
	return data.Bytes()
}

func serializedIFDLength(entries []testEntry) int {
	length := 2 + len(entries)*12 + 4
	for _, entry := range entries {
		value := entry.bytes()
		if len(value) > 4 {
			length += len(value)
		}
	}
	return length
}

func writeIFD(data *bytes.Buffer, entries []testEntry) {
	_ = binary.Write(data, binary.LittleEndian, uint16(len(entries)))
	valueData := bytes.NewBuffer(nil)
	valueOffset := uint32(data.Len() + len(entries)*12 + 4)
	for _, entry := range entries {
		value := entry.bytes()
		_ = binary.Write(data, binary.LittleEndian, entry.tag)
		_ = binary.Write(data, binary.LittleEndian, entry.fieldType)
		_ = binary.Write(data, binary.LittleEndian, entry.count())
		if len(value) <= 4 {
			data.Write(paddedValue(value))
		} else {
			_ = binary.Write(data, binary.LittleEndian, valueOffset+uint32(valueData.Len()))
			valueData.Write(value)
		}
	}
	_ = binary.Write(data, binary.LittleEndian, uint32(0))
	data.Write(valueData.Bytes())
}

func (entry testEntry) bytes() []byte {
	switch entry.fieldType {
	case typeASCII:
		return append([]byte(entry.text), 0)
	case typeShort:
		data := bytes.NewBuffer(nil)
		for _, value := range entry.values {
			_ = binary.Write(data, binary.LittleEndian, uint16(value))
		}
		return data.Bytes()
	case typeLong:
		data := bytes.NewBuffer(nil)
		for _, value := range entry.values {
			_ = binary.Write(data, binary.LittleEndian, value)
		}
		return data.Bytes()
	case typeRational:
		data := bytes.NewBuffer(nil)
		for _, value := range entry.values {
			_ = binary.Write(data, binary.LittleEndian, value)
		}
		return data.Bytes()
	default:
		return nil
	}
}

func (entry testEntry) count() uint32 {
	if entry.fieldType == typeASCII {
		return uint32(len(entry.text) + 1)
	}
	if entry.fieldType == typeRational {
		return uint32(len(entry.values) / 2)
	}
	return uint32(len(entry.values))
}

func paddedValue(value []byte) []byte {
	result := make([]byte, 4)
	copy(result, value)
	return result
}
