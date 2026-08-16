# Clip Role Tagger

An [Ableton Live Extension](https://www.ableton.com/en/live/extensions/) that right-click-tags a clip (or a whole track at once) with a role — sets both the clip's color and name prefix in one click, e.g. `Groove 1` → `[BASS] Groove 1`, instead of the usual color-picker-then-rename dance.

## Install

Download the latest `.ablx` from [Releases](../../releases), then drag it into **Live → Settings → Extensions**. Requires Ableton Live 12 Beta (12.4.5+) with Extensions support.

## Menu actions

- **Right-click a clip** (Session or Arrangement view) → **"Clip Role Tagger: Tag as: \<role>"** — tags just that clip.
- **Right-click a track header** → **"Clip Role Tagger: Tag all clips as: \<role>"** — tags every clip on the track, Session and Arrangement view both, as one undoable step (`Cmd+Z` undoes the whole batch, not clip-by-clip).
- **Right-click a track header** → **"Configure Clip Role Tagger…"** — opens a settings dialog to add, edit, recolor, or remove roles. Changes apply immediately, no restart needed.

Re-tagging a clip replaces the old tag rather than stacking it. Roles ship with six defaults (Drums/Bass/Lead/Pad/FX/Vocal) but are fully customizable through the settings dialog — see `roles.example.json` for the underlying schema if you want to hand-edit the config file directly instead.

## Building from source

This repo does **not** include the Ableton Extensions SDK itself — its license prohibits redistributing it outside of a compiled application, so you need your own copy:

1. Join [Ableton's Beta Program](https://www.ableton.com/en/beta/) and download the Extensions SDK zip from Centercode.
2. Copy `ableton-extensions-sdk-1.0.0-beta.1.tgz` and `ableton-extensions-cli-1.0.0-beta.1.tgz` from that zip into a `vendor/` folder here (create it — it's gitignored).
3. `npm install`
4. `npm start` — builds and launches the Extension Host against `EXTENSION_HOST_PATH` in `.env` (create this too, e.g. `EXTENSION_HOST_PATH=/Applications/Ableton Live 12 Beta.app`). Requires Developer Mode enabled in Live → Settings → Extensions.
5. `npm run package` — production build + `.ablx` archive.

## Known limitations

- **The Extensions SDK beta has no context-menu grouping/submenu API.** Every installed extension's menu items land in the same flat right-click menu — this extension's items are prefixed `"Clip Role Tagger: ..."` so they stay identifiable once you have more than one extension installed.
- **Clip color encoding is unverified.** `Clip.color` is a packed `0xRRGGBB` integer, following the convention from Live's older Python Control Surface API — the beta SDK docs just say `number` without specifying the encoding.
- **This is a beta-SDK project.** Ableton's Extensions SDK is itself in public beta; behavior may change under future SDK versions.

## License

MIT for the code in this repository — see [LICENSE](LICENSE). Built against Ableton's Extensions SDK, which is separately licensed by Ableton AG and not redistributed here.
