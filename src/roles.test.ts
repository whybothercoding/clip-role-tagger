import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { colorToHex, DEFAULT_ROLES, loadRoles, normalizeRoles, saveRoles } from "./roles.js";

function tempStorageDir(t: import("node:test").TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tagit-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("normalizeRoles skips entries with no label", () => {
  const roles = normalizeRoles([{ label: "Bass", color: "#5AA9E6" }, { color: "#FF0000" }], "test");
  assert.equal(roles.length, 1);
  assert.equal(roles[0].label, "Bass");
});

test("normalizeRoles rejects non-array input", () => {
  assert.deepEqual(normalizeRoles({ not: "an array" }, "test"), []);
  assert.deepEqual(normalizeRoles(null, "test"), []);
});

test("normalizeRoles derives an uppercase tag from the label when none is given", () => {
  const roles = normalizeRoles([{ label: "Sub Bass", color: "#5AA9E6" }], "test");
  assert.equal(roles[0].tag, "SUBBASS");
});

test("normalizeRoles skips later entries whose tag duplicates an earlier one", () => {
  const roles = normalizeRoles(
    [
      { label: "Bass", tag: "LOW", color: "#5AA9E6" },
      { label: "Sub", tag: "LOW", color: "#FF0000" },
    ],
    "test",
  );
  assert.equal(roles.length, 1);
  assert.equal(roles[0].label, "Bass");
});

test("normalizeRoles falls back to gray for an unparseable color instead of dropping the role", () => {
  const roles = normalizeRoles([{ label: "Bass", color: "not-a-color" }], "test");
  assert.equal(roles.length, 1);
  assert.equal(roles[0].color, 0x888888);
});

test("colorToHex round-trips a packed color back to its hex string", () => {
  assert.equal(colorToHex(0xff764d), "#FF764D");
});

test("loadRoles seeds roles.json with the defaults on first run", (t) => {
  const dir = tempStorageDir(t);
  const roles = loadRoles(dir);

  assert.equal(roles.length, DEFAULT_ROLES.length);
  assert.ok(fs.existsSync(path.join(dir, "roles.json")));
});

test("saveRoles then loadRoles round-trips the saved roles", (t) => {
  const dir = tempStorageDir(t);
  const initial = loadRoles(dir);

  const customized = normalizeRoles([{ label: "Guitar", tag: "GTR", color: "#8AC926" }], "test");
  saveRoles(dir, customized);

  const reloaded = loadRoles(dir);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].label, "Guitar");
  assert.equal(reloaded[0].tag, "GTR");
  assert.equal(colorToHex(reloaded[0].color), "#8AC926");
  assert.notEqual(reloaded.length, initial.length);
});

test("loadRoles falls back to defaults, without throwing, when roles.json is invalid JSON", (t) => {
  const dir = tempStorageDir(t);
  fs.writeFileSync(path.join(dir, "roles.json"), "{ not valid json");

  const roles = loadRoles(dir);
  assert.equal(roles.length, DEFAULT_ROLES.length);
});

test("loadRoles falls back to in-memory defaults when no storage directory is available", () => {
  const roles = loadRoles(undefined);
  assert.equal(roles.length, DEFAULT_ROLES.length);
});
