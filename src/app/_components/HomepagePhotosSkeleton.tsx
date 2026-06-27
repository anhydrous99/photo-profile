// Rows of varied ratios approximate the justified gallery layout.
const SKELETON_ROWS = [
  [3, 2, 4],
  [4, 3, 3],
];

export function HomepagePhotosSkeleton() {
  return (
    <>
      {/* Hero placeholder */}
      <section className="mb-10 md:mb-16">
        <div className="aspect-[3/2] max-h-[80vh] w-full animate-pulse bg-surface-secondary" />
      </section>

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
    </>
  );
}
