import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CLAUDE.md and SPEC 8: a migration already on `main` is never changed, only new ones are added
// (MD-01). CI checks out the whole history (fetch-depth 0), so origin/main is there to compare with.
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });
const onMain = git("ls-tree", "--name-only", "origin/main", "migrations/")
  .split("\n")
  .filter((path) => path.endsWith(".sql"));

describe("migrations already on main", () => {
  it("are all still here", () => {
    const here = readdirSync("migrations").map((name) => `migrations/${name}`);
    expect(onMain.length).toBeGreaterThan(0);
    expect(here).toEqual(expect.arrayContaining(onMain));
  });

  it.each(onMain)("%s is byte for byte the one on main", (path) => {
    expect(readFileSync(path, "utf8")).toBe(git("show", `origin/main:${path}`));
  });
});
