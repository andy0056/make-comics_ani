# IMPLEMENTATION PLAN

## 2026-02-17 Focus: Simple Mode Default + Advanced/Labs Toggle

### Goal
- Make the default UX clean and beginner-friendly.
- Keep advanced power features in-product, but behind an explicit mode/toggle.

### Delivery Plan
1. Add a persisted global UI mode state (`simple` default, `advanced` optional).
2. Add a reusable mode switch control usable across pages.
3. Apply Simple Mode gating on the landing/create flow.
4. Apply Simple Mode gating on story editor + generate-page modal.
5. Capture validation results and open items.

### Timestamped Execution Log
- `2026-02-17 11:50 +04` Scanned current workspace and confirmed target files for navbar, create flow, editor toolbar, and generation modal.
- `2026-02-17 11:54 +04` Added `hooks/use-ui-mode.ts` with persisted local storage state (`makecomics_ui_mode`), defaulting to `simple`.
- `2026-02-17 11:55 +04` Added reusable `components/ui/ui-mode-toggle.tsx` segmented toggle (`Simple` / `Labs`).
- `2026-02-17 11:57 +04` Integrated mode toggle into `components/landing/navbar.tsx`; GitHub/stars action now only shows in advanced mode.
- `2026-02-17 12:00 +04` Updated `app/page.tsx` to make Simple Mode the clean default layout (single-column prompt-first), with preview canvas shown only in advanced mode.
- `2026-02-17 12:03 +04` Updated `components/landing/hero-section.tsx` to hide “Powered by Together AI” badge in Simple Mode.
- `2026-02-17 12:08 +04` Updated `components/landing/comic-creation-form.tsx`:
  - Prompt-first by default.
  - Character/style controls hidden until user opens Advanced Options in Simple Mode.
  - Full controls remain visible in Advanced Mode.
- `2026-02-17 12:11 +04` Updated editor mode wiring:
  - `app/story/[storySlug]/story-editor-client.tsx` now owns mode state for editor route.
  - `components/editor/editor-toolbar.tsx` shows mode toggle and hides Share action unless advanced mode.
- `2026-02-17 12:14 +04` Updated `components/editor/generate-page-modal.tsx`:
  - Added Simple vs Labs behavior.
  - Character-reference controls now optional in Simple Mode.
  - Widened modal + vertical scroll (`max-w-3xl`, `max-h-[90vh]`, `overflow-y-auto`) to avoid cropped content.
  - Added hidden dialog description to improve accessibility warnings.

### Validation
- Full repo lint (`pnpm lint`) did not complete in this workspace within reasonable time.
- Targeted eslint and `tsc --noEmit` commands were also unusually long-running/hanging in this environment.
- Manual code-level verification completed for changed files and prop wiring.

### Immediate Next Check (Manual QA)
1. Toggle `Simple`/`Labs` from navbar and confirm persistence across `/`, `/stories`, and `/story/[slug]`.
2. In Simple Mode on `/`, verify right preview is hidden and prompt flow remains fast.
3. In Simple Mode on `/story/[slug]`, open “Continue story” modal and verify advanced character controls are hidden until expanded.
4. In Labs mode, verify all previous controls are still available.

---

## 2026-02-17 Focus: Guided 3-Step Simple Mode (Simple, Not Limited)

### Goal
- Implement a first-time creator flow for `/create` with progressive disclosure.
- Keep Labs mode fully available with no feature removal.

### Delivery Plan
1. Add stepper + state model for Story -> Visual -> Review in Simple mode.
2. Add collapsible status rail with `Ready / Generating / Saved / Error`.
3. Add local onboarding state for first-run hints and rail pin behavior.
4. Refactor create form into guided step sections with recipe-first starter.
5. Keep fallback classic flow for Labs mode and non-v2 paths.

