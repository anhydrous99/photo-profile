export function AlbumListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg p-2">
          <div className="h-20 w-20 flex-shrink-0 animate-pulse rounded-lg bg-surface-secondary" />
          <div className="h-5 w-40 animate-pulse rounded bg-surface-secondary" />
        </div>
      ))}
    </div>
  );
}
