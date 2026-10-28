import { describe, expect, it } from "vitest";
import { initialShellFiles } from "../../scripts/bundle-size.ts";

// Shell budget (SPEC 15, M5-16): what the visitor downloads on opening the app. A chunk loaded on
// request (admin, legal pages, search, the map) is not part of it.
const HTML = `<!doctype html><html><head>
<script src="/theme.js"></script>
<link rel="icon" href="/brand/favicon.svg">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" as="font" type="font/woff2" href="/fonts/a.woff2" crossorigin>
<script type="module" crossorigin src="/assets/index-A.js"></script>
<link rel="modulepreload" crossorigin href="/assets/shared-B.js">
<link rel="stylesheet" crossorigin href="/assets/index-C.css">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
</head></html>`;

const FILES: Record<string, string> = {
  "assets/index-A.js":
    'import{a as x}from"./shared-B.js";import"./side-D.js";const m=()=>import("./AdminPage-E.js");' +
    'const n=__vitePreload(()=>import("./maplibre-map-F.js"),__vite__mapDeps([0]));',
  "assets/shared-B.js": 'export{b as a}from"./deep-G.js";',
  "assets/side-D.js": "console.log(1)",
  "assets/deep-G.js": "export const b=1",
};
const read = (path: string) => FILES[path] ?? "";

describe("initialShellFiles", () => {
  it("counts the scripts and stylesheets of index.html and their static imports", () => {
    expect(initialShellFiles(HTML, read).sort()).toEqual(
      [
        "theme.js",
        "assets/index-A.js",
        "assets/shared-B.js",
        "assets/index-C.css",
        "assets/side-D.js",
        "assets/deep-G.js",
      ].sort(),
    );
  });

  it("leaves out what is loaded on request, icons, fonts, the manifest and other origins", () => {
    const files = initialShellFiles(HTML, read);
    for (const out of [
      "AdminPage-E",
      "maplibre-map-F",
      "favicon",
      "manifest",
      ".woff2",
      "turnstile",
    ])
      expect(files.some((f) => f.includes(out))).toBe(false);
  });

  it("counts a file once even if several files import it", () => {
    const html =
      '<script type="module" src="/assets/a.js"></script><link rel="modulepreload" href="/assets/b.js">';
    const files = initialShellFiles(html, (p) =>
      p === "assets/a.js" ? 'import"./b.js";import"./b.js"' : "",
    );
    expect(files).toEqual(["assets/a.js", "assets/b.js"]);
  });

  it("never counts MapLibre, even if the shell imported it statically", () => {
    const html = '<script type="module" src="/assets/a.js"></script>';
    expect(initialShellFiles(html, () => 'import"./maplibre-gl-X.js"')).toEqual(["assets/a.js"]);
  });

  it("does not count the map-chunk meta tag nor a prefetch hint (SPEC 1.12, MF-03)", () => {
    const html = HTML.replace(
      "</head>",
      '<meta name="map-chunk" content="/assets/maplibre-map-F.js">' +
        '<link rel="prefetch" as="script" href="/assets/AdminPage-E.js"></head>',
    );
    expect(initialShellFiles(html, read).sort()).toEqual(initialShellFiles(HTML, read).sort());
  });
});
