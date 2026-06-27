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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-medium tracking-tight text-text-primary">
        {heading}
      </h2>
      <p className="mt-3 mb-8 text-text-secondary">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="bg-button-primary-bg px-5 py-2.5 text-sm font-medium text-button-primary-text transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <a
          href={backHref}
          className="border border-border-strong px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          {backLabel}
        </a>
      </div>
    </div>
  );
}
