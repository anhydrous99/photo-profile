export function HomepagePhotosSkeleton() {
  return (
    <>
      {/* Hero placeholder */}
      <section className="mb-8">
        <div className="aspect-[3/2] w-full animate-pulse rounded bg-surface-secondary" />
      </section>

      {/* Grid placeholders */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded bg-surface-secondary"
          />
        ))}
      </section>
    </>
  );
}
