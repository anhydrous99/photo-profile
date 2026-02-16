import { DynamoDBPhotoRepository } from "./DynamoDBPhotoRepository";
import { DynamoDBAlbumRepository } from "./DynamoDBAlbumRepository";

export { DynamoDBPhotoRepository } from "./DynamoDBPhotoRepository";
export { DynamoDBAlbumRepository } from "./DynamoDBAlbumRepository";

// Memoized singleton instances
let _photoRepo: DynamoDBPhotoRepository | null = null;
let _albumRepo: DynamoDBAlbumRepository | null = null;

/**
 * Get the singleton PhotoRepository instance.
 * Returns the same instance across all calls (memoized).
 */
export function getPhotoRepository(): DynamoDBPhotoRepository {
  if (!_photoRepo) {
    _photoRepo = new DynamoDBPhotoRepository();
  }
  return _photoRepo;
}

/**
 * Get the singleton AlbumRepository instance.
 * Returns the same instance across all calls (memoized).
 * Automatically injects the PhotoRepository dependency.
 */
export function getAlbumRepository(): DynamoDBAlbumRepository {
  if (!_albumRepo) {
    _albumRepo = new DynamoDBAlbumRepository(getPhotoRepository());
  }
  return _albumRepo;
}
