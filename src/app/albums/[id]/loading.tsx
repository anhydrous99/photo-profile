export default function AlbumLoading() {
  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-surface-secondary" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[3/4] animate-pulse rounded-lg bg-surface-secondary"
          />
        ))}
      </div>
    </div>
  );
}
