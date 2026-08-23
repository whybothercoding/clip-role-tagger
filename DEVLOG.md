# Devlog

How TaGiT (released and developed as "Clip Role Tagger" through everything below, until the rename recorded near the end of this file) actually got built — including the parts that broke. Written as a record of real decisions and real bugs, not a highlight reel. Built with [Claude Code](https://claude.com/claude-code) as an agentic pair-programmer, working directly against a running Ableton Live 12 Beta instance the whole way.

## Why this extension, and why first

The goal going in wasn't "build a great extension" — it was "learn the Ableton Extensions SDK by building something real, safely." That constrained the choice: it had to touch the actual object model (not a toy), but be non-destructive if something went wrong. Tagging a clip's color and name fit — worst case of a bug is a mislabeled clip, not lost work.

Rejected up front: reskinning any of the SDK's own 7 official examples (`arrangementselection`, `audio-clips`, `context-menu`, `modal-dialog`, `progress-dialog`, `strip-silence`, `warpMode`). A reviewer familiar with the SDK spots a reskin instantly.

## v1: single-clip tagging

First pass: right-click a clip, pick a role (Drums/Bass/Lead/Pad/FX/Vocal) from a fixed list, it sets `clip.color` and prefixes `clip.name`. This is enough to exercise the core loop — `activate()`, `initialize()`, `registerCommand`, `registerContextMenuAction`, resolving a `Handle` back into a live object with `getObjectFromHandle`.

One real assumption baked in here, never fully verified: `Clip.color` is a packed `0xRRGGBB` integer. The SDK's own docs just say `color: number` — the packed-hex convention is carried over from Live's older Python Control Surface API, not confirmed for this beta's actual wire format. It visually worked in testing, which is the only verification I have.

## v2: batch tagging across a track

Asked: what does this actually save someone, beyond faster single-clip renaming? Answer: not much — so the next real step was tagging every clip on a track at once (Session slots and Arrangement clips both), triggered from the track header instead of a clip.

This is where `context.withinTransaction(...)` mattered for real, not academically: without it, tagging 12 clips creates 12 separate undo steps, and `Cmd+Z` only walks them back one at a time. Wrapping the batch mutation in a transaction makes the whole operation a single undo step — the difference between a tool that respects the user's undo history and one that quietly doesn't.

## v3: a settings UI, and the crash that came with it

Wanted role customization without hand-editing JSON. Built a webview-based settings dialog (`context.ui.showModalDialog`) backed by a `roles.json` config file in the extension's storage directory, with validation that degrades gracefully — a bad hex color falls back to gray with a logged warning, a missing label gets skipped, instead of taking the whole extension down over one typo.

First real bug, and it was a crash: saving a new role threw immediately —

```
Error: Command clip-role-tagger.tag-clip-drums is already registered.
```

`registerCommand` throws if called twice with the same ID, and — unlike context menu actions — commands have no unregister function. My first version of "apply the new role list" naively re-registered every command from scratch on every save. That's fine the first time and fatal every time after. The exception was thrown inside an `async` command callback the SDK doesn't await, so it became an unhandled rejection and killed the whole Node process running the extension host. Live doesn't get told when that process dies, so it kept showing menu items pointing at commands nothing was listening for anymore — clicking them silently did nothing, and only a full Live restart cleared the stale entries, since context menus are only rebuilt at launch.

The fix: separate "how many command slots exist" (a fixed, only-ever-growing pool, indexed by position) from "what does slot N currently do" (looked up from a mutable `currentRoles[i]` array at invocation time, not baked into the closure at registration). Growing the pool when a role is added never re-registers an existing ID. Menu *items*, which do support clean unregister, get freely torn down and rebuilt on every save.

## v3.1: two smaller, more honest bugs

**The native color picker glitched.** `<input type="color">` opens the OS-level color panel, a separate window — inside Live's embedded modal webview, it opened and immediately closed, likely a focus fight between two windows. Fix: dropped the native input entirely for a self-contained swatch-grid picker built from plain DOM/CSS, so there's no native window to lose focus to.

**Roles briefly disappeared after saving, no crash, no error logged.** Root cause, once I actually checked the mechanism instead of guessing: swapping the menu over on save did ~24-32 individual `await`ed round-trips to Live — unregister every old item one at a time, then register every new one, sequentially. If a right-click landed mid-sequence, the menu was caught in a state with old items already gone and new ones not registered yet. Fixed two ways: parallelized the round-trips with `Promise.all` instead of a sequential loop, and reordered so new menu items register *before* old ones are removed — worst case is a flicker of duplicate entries, never a gap with fewer than expected.

## The license catch, before anything went public

Before packaging for distribution, I read the actual Extensions SDK license instead of assuming. It explicitly prohibits redistributing the SDK itself "outside of your application" — meaning the vendor `.tgz` packages (`@ableton-extensions/sdk`, `@ableton-extensions/cli`) can't be committed to a public repo, even though bundling *compiled code* that uses them into your own application is explicitly permitted. That ruled out the "just commit `vendor/` so cloning works out of the box" convenience I'd planned — the repo now documents the SDK as a prerequisite readers get their own copy of from Ableton's Beta Program, matching the official project scaffolder's own `.gitignore` convention (which turned out to exist for exactly this reason, not just tidiness).

## Closing the color-encoding unknown

`Clip.color` as a packed `0xRRGGBB` integer was carried over from Live's older Python Control Surface API and never confirmed for this beta — flagged as an open unknown in every version of this file up to now. Closed it with a throwaway diagnostic command (right-click a clip → log `clip.color`, then delete the command) run against a live Ableton Live 12 Beta instance, checked two ways:

- A clip colored **natively in Live** (not by this extension) decoded to a plausible pastel blue-lavender as RRGGBB (`#92A7FF`); read the other way, as BBGGRR, the same bytes give a peach/salmon that doesn't match anything in Live's actual palette.
- A clip tagged **by this extension** with the `Drums` role (`color: "#FF764D"`) read back `clip.color` as exactly `0xFF764D` — the write survives untouched, with no palette-snapping to a different value.

Both checks agree: packed `0xRRGGBB`, confirmed, no snapping. The assumption was right, but "it visually worked in testing" (the v1 caveat) and "confirmed by reading the raw value back against a known write" are different claims — worth actually closing the gap instead of leaving it as a permanent asterisk.

## A wrong assumption from v1: manual menu-name prefixing was never needed

v1 assumed the beta SDK had no context-menu grouping, and manually prefixed every label with `"Clip Role Tagger: "` as a workaround — that assumption made it into the README as a documented limitation and was never actually tested against a live menu. Running against real Ableton Live 12 Beta showed the opposite: Live already groups every extension's context-menu items under its own name (from `manifest.json`), automatically. The manual prefix wasn't filling a gap, it was duplicating a heading Live was already adding — the menu read `"Clip Role Tagger: Clip Role Tagger: Bass"`.

Fix: dropped the manual prefix from every label (`"Tag as: Bass"`, `"Clear role"`, `"Configure…"`, etc.) and let Live's own grouping do the job. Same lesson as the color encoding above, really — an assumption that looked reasonable and went undocumented-as-unverified for an entire release, until it was actually checked against the real menu.

## Renamed: Clip Role Tagger → TaGiT

Even after dropping the manual prefix, the menu still read `"Clip Role Tagger: Tag as: Bass"` — Live's auto-added heading plus a verb-y label, three words of overhead before the actual role name. Shortened both ends: the extension itself is now named **TaGiT** (`manifest.json`), and the labels dropped their verbs too (`"Tag as: Bass"` → just `"Bass"`, `"Clear role"` → `"Clear"`). The menu now reads `"TaGiT: Bass"` — the whole point, since Live's own grouping already tells you it's a tagging action; the label just needs to say *what*.

One real consequence, not just cosmetic: `manifest.json`'s `name` field also names the `.ablx` file `ableton-extensions-cli package` produces. Future builds are `TaGiT-1.0.0.ablx`, not `Clip-Role-Tagger-1.0.0.ablx` — the already-published v1.0.0 GitHub release keeps its original filename; this only affects builds going forward. `package.json`'s npm-style identifier moved to `tagit` too, for internal consistency (it's never published to a registry, so no external consequence either way). Left alone on purpose: the GitHub repo slug (`clip-role-tagger`) — it's not user-facing, and it carries the existing history, stars, and any inbound links, including from the ablx.live listing.

## Settings dialog: contrast and layout, checked properly this time

The dark-mode palette had never been checked against an actual contrast ratio, only eyeballed. It failed: secondary/hint text at 41% lightness against a 21% window background works out to roughly 2.2:1 — WCAG AA wants 4.5:1 for normal text. Borders were worse, at 7% lightness against 12–21% backgrounds — close enough to invisible that buttons and fields had no visible edge at all. Fixed both by computing the actual numbers instead of guessing again: secondary text moved to 64% (comfortably clears 4.5:1 against every dark surface in the dialog), borders to 36%. Window/control/field backgrounds also got pulled further apart (13%/8% instead of 16%/12%) so controls read as distinct surfaces instead of blending into the window.

Two structural layout fixes alongside: the role list's own padding (0.25em) was thinner than its border-radius (4px), so content crowded the rounded corners unevenly — bumped to 0.5em. And the Export/Import panel's Load/Close buttons were stacked in their own row above Cancel/Save's row — merged them into one shared row (Load/Close left, Cancel/Save right, via `margin-left: auto` on the Cancel/Save group) so they don't eat an extra row of vertical space in a fixed 480×480 dialog.

## Menu items that moved position after the first save

"Clear"/"Clear (Track)"/"Configure…" showed at the bottom of the menu right after install — expected, they're registered after the first batch of role items. But after saving the settings dialog even once, they'd jump to show right under the "TaGiT" heading instead, ahead of every role. No crash, nothing logged — just items that didn't stay where they were.

Root cause: those three are registered exactly once, right after the *first* `registerRoleMenus` call, and never touched again for the rest of the session. Every subsequent save, though, calls `registerRoleMenus` again to rebuild the role items — and since Clear/Configure were never re-registered, that fresh batch always lands chronologically *after* them from that point on. First activation: [roles] → [Clear, Configure]. After any save: [Clear, Configure] → [fresh roles]. Whatever's rendering this menu evidently follows registration order, not some stable ID — so the same three items visibly swapped ends of the list depending on whether a save had happened yet.

Fix: register Clear/Configure *before* the initial role batch instead of after. They're still only registered once, still never touched again — but now every subsequent role rebuild (on every future save, forever) lands after them instead of before, which pins them at the top of the menu permanently instead of just for the first activation.

## What I'd flag to Ableton directly

- **No theme signal in `ExtensionContext.environment`.** Only `storageDirectory`, `tempDirectory`, `language` are exposed — nothing about Live's own light/dark or brightness setting. The settings dialog here follows the OS-level `prefers-color-scheme` media query instead, which is a reasonable fallback but isn't guaranteed to track Live's own internal theme.
- **The dev CLI's `--storage-directory` flag isn't optional in practice.** Without it, `context.environment.storageDirectory` comes back `undefined` during `npm start`, silently disabling any config persistence — easy to miss until you go looking for why a saved setting didn't stick.

## Publishing

Production build (`npm run build`) and the dev build aren't the same code path — minification is a real transformation, so it got tested against a live Extension Host before being trusted, not assumed safe. Packaged with `npm run package` into a `.ablx`, attached to a GitHub release, and listed on [ablx.live](https://ablx.live) — a small (as of this writing, ~30 extensions from a dozen authors), community-run, Ableton-unaffiliated catalog, not an official store. There isn't one yet.
