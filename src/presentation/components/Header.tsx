import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="text-lg font-semibold text-text-primary">
        Portfolio
      </Link>
      <nav>
        <Link
          href="/albums"
          className="text-text-secondary hover:text-text-primary"
        >
          Albums
        </Link>
      </nav>
    </header>
  );
}
