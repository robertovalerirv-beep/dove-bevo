// Which built files make the initial shell (SPEC 15, M5-16): the scripts and stylesheets index.html
// loads, and what they import statically. Chunks behind import() load on request (admin, legal pages,
// search, the map) and MapLibre is excluded by the SPEC; icons, fonts and the manifest are not code.

const SCRIPT = /<script\b[^>]*\bsrc="(\/[^"]+)"/g;
const LINK = /<link\b[^>]*>/g;
const CODE_LINK = /\brel="(stylesheet|modulepreload)"/;
const HREF = /\bhref="(\/[^"]+)"/;
/** `import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`; never `import("./x.js")`. */
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["'](\.\/[^"']+\.js)["']/g;

const isMapLibre = (path: string) => path.includes("maplibre");

/** Paths relative to the build root (no leading slash), each once. */
export function initialShellFiles(html: string, read: (path: string) => string): string[] {
  const roots = [...html.matchAll(SCRIPT)].map((m) => m[1] ?? "");
  for (const [tag] of html.matchAll(LINK))
    if (CODE_LINK.test(tag)) roots.push(HREF.exec(tag)?.[1] ?? "");

  const seen = new Set<string>();
  const visit = (path: string) => {
    if (!path || seen.has(path) || isMapLibre(path)) return;
    seen.add(path);
    if (!path.endsWith(".js")) return;
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    for (const m of read(path).matchAll(STATIC_IMPORT)) visit(dir + (m[1] ?? "").slice(2));
  };
  for (const root of roots) visit(root.slice(1));
  return [...seen];
}
