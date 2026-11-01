import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { build } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = path.resolve(here, "../..");
const client = path.join(repo, "dist/client");
function snapshot(directory, prefix = "") {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory())
      for (const [name, hash] of snapshot(path.join(directory, entry.name), `${key}/`))
        files.set(name, hash);
    else
      files.set(
        key,
        createHash("sha256")
          .update(readFileSync(path.join(directory, entry.name)))
          .digest("hex"),
      );
  }
  return files;
}
if (!existsSync(path.join(client, "index.html")))
  throw new Error("Build the existing website before staging its app-only assets");
const before = snapshot(client);
await build({ configFile: path.join(here, "vite.config.mjs") });
const output = path.join(here, ".build/client");
mkdirSync(path.join(client, "mobile"), { recursive: true });
cpSync(path.join(output, "index.html"), path.join(client, "mobile/index.html"));
mkdirSync(path.join(client, "assets/mobile"), { recursive: true });
cpSync(path.join(output, "assets/mobile"), path.join(client, "assets/mobile"), { recursive: true });
for (const [name, hash] of before) {
  if (name.startsWith("mobile/") || name.startsWith("assets/mobile/")) continue;
  if (
    createHash("sha256")
      .update(readFileSync(path.join(client, name)))
      .digest("hex") !== hash
  )
    throw new Error("App asset staging altered an existing website artifact");
}
console.log("App-only HTTPS assets staged; every existing website artifact is unchanged.");
