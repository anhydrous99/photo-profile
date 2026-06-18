import { formatDuration } from "@/lib/formatDuration";

/**
 * Overlay shown on top of a video's poster thumbnail in grids: a centered play
 * icon plus an optional duration badge. Purely presentational and
 * non-interactive (clicks pass through to the underlying button).
 */

interface VideoOverlayProps {
  durationMs?: number | null;
}

export function VideoOverlay({ durationMs }: VideoOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={28}
          height={28}
          fill="white"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      {durationMs != null && durationMs > 0 && (
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(durationMs)}
        </span>
      )}
    </div>
  );
}
