# Roadmap: Photo Portfolio

## Milestones

- v1.0 MVP - Phases 1-10 (shipped 2026-02-05)
- v1.1 Enhancement - Phases 11-14 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-10) - SHIPPED 2026-02-05</summary>

29 plans across 10 phases. All complete. See git history for details.

</details>

### v1.1 Enhancement (In Progress)

**Milestone Goal:** Enrich the viewing experience with EXIF metadata, polished lightbox interactions, better album management, and shareability.

**Phase Numbering:**

- Integer phases (11, 12, 13, 14): Planned milestone work
- Decimal phases (12.1, 12.2): Urgent insertions if needed (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 11: EXIF Metadata Pipeline** - Extract, store, display, and backfill camera metadata from photos
- [ ] **Phase 12: Lightbox Polish** - Responsive images, touch gestures, zoom, and fullscreen in the lightbox
- [ ] **Phase 13: Album Management** - Cover photo selection and drag-to-reorder photos within albums
- [ ] **Phase 14: Shareability** - Direct photo links and OpenGraph meta tags for social sharing

## Phase Details

### Phase 11: EXIF Metadata Pipeline

**Goal**: Visitors see camera and shooting details for every photo without the admin doing any manual data entry
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: EXIF-01, EXIF-02, EXIF-03, EXIF-04
**Success Criteria** (what must be TRUE):

1. Uploading a new photo automatically extracts and stores camera, lens, focal length, aperture, shutter speed, ISO, and date taken
2. GPS coordinates and camera serial numbers are never stored or displayed, even when present in the original file
3. Opening a photo in the lightbox shows its EXIF metadata (camera, lens, settings) in a non-intrusive display
4. Running the backfill process populates EXIF data for all previously uploaded photos that have originals on disk
   **Plans**: TBD

Plans:

- [ ] 11-01: TBD
- [ ] 11-02: TBD
- [ ] 11-03: TBD

### Phase 12: Lightbox Polish

**Goal**: The lightbox feels native and responsive across devices -- right image size, fluid gestures, immersive viewing
**Depends on**: Phase 11 (EXIF data displayed in lightbox)
**Requirements**: LBOX-01, LBOX-02, LBOX-03, LBOX-04
**Success Criteria** (what must be TRUE):

1. Lightbox loads the image derivative closest to the viewer's screen width instead of always loading the largest size
2. On mobile, swiping down on a photo closes the lightbox
3. On mobile, pinch-to-zoom and double-tap-to-zoom magnify the current photo
4. A fullscreen button appears in the lightbox toolbar and entering fullscreen hides browser chrome (gracefully absent on unsupported browsers like iPhone Safari)
   **Plans**: TBD

Plans:

- [ ] 12-01: TBD

### Phase 13: Album Management

**Goal**: The admin has full control over how an album presents itself -- which photo represents it and what order photos appear in
**Depends on**: Nothing (independent of Phases 11-12; can run in parallel with Phase 12)
**Requirements**: ALBM-01, ALBM-02, ALBM-03, ALBM-04
**Infrastructure fixes included**:

- Fix `coverPhotoId` FK constraint (schema says SET NULL, DB has NO ACTION)
- Fix `findByAlbumId()` to ORDER BY `photo_albums.sortOrder`
  **Success Criteria** (what must be TRUE):

1. Admin can click a photo in the album detail view to set it as the album's cover, and the album listing page shows that cover photo
2. The current cover photo is visually distinguished from other photos in the admin album detail view
3. Admin can drag photos into a custom order within the album detail view and the new order persists after page reload
4. The public album page displays photos in the same order the admin arranged them
5. Deleting a photo that is an album's cover sets the cover to null instead of failing or leaving a dangling reference
   **Plans**: TBD

Plans:

- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: Shareability

**Goal**: Visitors can link directly to a specific photo and shared links look good when previewed on social media
**Depends on**: Phase 11 (EXIF data enriches OG tags), Phase 13 (album covers used in OG images, photo ordering for navigation context)
**Requirements**: SHAR-01, SHAR-02, SHAR-03, SHAR-04
**Success Criteria** (what must be TRUE):

1. Opening a photo in the lightbox updates the browser URL to include that photo's identifier without adding excessive history entries
2. Navigating to a URL with a photo identifier opens the page with the lightbox already showing that specific photo
3. Sharing an album URL on social media shows a preview card with the album's title, description, and cover photo image
4. Sharing the homepage URL on social media shows a preview card with the site name and description
   **Plans**: TBD

Plans:

- [ ] 14-01: TBD
- [ ] 14-02: TBD

## Progress

**Execution Order:**
Phases 12 and 13 are independent and could execute in parallel. Phase 14 depends on both.
11 -> 12 (and/or 13) -> 14

| Phase                      | Milestone | Plans Complete | Status      | Completed |
| -------------------------- | --------- | -------------- | ----------- | --------- |
| 11. EXIF Metadata Pipeline | v1.1      | 0/3            | Not started | -         |
| 12. Lightbox Polish        | v1.1      | 0/1            | Not started | -         |
| 13. Album Management       | v1.1      | 0/2            | Not started | -         |
| 14. Shareability           | v1.1      | 0/2            | Not started | -         |
