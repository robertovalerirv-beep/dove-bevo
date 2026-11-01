import { createHash } from "node:crypto";
import ts from "typescript";
/* global structuredClone */

const PINS = {
  app: "cc3f56414aa3d123d94604a3aca1bba37b17b4c0cf3e6761c0b2664cef6262df",
  map: "98326334f1a2ec4b03d37e57423bbec655aaed24332a80325cdaec75db810c57",
};
const normalized = (source) => source.replaceAll("\r\n", "\n");
function pinned(source, name) {
  const value = normalized(source);
  if (createHash("sha256").update(value).digest("hex") !== PINS[name])
    throw new Error(`Review updated website ${name} source before rebuilding the app presentation`);
  return value;
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("App presentation seam changed");
  return source.replace(before, after);
}

/** Compile-time presentation/route seams only; no runtime history monkey-patch. */
export function transformApp(source) {
  let result = pinned(source, "app");
  result = once(result, ".exec(location.pathname)", ".exec(mobilePath(location))");
  result = once(
    result,
    'history.pushState({ inApp: true }, "", path)',
    'history.pushState({ inApp: true }, "", mobileURL(path))',
  );
  result = once(
    result,
    'history.replaceState(null, "", "/")',
    'history.replaceState(null, "", mobileURL("/"))',
  );
  result = once(
    result,
    "useState<string[]>([DEFAULT_DRINK])",
    "useState<string[]>([mobileDefaultDrink(DEFAULT_DRINK)])",
  );
  return 'import { mobilePath, mobileURL, mobileDefaultDrink } from "@mobile/routes";\n' + result;
}

export function transformMap(source, styleURLExpression) {
  let result = pinned(source, "map");
  const tree = ts.createSourceFile(
    "map.ts",
    result,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "pinImage",
  );
  if (!declaration?.body) throw new Error("Price pin seam changed");
  result =
    result.slice(0, declaration.body.getStart(tree)) +
    "{ return mobilePinImage(tier, stale, label); }" +
    result.slice(declaration.body.end);
  result = once(result, "MAP_STYLES[theme()]", styleURLExpression);
  result = once(
    result,
    'layout: { "icon-image": ["get", "pin"] },',
    'layout: { "icon-image": ["get", "pin"], "icon-anchor": "bottom", "icon-offset": [0, 8] },',
  );
  result = once(
    result,
    'paint: { "circle-radius": 24, "circle-opacity": 0 },',
    'paint: { "circle-radius": id === "price-hit" ? 32 : 24, "circle-opacity": 0, "circle-translate": id === "price-hit" ? [0, -25] : [0, 0], "circle-translate-anchor": "viewport" },',
  );
  result = once(result, '"circle-color": ink,', '"circle-color": "#eef1f3",');
  result = once(result, 'paint: { "text-color": bg },', 'paint: { "text-color": "#65717b" },');
  // One physical tap produces one selection even where expanded hit targets overlap.
  const updated = ts.createSourceFile(
    "map.ts",
    result,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const mapClass = updated.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === "VenueMap",
  );
  const click = mapClass?.members.find(
    (node) => ts.isMethodDeclaration(node) && node.name.getText(updated) === "onVenueClick",
  );
  if (!click?.body) throw new Error("Venue hit seam changed");
  result =
    result.slice(0, click.body.getStart(updated)) +
    `{
    this.map.on("click", (event) => {
      const hits = this.map.queryRenderedFeatures(event.point, { layers: ["price-hit", "venue-hit"] });
      const target = hits.find((hit) => hit.layer.id === "price-hit") ?? hits[0];
      if (target?.properties) listener(String(target.properties.key), String(target.properties.cell));
    });
  }` +
    result.slice(click.body.end);
  result = once(
    result,
    "const id = e.features?.[0]?.properties.cluster_id as number | undefined;",
    'if (map.queryRenderedFeatures(e.point, { layers: ["price-hit", "venue-hit"] }).length) return;\n      const id = e.features?.[0]?.properties.cluster_id as number | undefined;',
  );
  return 'import { mobilePinImage } from "@mobile/map-pins";\n' + result;
}

/** Recolour an existing licensed style; retain sources, names, sprites and attribution. */
export function mobileMapStyle(original) {
  const style = structuredClone(original);
  for (const layer of style.layers) {
    if (!layer.paint) continue;
    const name = layer.id.toLowerCase();
    if (layer.type === "background") layer.paint["background-color"] = "#f5f6f3";
    if (layer.type === "fill") {
      layer.paint["fill-color"] = /water|ocean|river/.test(name)
        ? "#b9dfed"
        : /park|wood|grass|forest|garden/.test(name)
          ? "#e3efdf"
          : /building/.test(name)
            ? "#e8ebe7"
            : "#f3f5f0";
    }
    if (layer.type === "line" && /road|highway|motorway|street|bridge|tunnel/.test(name))
      layer.paint["line-color"] = /casing|case|outline/.test(name) ? "#e1e5df" : "#ffffff";
    if (layer.type === "symbol" && layer.paint["text-color"])
      layer.paint["text-color"] = /water/.test(name) ? "#618b9c" : "#7b8583";
  }
  return style;
}
