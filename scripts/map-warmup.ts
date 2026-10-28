// SPEC 1.12 (decision of Roberto, 28/10/2026): the files of the map carry a content hash in their name,
// so the build tells the page which ones they are, in a <meta> tag of index.html (it downloads nothing
// by itself). The page fetches them ahead of time (src/app/lib/map-warmup.ts).

const MAP_FILES = [
  /^assets\/maplibre-map-[^/]+\.js$/,
  /^assets\/maplibre-map-[^/]+\.css$/,
  /^assets\/maplibre-gl-worker-[^/]+\.mjs$/,
];

/** `/assets/…` paths of the map chunk, its stylesheet and its worker; none if the chunk is missing. */
export function mapWarmupPaths(fileNames: string[]): string[] {
  const found = MAP_FILES.map((re) => fileNames.find((name) => re.test(name)));
  const [chunk] = found;
  if (!chunk) return [];
  return found.filter((name): name is string => name !== undefined).map((name) => `/${name}`);
}

export function mapWarmupMeta(paths: string[]): string {
  return paths.length ? `<meta name="map-chunk" content="${paths.join(" ")}">` : "";
}