### Timestamped Execution Log
- `2026-02-17 12:44 +04` Verified existing `/create` implementation (`app/page.tsx`, `components/landing/comic-creation-form.tsx`) and confirmed there was no separate right-rail component in this branch.
- `2026-02-17 12:47 +04` Added `components/landing/create-stepper.tsx` with typed step contract (`CreateStep`) and lockable step navigation.
- `2026-02-17 12:49 +04` Added `components/landing/create-status-rail.tsx` with typed status contract (`CreateStatus`) and collapsed/expanded operational rail.
- `2026-02-17 12:50 +04` Added `components/landing/first-run-hint.tsx` for contextual helper messaging with dismiss action.
- `2026-02-17 12:52 +04` Added `hooks/use-create-onboarding.ts` with local state for `firstRunCompleted`, `hintsDismissed`, and `simpleRailPinned`.
- `2026-02-17 12:56 +04` Updated `app/page.tsx` to:
  - Enable Simple-mode stepper shell behind `NEXT_PUBLIC_SIMPLE_MODE_V2` flag.
  - Manage `CreateStatus` updates from form callbacks.
  - Auto-expand status rail during generation/errors and auto-collapse after success when not pinned.
  - Keep existing Labs split layout unchanged.
- `2026-02-17 13:00 +04` Rebuilt `components/landing/comic-creation-form.tsx` to support:
  - Guided steps (`story`, `visual`, `review`) in Simple mode.
  - Recipe-first starter prompt bootstrapping.
  - Per-step progressive controls via accordion (“More control”).
  - Status callbacks to parent rail for pipeline stages.
  - Safer JSON parsing for API responses to avoid empty-body parse crashes.
  - First-run hint rendering and completion marking after successful generation.

### Validation
- Pending: targeted eslint + type-check on changed files.
- Pending: manual UX checks for guided step transitions and rail behavior.
- `2026-02-17 13:13 +04` Validation command attempts (`pnpm exec eslint`, `pnpm exec tsc --noEmit`, direct `./node_modules/.bin/eslint/tsc`) hung in this workspace with no stdout and required process cleanup; binary versions verified (`eslint v9.39.2`, `tsc 5.9.3`, `node v20.19.4`).
- `2026-02-17 13:13 +04` Manual static verification completed for changed files; recommend user run local smoke pass on `/create` in both `Simple` and `Labs` modes.
- `2026-02-17 13:19 +04` Applied follow-up fix in `components/landing/comic-creation-form.tsx` so `isLoading` is reset before navigation after successful generation (prevents stale loading state if navigation is delayed).

---

## 2026-02-17 Focus: Style Catalog Expansion (Webtoon + Cinematic Anime)

### Goal
- Add two likely high-usage comic styles without changing API contracts or generation flow architecture.
- Ensure the new styles are immediately available across both Simple and Labs UX surfaces.

### Delivery Plan
1. Append `webtoon` and `anime-cinematic` to `COMIC_STYLES`.
2. Verify style injection path (`UI -> API -> buildComicPrompt -> model`) remains unchanged.
3. Verify story metadata surfaces can resolve and render the new style names.
4. Log implementation details and validation in timestamped format.

### Timestamped Execution Log
- `2026-02-17 13:31 +04` Re-verified style wiring usage across `components/landing/comic-creation-form.tsx`, `app/api/generate-comic/route.ts`, `app/api/add-page/route.ts`, `lib/prompt.ts`, `app/stories/page.tsx`, and `components/editor/page-info-sheet.tsx`.
- `2026-02-17 13:33 +04` Updated `lib/constants.ts` and appended:
  - `webtoon` (`Webtoon`)
  - `anime-cinematic` (`Cinematic Anime`)
  with dedicated style prompt descriptors for prompt builder consumption.
- `2026-02-17 13:34 +04` Confirmed no schema/API changes required because style is already persisted and transported as generic string fields.

### Validation
- Manual static validation confirms `COMIC_STYLES.find(...)` lookups will automatically include new styles in existing dropdown and metadata surfaces.
- Prompt integrity path unchanged: `buildComicPrompt()` resolves style descriptors from `COMIC_STYLES` and applies fallback behavior for unknown styles.
- Full lint/typecheck remains environment-limited in this workspace (same hanging behavior documented above), so this pass is code-level verified.

### Follow-up Compatibility Fix
- `2026-02-17 13:47 +04` Added backward-compat exports and callback props in `components/landing/comic-creation-form.tsx` for legacy `/app/create` workspace integration:
  - Restored exports: `GENERATION_STAGES`, `getGenerationStageState`, and `GenerationProgressSnapshot`.
  - Added optional props: `onGenerationStateChange`, `onCreateSuccess`, `hideStatusPanel`.
  - Wired generation lifecycle updates so legacy activity feed receives progress state without changing the newer Simple/Labs flow.

---

