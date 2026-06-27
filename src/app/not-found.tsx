import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="mb-2 text-6xl font-medium tracking-tight text-text-tertiary">
        404
      </span>
      <h2 className="text-2xl font-medium tracking-tight text-text-primary">
        Page not found
      </h2>
      <p className="mt-3 mb-8 text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="bg-button-primary-bg px-5 py-2.5 text-sm font-medium text-button-primary-text transition-opacity hover:opacity-90"
      >
        Back to gallery
      </Link>
    </div>
  );
}
