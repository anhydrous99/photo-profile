export function AlbumListSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[4/5] w-full animate-pulse bg-surface-secondary" />
          <div className="mt-3 h-3 w-24 animate-pulse bg-surface-secondary" />
        </div>
      ))}
    </div>
  );
}
