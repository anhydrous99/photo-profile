export interface Photo {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  status: 'processing' | 'ready' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
