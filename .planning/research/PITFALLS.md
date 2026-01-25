# Pitfalls Research: Photography Portfolio

## Critical Pitfalls

### 1. Serving Original 50MP Images Directly

**The Mistake:** Displaying original high-resolution files in galleries or lightboxes.

**Why It Happens:** Seems simpler to just use the uploaded file.

**Consequences:**
- 20-50MB per image download
- Page loads take 30+ seconds
- Mobile users abandon immediately
- Bandwidth costs explode
- Browser memory crashes on galleries

**Warning Signs:**
- First gallery test loads slowly
- Lighthouse performance score < 50
- Mobile testing fails completely

**Prevention Strategy:**
- Generate multiple sizes on upload (300px, 600px, 1200px, 2400px)
- Generate WebP/AVIF formats for modern browsers
- Use `<picture>` with srcset for browser-optimal selection
- Store originals separately, never serve directly

**Phase:** Must be addressed in Phase 2 (Image Pipeline)

---

### 2. Synchronous Image Processing

**The Mistake:** Processing images during the upload HTTP request.

**Why It Happens:** Simpler to process inline rather than set up job queues.

**Consequences:**
- Upload requests timeout (50MP processing takes 5-30 seconds)
- Server blocks on single upload
- Multiple uploads crash the server
- Poor user experience (hanging uploads)

**Warning Signs:**
- Uploads timeout on large files
- Server becomes unresponsive during uploads
- Memory usage spikes during processing

**Prevention Strategy:**
- Accept upload immediately, store original
- Queue processing job (BullMQ, node-schedule, or simple file-based queue)
- Return upload success before processing completes
- Show "processing" status in admin UI
- Process in background worker

**Phase:** Must be addressed in Phase 2 (Image Pipeline)

---

### 3. Memory Exhaustion During Processing

**The Mistake:** Loading entire 50MP image into memory for processing.

**Why It Happens:** Using naive image libraries or buffer-based approaches.

**Consequences:**
- Node.js process crashes (heap out of memory)
- Server restarts, loses processing progress
- Cascading failures on batch uploads

**Warning Signs:**
- "JavaScript heap out of memory" errors
- Process killed by OS (OOM killer)
- Works locally, fails on smaller server

**Prevention Strategy:**
- Use Sharp (libvips-based, streams images)
- Set explicit memory limits in Sharp options
- Process one image at a time in queue
- Monitor memory during development with realistic file sizes

**Phase:** Must be addressed in Phase 2 (Image Pipeline)

---

### 4. Missing EXIF Rotation Handling

**The Mistake:** Ignoring EXIF orientation flag when generating thumbnails.

**Why It Happens:** Many cameras store rotation in metadata, not pixels.

**Consequences:**
- Photos appear rotated 90° or upside down
- Inconsistent display across devices
- Users think upload is broken

**Warning Signs:**
- Portrait photos display as landscape
- Same photo looks different on phone vs desktop
- Rotation works in some browsers, not others

**Prevention Strategy:**
- Use Sharp with `rotate()` (auto-rotates based on EXIF)
- Strip EXIF orientation after applying rotation
- Test with photos from multiple camera brands

**Phase:** Must be addressed in Phase 2 (Image Pipeline)

---

## Moderate Pitfalls

### 5. No Image Format Optimization

**The Mistake:** Only generating JPEG thumbnails.

**Why It Happens:** JPEG is familiar, works everywhere.

**Consequences:**
- 30-50% larger file sizes than necessary
- Slower load times
- Higher bandwidth costs

**Prevention Strategy:**
- Generate WebP (30% smaller, 95%+ browser support)
- Generate AVIF (50% smaller, 90%+ browser support)
- Use `<picture>` element with fallbacks
- Serve best format browser supports

**Phase:** Phase 2 (Image Pipeline)

---

### 6. Blocking UI During Uploads

**The Mistake:** UI freezes or provides no feedback during upload.

**Why It Happens:** Not implementing progress tracking or optimistic updates.

**Consequences:**
- User thinks upload failed, retries
- Duplicate uploads
- Poor admin experience

**Prevention Strategy:**
- Show upload progress bar
- Display "queued" → "processing" → "ready" states
- Allow continued browsing during uploads

