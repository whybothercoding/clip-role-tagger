import { type ActivationContext, Clip, type ContextMenuScope, type ExtensionContext, type Handle, initialize, Track } from "@ableton-extensions/sdk";
import { ensureSlots, swapRegistrations } from "./registration.js";
import { colorToHex, loadRoles, normalizeRoles, type Role, saveRoles } from "./roles.js";
import settingsDialogHtml from "./settings-dialog.html";
import { buildTaggedName, withoutExistingTag } from "./tag-format.js";

type Ctx = ExtensionContext<"1.0.0">;
type Unregister = () => Promise<void>;

// Clip.color is a packed 0xRRGGBB integer — confirmed against a running
// Live 12 Beta instance (see DEVLOG.md): a role's declared hex color
// round-trips through clip.color exactly, and a clip colored natively in
// Live decodes to a plausible RGB (not to nonsense under a reversed byte
// order). No snapping to a different palette value observed either.

function applyRole(clip: Clip<"1.0.0">, role: Role): void {
  clip.color = role.color;
  clip.name = buildTaggedName(clip.name, role.tag);
}

// Live has no "no color" clip state to revert to, so clearing a role only
// strips the name prefix — guessing a replacement color would silently
// clobber any manual recoloring the user did after tagging.
function clearRole(clip: Clip<"1.0.0">): void {
  clip.name = withoutExistingTag(clip.name);
}

function clipsOnTrack(track: Track<"1.0.0">): Clip<"1.0.0">[] {
  return [...track.clipSlots.map((slot) => slot.clip).filter((c): c is Clip<"1.0.0"> => c !== null), ...track.arrangementClips];
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
const slotState = { registeredCount: 0 };

function ensureSlotsRegistered(context: Ctx, count: number): void {
  ensureSlots(count, slotState, (i) => {
    context.commands.registerCommand(`tagit.tag-clip-slot-${i}`, (handle) => {
      const role = currentRoles[i];
      if (!role) return;
      const clip = context.getObjectFromHandle(handle as Handle, Clip);
      applyRole(clip, role);
    });

    context.commands.registerCommand(`tagit.tag-track-slot-${i}`, (handle) => {
      const role = currentRoles[i];
      if (!role) return;
      const track = context.getObjectFromHandle(handle as Handle, Track);
      const clips = clipsOnTrack(track);
      if (clips.length === 0) return;
      context.withinTransaction(() => {
        for (const clip of clips) applyRole(clip, role);
      });
    });
  });
}

async function registerRoleMenus(context: Ctx, roles: Role[]): Promise<Unregister[]> {
  const unregisterFns: Unregister[] = [];

  const registrations: Promise<Unregister>[] = [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    for (const scope of CLIP_SCOPES) {
      registrations.push(context.ui.registerContextMenuAction(scope, role.label, `tagit.tag-clip-slot-${i}`));
    }
    for (const scope of TRACK_SCOPES) {
      registrations.push(context.ui.registerContextMenuAction(scope, `${role.label} (Track)`, `tagit.tag-track-slot-${i}`));
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
    console.error("tagit: no valid roles loaded — check roles.json. No menu items registered.");
    return;
  }

  let menuUnregisterFns: Unregister[] = [];

  // Clear/Configure are registered once, here, before any role menu items —
  // and never re-registered afterward. That's what pins them at the top of
  // the menu permanently. Every settings-dialog save re-registers the role
  // items fresh (see swapRegistrations below); if Clear/Configure were
  // registered AFTER the initial role batch instead, the very first save
  // would push that fresh batch ahead of them chronologically, flipping
  // their apparent menu position from last to second.
  context.commands.registerCommand("tagit.clear-clip", (handle) => {
    const clip = context.getObjectFromHandle(handle as Handle, Clip);
    clearRole(clip);
  });

  context.commands.registerCommand("tagit.clear-track", (handle) => {
    const track = context.getObjectFromHandle(handle as Handle, Track);
    const clips = clipsOnTrack(track);
    if (clips.length === 0) return;
    context.withinTransaction(() => {
      for (const clip of clips) clearRole(clip);
    });
  });

  context.commands.registerCommand("tagit.configure", async () => {
    const html = settingsDialogHtml.replace(
      "__INITIAL_ROLES__",
      JSON.stringify(currentRoles.map((r) => ({ label: r.label, tag: r.tag, color: colorToHex(r.color) }))).replace(/</g, "\\u003c"),
    );

    const resultJson = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 480, 480);
    const result = JSON.parse(resultJson) as { roles: { label: string; tag: string; color: string }[] | null };

    if (result.roles === null) return; // user cancelled

    const nextRoles = normalizeRoles(result.roles, "settings dialog");
    if (nextRoles.length === 0) {
      console.error("tagit: settings dialog saved with no valid roles — keeping the previous set.");
      return;
    }

    if (storageDirectory) {
      saveRoles(storageDirectory, nextRoles);
    } else {
      console.error("tagit: no storage directory available — new roles apply for this session only, they won't persist.");
    }

    ensureSlotsRegistered(context, nextRoles.length); // only registers newly-added indices, never re-registers existing ones

    // Register the new menu set BEFORE removing the old one, so there's
    // never a gap where the menu is missing entries — worst case is a
    // brief moment of duplicates, not missing roles.
    menuUnregisterFns = await swapRegistrations(
      () => registerRoleMenus(context, nextRoles),
      menuUnregisterFns,
      (unregister) => unregister(),
      () => {
        currentRoles = nextRoles;
      },
    );
  });

  for (const scope of CLIP_SCOPES) {
    await context.ui.registerContextMenuAction(scope, "Clear", "tagit.clear-clip");
  }
  for (const scope of TRACK_SCOPES) {
    await context.ui.registerContextMenuAction(scope, "Clear (Track)", "tagit.clear-track");
    await context.ui.registerContextMenuAction(scope, "Configure…", "tagit.configure");
  }

  ensureSlotsRegistered(context, currentRoles.length);
  menuUnregisterFns = await registerRoleMenus(context, currentRoles);
}
