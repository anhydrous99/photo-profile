# Phase 3: Admin Auth - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Protect admin features with password authentication. Single admin user with credential-based login. Session management and route protection to control access to /admin/\* paths. Multi-user support or OAuth providers are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Login Experience

- **Page design:** Minimal centered form - just password field and submit button on blank page
- **Error handling:** Show inline error message "Incorrect password" below field, keep password visible for retry
- **Brute-force protection:** Rate limiting - limit login attempts (5 tries per 15 minutes) with countdown message
- **Post-login behavior:** Claude's discretion - choose between redirecting to admin home vs. returning to attempted page

### Protected Routes

- **Unauthenticated access:** Show 404 page to hide admin existence - "Page not found" instead of revealing admin area
- **Session expiry:** Auto-redirect on expiry - when session expires, immediately redirect to login with "Session expired" message
- **Session duration:** 8 hours (medium) - covers typical work session, expires overnight
- **Logout UI:** No visible logout button - sessions auto-expire, can clear cookies manually if needed

### Claude's Discretion

- Post-login redirect logic (admin home vs. return-to-origin)
- Exact rate limiting implementation details
- Session storage mechanism
- Password input styling and accessibility

</decisions>

<specifics>
## Specific Ideas

No specific requirements - open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

_Phase: 03-admin-auth_
_Context gathered: 2026-01-29_
