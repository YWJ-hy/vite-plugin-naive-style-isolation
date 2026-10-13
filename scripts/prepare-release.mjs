import fs from "node:fs";
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const response = await fetch(`https://registry.npmjs.org/${manifest.name}`);
if (!response.ok && response.status !== 404) {
  throw new Error(`Cannot read npm versions: HTTP ${response.status}`);
}
const registry = response.ok ? await response.json() : { versions: {} };
const latest = registry["dist-tags"]?.latest;
const releasePaths = ["src", "dist", "scripts", "tests", "package.json", "package-lock.json",
  "tsconfig.json", "tsconfig.build.json", "vitest.config.ts", ".npmrc", ".github/workflows"];

let release = true;
if (registry.versions[manifest.version]) {
  if (latest !== manifest.version) {
    throw new Error(`Local version ${manifest.version} is not npm latest ${latest}`);
  }
  // Missing tags fail closed; never guess which source was last published.
  git("rev-parse", "--verify", `refs/tags/v${latest}`);
  const changed = git("diff", "--name-only", `v${latest}`, "HEAD", "--", ...releasePaths);
  release = Boolean(changed);
  if (release) {
    const parts = manifest.version.split(".").map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isSafeInteger(part))) {
      throw new Error("Automatic releases require a stable x.y.z version");
    }
    parts[2] += 1;
    manifest.version = parts.join(".");
    fs.writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    lock.version = manifest.version;
    lock.packages[""].version = manifest.version;
    fs.writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
    const notes = git("log", "--format=- %s", `v${latest}..HEAD`, "--", ...releasePaths);
    const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
    const headingEnd = changelog.indexOf("\n");
    fs.writeFileSync("CHANGELOG.md", `${changelog.slice(0, headingEnd)}\n\n## ${manifest.version} - ${new Date().toISOString().slice(0, 10)}\n\n${notes}\n${changelog.slice(headingEnd)}`);
  }
}
const output = `release=${release}\nversion=${manifest.version}\n`;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
console.log(output);
