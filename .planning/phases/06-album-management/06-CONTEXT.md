# Phase 6: Album Management - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin interface for creating, renaming, and deleting photo albums. This phase delivers CRUD operations for albums as organizational containers. Photos already exist (Phase 5), and public gallery viewing comes later (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Album creation

- Name + description fields captured during creation
- Description is optional, name is required
- Claude's discretion: UI pattern (inline, modal, or page), name validation rules, post-creation navigation

### Album organization

- Manual drag-drop ordering for albums
- Drag-drop order applies to both admin and public views (same order everywhere)
- Albums stay flat (no nesting) but support custom category tags
- Tags are free-form text input (admin creates any tags they want)

### Deletion behavior

- User chooses on deletion: "Delete album only" or "Delete album and all photos"
- Confirmation modal with choice between two deletion modes
- Claude's discretion: restrictions on deletion (warnings, blocks), recovery mechanism (trash, undo, or hard delete)

### Album list display

- Admin can select which photo serves as album cover (not automatic)
- No search or filter capabilities (keep simple)
- Claude's discretion: layout pattern (grid/table/list), information density (what metadata to show)

### Claude's Discretion

- Album creation UI pattern (inline, modal, or separate page)
- Name uniqueness validation and constraints
- Post-creation navigation flow
- Deletion safeguards (warnings, blocks, restrictions)
- Recovery mechanism (trash, undo, or permanent)
- Album list layout (grid, table, or compact list)
- Information density (cover image, photo count, dates, tags shown)

</decisions>

<specifics>
## Specific Ideas

- Drag-drop ordering is important — admin control over sequence matters for public presentation
- Deletion should offer clear choice between removing just the organizational container vs. removing the content too
- Cover photo selection gives admin control over how albums are visually represented

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 06-album-management_
_Context gathered: 2026-01-31_
