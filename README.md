# TaGiT

[![CI](https://github.com/whybothercoding/clip-role-tagger/actions/workflows/ci.yml/badge.svg)](https://github.com/whybothercoding/clip-role-tagger/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An [Ableton Live Extension](https://www.ableton.com/en/live/extensions/) that right-click-tags a clip (or a whole track at once) with a role — sets both the clip's color and name prefix in one click, e.g. `Groove 1` → `[BASS] Groove 1`, instead of the usual color-picker-then-rename dance.

*(Formerly "Clip Role Tagger" — renamed to keep Live's auto-grouped menu heading short; the repo slug is unchanged. See [CHANGELOG.md](CHANGELOG.md).)*

See [DEVLOG.md](DEVLOG.md) for how this was actually built — including a process-killing crash, a native-picker glitch, and a license catch made before anything went public. See [CHANGELOG.md](CHANGELOG.md) for what shipped when.

## Install

Download the latest `.ablx` from [Releases](../../releases), then drag it into **Live → Settings → Extensions**. Requires Ableton Live 12 Beta (12.4.5+) with Extensions support.

## Menu actions

Live groups each extension's items under its own name automatically, so these show up in the right-click menu under a **"TaGiT"** heading:

- **Right-click a clip** (Session or Arrangement view) → **"\<role>"** (e.g. `"TaGiT: Bass"`) — tags just that clip.
- **Right-click a track header** → **"\<role> (Track)"** (e.g. `"TaGiT: Bass (Track)"`) — tags every clip on the track, Session and Arrangement view both, as one undoable step (`Cmd+Z` undoes the whole batch, not clip-by-clip).
- **Right-click a clip** → **"Clear"** — strips the `[TAG]` prefix back off. Color is left as-is; there's no "no color" clip state to revert to.
- **Right-click a track header** → **"Clear (Track)"** — same, for every clip on the track, as one undoable step.
- **Right-click a track header** → **"Configure…"** — opens a settings dialog to add, edit, recolor, or remove roles. Changes apply immediately, no restart needed. Includes Export/Import (copy-paste JSON, no native file dialog) for moving a role set between machines or sharing one with someone else.

Re-tagging a clip replaces the old tag rather than stacking it. Roles ship with six defaults (Drums/Bass/Lead/Pad/FX/Vocal) but are fully customizable through the settings dialog — see `roles.example.json` for the underlying schema if you want to hand-edit the config file directly instead.

## Building from source

This repo does **not** include the Ableton Extensions SDK itself — its license prohibits redistributing it outside of a compiled application, so you need your own copy:

1. Join [Ableton's Beta Program](https://www.ableton.com/en/beta/) and download the Extensions SDK zip from Centercode.
2. Copy `ableton-extensions-sdk-1.0.0-beta.1.tgz` and `ableton-extensions-cli-1.0.0-beta.1.tgz` from that zip into a `vendor/` folder here (create it — it's gitignored).
3. `npm install`
4. `npm start` — builds and launches the Extension Host against `EXTENSION_HOST_PATH` in `.env` (create this too, e.g. `EXTENSION_HOST_PATH=/Applications/Ableton Live 12 Beta.app`). Requires Developer Mode enabled in Live → Settings → Extensions.
5. `npm run package` — production build + `.ablx` archive.

## Development

The extraction described in [DEVLOG.md](DEVLOG.md) v3/v3.1 pulled the two invariants behind those bugs — never re-register a command slot, always register a new context-menu set before tearing down the old one — out of `extension.ts` into standalone modules (`src/registration.ts`, `src/tag-format.ts`) that don't import `@ableton-extensions/sdk` at all. That's what makes the commands below possible without the (unredistributable, beta-gated) SDK installed:

- `npm test` — unit tests (Node's built-in `node:test`, run via `tsx`; no separate test-runner dependency), including regression tests named after those two incidents.
- `npm run lint` — [Biome](https://biomejs.dev), lint + format check. `npm run lint:fix` applies safe fixes.
- `npm run ci` — everything CI runs: lint, a typecheck scoped to the SDK-free modules (`tsconfig.ci.json`), tests, and the `package.json`/`manifest.json` version-consistency check.

CI (`.github/workflows/ci.yml`) runs `npm run ci` on every push and PR — but, for the same SDK-redistribution reason `vendor/` is gitignored, it can't install `@ableton-extensions/sdk` and so can't typecheck `extension.ts` itself or produce a `.ablx`. That part only a full local build (above), by someone with their own SDK copy, can verify.

## Known limitations

- **This is a beta-SDK project.** Ableton's Extensions SDK is itself in public beta; behavior may change under future SDK versions.

## License

MIT for the code in this repository — see [LICENSE](LICENSE). Built against Ableton's Extensions SDK, which is separately licensed by Ableton AG and not redistributed here.
