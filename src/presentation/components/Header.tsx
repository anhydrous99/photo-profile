import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="group flex flex-col leading-none">
        <span className="text-lg font-bold uppercase tracking-wide text-text-primary">
          Armando
        </span>
        <span className="text-[0.65rem] font-light uppercase tracking-[0.25em] text-text-secondary group-hover:text-text-primary transition-colors">
          Herrera III
        </span>
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
