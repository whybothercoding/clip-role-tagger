// Guards against shipping a .ablx built from a package.json/manifest.json
// pair whose versions have drifted apart — an easy mistake since nothing
// else forces them to move together. Runs before `npm run package` (via the
// `prepackage` npm lifecycle hook) and in CI.
import * as fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string };
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8")) as { version: string };

if (pkg.version !== manifest.version) {
  console.error(
    `tagit: version mismatch — package.json is "${pkg.version}", manifest.json is "${manifest.version}". Update manifest.json to match before packaging.`,
  );
  process.exit(1);
}

console.log(`tagit: package.json and manifest.json agree on version ${pkg.version}.`);
