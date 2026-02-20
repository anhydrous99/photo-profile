import { THUMBNAIL_SIZES } from "@/lib/constants";

const cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;

function selectBestWidth(width: number, maxWidth?: number): number {
  const availableWidths =
    maxWidth !== undefined
      ? THUMBNAIL_SIZES.filter((w) => w <= maxWidth)
      : THUMBNAIL_SIZES;

  if (availableWidths.length === 0) {
    return THUMBNAIL_SIZES[0];
  }

  return (
    availableWidths.find((w) => w >= width) ??
    availableWidths[availableWidths.length - 1]
  );
}

function extractPhotoId(src: string): string {
  const cleanSrc = src.split("?")[0];
  const parts = cleanSrc.split("/");
  return parts[parts.length - 1];
}

export function getClientImageUrl(photoId: string, filename: string): string {
  if (cloudfrontDomain) {
    return `https://${cloudfrontDomain}/processed/${photoId}/${filename}`;
  }
  return `/api/images/${photoId}/${filename}`;
}

export function buildSrcSet(
  photoId: string,
  format: "webp" | "avif",
  maxWidth?: number,
): string {
  let widths: number[] = maxWidth
    ? THUMBNAIL_SIZES.filter((w) => w <= maxWidth)
    : [...THUMBNAIL_SIZES];
  if (widths.length === 0) widths = [THUMBNAIL_SIZES[0]];

  return widths
    .map((w) => `${getClientImageUrl(photoId, `${w}w.${format}`)} ${w}w`)
    .join(", ");
}

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const cleanSrc = src.split("?")[0];
  const queryParams = new URLSearchParams(src.split("?")[1] || "");
  const maxWidthParam = queryParams.get("maxWidth");
  const maxWidth =
    maxWidthParam && !Number.isNaN(parseInt(maxWidthParam, 10))
      ? parseInt(maxWidthParam, 10)
      : undefined;

  const bestWidth = selectBestWidth(width, maxWidth);
  const derivative = `${bestWidth}w.webp`;

  if (cloudfrontDomain) {
    const photoId = extractPhotoId(src);
    return `https://${cloudfrontDomain}/processed/${photoId}/${derivative}`;
  }

  return `${cleanSrc}/${derivative}`;
}
