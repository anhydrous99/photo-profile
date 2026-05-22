Golden parity fixtures are generated at test runtime by `golden_test.go` to keep binary data out of the repository.

The harness covers the app-accepted upload MIME family from `src/lib/constants.ts`: JPEG, PNG, WebP, HEIC, and HEIF. HEIC/HEIF fixtures are intentionally generated and decoded through the local govips/libvips build so missing native support fails the capability tests instead of being skipped.
