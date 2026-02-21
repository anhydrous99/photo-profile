export function AlbumPhotosSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb placeholder */}
      <div className="mb-4 flex items-center gap-2">
        <div className="h-4 w-10 animate-pulse rounded bg-surface-secondary" />
        <div className="h-4 w-2 text-text-tertiary">/</div>
        <div className="h-4 w-14 animate-pulse rounded bg-surface-secondary" />
        <div className="h-4 w-2 text-text-tertiary">/</div>
        <div className="h-4 w-28 animate-pulse rounded bg-surface-secondary" />
      </div>

      {/* Title placeholder */}
      <div className="h-9 w-48 animate-pulse rounded bg-surface-secondary" />

      {/* Spacer matching mb-8 */}
      <div className="mb-8" />

      {/* Grid placeholders */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-lg bg-surface-secondary"
          />
        ))}
      </div>
    </main>
  );
}
