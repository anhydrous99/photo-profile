"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h2 className="text-xl font-semibold text-text-primary">
        Something went wrong
      </h2>
      <p className="text-text-secondary mb-6">
        An error occurred in the admin panel. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
