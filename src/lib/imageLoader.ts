const AVAILABLE_WIDTHS = [300, 600, 1200, 2400];

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const bestWidth =
    AVAILABLE_WIDTHS.find((w) => w >= width) ??
    AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1];
  return `${src}/${bestWidth}w.webp`;
}
