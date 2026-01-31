export interface Album {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  coverPhotoId: string | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: Date;
}
