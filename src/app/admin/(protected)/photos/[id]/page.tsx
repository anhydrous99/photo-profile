import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DynamoDBPhotoRepository,
  DynamoDBAlbumRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { PhotoDetail, AlbumSelector } from "@/presentation/components";

const photoRepository = new DynamoDBPhotoRepository();
const albumRepository = new DynamoDBAlbumRepository(photoRepository);

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Photo Detail Page
 *
 * Shows photo details with:
 * - Photo metadata and editable description
 * - Album assignment checkboxes
 * - Delete functionality
 */
export default async function PhotoDetailPage({ params }: PageProps) {
  const { id: photoId } = await params;

  // Fetch photo by ID
  const photo = await photoRepository.findById(photoId);
  if (!photo) {
    notFound();
  }

  // Fetch all albums and photo's album memberships
  const [albums, photoAlbumIds] = await Promise.all([
    albumRepository.findAll(),
    photoRepository.getAlbumIds(photoId),
  ]);

  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Dashboard
      </Link>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Photo detail - takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-surface p-6">
            <PhotoDetail
              photo={photo}
              albums={albums}
              photoAlbumIds={photoAlbumIds}
            />
          </div>
        </div>

        {/* Album selector - right sidebar on large screens */}
        <div className="lg:col-span-1">
          <AlbumSelector
            photoId={photoId}
            albums={albums}
            selectedAlbumIds={photoAlbumIds}
          />
        </div>
      </div>
    </div>
  );
}
