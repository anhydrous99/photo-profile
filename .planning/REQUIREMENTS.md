# Requirements: Photo Portfolio

**Defined:** 2026-02-05
**Core Value:** Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus, not the interface.

## v1.1 Requirements

Requirements for the v1.1 Enhancement milestone. Each maps to roadmap phases.

### EXIF Metadata

- [x] **EXIF-01**: EXIF data (camera, lens, focal length, aperture, shutter speed, ISO, date taken) is auto-extracted during upload processing
- [x] **EXIF-02**: EXIF data is displayed in the lightbox view
- [x] **EXIF-03**: GPS coordinates and camera serial number are excluded from extraction for privacy
- [x] **EXIF-04**: Existing photos have EXIF data backfilled from originals

### Lightbox Polish

- [x] **LBOX-01**: Lightbox serves responsive images via srcSet matching viewer's screen size
- [x] **LBOX-02**: Swipe down to close lightbox on mobile
- [x] **LBOX-03**: Pinch-to-zoom and double-tap-to-zoom on photos
- [x] **LBOX-04**: Full-screen button in lightbox toolbar (user-initiated, not auto)

### Album Management

- [x] **ALBM-01**: Admin can select a cover photo for an album from the album's photos
- [x] **ALBM-02**: Current cover photo is visually indicated in admin
- [x] **ALBM-03**: Admin can drag to reorder photos within an album
- [x] **ALBM-04**: Photo order in admin is reflected on public album page

### Sharing

- [ ] **SHAR-01**: Opening a photo in the lightbox updates the URL with the photo identifier
- [ ] **SHAR-02**: Navigating to a photo URL opens the lightbox on that specific photo
- [ ] **SHAR-03**: Albums have OpenGraph meta tags (title, description, cover photo image)
- [ ] **SHAR-04**: Homepage has OpenGraph meta tags with site name and description

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Visual Polish

- **VPOL-01**: Branded OpenGraph image generation (photo on template card)
- **VPOL-02**: Slideshow auto-play mode
- **VPOL-03**: Custom animation easing profiles

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                | Reason                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| GPS coordinate display                 | Privacy: reveals shooting locations                                 |
| Camera serial number display           | Privacy: identifies specific device                                 |
| Auto-enter fullscreen on lightbox open | Surprising and intrusive UX                                         |
| Standalone /photos/[id] page           | Photos belong in album context; query param deep linking sufficient |
| Custom gesture handling library        | YARL handles gestures; custom code is fragile on mobile             |
| Dynamic OG image generation            | The actual photo is a better OG image than a generated card         |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status   |
| ----------- | ----- | -------- |
| EXIF-01     | 11    | Complete |
| EXIF-02     | 11    | Complete |
| EXIF-03     | 11    | Complete |
| EXIF-04     | 11    | Complete |
| LBOX-01     | 12    | Complete |
| LBOX-02     | 12    | Complete |
| LBOX-03     | 12    | Complete |
| LBOX-04     | 12    | Complete |
| ALBM-01     | 13    | Complete |
| ALBM-02     | 13    | Complete |
| ALBM-03     | 13    | Complete |
| ALBM-04     | 13    | Complete |
| SHAR-01     | 14    | Pending  |
| SHAR-02     | 14    | Pending  |
| SHAR-03     | 14    | Pending  |
| SHAR-04     | 14    | Pending  |

**Coverage:**

- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---

_Requirements defined: 2026-02-05_
_Last updated: 2026-02-06 after Phase 13 completion_
