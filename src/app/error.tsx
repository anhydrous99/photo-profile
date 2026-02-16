"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/presentation/components";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <ErrorBoundaryContent
      heading="Something went wrong"
      message="An unexpected error occurred. Please try again."
      backHref="/"
      backLabel="Go home"
      onReset={reset}
    />
  );
}