**Phase:** Phase 4 (Admin Panel)

---

### 7. No Backup Strategy for Originals

**The Mistake:** Only storing images in one location.

**Why It Happens:** Backup seems like a "later" problem.

**Consequences:**
- Disk failure = permanent photo loss
- Originals are irreplaceable
- Photographers deeply value their RAW/original files

**Prevention Strategy:**
- Store originals in separate location from processed versions
- Document backup procedure in deployment
- Consider automated backup to external storage

**Phase:** Phase 5 (Deployment/Polish)

---

### 8. Hardcoded Image Dimensions

**The Mistake:** Fixed pixel dimensions that don't adapt to viewport.

**Why It Happens:** Easier to generate one size than multiple.

**Consequences:**
- Blurry images on high-DPI displays
- Oversized images on mobile (wasted bandwidth)
- Poor responsive behavior

**Prevention Strategy:**
- Generate multiple sizes (srcset breakpoints)
- Use CSS for container sizing, let browser choose image
- Test on multiple viewport sizes

**Phase:** Phase 2-3 (Pipeline and Gallery)

---

### 9. EXIF Privacy Exposure

**The Mistake:** Displaying all EXIF data including GPS coordinates.

**Why It Happens:** Auto-extracting and displaying without filtering.

**Consequences:**
- Location privacy breach
- Serial numbers exposed
- Personal information leak

**Prevention Strategy:**
- Whitelist displayed EXIF fields (camera, ISO, aperture, shutter, focal length)
- Explicitly exclude: GPS, serial numbers, software versions
- Strip sensitive EXIF from served images

**Phase:** Phase 2 (EXIF extraction) and Phase 3 (display)

---

### 10. Poor Lightbox Accessibility

**The Mistake:** Lightbox without keyboard navigation or escape to close.

**Why It Happens:** Focus on visual design, not interaction patterns.

**Consequences:**
- Keyboard users trapped
- Screen reader users confused
- Poor user experience

**Prevention Strategy:**
- Escape key closes lightbox
- Arrow keys navigate prev/next
- Focus trap within modal
- Proper ARIA labels

**Phase:** Phase 3 (Gallery UI)

---

## Clean Code Specific Pitfalls

### 11. Image Processing Logic in Route Handlers

**The Mistake:** Mixing HTTP handling with image processing business logic.

**Why It Happens:** Quick to implement inline.

**Consequences:**
- Untestable code
- Violates Single Responsibility
- Hard to change processing without touching routes

**Prevention Strategy:**
- Separate layers: Routes → Services → Processing
- Routes only handle HTTP concerns
- Services contain business logic
- Processing is pure functions

**Phase:** Phase 1 (Foundation architecture)

---

### 12. Database Queries in Components

**The Mistake:** Calling database directly from UI components.

**Why It Happens:** Convenient in full-stack frameworks.

**Consequences:**
- Tight coupling
- Hard to test UI
- Business logic scattered

**Prevention Strategy:**
- Repository pattern for data access
- Components receive data via props/server actions
- Clear boundaries between layers

**Phase:** Phase 1 (Foundation architecture)

---

## Pitfall Prevention Checklist

| Pitfall | Detection Method | Phase to Address |
|---------|------------------|------------------|
| Serving originals | Lighthouse, network tab | Phase 2 |
| Sync processing | Upload timeout test | Phase 2 |
| Memory exhaustion | Test with real 50MP files | Phase 2 |
| EXIF rotation | Test portrait photos | Phase 2 |
| No format optimization | Compare WebP vs JPEG sizes | Phase 2 |
| Blocking upload UI | Manual testing | Phase 4 |
| No backup strategy | Deployment docs review | Phase 5 |
| Hardcoded dimensions | Responsive testing | Phase 3 |
| EXIF privacy | Review displayed fields | Phase 3 |
| Poor accessibility | Keyboard-only testing | Phase 3 |
| Logic in handlers | Code review | Phase 1 |
| DB in components | Code review | Phase 1 |

---

*Research completed: 2026-01-25*
*Confidence: HIGH — based on common issues in image-heavy web applications*
