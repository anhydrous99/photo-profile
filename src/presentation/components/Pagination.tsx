"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1"
    >
      <button
        onClick={() => onChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
        className="rounded-lg border border-border px-2 py-2 text-sm text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft />
      </button>

      {pages.map((page, i) =>
        page === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            className="px-2 py-2 text-sm text-text-tertiary"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
            className={`min-w-[2.25rem] rounded-lg px-3 py-2 text-sm font-medium ${
              page === currentPage
                ? "bg-accent text-white"
                : "border border-border text-text-primary hover:bg-surface-hover"
            }`}
          >
            {page}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        className="rounded-lg border border-border px-2 py-2 text-sm text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronRight />
      </button>
    </nav>
  );
}

export type PageItem = number | "ellipsis";

export function getPageNumbers(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: PageItem[] = [];

  pages.push(1);

  if (current > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("ellipsis");
  }

  pages.push(total);

  return pages;
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
