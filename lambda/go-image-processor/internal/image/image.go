package image

import "fmt"

var derivativeWidths = []int{300, 600, 1200, 2400}

func DerivativeWidths() []int {
	widths := make([]int, len(derivativeWidths))
	copy(widths, derivativeWidths)
	return widths
}

func ProcessedKey(photoID string, width int, format string) string {
	return fmt.Sprintf("processed/%s/%dw.%s", photoID, width, format)
}
