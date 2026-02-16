/**
 * Format date as "Jan 5" (month + day only, no year)
 */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Format date as "Jan 5, 2025, 3:42 PM" (full timestamp)
 */
export function formatDateFull(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Format EXIF date string as "Jan 5, 2025" (string input, date with year)
 */
export function formatExifDate(dateTaken: string): string {
  return new Date(dateTaken).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
