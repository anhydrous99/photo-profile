import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="group flex flex-col leading-tight">
          <span className="text-base font-semibold uppercase tracking-[0.2em] text-text-primary">
            Armando
          </span>
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.35em] text-text-secondary transition-colors group-hover:text-text-primary">
            Herrera III
          </span>
        </Link>
        <nav>
          <Link
            href="/albums"
            className="text-xs font-medium uppercase tracking-[0.2em] text-text-secondary transition-colors hover:text-text-primary"
          >
            Albums
          </Link>
        </nav>
      </div>
    </header>
  );
}
