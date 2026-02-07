# Dark Mode: System-Preference-Based Day/Night Theme

## TL;DR

> **Quick Summary**: Add system-preference-based dark/light mode to the entire photography portfolio using semantic CSS variables. No manual toggle — purely `prefers-color-scheme` driven. Replace 126+ hardcoded Tailwind color classes across all components and pages with theme tokens.
>
> **Deliverables**:
>
> - Complete semantic CSS variable token system in `globals.css` (light + dark palettes)
> - `color-scheme` + `<meta name="theme-color">` for native browser adaptation
> - All 18 components migrated to use semantic tokens
> - All 11 page files + 3 client pages migrated
> - Vitest infrastructure + theme token tests
> - Playwright visual QA baseline + dark mode verification
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 (baseline) → Task 1 (tokens) → Tasks 2-4 (migration) → Task 6 (visual QA)

---

## Context

### Original Request

Add day/night mode depending on system preferences.

### Interview Summary

**Key Discussions**:

- **Toggle behavior**: System preferences only — no manual toggle, no localStorage, no theme context/provider
- **Scope**: Both public gallery AND admin panel get full dark mode treatment
- **Strategy**: Semantic CSS variables (define tokens in globals.css, map via Tailwind `@theme inline`)
- **Palette**: Softer dark gray (#1e1e1e style) — "dark UI" feel, not gallery-black
- **Testing**: TDD with Vitest (new infrastructure) + Playwright visual QA

**Research Findings**:

- Tailwind v4 config lives entirely in `globals.css` via `@theme inline` — no `tailwind.config.js`
- CSS variables `--background`/`--foreground` already exist with `prefers-color-scheme: dark` media query, but components don't use them
- Zero `dark:` prefixes in the entire codebase — clean slate
- 126+ hardcoded Tailwind color classes across 18 components + 14 page/client files
- No opacity modifiers on color classes (e.g., `bg-blue-600/50`) — CSS variable approach has no conflicts
- `font-family: Arial` in body overrides Geist fonts (existing bug, flagged but out of scope)

### Metis Review

**Identified Gaps** (addressed):

- **Missing `color-scheme: light dark`**: Without it, browser native controls (scrollbars, checkboxes, inputs) stay light-themed. → Added to Task 1.
- **Missing `<meta name="theme-color">`**: Mobile browser address bar won't adapt. → Added to Task 1.
- **Login button invisible in dark mode**: `bg-black text-white` disappears against dark background. → Flagged as edge case in Task 4.
- **`hover:bg-gray-50` flashes white**: 7 occurrences across components. → Token `--surface-hover` covers this.
- **`ring-offset-2` leaks white**: 3 locations in gallery components. → Token `--ring-offset` covers this.
- **Status badge colors need dark equivalents**: Inline color maps in PhotoGrid, PhotoDetail, BatchActions. → Addressed in Task 3.
- **Functional alert colors** (`bg-blue-50 text-blue-700`, `bg-red-50 text-red-700`): Illegible in dark. → Token pairs for info/error/success/warning.
- **Existing `--background: #0a0a0a` needs update**: Contradicts softer dark gray decision. → Updated in Task 1.

---

## Work Objectives

### Core Objective

Make the entire photography portfolio visually adapt to the user's OS dark/light mode preference via semantic CSS variables, with zero manual intervention required.

### Concrete Deliverables

- `src/app/globals.css` — complete semantic token system (~20 tokens) with light/dark values
- `src/app/layout.tsx` — `color-scheme` meta, `theme-color` meta tags
- 18 component files in `src/presentation/components/` — migrated to tokens
- 14 page/client files in `src/app/` — migrated to tokens
- `vitest.config.ts` + test files for theme tokens
- Playwright visual test specs with baseline screenshots

### Definition of Done

- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npx vitest run` — all theme tests pass
- [ ] Light mode visually matches current site (regression check)
- [ ] Dark mode renders correctly with softer dark gray palette
- [ ] Browser native controls adapt (scrollbars, checkboxes) via `color-scheme`
- [ ] Mobile address bar adapts via `theme-color` meta

### Must Have

- System-preference-only switching (`prefers-color-scheme` media query)
- Semantic CSS variable tokens for all color roles (surface, text, border, accent, status)
- `color-scheme: light dark` on root element
- `<meta name="theme-color">` with media queries for light/dark
- All text-on-background pairs with readable contrast
- Status badges (processing/ready/error) visible in both modes

### Must NOT Have (Guardrails)

- NO manual toggle button or UI
- NO localStorage, cookies, or JS-based theme state
- NO theme context/provider/wrapper component
- NO `dark:` Tailwind prefix classes — use semantic variables only
- DO NOT touch `PhotoLightbox` `backgroundColor: "rgb(0, 0, 0)"` — intentionally black for photo viewing
- DO NOT touch `ExifPanel` gradient (`from-black/90 via-black/70`) — intentionally dark for lightbox overlay
- DO NOT touch `ExifPanel` text colors (`text-gray-400`, `text-white`) — lightbox context
- DO NOT touch modal backdrop overlays (`bg-black/50`) — work in both modes as-is
- DO NOT fix `font-family: Arial` bug in `globals.css:25` — out of scope
- DO NOT add `@ts-ignore`, `@ts-expect-error`, or `as any`
- DO NOT modify any infrastructure, domain, or API files
- DO NOT change any behavior or functionality — this is purely visual/styling

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> This is NOT conditional — it applies to EVERY task, regardless of test strategy.
>
> **FORBIDDEN** — acceptance criteria that require:
>
> - "User manually tests..." / "User visually confirms..."
> - "User interacts with..." / "Ask user to verify..."
> - ANY step where a human must perform an action
>
> **ALL verification is executed by the agent** using tools (Playwright, Bash, etc.). No exceptions.

### Test Decision

- **Infrastructure exists**: NO (setting up in Task 5)
- **Automated tests**: YES (TDD where applicable — token tests written first)
- **Framework**: Vitest

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> Whether TDD is enabled or not, EVERY task MUST include Agent-Executed QA Scenarios.
> These describe how the executing agent DIRECTLY verifies the deliverable.

**Verification Tool by Deliverable Type:**

| Type                    | Tool       | How Agent Verifies                                        |
| ----------------------- | ---------- | --------------------------------------------------------- |
| **CSS/Theme**           | Playwright | Emulate color scheme, inspect computed styles, screenshot |
| **Component Migration** | Playwright | Navigate pages in both modes, assert visual correctness   |
| **Build/Lint**          | Bash       | Run commands, assert exit code 0                          |
| **Tests**               | Bash       | Run vitest, assert all pass                               |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 0: Capture Playwright baseline screenshots (light mode)
└── Task 5: Set up Vitest infrastructure

Wave 2 (After Wave 1):
├── Task 1: Define token system in globals.css + layout.tsx [depends: 0]
└── (Task 5 may still be finishing — independent)

Wave 3 (After Task 1):
├── Task 2: Migrate public-facing components [depends: 1]
├── Task 3: Migrate admin components [depends: 1]
└── Task 4: Handle edge cases (login button, status badges, ring-offset) [depends: 1]

Wave 4 (After Wave 3):
└── Task 6: Playwright dark mode visual QA + regression check [depends: 2, 3, 4]

Critical Path: Task 0 → Task 1 → Tasks 2/3/4 → Task 6
Parallel Speedup: ~35% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks  | Can Parallelize With |
| ---- | ---------- | ------- | -------------------- |
| 0    | None       | 1, 6    | 5                    |
| 1    | 0          | 2, 3, 4 | 5                    |
| 2    | 1          | 6       | 3, 4, 5              |
| 3    | 1          | 6       | 2, 4, 5              |
| 4    | 1          | 6       | 2, 3, 5              |
| 5    | None       | 6       | 0, 1, 2, 3, 4        |
| 6    | 2, 3, 4, 5 | None    | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Agents                                           |
| ---- | ------- | ------------------------------------------------------------ |
| 1    | 0, 5    | Task 0: `visual-engineering` + `playwright`. Task 5: `quick` |
| 2    | 1       | `unspecified-high` (CSS architecture)                        |
| 3    | 2, 3, 4 | All `visual-engineering` + `frontend-ui-ux` (parallel)       |
| 4    | 6       | `visual-engineering` + `playwright`                          |

---

## TODOs

- [x] 0. Capture Playwright Baseline Screenshots (Light Mode)

  **What to do**:
  - Start the dev server (`npm run dev`)
  - Capture full-page screenshots of key pages in light mode (current state) using Playwright
  - Pages to capture:
    - Homepage (`/`)
    - Albums listing (`/albums`)
    - An album detail page (pick first available album)
    - Admin login (`/admin/login`)
    - Admin dashboard (`/admin` — requires auth cookie, if accessible set one up; if not, login page is sufficient)
  - Save screenshots to `.sisyphus/evidence/baseline/` with descriptive names
  - These serve as the regression safety net — light mode must look identical after changes

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT change any styles

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual verification task requiring Playwright browser automation
  - **Skills**: [`playwright`]
    - `playwright`: Required for browser automation, screenshot capture, and page navigation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 5)
  - **Blocks**: Task 1, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/app/page.tsx` — Homepage server component (renders `HomepageClient`)
  - `src/app/albums/page.tsx` — Public albums listing page
  - `src/app/admin/login/page.tsx` — Login page with form

  **Documentation References**:
  - `AGENTS.md:Commands` — `npm run dev` starts dev server on port 3000

  **WHY Each Reference Matters**:
  - Page files tell you what routes exist and what they render, so you can navigate to the correct URLs

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Capture homepage baseline screenshot
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Wait for: body visible (timeout: 10s)
      3. Wait for: network idle (timeout: 15s)
      4. Full-page screenshot: .sisyphus/evidence/baseline/homepage-light.png
    Expected Result: Screenshot saved showing current light-mode homepage
    Evidence: .sisyphus/evidence/baseline/homepage-light.png

  Scenario: Capture albums page baseline screenshot
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/albums
      2. Wait for: body visible (timeout: 10s)
      3. Full-page screenshot: .sisyphus/evidence/baseline/albums-light.png
    Expected Result: Screenshot saved showing current light-mode albums page
    Evidence: .sisyphus/evidence/baseline/albums-light.png

  Scenario: Capture login page baseline screenshot
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Wait for: input[type="password"] visible (timeout: 10s)
      3. Full-page screenshot: .sisyphus/evidence/baseline/login-light.png
    Expected Result: Screenshot saved showing current light-mode login page
    Evidence: .sisyphus/evidence/baseline/login-light.png
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/baseline/homepage-light.png`
  - [ ] `.sisyphus/evidence/baseline/albums-light.png`
  - [ ] `.sisyphus/evidence/baseline/login-light.png`

  **Commit**: NO (no source changes)

---

- [x] 1. Define Semantic Token System + Layout Meta Tags

  **What to do**:
  - **In `src/app/globals.css`**:
    - Define complete semantic CSS variable token system in `:root` (light mode values)
    - Define dark mode overrides in `@media (prefers-color-scheme: dark)` block
    - Update existing `--background` dark value from `#0a0a0a` to softer dark gray (`#1e1e1e`)
    - Map ALL tokens to Tailwind via `@theme inline` directive
    - Add `color-scheme: light dark` to root element styles
    - Token list (role-based, ~20 tokens):

      **Surface tokens:**
      - `--surface`: Main content background (white / dark gray)
      - `--surface-secondary`: Slightly offset background for cards, sections (gray-50 / slightly lighter dark)
      - `--surface-hover`: Hover state for interactive surfaces (gray-50 / slightly lighter dark)
      - `--surface-inset`: Inset/recessed areas like inputs (white / darker gray)

      **Text tokens:**
      - `--text-primary`: Main text (gray-900 / gray-100)
      - `--text-secondary`: Secondary/muted text (gray-600 / gray-400)
      - `--text-tertiary`: Least important text, placeholders (gray-400 / gray-500)

      **Border tokens:**
      - `--border`: Default borders (gray-200 / gray-700)
      - `--border-strong`: Stronger borders, selected states (gray-400 / gray-500)

      **Interactive/Accent tokens:**
      - `--accent`: Primary accent color (blue-600 / blue-500)
      - `--accent-hover`: Accent hover state (blue-700 / blue-400)
      - `--accent-surface`: Light accent background for highlights (blue-50 / blue-950)
      - `--accent-text`: Text on accent backgrounds (blue-800 / blue-300)

      **Status tokens:**
      - `--status-success-bg`: Success background (green-100 / green-900/30)
      - `--status-success-text`: Success text (green-800 / green-400)
      - `--status-warning-bg`: Warning background (yellow-100 / yellow-900/30)
      - `--status-warning-text`: Warning text (yellow-800 / yellow-400)
      - `--status-error-bg`: Error background (red-100 / red-900/30)
      - `--status-error-text`: Error text (red-800 / red-400)
      - `--status-error-surface`: Error surface/alert bg (red-50 / red-950)
      - `--status-error-surface-text`: Error surface text (red-700 / red-400)

      **Misc tokens:**
      - `--ring-offset`: Focus ring offset color (white / dark surface color)
      - `--button-primary-bg`: Primary button background (gray-900 / gray-100)
      - `--button-primary-text`: Primary button text (white / gray-900)

  - **In `src/app/layout.tsx`**:
    - Add `<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />` in metadata export
    - Add `<meta name="theme-color" content="#1e1e1e" media="(prefers-color-scheme: dark)" />` in metadata export

  **Must NOT do**:
  - Do NOT remove existing `--background` and `--foreground` variables — update them
  - Do NOT fix `font-family: Arial` (out of scope)
  - Do NOT add any JavaScript-based theming
  - Do NOT add a theme toggle component

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CSS architecture task requiring careful token design — not visual implementation, not trivial
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Understanding of design tokens, color systems, and Tailwind v4 theme integration

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: Task 0 (baseline must be captured first)

  **References**:

  **Pattern References**:
  - `src/app/globals.css:1-27` — Current CSS variable setup, `@theme inline` directive, `prefers-color-scheme` media query. This is the ONLY file for token definitions. Extend the existing pattern.
  - `src/app/layout.tsx:15-32` — Current metadata export. Add `themeColor` property to Next.js Metadata object using the media query format.

  **API/Type References**:
  - Next.js Metadata type supports `themeColor` as an array of objects with `media` and `color` properties.

  **WHY Each Reference Matters**:
  - `globals.css` is the single source of truth for all CSS tokens — extend its existing pattern
  - `layout.tsx` metadata export is where Next.js generates `<meta>` tags — use its typed API

  **Acceptance Criteria**:

  **TDD (RED-GREEN-REFACTOR):**
  - Note: Vitest may or may not be ready (Task 5 is parallel). If Vitest is ready, write token tests. If not, rely on QA scenarios below.
  - If Vitest IS ready: Write a test that parses `globals.css` and asserts all expected token names exist in both `:root` and `@media (prefers-color-scheme: dark)` blocks.

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify light mode tokens render correctly
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000 with updated globals.css
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'light' }
      3. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('--surface')
      4. Assert: --surface resolves to a white-ish value (e.g., #ffffff or rgb(255, 255, 255))
      5. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
      6. Assert: --text-primary resolves to a dark value (e.g., near #111827)
      7. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('color-scheme')
      8. Assert: color-scheme includes "light" and "dark"
    Expected Result: All light-mode tokens resolve to correct light values
    Evidence: Console output of computed style values

  Scenario: Verify dark mode tokens render correctly
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'dark' }
      3. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('--surface')
      4. Assert: --surface resolves to a dark gray value (near #1e1e1e)
      5. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('--background')
      6. Assert: --background resolves to #1e1e1e (NOT #0a0a0a — must be updated)
      7. Evaluate JS: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
      8. Assert: --text-primary resolves to a light value (near #f3f4f6)
    Expected Result: All dark-mode tokens resolve to correct dark values
    Evidence: Console output of computed style values

  Scenario: Verify theme-color meta tags exist
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Query: document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
      3. Assert: element exists and content is "#ffffff" (or similar light color)
      4. Query: document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')
      5. Assert: element exists and content is "#1e1e1e" (or similar dark color)
    Expected Result: Both theme-color meta tags present with correct media queries
    Evidence: DOM query results

  Scenario: Build and lint pass after token changes
    Tool: Bash
    Steps:
      1. Run: npm run build
      2. Assert: exit code 0
      3. Run: npm run typecheck
      4. Assert: exit code 0
      5. Run: npm run lint
      6. Assert: exit code 0
    Expected Result: No build, type, or lint errors
    Evidence: Command output
  ```

  **Evidence to Capture:**
  - [ ] Computed style values for light mode tokens
  - [ ] Computed style values for dark mode tokens
  - [ ] DOM query results for theme-color meta tags

  **Commit**: YES
  - Message: `feat(theme): define semantic CSS variable token system for dark/light mode`
  - Files: `src/app/globals.css`, `src/app/layout.tsx`
  - Pre-commit: `npm run build && npm run typecheck && npm run lint`

---

- [x] 2. Migrate Public-Facing Components to Semantic Tokens

  **What to do**:
  - Migrate ALL public-facing components and pages to use the semantic CSS variable tokens defined in Task 1
  - Replace hardcoded Tailwind color classes with token-based classes (e.g., `bg-white` → `bg-surface`, `text-gray-900` → `text-text-primary`, `border-gray-200` → `border-border`)
  - Components to migrate (public-facing):
    1. `src/presentation/components/Header.tsx` — nav links: `text-gray-900` → `text-text-primary`, `text-gray-600` → `text-text-secondary`
    2. `src/presentation/components/Breadcrumb.tsx` — breadcrumb text: `text-gray-400` → `text-text-tertiary`, `text-gray-600` → `text-text-secondary`, `text-gray-900` → `text-text-primary`
    3. `src/presentation/components/HomepageClient.tsx` — focus ring offset: add `ring-offset-ring-offset` to all 3 `ring-offset-2` instances
    4. `src/presentation/components/AlbumGalleryClient.tsx` — text colors + focus ring offset: `text-gray-900` → `text-text-primary`, `text-gray-600` → `text-text-secondary`, ring-offset fix
    5. `src/presentation/components/FadeImage.tsx` — check for any hardcoded colors (may be clean)
  - Pages to migrate: 6. `src/app/page.tsx` — homepage: `text-gray-500` → `text-text-secondary` 7. `src/app/albums/page.tsx` — album listing: `bg-gray-100` → `bg-surface-secondary`, `text-gray-400` → `text-text-tertiary`, `text-gray-900` → `text-text-primary`, `hover:bg-gray-50` → `hover:bg-surface-hover` 8. `src/app/photo/[slug]/page.tsx` — photo detail: `text-gray-500` → `text-text-secondary` 9. `src/app/albums/[id]/page.tsx` — album detail page 10. `src/app/albums/[id]/photo/[slug]/page.tsx` — album photo page

  **Must NOT do**:
  - Do NOT change `PhotoLightbox.tsx` (backgroundColor: "rgb(0, 0, 0)")
  - Do NOT change `ExifPanel.tsx` (lightbox overlay — intentionally dark)
  - Do NOT change any functionality or behavior
  - Do NOT use `dark:` Tailwind prefixes — use semantic token classes only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Component-level styling migration requiring visual awareness and Tailwind expertise
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Understands color systems, design tokens, and component styling patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (tokens must be defined first)

  **References**:

  **Pattern References**:
  - `src/app/globals.css` (after Task 1) — the complete token system. Each Tailwind utility maps to a CSS variable: `bg-surface` uses `--color-surface`, `text-text-primary` uses `--color-text-primary`, etc.
  - `src/presentation/components/Header.tsx` — example of typical color class usage pattern across components

  **API/Type References**:
  - Tailwind v4 `@theme inline` maps `--color-{name}` to `bg-{name}`, `text-{name}`, `border-{name}` utilities automatically

  **Documentation References**:
  - `AGENTS.md:Conventions:Styling` — Tailwind CSS v4, utility-first, no CSS-in-JS

  **WHY Each Reference Matters**:
  - `globals.css` token system is the single reference for what token names to use — executor must follow exact naming
  - `Header.tsx` shows the pattern of how color classes are used — apply same migration strategy to all files
  - Tailwind v4 `@theme` docs explain how `--color-X` variables become utility classes

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Homepage renders correctly in light mode (regression)
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'light' }
      3. Wait for: body visible (timeout: 10s)
      4. Full-page screenshot: .sisyphus/evidence/task-2-homepage-light.png
      5. Compare visually with: .sisyphus/evidence/baseline/homepage-light.png
      6. Assert: Layout structure unchanged, colors appear similar to baseline
    Expected Result: Light mode homepage looks identical to baseline
    Evidence: .sisyphus/evidence/task-2-homepage-light.png

  Scenario: Homepage renders correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'dark' }
      3. Wait for: body visible (timeout: 10s)
      4. Full-page screenshot: .sisyphus/evidence/task-2-homepage-dark.png
      5. Assert: Background is dark gray (not white)
      6. Assert: Text is light colored (readable against dark background)
      7. Assert: No white "blobs" or unthemed elements visible
    Expected Result: Homepage has consistent dark theme with softer dark gray background
    Evidence: .sisyphus/evidence/task-2-homepage-dark.png

  Scenario: Albums page renders correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/albums
      2. Emulate media: { colorScheme: 'dark' }
      3. Wait for: body visible (timeout: 10s)
      4. Full-page screenshot: .sisyphus/evidence/task-2-albums-dark.png
      5. Assert: Album cards have dark surface background
      6. Assert: Text is readable (light on dark)
      7. Assert: Hover any album card — hover state uses dark-appropriate color (not white flash)
    Expected Result: Albums page has consistent dark theme, hover states work
    Evidence: .sisyphus/evidence/task-2-albums-dark.png

  Scenario: Build still passes after migration
    Tool: Bash
    Steps:
      1. Run: npm run build
      2. Assert: exit code 0
      3. Run: npm run typecheck
      4. Assert: exit code 0
    Expected Result: No build or type errors
    Evidence: Command output
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-homepage-light.png` (regression check)
  - [ ] `.sisyphus/evidence/task-2-homepage-dark.png`
  - [ ] `.sisyphus/evidence/task-2-albums-dark.png`

  **Commit**: YES
  - Message: `feat(theme): migrate public-facing components to semantic tokens`
  - Files: `src/presentation/components/Header.tsx`, `src/presentation/components/Breadcrumb.tsx`, `src/presentation/components/HomepageClient.tsx`, `src/presentation/components/AlbumGalleryClient.tsx`, `src/presentation/components/FadeImage.tsx`, `src/app/page.tsx`, `src/app/albums/page.tsx`, `src/app/photo/[slug]/page.tsx`, `src/app/albums/[id]/page.tsx`, `src/app/albums/[id]/photo/[slug]/page.tsx`
  - Pre-commit: `npm run build && npm run typecheck`

---

- [x] 3. Migrate Admin Components to Semantic Tokens

  **What to do**:
  - Migrate ALL admin-facing components and pages to use semantic CSS variable tokens
  - Components to migrate:
    1. `src/presentation/components/PhotoGrid.tsx` — cards: `bg-white` → `bg-surface`, `border-gray-200` → `border-border`, `bg-gray-100` → `bg-surface-secondary`, `text-gray-400` → `text-text-tertiary`, selection states
    2. `src/presentation/components/PhotoDetail.tsx` — detail view: `bg-gray-100` → `bg-surface-secondary`, `text-gray-900` → `text-text-primary`, `text-gray-500` → `text-text-secondary`, `border-gray-200` → `border-border`
    3. `src/presentation/components/DropZone.tsx` — drag zone: `border-gray-300` → `border-border`, `text-gray-600` → `text-text-secondary`, `text-gray-400` → `text-text-tertiary`, active state: `border-blue-500` → `border-accent`, `bg-blue-50` → `bg-accent-surface`, `text-blue-600` → `text-accent`
    4. `src/presentation/components/UploadQueue.tsx` — upload items: `bg-white` → `bg-surface`, `border-gray-200` → `border-border`, `text-gray-700` → `text-text-primary`, progress: `bg-gray-200` → `bg-surface-secondary`, `bg-blue-500` → `bg-accent`
    5. `src/presentation/components/BatchActions.tsx` — action bar: accent surfaces and text
    6. `src/presentation/components/AlbumSelector.tsx` — album list: `bg-white` → `bg-surface`, `border-gray-200` → `border-border`, hover states
    7. `src/presentation/components/AlbumCreateModal.tsx` — modal: `bg-white` → `bg-surface`, form inputs, button styles
    8. `src/presentation/components/DeleteAlbumModal.tsx` — modal: `bg-white` → `bg-surface`, warning text
    9. `src/presentation/components/TagsInput.tsx` — input: `bg-white` → `bg-surface-inset`, `border-gray-300` → `border-border`, tag pills
    10. `src/presentation/components/SortableAlbumCard.tsx` — card: `bg-white` → `bg-surface`, `border-gray-200` → `border-border`, drag state
    11. `src/presentation/components/SortablePhotoCard.tsx` — photo card: `border-gray-200` → `border-border`, text colors
  - Admin pages to migrate: 12. `src/app/admin/(protected)/page.tsx` — dashboard: `border-gray-300` → `border-border`, `text-gray-700` → `text-text-secondary`, `hover:bg-gray-50` → `hover:bg-surface-hover` 13. `src/app/admin/(protected)/albums/page.tsx` — uses `AlbumsPageClient` 14. `src/app/admin/(protected)/albums/AlbumsPageClient.tsx` — info/error alerts: accent/error surfaces 15. `src/app/admin/(protected)/albums/[id]/page.tsx` — uses `AlbumDetailClient` 16. `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx` — info/error alerts 17. `src/app/admin/(protected)/upload/page.tsx` — upload page 18. `src/app/admin/(protected)/photos/[id]/page.tsx` — photo detail: `bg-white` → `bg-surface`, `border-gray-200` → `border-border` 19. `src/app/admin/(protected)/AdminDashboardClient.tsx` — dashboard client

  **Must NOT do**:
  - Do NOT change `PhotoLightbox.tsx` or `ExifPanel.tsx` (lightbox context — keep as-is)
  - Do NOT change modal backdrop `bg-black/50` (works in both modes)
  - Do NOT change any functionality or behavior
  - Do NOT use `dark:` Tailwind prefixes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Bulk component migration with styling expertise needed
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design token migration, component styling patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 2, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (tokens must be defined first)

  **References**:

  **Pattern References**:
  - `src/app/globals.css` (after Task 1) — complete token system with all variable names
  - `src/presentation/components/index.ts` — barrel export; all 12 exported components listed here must be addressed
  - Task 2 migration (if completed first) — follow the exact same token mapping pattern established there

  **API/Type References**:
  - Status badge inline maps at `src/presentation/components/PhotoDetail.tsx:162-166` and `src/presentation/components/PhotoGrid.tsx:181-183` — these hardcoded color objects need token values: `"bg-status-warning-bg text-status-warning-text"` etc.
  - Save indicator map at `src/presentation/components/PhotoDetail.tsx:184-188` — similar pattern

  **WHY Each Reference Matters**:
  - Token system in `globals.css` is the authoritative mapping — don't invent token names, use what's defined
  - `index.ts` barrel export ensures no component is missed
  - Status badge maps are the trickiest migration — they're inline objects, not simple class replacements

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Admin login page renders in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Emulate media: { colorScheme: 'dark' }
      3. Wait for: input[type="password"] visible (timeout: 10s)
      4. Full-page screenshot: .sisyphus/evidence/task-3-login-dark.png
      5. Assert: Background is dark gray
      6. Assert: Form input is visible with appropriate dark styling
      7. Assert: Submit button is visible (NOT invisible — regression check for bg-black issue, handled in Task 4)
    Expected Result: Login page has dark theme with all elements visible
    Evidence: .sisyphus/evidence/task-3-login-dark.png

  Scenario: Modal renders correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000, logged into admin, on albums page
    Steps:
      1. Navigate to admin albums page (requires auth)
      2. Emulate media: { colorScheme: 'dark' }
      3. Click: button to create new album (triggering AlbumCreateModal)
      4. Wait for: modal visible (timeout: 5s)
      5. Assert: Modal surface is dark (not white blob against dark backdrop)
      6. Assert: Form inputs have dark styling
      7. Screenshot: .sisyphus/evidence/task-3-modal-dark.png
    Expected Result: Modal has dark surface that's distinct from backdrop
    Evidence: .sisyphus/evidence/task-3-modal-dark.png

  Scenario: Build and typecheck pass
    Tool: Bash
    Steps:
      1. Run: npm run build
      2. Assert: exit code 0
      3. Run: npm run typecheck
      4. Assert: exit code 0
    Expected Result: No errors
    Evidence: Command output
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-login-dark.png`
  - [ ] `.sisyphus/evidence/task-3-modal-dark.png`

  **Commit**: YES
  - Message: `feat(theme): migrate admin components and pages to semantic tokens`
  - Files: All admin components and pages listed above
  - Pre-commit: `npm run build && npm run typecheck`

---

- [ ] 4. Handle Edge Cases and Special Color Patterns

  **What to do**:
  - Fix specific edge cases identified during analysis that don't fit the mechanical token migration:
  1. **Login button invisible in dark mode** (`src/app/admin/login/page.tsx:43`):
     - Current: `bg-black text-white` — disappears against dark background
     - Fix: Replace with `bg-button-primary-bg text-button-primary-text` tokens
     - Light mode renders as dark button on light page, dark mode renders as light button on dark page

  2. **Status badge color maps** — update inline objects in:
     - `src/presentation/components/PhotoGrid.tsx:181-183` — status badge styles object
     - `src/presentation/components/PhotoDetail.tsx:162-166` — status badge styles object
     - `src/presentation/components/PhotoDetail.tsx:184-188` — save indicator styles object
     - Replace hardcoded color classes with token classes:
       - `processing`: `"bg-status-warning-bg text-status-warning-text"`
       - `ready`: `"bg-status-success-bg text-status-success-text"`
       - `error`: `"bg-status-error-bg text-status-error-text"`

  3. **Focus ring-offset white leak** — 3 locations:
     - `src/presentation/components/HomepageClient.tsx:77` — add `ring-offset-ring-offset`
     - `src/presentation/components/HomepageClient.tsx:98` — add `ring-offset-ring-offset`
     - `src/presentation/components/AlbumGalleryClient.tsx:102` — add `ring-offset-ring-offset`
     - (These may have been addressed in Task 2 — verify and complete if not)

  4. **Accent color interactive states** — verify focus states across form inputs:
     - `focus:border-blue-500 focus:ring-blue-500` pattern used in `DropZone`, `TagsInput`, and various inputs
     - Replace with `focus:border-accent focus:ring-accent`

  5. **Info/Error alert boxes** in admin client pages:
     - `src/app/admin/(protected)/albums/AlbumsPageClient.tsx` — `bg-blue-50 text-blue-700` (info) and `bg-red-50 text-red-700` (error)
     - `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx` — same pattern
     - Replace with token equivalents: `bg-accent-surface text-accent-text` (info), `bg-status-error-surface text-status-error-surface-text` (error)

  **Must NOT do**:
  - Do NOT change `PhotoLightbox.tsx` or `ExifPanel.tsx`
  - Do NOT change modal backdrop `bg-black/50`
  - Do NOT introduce any JS-based theming

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Edge case fixes requiring visual verification and careful styling
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Understanding of focus states, accessibility, and design token edge cases

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 2, 3)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (tokens must be defined first)

  **References**:

  **Pattern References**:
  - `src/app/admin/login/page.tsx:43` — Login button with `bg-black text-white`. Must become `bg-button-primary-bg text-button-primary-text`.
  - `src/presentation/components/PhotoGrid.tsx:181-183` — Status badge inline map. Shows exact object structure to update.
  - `src/presentation/components/PhotoDetail.tsx:162-166` — Duplicate status badge map. Must match PhotoGrid's updated version.
  - `src/presentation/components/PhotoDetail.tsx:184-188` — Save indicator map. Similar inline object pattern.
  - `src/presentation/components/HomepageClient.tsx:77,98` — `ring-offset-2` without offset color. Add `ring-offset-ring-offset`.
  - `src/presentation/components/AlbumGalleryClient.tsx:102` — Same ring-offset issue.
  - `src/app/admin/(protected)/albums/AlbumsPageClient.tsx` — Info/error alert pattern with `bg-blue-50 text-blue-700`.
  - `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx` — Same alert pattern.

  **WHY Each Reference Matters**:
  - Login button is a critical UX bug in dark mode — invisible button = unusable login
  - Status badge maps are the trickiest pattern — inline objects with string values, not simple class-level changes
  - Ring-offset is subtle but creates a jarring white gap in dark mode around focused images
  - Alert boxes are currently light-tinted and become illegible against dark backgrounds

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Login button visible in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Emulate media: { colorScheme: 'dark' }
      3. Wait for: button[type="submit"] visible (timeout: 5s)
      4. Evaluate JS: getComputedStyle(document.querySelector('button[type="submit"]')).backgroundColor
      5. Assert: Button background is NOT the same as page background (button is distinguishable)
      6. Evaluate JS: getComputedStyle(document.querySelector('button[type="submit"]')).color
      7. Assert: Button text contrasts with button background
      8. Screenshot: .sisyphus/evidence/task-4-login-button-dark.png
    Expected Result: Login button clearly visible with good contrast in dark mode
    Evidence: .sisyphus/evidence/task-4-login-button-dark.png

  Scenario: Login button still looks good in light mode (regression)
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Emulate media: { colorScheme: 'light' }
      3. Wait for: button[type="submit"] visible (timeout: 5s)
      4. Screenshot: .sisyphus/evidence/task-4-login-button-light.png
      5. Assert: Button is dark-colored on light background (similar to original)
    Expected Result: Login button maintains its dark-on-light appearance
    Evidence: .sisyphus/evidence/task-4-login-button-light.png

  Scenario: Status badges readable in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, admin authenticated, photos exist with different statuses
    Steps:
      1. Navigate to admin photos page
      2. Emulate media: { colorScheme: 'dark' }
      3. Find status badge elements
      4. Assert: Badge background and text colors provide readable contrast
      5. Screenshot: .sisyphus/evidence/task-4-status-badges-dark.png
    Expected Result: Processing (yellow), ready (green), and error (red) badges are all readable
    Evidence: .sisyphus/evidence/task-4-status-badges-dark.png

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: npm run build
      2. Assert: exit code 0
    Expected Result: No errors
    Evidence: Command output
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-login-button-dark.png`
  - [ ] `.sisyphus/evidence/task-4-login-button-light.png`
  - [ ] `.sisyphus/evidence/task-4-status-badges-dark.png`

  **Commit**: YES
  - Message: `fix(theme): handle edge cases — login button, status badges, ring-offset, alert boxes`
  - Files: `src/app/admin/login/page.tsx`, `src/presentation/components/PhotoGrid.tsx`, `src/presentation/components/PhotoDetail.tsx`, `src/presentation/components/HomepageClient.tsx`, `src/presentation/components/AlbumGalleryClient.tsx`, `src/app/admin/(protected)/albums/AlbumsPageClient.tsx`, `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx`
  - Pre-commit: `npm run build && npm run typecheck`

---

- [x] 5. Set Up Vitest Infrastructure + Theme Token Tests

  **What to do**:
  - Install Vitest and required dependencies:
    - `npm install -D vitest`
  - Create `vitest.config.ts` at project root with TypeScript path aliases matching `tsconfig.json`
  - Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
  - Write theme token tests:
    - Create `src/__tests__/theme-tokens.test.ts`
    - Test: Parse `src/app/globals.css` as text
    - Assert: All expected token names exist in `:root` block
    - Assert: All expected token names exist in `@media (prefers-color-scheme: dark)` block
    - Assert: Token count matches between light and dark (every light token has a dark equivalent)
    - Assert: `color-scheme: light dark` is present
  - TDD flow: Write failing test FIRST (RED), then verify globals.css satisfies it (GREEN)
    - Note: If Task 1 is already done, tests should pass immediately (GREEN). If not, tests fail (RED) until Task 1 completes.

  **Must NOT do**:
  - Do NOT set up jsdom or happy-dom (we don't need DOM rendering for CSS parsing tests)
  - Do NOT write component rendering tests (out of scope)
  - Do NOT over-engineer the test setup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward test framework setup — install, config, one test file
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Knows Vitest configuration for modern frontend projects

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 0) — can start immediately
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json:5-21` — existing scripts section. Add `test` and `test:watch` scripts here.
  - `src/app/globals.css` (after Task 1) — the file being tested. Token tests parse this file as text.

  **External References**:
  - Vitest docs: `https://vitest.dev/guide/` — configuration and setup guide

  **WHY Each Reference Matters**:
  - `package.json` scripts section is where test commands must be added
  - `globals.css` is the test subject — tests validate its structure and content

  **Acceptance Criteria**:

  **TDD (RED-GREEN-REFACTOR):**
  - [ ] Test file created: `src/__tests__/theme-tokens.test.ts`
  - [ ] If Task 1 not done: `npx vitest run` → FAIL (tokens don't exist yet)
  - [ ] If Task 1 done: `npx vitest run` → PASS (all token assertions satisfied)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Vitest runs successfully
    Tool: Bash
    Preconditions: vitest installed, config created
    Steps:
      1. Run: npx vitest run --reporter=verbose
      2. Assert: exit code 0 (or 1 if Task 1 not yet done — expected RED)
      3. Assert: output shows test file was discovered
      4. Assert: output shows individual test cases
    Expected Result: Vitest discovers and runs theme token tests
    Evidence: Command output

  Scenario: NPM test script works
    Tool: Bash
    Steps:
      1. Run: npm test
      2. Assert: Vitest runs (not "missing script" error)
    Expected Result: test script correctly invokes vitest
    Evidence: Command output
  ```

  **Evidence to Capture:**
  - [ ] Vitest run output showing test discovery
  - [ ] npm test output

  **Commit**: YES
  - Message: `test(theme): set up Vitest infrastructure and add theme token tests`
  - Files: `vitest.config.ts`, `package.json`, `src/__tests__/theme-tokens.test.ts`
  - Pre-commit: `npm run lint`

---

- [ ] 6. Playwright Dark Mode Visual QA + Full Regression Check

  **What to do**:
  - Run comprehensive visual QA across the entire app in BOTH color schemes
  - Compare light mode against baseline screenshots from Task 0 (regression check)
  - Capture dark mode screenshots of all key pages
  - Verify specific edge cases fixed in Tasks 2-4
  - Run full build + typecheck + lint + test suite as final verification
  - Pages to test (both light AND dark):
    - Homepage (`/`)
    - Albums listing (`/albums`)
    - Admin login (`/admin/login`)
    - Admin dashboard (if accessible)
    - Admin albums page (if accessible)
    - A modal dialog (album create, if accessible)
  - Specific checks:
    - Login button visible in dark mode (Task 4 regression)
    - No white "blobs" or unthemed elements in dark mode
    - Hover states don't flash white in dark mode
    - Focus rings don't leak white offset in dark mode
    - Status badges readable in dark mode (if admin accessible)
    - Browser native controls (inputs, checkboxes) adapt via `color-scheme`

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT fix issues found — report them only (fixes would be a separate task)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Comprehensive visual verification requiring Playwright browser automation
  - **Skills**: [`playwright`]
    - `playwright`: Required for emulating color schemes, screenshot capture, DOM assertions

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final task)
  - **Blocks**: None (this is the final task)
  - **Blocked By**: Tasks 2, 3, 4, 5 (all migration + tests must be complete)

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/baseline/` — Baseline screenshots from Task 0. Compare light-mode screenshots against these.
  - All component/page files modified in Tasks 2-4 — verify visual output

  **WHY Each Reference Matters**:
  - Baseline screenshots are the regression safety net — light mode must look identical after all changes
  - Edge case files (login button, status badges) need explicit visual verification

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Light mode regression check — homepage
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000, all Tasks 1-5 complete
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'light' }
      3. Wait for: network idle (timeout: 15s)
      4. Full-page screenshot: .sisyphus/evidence/final/homepage-light.png
      5. Compare with: .sisyphus/evidence/baseline/homepage-light.png
      6. Assert: No visible layout or color differences
    Expected Result: Light mode homepage matches baseline exactly
    Evidence: .sisyphus/evidence/final/homepage-light.png

  Scenario: Dark mode comprehensive check — homepage
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: http://localhost:3000/
      2. Emulate media: { colorScheme: 'dark' }
      3. Wait for: network idle (timeout: 15s)
      4. Full-page screenshot: .sisyphus/evidence/final/homepage-dark.png
      5. Assert: Background is softer dark gray (not near-black, not white)
      6. Assert: All text is readable (light on dark)
      7. Assert: No white blobs or unthemed sections
      8. Assert: Navigation links have appropriate dark-mode colors
    Expected Result: Consistent dark theme across homepage
    Evidence: .sisyphus/evidence/final/homepage-dark.png

  Scenario: Dark mode comprehensive check — albums page
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: http://localhost:3000/albums
      2. Emulate media: { colorScheme: 'dark' }
      3. Full-page screenshot: .sisyphus/evidence/final/albums-dark.png
      4. Assert: Album cards, text, borders all themed
    Expected Result: Albums page fully dark-themed
    Evidence: .sisyphus/evidence/final/albums-dark.png

  Scenario: Dark mode comprehensive check — login page
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Emulate media: { colorScheme: 'dark' }
      3. Full-page screenshot: .sisyphus/evidence/final/login-dark.png
      4. Assert: Form inputs have dark styling (dark background, light text)
      5. Assert: Submit button is clearly visible (NOT invisible)
      6. Assert: Page background is dark gray
    Expected Result: Login page fully functional in dark mode
    Evidence: .sisyphus/evidence/final/login-dark.png

  Scenario: Browser native controls adapt
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Emulate media: { colorScheme: 'dark' }
      3. Focus on: input[type="password"]
      4. Evaluate JS: getComputedStyle(document.documentElement).colorScheme
      5. Assert: value includes "dark" (proves color-scheme is applied)
    Expected Result: color-scheme CSS property is active
    Evidence: Computed style value

  Scenario: Full build + test suite passes
    Tool: Bash
    Steps:
      1. Run: npm run build
      2. Assert: exit code 0
      3. Run: npm run typecheck
      4. Assert: exit code 0
      5. Run: npm run lint
      6. Assert: exit code 0
      7. Run: npm test
      8. Assert: exit code 0 (all Vitest theme tests pass)
    Expected Result: Zero errors across build, types, lint, and tests
    Evidence: All command outputs
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/final/homepage-light.png` (regression)
  - [ ] `.sisyphus/evidence/final/homepage-dark.png`
  - [ ] `.sisyphus/evidence/final/albums-dark.png`
  - [ ] `.sisyphus/evidence/final/login-dark.png`
  - [ ] Build + typecheck + lint + test output

  **Commit**: NO (no source changes — QA only)

---

## Commit Strategy

| After Task | Message                                                                                 | Files                                         | Verification                                         |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| 1          | `feat(theme): define semantic CSS variable token system for dark/light mode`            | `globals.css`, `layout.tsx`                   | `npm run build && npm run typecheck && npm run lint` |
| 2          | `feat(theme): migrate public-facing components to semantic tokens`                      | 10 component/page files                       | `npm run build && npm run typecheck`                 |
| 3          | `feat(theme): migrate admin components and pages to semantic tokens`                    | ~19 component/page files                      | `npm run build && npm run typecheck`                 |
| 4          | `fix(theme): handle edge cases — login button, status badges, ring-offset, alert boxes` | ~7 files                                      | `npm run build && npm run typecheck`                 |
| 5          | `test(theme): set up Vitest infrastructure and add theme token tests`                   | `vitest.config.ts`, `package.json`, test file | `npm run lint && npm test`                           |

---

## Success Criteria

### Verification Commands

```bash
npm run build      # Expected: exit 0, no errors
npm run typecheck  # Expected: exit 0, no errors
npm run lint       # Expected: exit 0, no errors
npm test           # Expected: all Vitest theme token tests pass
```

### Final Checklist

- [ ] All "Must Have" requirements present
- [ ] All "Must NOT Have" guardrails respected
- [ ] Light mode visually identical to pre-change baseline
- [ ] Dark mode renders with softer dark gray palette across all pages
- [ ] Login button visible in both modes
- [ ] Status badges readable in both modes
- [ ] No white "blobs" or unthemed elements in dark mode
- [ ] `color-scheme: light dark` active on root
- [ ] `theme-color` meta tags present for both schemes
- [ ] All tests pass
- [ ] All builds pass
