"use client";

import { useEffect, useRef } from "react";
import type HlsType from "hls.js";

interface VideoPlayerProps {
  /** HLS master playlist URL. */
  src: string;
  /** Poster image shown before playback. */
  poster?: string;
  /** Autoplay (muted) on mount. */
  autoPlay?: boolean;
  className?: string;
}

/**
 * HLS video player.
 *
 * Safari plays HLS natively via the <video> src. Other browsers use hls.js,
 * which is dynamically imported so the ~100KB library only loads when a video
 * is actually played (keeping it out of the main bundle).
 */
export function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Native HLS support (Safari / iOS).
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    let hls: HlsType | null = null;
    let cancelled = false;

    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: true });
          hls.loadSource(src);
          hls.attachMedia(video);
        } else {
          // Last resort: let the browser try the manifest directly.
          video.src = src;
        }
      })
      .catch(() => {
        if (!cancelled) video.src = src;
      });

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      playsInline
      autoPlay={autoPlay}
      muted={autoPlay}
      controlsList="nodownload"
      onContextMenu={(e) => e.preventDefault()}
      className={className}
      style={{
        maxHeight: "100%",
        maxWidth: "100%",
        margin: "auto",
        objectFit: "contain",
      }}
    />
  );
}
