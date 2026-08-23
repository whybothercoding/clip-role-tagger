// Pure name-formatting helpers, deliberately kept free of any
// @ableton-extensions/sdk import so they can be unit tested without the
// (unredistributable, license-restricted) SDK installed. extension.ts calls
// these and assigns the result onto a real Clip.

// Strips any previous "[TAG] " prefix this extension added — including tags
// no longer present in the current role list — so re-tagging always
// replaces cleanly instead of stacking ("[LEAD] [BASS] Groove 1").
export function withoutExistingTag(name: string): string {
  return name.replace(/^\[[A-Z0-9]+\] /, "");
}

export function buildTaggedName(currentName: string, tag: string): string {
  return `[${tag}] ${withoutExistingTag(currentName)}`;
}
