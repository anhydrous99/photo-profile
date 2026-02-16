"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/presentation/components";

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
    <ErrorBoundaryContent
      heading="Something went wrong"
      message="An error occurred in the admin panel. Please try again."
      backHref="/admin"
      backLabel="Dashboard"
      onReset={reset}
    />
  );
}
