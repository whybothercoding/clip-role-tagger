import {
  initialize,
  Clip,
  Track,
  type ActivationContext,
  type ContextMenuScope,
  type ExtensionContext,
  type Handle,
} from "@ableton-extensions/sdk";
import { loadRoles, saveRoles, colorToHex, normalizeRoles, type Role } from "./roles.js";
import settingsDialogHtml from "./settings-dialog.html";

type Ctx = ExtensionContext<"1.0.0">;
type Unregister = () => Promise<void>;

// Live's classic packed-RGB clip color convention (0xRRGGBB), snapped to the
// nearest swatch in Live's fixed clip-color palette. Unverified against this
// beta's actual wire format — if colors land on the wrong swatch, log an
// existing clip's `color` first to see the real encoding.

// Strips any previous "[TAG] " prefix this extension added — including tags
// no longer present in the current role list — so re-tagging always
// replaces cleanly instead of stacking ("[LEAD] [BASS] Groove 1").
function withoutExistingTag(name: string): string {
  return name.replace(/^\[[A-Z0-9]+\] /, "");
}

function applyRole(clip: Clip<"1.0.0">, role: Role): void {
  clip.color = role.color;
  clip.name = `[${role.tag}] ${withoutExistingTag(clip.name)}`;
}

const CLIP_SCOPES: ContextMenuScope<"1.0.0">[] = ["MidiClip", "AudioClip"];
const TRACK_SCOPES: ContextMenuScope<"1.0.0">[] = ["MidiTrack", "AudioTrack"];

// `registerCommand` throws if called twice with the same ID, and commands
// (unlike context menu actions) have no unregister function — so command
// IDs are a fixed, growable pool of numbered slots, registered exactly
// once each. A slot's behavior is looked up from `currentRoles[i]` at
// invocation time, not baked into the closure at registration time — that's
// what lets the settings dialog change what a slot does without needing to
// re-register it. Menu *items* pointing at these slots still get freely
// torn down and rebuilt on every save, since that path does support a
// clean unregister.
let currentRoles: Role[] = [];
let registeredSlotCount = 0;

function ensureSlotsRegistered(context: Ctx, count: number): void {
  for (let i = registeredSlotCount; i < count; i++) {
    context.commands.registerCommand(`clip-role-tagger.tag-clip-slot-${i}`, (handle) => {
      const role = currentRoles[i];
      if (!role) return;
      const clip = context.getObjectFromHandle(handle as Handle, Clip);
      applyRole(clip, role);
    });

    context.commands.registerCommand(`clip-role-tagger.tag-track-slot-${i}`, (handle) => {
      const role = currentRoles[i];
      if (!role) return;
      const track = context.getObjectFromHandle(handle as Handle, Track);
      const clips = [
        ...track.clipSlots.map((slot) => slot.clip).filter((c): c is Clip<"1.0.0"> => c !== null),
        ...track.arrangementClips,
      ];
      if (clips.length === 0) return;
      context.withinTransaction(() => {
        for (const clip of clips) applyRole(clip, role);
      });
    });
  }
  registeredSlotCount = Math.max(registeredSlotCount, count);
}

async function registerRoleMenus(context: Ctx, roles: Role[]): Promise<Unregister[]> {
  const unregisterFns: Unregister[] = [];

  const registrations: Promise<Unregister>[] = [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    for (const scope of CLIP_SCOPES) {
      registrations.push(context.ui.registerContextMenuAction(scope, `Clip Role Tagger: Tag as: ${role.label}`, `clip-role-tagger.tag-clip-slot-${i}`));
    }
    for (const scope of TRACK_SCOPES) {
      registrations.push(context.ui.registerContextMenuAction(scope, `Clip Role Tagger: Tag all clips as: ${role.label}`, `clip-role-tagger.tag-track-slot-${i}`));
    }
  }
  unregisterFns.push(...(await Promise.all(registrations)));

  return unregisterFns;
}

export async function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  const storageDirectory = context.environment.storageDirectory;

  currentRoles = loadRoles(storageDirectory);
  if (currentRoles.length === 0) {
    console.error("clip-role-tagger: no valid roles loaded — check roles.json. No menu items registered.");
    return;
  }

  ensureSlotsRegistered(context, currentRoles.length);
  let menuUnregisterFns = await registerRoleMenus(context, currentRoles);

  // The "Configure..." entry itself is a fixed command, registered once,
  // separately from the numbered slots above.
  context.commands.registerCommand("clip-role-tagger.configure", async () => {
    const html = settingsDialogHtml.replace(
      "__INITIAL_ROLES__",
      JSON.stringify(currentRoles.map((r) => ({ label: r.label, tag: r.tag, color: colorToHex(r.color) }))).replace(/</g, "\\u003c"),
    );

    const resultJson = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 480, 480);
    const result = JSON.parse(resultJson) as { roles: { label: string; tag: string; color: string }[] | null };

    if (result.roles === null) return; // user cancelled

    const nextRoles = normalizeRoles(result.roles, "settings dialog");
    if (nextRoles.length === 0) {
      console.error("clip-role-tagger: settings dialog saved with no valid roles — keeping the previous set.");
      return;
    }

    if (storageDirectory) {
      saveRoles(storageDirectory, nextRoles);
    } else {
      console.error("clip-role-tagger: no storage directory available — new roles apply for this session only, they won't persist.");
    }

    ensureSlotsRegistered(context, nextRoles.length); // only registers newly-added indices, never re-registers existing ones

    // Register the new menu set BEFORE removing the old one, so there's
    // never a gap where the menu is missing entries — worst case is a
    // brief moment of duplicates, not missing roles.
    const oldUnregisterFns = menuUnregisterFns;
    menuUnregisterFns = await registerRoleMenus(context, nextRoles);
    currentRoles = nextRoles;
    await Promise.all(oldUnregisterFns.map((unregister) => unregister()));
  });

  for (const scope of TRACK_SCOPES) {
    await context.ui.registerContextMenuAction(scope, "Configure Clip Role Tagger…", "clip-role-tagger.configure");
  }
}
