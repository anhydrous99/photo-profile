import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="text-lg font-semibold text-gray-900">
        Portfolio
      </Link>
      <nav>
        <Link href="/albums" className="text-gray-600 hover:text-gray-900">
          Albums
        </Link>
      </nav>
    </header>
  );
}
