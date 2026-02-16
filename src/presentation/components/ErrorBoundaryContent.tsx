"use client";

export function ErrorBoundaryContent({
  heading,
  message,
  backHref,
  backLabel,
  onReset,
}: {
  heading: string;
  message: string;
  backHref: string;
  backLabel: string;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h2 className="text-xl font-semibold text-text-primary">{heading}</h2>
      <p className="text-text-secondary mb-6">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
        <a
          href={backHref}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
        >
          {backLabel}
        </a>
      </div>
    </div>
  );
}
