import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { getImageUrl } from "@/infrastructure/storage";
import { Header } from "@/presentation/components/Header";
import { HomepageClient } from "@/presentation/components/HomepageClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const photoRepo = new SQLitePhotoRepository();
  const photo = await photoRepo.findBySlugPrefix(slug);

  if (!photo) {
    return { title: "Photo Not Found" };
  }

  // Build description from EXIF data if available
  let description = photo.description || "A photo";
  if (photo.exifData) {
    const exifParts: string[] = [];
    if (photo.exifData.cameraModel) exifParts.push(photo.exifData.cameraModel);
    if (photo.exifData.focalLength)
      exifParts.push(`${photo.exifData.focalLength}mm`);
    if (photo.exifData.aperture) exifParts.push(`f/${photo.exifData.aperture}`);
    if (photo.exifData.shutterSpeed)
      exifParts.push(photo.exifData.shutterSpeed);
    if (photo.exifData.iso) exifParts.push(`ISO ${photo.exifData.iso}`);
    if (exifParts.length > 0) {
      description = photo.description
        ? `${photo.description} — ${exifParts.join(" | ")}`
        : exifParts.join(" | ");
    }
  }

  const ogImageUrl = getImageUrl(photo.id, "1200w.webp");

  return {
    title: photo.title || "Photo",
    description,
    openGraph: {
      title: photo.title || "Photo",
      description,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, type: "image/webp" }],
    },
    twitter: {
      card: "summary_large_image",
      title: photo.title || "Photo",
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PhotoDeepLinkPage({ params }: PageProps) {
  const { slug } = await params;

  const photoRepo = new SQLitePhotoRepository();
  const photo = await photoRepo.findBySlugPrefix(slug);

  if (!photo) {
    notFound();
  }

  // Fetch homepage random photos
  const randomPhotos = await photoRepo.findRandomFromPublishedAlbums(8);

  // Ensure the deep-linked photo is in the set
  const isInSet = randomPhotos.some((p) => p.id === photo.id);
  let photos = randomPhotos;
  if (!isInSet) {
    // Replace last photo with the deep-linked photo so lightbox can open to it
    photos = [...randomPhotos.slice(0, randomPhotos.length - 1), photo];
  }

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
            initialPhotoSlug={slug}
          />
        )}
      </main>
    </>
  );
}
