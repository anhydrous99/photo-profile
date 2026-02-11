"use client";

interface PaginationProps {
  nextCursor: string | null;
  onNext: () => void;
  onPrevious: () => void;
  hasPrevious: boolean;
}

export function Pagination({
  nextCursor,
  onNext,
  onPrevious,
  hasPrevious,
}: PaginationProps) {
  if (!hasPrevious && !nextCursor) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-2"
    >
      <button
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous page"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft />
        Previous
      </button>

      <button
        onClick={onNext}
        disabled={!nextCursor}
        aria-label="Next page"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
        <ChevronRight />
      </button>
    </nav>
  );
}

function ChevronLeft() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
