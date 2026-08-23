# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). See [DEVLOG.md](DEVLOG.md) for the narrative behind these changes — how they were actually built, including what broke along the way.

## [Unreleased]

### Added
- "Clear role" context menu action — right-click a clip to strip its `[TAG]` prefix, or a track header to clear it from every clip on that track in one undoable step. Color is left untouched: Live has no "no color" clip state to revert to, and guessing a replacement would clobber any manual recoloring done after tagging.
- Export/import for roles in the settings dialog: a read-only textarea to copy the current roles as JSON, and a paste-and-load panel to bring a set back in — no native file picker involved, since that class of dialog previously fought Live's embedded webview for focus (see v3.1 below).
- Unit tests (Node's built-in `node:test`, run via the already-installed `tsx` — no new test-runner dependency) covering role validation/persistence and, specifically, regression tests for the two production incidents from v3/v3.1 below.
- CI (GitHub Actions) running lint, typecheck, and tests on every push and PR, scoped to the SDK-free modules — the actual `@ableton-extensions/sdk`-dependent build still requires a local copy of the (license-restricted, unredistributable) beta SDK.
- Biome for linting and formatting.
- A version-consistency check (`package.json` vs `manifest.json`) run before packaging and in CI.
- Dependabot for devDependency and GitHub Actions updates.

### Changed
- Extracted the pure name-formatting logic and the two hard-won registration invariants (see v3/v3.1 below) out of `extension.ts` into standalone, SDK-free modules (`tag-format.ts`, `registration.ts`) so they can be unit tested without the Ableton Extensions SDK installed.
- **Renamed Clip Role Tagger → TaGiT** (`manifest.json`), and dropped the verbs from every menu label (`"Tag as: Bass"` → `"Bass"`, `"Clear role"` → `"Clear"`, etc.) — combined with Live's automatic menu grouping (below), the right-click menu now reads `"TaGiT: Bass"` instead of `"Clip Role Tagger: Tag as: Bass"`. `package.json`'s identifier moved to `tagit` for consistency; the GitHub repo slug is unchanged. See DEVLOG.md. Future `.ablx` builds are named `TaGiT-1.0.0.ablx` — the published v1.0.0 release keeps its original filename.
- Settings dialog: reworked dark-mode contrast (secondary/hint text, borders, and the window/control/field surfaces were all too close together — see Fixed below), gave the role list more breathing room from its own border, and merged the Export/Import Load/Close buttons onto the same row as Cancel/Save (left- vs. right-aligned) instead of stacking as two separate rows.

### Fixed
- Confirmed, via a live Ableton Live 12 Beta instance, that `Clip.color` is a packed `0xRRGGBB` integer with no palette-snapping on write — previously an unverified assumption flagged in every prior version of this file and in the README. See DEVLOG.md.
- Removed the manual `"Clip Role Tagger: "` prefix from every menu label. Live already groups each extension's context-menu items under its own name automatically — the manual prefix was duplicating that heading, showing as `"Clip Role Tagger: Clip Role Tagger: Bass"`. See DEVLOG.md.
- Settings dialog dark mode: secondary/hint text was ~2.2:1 contrast against the window background (WCAG AA needs 4.5:1), and borders were nearly invisible (7% lightness against a 12–21% background). Both corrected; see DEVLOG.md for the exact values.
- **"Clear"/"Clear (Track)"/"Configure…" changed position after the first settings-dialog save** — they showed at the bottom of the menu on first load, then jumped to appear right after the heading on any subsequent save. Root cause: they were registered once, right after the *first* role-menu batch, and never touched again — but every save re-registers a fresh role-menu batch that always lands chronologically after them, flipping their apparent position. Fixed by registering them *before* any role items, so every later rebuild lands after them instead. See DEVLOG.md.

## [1.0.0] - 2026-08-16

Initial release.

### Added
- Right-click a clip → tag it with a role, setting both `clip.color` and a `[TAG]` name prefix in one action. Re-tagging replaces the previous tag rather than stacking it.
- Right-click a track header → tag every clip on that track (Session and Arrangement view both) as one undoable step.
- Settings dialog (right-click a track header → "Configure Clip Role Tagger…") to add, edit, recolor, or remove roles, backed by a `roles.json` config file. Changes apply immediately, no restart needed.
- Six default roles: Drums, Bass, Lead, Pad, FX, Vocal.

### Fixed (during development, before this release — see DEVLOG.md)
- **v3 crash:** saving a new role in the settings dialog threw `Command ... is already registered` and silently killed the extension host process, since `registerCommand` throws on a duplicate ID and commands have no unregister. Fixed by separating "how many command slots exist" (a fixed, only-ever-growing pool) from "what a slot currently does" (looked up at invocation time).
- **v3 glitch:** the native `<input type="color">` picker opened and immediately closed inside Live's embedded modal webview — a focus fight between two windows. Replaced with a self-contained swatch-grid picker built from plain DOM/CSS.
- **v3.1 bug:** roles briefly disappeared after saving, with no error logged — a sequential unregister-then-register loop left a window where a right-click could land on neither the old nor the new menu. Fixed by parallelizing the round-trips and registering the new menu set before removing the old one.
