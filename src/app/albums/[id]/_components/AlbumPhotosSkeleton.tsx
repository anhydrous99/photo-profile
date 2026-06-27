// Rows of varied ratios approximate the justified gallery layout.
const SKELETON_ROWS = [
  [4, 3, 2],
  [2, 4, 3],
  [3, 3, 4],
];

export function AlbumPhotosSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 md:py-16 lg:px-8">
      {/* Breadcrumb placeholder */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-4 w-10 animate-pulse bg-surface-secondary" />
        <span className="text-text-tertiary">/</span>
        <div className="h-4 w-14 animate-pulse bg-surface-secondary" />
        <span className="text-text-tertiary">/</span>
        <div className="h-4 w-28 animate-pulse bg-surface-secondary" />
      </div>

      {/* Title placeholder */}
      <div className="mb-8 md:mb-12">
        <div className="h-9 w-64 max-w-full animate-pulse bg-surface-secondary md:h-12" />
        <div className="mt-4 h-3 w-28 animate-pulse bg-surface-secondary" />
      </div>

      {/* Justified rows placeholder */}
      <div className="space-y-3">
        {SKELETON_ROWS.map((row, i) => (
          <div key={i} className="flex gap-3">
            {row.map((ratio, j) => (
              <div
                key={j}
                className="h-40 animate-pulse bg-surface-secondary sm:h-56 md:h-72"
                style={{ flexGrow: ratio, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
