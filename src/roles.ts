import * as fs from "node:fs";
import * as path from "node:path";

export interface Role {
  label: string;
  tag: string;
  color: number; // packed 0xRRGGBB
}

// Seeded into roles.json on first run. Users edit that file to customize —
// see roles.example.json at the project root for the schema. Also the
// fallback set shown in the settings dialog when a config can't be read.
export const DEFAULT_ROLES: { label: string; tag?: string; color: string }[] = [
  { label: "Drums", tag: "DRUMS", color: "#FF764D" },
  { label: "Bass", tag: "BASS", color: "#5AA9E6" },
  { label: "Lead", tag: "LEAD", color: "#F2E94E" },
  { label: "Pad", tag: "PAD", color: "#9B5DE5" },
  { label: "FX", tag: "FX", color: "#2EC4B6" },
  { label: "Vocal", tag: "VOCAL", color: "#FF5D8F" },
];

function deriveTag(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "ROLE";
}

function parseColor(hex: string): number {
  const value = parseInt(hex.trim().replace(/^#/, ""), 16);
  if (Number.isNaN(value)) {
    throw new Error(`invalid color "${hex}" — expected a hex string like "#FF764D"`);
  }
  return value;
}

export function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
}

// Validates and cleans a raw list of role-like objects, whether it came from
// roles.json on disk or from the settings dialog's Save button. Bad entries
// are logged (tagged with `source` so the message says where to look) and
// skipped rather than throwing — one bad entry shouldn't take the rest down.
export function normalizeRoles(rawEntries: unknown, source: string): Role[] {
  if (!Array.isArray(rawEntries)) {
    console.error(`clip-role-tagger: ${source} must be an array, got ${typeof rawEntries}.`);
    return [];
  }

  const roles: Role[] = [];
  const seenTags = new Set<string>();

  for (const entry of rawEntries as Record<string, unknown>[]) {
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label) {
      console.error(`clip-role-tagger: skipping ${source} entry with no "label": ${JSON.stringify(entry)}`);
      continue;
    }

    const tag = (typeof entry.tag === "string" && entry.tag.trim() ? entry.tag.trim() : deriveTag(label)).toUpperCase();
    if (seenTags.has(tag)) {
      console.error(`clip-role-tagger: skipping "${label}" (${source}) — duplicate tag "${tag}".`);
      continue;
    }

    let color: number;
    try {
      color = parseColor(typeof entry.color === "string" ? entry.color : "#888888");
    } catch (err) {
      console.error(`clip-role-tagger: ${label} (${source}) — ${err instanceof Error ? err.message : err}. Using gray.`);
      color = 0x888888;
    }

    seenTags.add(tag);
    roles.push({ label, tag, color });
  }

  return roles;
}

function configPath(storageDirectory: string): string {
  return path.join(storageDirectory, "roles.json");
}

// Reads roles.json from the extension's storage directory, seeding it with
// DEFAULT_ROLES on first run. Falls back to in-memory defaults (no
// persistence) if no storage directory is available at all.
export function loadRoles(storageDirectory: string | undefined): Role[] {
  if (!storageDirectory) {
    console.error("clip-role-tagger: no storage directory available from this host — using built-in defaults, customization is unavailable this session.");
    return normalizeRoles(DEFAULT_ROLES, "built-in defaults");
  }

  const file = configPath(storageDirectory);

  if (!fs.existsSync(file)) {
    fs.mkdirSync(storageDirectory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(DEFAULT_ROLES, null, 2));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`clip-role-tagger: ${file} is invalid JSON, using built-in defaults. ${err}`);
    parsed = DEFAULT_ROLES;
  }

  const roles = normalizeRoles(parsed, file);
  return roles.length > 0 ? roles : normalizeRoles(DEFAULT_ROLES, "built-in defaults");
}

// Writes roles back to roles.json as human-editable hex colors. Throws if
// there's no storage directory — callers must check before offering Save.
export function saveRoles(storageDirectory: string, roles: Role[]): void {
  const file = configPath(storageDirectory);
  const serializable = roles.map((r) => ({ label: r.label, tag: r.tag, color: colorToHex(r.color) }));
  fs.mkdirSync(storageDirectory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(serializable, null, 2));
}
