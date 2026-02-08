/**
 * StorageAdapter interface for abstracting file storage operations.
 *
 * Implementations can use filesystem, S3, or other storage backends.
 * All methods are async to support both local and remote storage.
 */
export interface StorageAdapter {
  /**
   * Save a file to storage.
   *
   * @param key - Unique identifier for the file (e.g., "originals/photo-id/original.jpg")
   * @param data - File contents as Buffer
   * @param contentType - MIME type (e.g., "image/jpeg")
   * @returns Promise that resolves when file is saved
   */
  saveFile(key: string, data: Buffer, contentType: string): Promise<void>;

  /**
   * Retrieve a file from storage.
   *
   * @param key - Unique identifier for the file
   * @returns Promise resolving to file contents as Buffer
   * @throws Error if file not found
   */
  getFile(key: string): Promise<Buffer>;

  /**
   * Retrieve a file as a readable stream.
   *
   * Useful for large files to avoid loading entire file into memory.
   *
   * @param key - Unique identifier for the file
   * @returns Promise resolving to ReadableStream
   * @throws Error if file not found
   */
  getFileStream(key: string): Promise<ReadableStream>;

  /**
   * Delete all files with a given prefix.
   *
   * Used for cascade deletion (e.g., delete all derivatives when photo is removed).
   *
   * @param prefix - Path prefix to match (e.g., "processed/photo-id/")
   * @returns Promise that resolves when all matching files are deleted
   */
  deleteFiles(prefix: string): Promise<void>;

  /**
   * Check if a file exists in storage.
   *
   * @param key - Unique identifier for the file
   * @returns Promise resolving to true if file exists, false otherwise
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * List all files with a given prefix.
   *
   * Used for finding originals or fallback derivatives.
   *
   * @param prefix - Path prefix to match (e.g., "originals/photo-id/")
   * @returns Promise resolving to array of file keys matching the prefix
   */
  listFiles(prefix: string): Promise<string[]>;
}
