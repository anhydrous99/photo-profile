import { Suspense } from "react";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
import { SocialFooter } from "@/presentation/components/SocialFooter";
import { AlbumList } from "./_components/AlbumList";
import { AlbumListSkeleton } from "./_components/AlbumListSkeleton";

export const revalidate = 300;

export default function AlbumsPage() {
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumb
          items={[{ label: "Home", href: "/" }, { label: "Albums" }]}
        />
        <h1 className="mb-8 text-2xl font-semibold text-text-primary">
          Albums
        </h1>

        <Suspense fallback={<AlbumListSkeleton />}>
          <AlbumList />
        </Suspense>
      </main>
      <SocialFooter />
    </>
  );
}
