# Decisions - Dark Mode Implementation

## Architectural Choices

_Key decisions made during implementation with rationale_

---

## [2026-02-07] Task 1: Semantic CSS Token System

### Token Count

26 tokens total (2 base + 4 surface + 3 text + 2 border + 4 accent + 8 status + 3 misc). Exceeds the ~20 target because the plan's status token list included `--status-error-surface` and `--status-error-surface-text` beyond the initial estimate.

### Color Palette Rationale

**Light mode** — Neutral grays from Tailwind's neutral scale for surfaces/text. Blue accent (`#2563eb` / blue-600) for interactive elements — standard, accessible, photography-appropriate. Status colors use Tailwind green/yellow/red families with muted backgrounds and strong text for readability.

**Dark mode** — Softer dark gray `#1e1e1e` (vs previous `#0a0a0a` near-black). This follows modern dark UI conventions (VS Code, GitHub dark) that reduce eye strain. Surface hierarchy: `#1e1e1e` → `#2a2a2a` → `#333333` with inset going darker to `#171717`. Accent shifts to lighter blue (`#60a5fa` / blue-400) for visibility on dark backgrounds. Button colors invert (light bg on dark surface).

### Key Decisions

1. **`themeColor` in `viewport` export, not `metadata`**: Next.js 16 moved `themeColor` to the Viewport API. Using `metadata` produces build warnings. Used `export const viewport: Viewport` with array of objects.

2. **`color-scheme: light dark` on `html` selector**: Placed on `html` (not `:root`) as a separate rule for clarity. Both `html` and `:root` target the same element, but using `html` is more semantically clear for browser-level hints.

3. **Token naming convention**: Bare CSS custom properties (`--surface`, `--accent`) in `:root`/dark blocks. Tailwind mapping uses `--color-{name}` prefix in `@theme inline` to generate utility classes (`bg-surface`, `text-accent`, etc.).

4. **Test expectations expanded**: Updated `theme-tokens.test.ts` to assert all 26 tokens in both light and dark blocks. Also strengthened the `color-scheme` test to actually assert the value (was previously a soft check).

### Deviations from Plan

- None. All tokens from the plan's token list are implemented.
- Added `Viewport` import from `next` (not in plan but required by Next.js 16 API).
