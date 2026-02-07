import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <span className="mb-2 text-6xl font-bold text-text-tertiary">404</span>
      <h2 className="text-xl font-semibold text-text-primary">
        Page not found
      </h2>
      <p className="text-text-secondary mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Back to gallery
      </Link>
    </div>
  );
}