## 2026-02-17 Focus: Runtime Stabilization (/api/stories 500 + Console Noise)

### Goal
- Remove active blockers causing `/stories` fetch failures.
- Improve compatibility with older local DB shapes while preserving current behavior.

### Timestamped Execution Log
- `2026-02-17 14:08 +04` Confirmed active `next dev` runtime is from `/Users/anirudhthakur/Downloads/make-comics_ani-main-20260207-210815`.
- `2026-02-17 14:09 +04` Traced `/api/stories` route and identified brittle dependency on `pages.updatedAt` during list query/sort path.
- `2026-02-17 14:10 +04` Implemented `loadStoriesWithBestEffortSchema()` in `app/api/stories/route.ts`:
  - Primary query keeps full fields including `pageUpdatedAt`.
  - Fallback query omits `pages.updatedAt` and normalizes `pageUpdatedAt: null` for compatibility.
- `2026-02-17 14:11 +04` Added robust timestamp coercion via `toTimestamp()` to avoid invalid-date sort regressions.
- `2026-02-17 14:11 +04` Ran targeted lint on updated route (`pnpm exec eslint app/api/stories/route.ts`) and resolved one unused variable issue.

### Validation
- `/api/stories` route compiles and lints clean after patch.
- Hydration warnings with `bis_skin_checked` are extension-injected attributes, not app-rendered attributes.
- `2026-02-17 14:26 +04` Expanded `/api/stories` compatibility fallback chain in `app/api/stories/route.ts` to tolerate deeper local DB drift:
  - Fallback A: without `pages.updatedAt`.
  - Fallback B: stories-only query when pages join/columns fail.
  - Fallback C: minimal stories query with default `style: "noir"` when `stories.style` is missing.
- `2026-02-17 14:26 +04` Re-ran targeted lint for updated route (`pnpm exec eslint app/api/stories/route.ts`) and confirmed clean.
- `2026-02-17 14:33 +04` Added localhost-aware DB driver switch in `lib/db.ts`:
  - `localhost|127.0.0.1|::1` -> `drizzle-orm/node-postgres` via `pg` Pool.
  - non-local hosts -> existing `drizzle-orm/neon-http` path.
  - Added dev-time global pool reuse to avoid connection churn during HMR.
- `2026-02-17 14:34 +04` Added dependencies for local driver support in runtime repo:
  - `pg` dependency
  - `@types/pg` dev dependency
- `2026-02-17 14:34 +04` Ran `pnpm install` and targeted lint (`lib/db.ts`, `app/api/stories/route.ts`) successfully.
- `2026-02-17 15:58 +04` Fixed style dropdown clipping in `components/landing/comic-creation-form.tsx`:
  - Dropdown now opens upward (`bottom-full`, `mb-2`) to avoid bottom-edge clipping near CTA area.
  - Added bounded menu viewport (`max-h-56`) with `overflow-y-auto` + `overscroll-contain` for scrollable style lists.
  - Increased desktop width (`sm:w-52`) for better label readability.
- `2026-02-17 15:58 +04` Synced dropdown fix to runtime repo (`Downloads`) and ran targeted lint successfully.
- `2026-02-19 09:57 +04` Improved Simple Mode Step 2 discoverability in `components/landing/comic-creation-form.tsx`:
  - Removed collapsed-only `More control` gate for visual step.
  - Made character upload + style controls visible by default under "Character images and style (Optional)".
  - Synced fix to runtime repo and validated with targeted lint.
- `2026-02-19 11:52 +04` Removed Labs mode from active UX and standardized product to Simple-only flow:
  - Deleted mode toggle from `components/landing/navbar.tsx`.
  - Removed GitHub/star button from navbar.
  - Forced `/` create page to Simple path (`isAdvancedMode=false`, guided simple enabled).
  - Removed right-side comic preview block that was Labs-only.
  - Removed editor mode toggle wiring (`components/editor/editor-toolbar.tsx`, `app/story/[storySlug]/story-editor-client.tsx`) and kept single-mode behavior.
- `2026-02-19 12:13 +04` Removed remaining Labs-facing copy and controls:
  - Updated create flow messaging to remove Labs references (`components/landing/comic-creation-form.tsx`).
  - Updated generate-page modal optional-controls toggle label from Labs wording to generic options (`components/editor/generate-page-modal.tsx`).
