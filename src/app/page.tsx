import type { Metadata } from "next";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { Header } from "@/presentation/components/Header";
import { HomepageClient } from "@/presentation/components/HomepageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "A photography portfolio",
  openGraph: {
    title: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
    description:
      process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "A photography portfolio",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default async function Home() {
  const photoRepository = new SQLitePhotoRepository();
  const photos = await photoRepository.findRandomFromPublishedAlbums(8);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {photos.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-text-secondary">No photos available yet.</p>
          </div>
        ) : (
          <HomepageClient
            photos={photos.map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              originalFilename: p.originalFilename,
              blurDataUrl: p.blurDataUrl,
              exifData: p.exifData,
              width: p.width,
              height: p.height,
            }))}
          />
        )}
      </main>
    </>
  );
}
