# Devlog

How Clip Role Tagger actually got built — including the parts that broke. Written as a record of real decisions and real bugs, not a highlight reel. Built with [Claude Code](https://claude.com/claude-code) as an agentic pair-programmer, working directly against a running Ableton Live 12 Beta instance the whole way.

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

## What I'd flag to Ableton directly

- **No context-menu grouping or submenu API in this beta.** Every installed extension's items land in one flat right-click menu. The only current mitigation is a naming convention (`"Clip Role Tagger: ..."` prefixes), not a platform feature.
- **No theme signal in `ExtensionContext.environment`.** Only `storageDirectory`, `tempDirectory`, `language` are exposed — nothing about Live's own light/dark or brightness setting. The settings dialog here follows the OS-level `prefers-color-scheme` media query instead, which is a reasonable fallback but isn't guaranteed to track Live's own internal theme.
- **The dev CLI's `--storage-directory` flag isn't optional in practice.** Without it, `context.environment.storageDirectory` comes back `undefined` during `npm start`, silently disabling any config persistence — easy to miss until you go looking for why a saved setting didn't stick.

## Publishing

Production build (`npm run build`) and the dev build aren't the same code path — minification is a real transformation, so it got tested against a live Extension Host before being trusted, not assumed safe. Packaged with `npm run package` into a `.ablx`, attached to a GitHub release, and listed on [ablx.live](https://ablx.live) — a small (as of this writing, ~30 extensions from a dozen authors), community-run, Ableton-unaffiliated catalog, not an official store. There isn't one yet.
