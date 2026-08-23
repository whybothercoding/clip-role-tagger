import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaggedName, withoutExistingTag } from "./tag-format.js";

test("withoutExistingTag strips a single existing tag prefix", () => {
  assert.equal(withoutExistingTag("[BASS] Groove 1"), "Groove 1");
});

test("withoutExistingTag leaves an untagged name unchanged", () => {
  assert.equal(withoutExistingTag("Groove 1"), "Groove 1");
});

test("withoutExistingTag ignores bracketed text that isn't a tag prefix (lowercase, mid-string)", () => {
  assert.equal(withoutExistingTag("Groove [loop] 1"), "Groove [loop] 1");
});

test("buildTaggedName replaces an existing tag instead of stacking (DEVLOG v1 regression)", () => {
  // The exact failure mode called out in DEVLOG.md: re-tagging a clip that
  // already carries "[LEAD]" with a different role must not produce
  // "[BASS] [LEAD] Groove 1".
  const tagged = buildTaggedName("[LEAD] Groove 1", "BASS");
  assert.equal(tagged, "[BASS] Groove 1");
  assert.doesNotMatch(tagged, /\[LEAD\]/);
});

test("buildTaggedName is idempotent when re-applying the same tag", () => {
  const once = buildTaggedName("Groove 1", "DRUMS");
  const twice = buildTaggedName(once, "DRUMS");
  assert.equal(once, twice);
});

test("buildTaggedName strips a tag no longer present in the current role list", () => {
  // A role can be deleted from the settings dialog after clips were already
  // tagged with it; re-tagging with a surviving role must still replace
  // cleanly rather than stacking an orphaned tag.
  assert.equal(buildTaggedName("[RETIRED] Groove 1", "BASS"), "[BASS] Groove 1");
});
