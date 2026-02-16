"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/presentation/components";

export default function AlbumError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Album error:", error);
  }, [error]);

  return (
    <ErrorBoundaryContent
      heading="Failed to load album"
      message="There was a problem loading this album. Please try again."
      backHref="/albums"
      backLabel="Browse albums"
      onReset={reset}
    />
  );
}
