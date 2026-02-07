"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h2 className="text-xl font-semibold text-text-primary">
        Failed to load album
      </h2>
      <p className="text-text-secondary mb-6">
        There was a problem loading this album. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/albums"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
        >
          Browse albums
        </Link>
      </div>
    </div>
  );
}
