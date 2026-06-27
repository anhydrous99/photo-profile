import { Suspense } from "react";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
import { SocialFooter } from "@/presentation/components/SocialFooter";
import { AlbumList } from "./_components/AlbumList";
import { AlbumListSkeleton } from "./_components/AlbumListSkeleton";

export const revalidate = 300;

export default function AlbumsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 md:py-16 lg:px-8">
        <Breadcrumb
          items={[{ label: "Home", href: "/" }, { label: "Albums" }]}
        />
        <header className="mb-8 md:mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-text-primary md:text-5xl">
            Albums
          </h1>
        </header>

        <Suspense fallback={<AlbumListSkeleton />}>
          <AlbumList />
        </Suspense>
      </main>
      <SocialFooter />
    </>
  );
}
