const AVAILABLE_WIDTHS = [300, 600, 1200, 2400];

const cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;

function selectBestWidth(width: number): number {
  return (
    AVAILABLE_WIDTHS.find((w) => w >= width) ??
    AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1]
  );
}

function extractPhotoId(src: string): string {
  const parts = src.split("/");
  return parts[parts.length - 1];
}

export function getClientImageUrl(photoId: string, filename: string): string {
  if (cloudfrontDomain) {
    return `https://${cloudfrontDomain}/processed/${photoId}/${filename}`;
  }
  return `/api/images/${photoId}/${filename}`;
}

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const bestWidth = selectBestWidth(width);
  const derivative = `${bestWidth}w.webp`;

  if (cloudfrontDomain) {
    const photoId = extractPhotoId(src);
    return `https://${cloudfrontDomain}/processed/${photoId}/${derivative}`;
  }

  return `${src}/${derivative}`;
}
