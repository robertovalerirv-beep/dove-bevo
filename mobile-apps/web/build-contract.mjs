import { createHash } from "node:crypto";
import ts from "typescript";
/* global structuredClone */

const PINS = {
  app: "9ad927c8c8e72d5b7795bdbd43635339aee9906db67a6209acc2dc36215efc51",
  map: "6cf9a2d5b015865f9ec7c3b4e48da8e16f574edf061d2c5826a48ee04bd1027e",
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
    "useState<string[]>(mobileInitialDrinks())",
  );
  result = once(
    result,
    "  const pendingMove = useRef<[number, number, number] | null>(initialAt);",
    "  const pendingMove = useRef<[number, number, number] | null>(initialAt);\n  const mobileHomeView = useRef<[number, number, number] | null>(initialAt);",
  );
  // The native Map tab starts its Italy map immediately; the static preview covers tile loading.
  result = once(result, "useState(initialAt !== null)", "useState(true)");
  result = once(
    result,
    "  const ensureMap = () => {\n    setMapWanted(true);\n  };",
    "  const [mapAttempt, setMapAttempt] = useState(0);\n  const ensureMap = () => {\n    if (mapFailed) {\n      setMapFailed(false);\n      setReady(false);\n      setMapAttempt((value) => value + 1);\n    }\n    setMapWanted(true);\n  };",
  );
  result = once(result, "  }, [mapWanted]);", "  }, [mapWanted, mapAttempt]);");
  result = once(
    result,
    "        setView(created.view());",
    "        const startingView = created.view();\n        if (!mobileHomeView.current) mobileHomeView.current = [startingView.lat, startingView.lon, startingView.zoom];\n        setView(startingView);",
  );
  result = once(
    result,
    "const picture = !mapWanted && !ready;",
    "const picture = (!mapWanted || mapFailed) && !ready;",
  );
  result = once(result, "{it.map.start}", '{mapFailed ? "Riprova mappa" : it.map.start}');
  result = once(
    result,
    "const coverageText = it.map.coverage(zoneCoverage.withPrice, zoneCoverage.total);",
    "const coverageText = mobileCoverageText(zoneCoverage.withPrice, zoneCoverage.total);",
  );
  result = once(
    result,
    "const status = picture && rawStatus === it.map.zoomIn ? null : rawStatus;",
    "const status = picture && rawStatus === it.map.zoomIn ? null : rawStatus === it.map.zoomIn ? mobileZoomHint() : rawStatus;",
  );
  result = once(
    result,
    '<p class="map__status" data-testid="map-status" role="status">',
    '<p class="map__status" data-testid="map-status" data-mobile-zoom-hint={rawStatus === it.map.zoomIn ? "1" : undefined} role="status">',
  );
  result = once(
    result,
    "              {status}\n            </p>",
    '              {status}\n              {!pinning && inView.some((v) => !bestPrice(v, drinks) && mobileMenuPin(v, drinks)) && (\n                <span class="mobile-menu-map-note">{drinks.length ? "M+ = prezzo del drink da menu; coperto e supplementi esclusi" : "Numeri sulla mappa = voci di menu verificate o prezzi segnalati; non sono prezzi medi"}</span>\n              )}\n            </p>',
  );
  result = once(
    result,
    "              {status}\n              {!pinning",
    '              {rawStatus === it.map.zoomIn ? (\n                <button type="button" class="mobile-zoom-search" aria-label={it.search.open}\n                  onClick={() => { setSearchHint(undefined); setSheet("search"); ensureMap(); }}>\n                  {status}\n                </button>\n              ) : status}\n              {!pinning',
  );
  result = once(
    result,
    "Promise.all(cells.map(loadCell))",
    "Promise.all(cells.map((cell) => loadMobileCell(cell, drinks)))",
  );
  result = once(result, "}, [view, attempt]);", "}, [view, attempt, drinks]);");
  result = once(
    result,
    "const onPop = () => {\n      setRoute(parseRoute());",
    "const onPop = () => {\n      const restoredDrink = mobileFocus(location);\n      if (restoredDrink) setDrinks([restoredDrink.drink]);\n      setRoute(parseRoute());",
  );
  result = once(
    result,
    '  // A "Vicino a me" message belongs to the view it was shown on: moving the map clears it.',
    `  useEffect(() => {
    const refresh = (event: Event) => {
        const cell = (event as CustomEvent<{ cell?: string }>).detail?.cell;
        if (cell && view && visibleCells(view)?.includes(cell))
          setAttempt((value) => value + 1);
      };
      window.addEventListener("dovebevo:menu-cell-ready", refresh);
      return () => { window.removeEventListener("dovebevo:menu-cell-ready", refresh); };
    }, [view]);

  // A "Vicino a me" message belongs to the view it was shown on: moving the map clears it.`,
  );
  result = once(
    result,
    "  function openAdd(prefill: Prefill | null) {",
    '  function openAdd(prefill: Prefill | null) {\n    if (prefill?.venue.key.startsWith("m")) {\n      navigate(`/bar/${prefill.venue.key}?c=${prefill.venue.cell}`);\n      return;\n    }',
  );
  result = once(
    result,
    "  async function nearMe() {",
    '  function resetMobileMapHome() {\n    if (route.name === "bar") {\n      history.replaceState(null, "", mobileURL("/"));\n      setRoute(parseRoute());\n    }\n    setMessage(null);\n    const target = mobileHomeView.current;\n    if (target) moveTo(...target);\n    else ensureMap();\n  }\n\n  async function nearMe() {',
  );
  result = once(
    result,
    "    moveTo(place[2], place[3], 14);",
    "    mobileHomeView.current = [place[2], place[3], 14];\n    moveTo(place[2], place[3], 14);",
  );
  result = once(result, "venues={everyVenue}", "venues={legacyPriceVenues(everyVenue)}");
  result = once(
    result,
    'document.querySelector<HTMLElement>(".bottom__primary")?.focus();',
    'document.querySelector<HTMLElement>(".mobile-map-actions__toggle")?.focus();',
  );
  result = once(
    result,
    'layer === document.body\n          ? document.querySelector<HTMLElement>(".bottom__primary")',
    'layer === document.body\n          ? document.querySelector<HTMLElement>(".mobile-map-actions__toggle")',
  );
  result = once(result, "() => coverage(inView, drinks)", "() => mobileCoverage(inView, drinks)");
  result = once(result, "VENUE_KEY_PATTERN.test(match[1])", "mobileVenueKeyPattern.test(match[1])");
  result = once(
    result,
    "invalidateCell(venue.cell);",
    "invalidateCell(venue.cell); invalidateMobileCell(venue.cell);",
  );
  result = once(
    result,
    "invalidateCell(cell);",
    "invalidateCell(cell); invalidateMobileCell(cell);",
  );
  result = once(
    result,
    '        const price = bestPrice(v, drinks);\n        const label = price\n          ? `${formatPrice(price[3])}${price[2] === 1 ? ` ${it.bar.happyHour}` : ""}`\n          : "";',
    '        const price = bestPrice(v, drinks);\n        const menuPin = price ? null : mobileMenuPin(v, drinks);\n        const minimumPin = price || menuPin ? mobileMinimumPin(v) : null;\n        const priceLabel = price\n          ? `${formatPrice(price[3])}${price[2] === 1 ? ` ${it.bar.happyHour}` : ""}`\n          : menuPin ?? "";\n        const label = priceLabel + (minimumPin ? ` · ${minimumPin}` : "");',
  );
  result = once(
    result,
    "          {/* Attributions in the shell: always visible, even before MapLibre loads (SPEC 2.8). */}",
    '          {!pinning && <MobileMapHomeButton className="mobile-map-home" onClick={resetMobileMapHome} />}\n          {!pinning && <MobileMapActions onAddPrice={() => openAdd(null)} onAddVenue={() => startProposal()} />}\n          {/* Attributions in the shell: always visible, even before MapLibre loads (SPEC 2.8). */}',
  );
  const tree = ts.createSourceFile(
    "app.tsx",
    result,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const buttons = [];
  function visit(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(tree) === "button" &&
      node.openingElement.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(tree) === "class" &&
          attribute.initializer?.text === "btn btn--slim search-field",
      )
    )
      buttons.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (buttons.length !== 1) throw new Error("Map search presentation seam changed");
  result =
    result.slice(0, buttons[0].getStart(tree)) +
    '<MobileSearchButton venues={inView} onOpen={() => { if (route.name === "bar") { history.replaceState(null, "", mobileURL("/")); setRoute(parseRoute()); } setSearchHint(undefined); setSheet("search"); ensureMap(); }} />' +
    result.slice(buttons[0].end);
  return (
    'import { mobilePath, mobileURL, mobileInitialDrinks, mobileVenueKeyPattern, mobileFocus } from "@mobile/routes";\nimport { MapSearchButton as MobileSearchButton } from "@mobile/components/MapSearchButton";\nimport { MapHomeButton as MobileMapHomeButton } from "@mobile/components/MapHomeButton";\nimport { MapContributeActions as MobileMapActions } from "@mobile/components/MapContributeActions";\nimport { loadMobileCell, mobileMenuPin, mobileMinimumPin, mobileCoverage, mobileCoverageText, mobileZoomHint, invalidateMobileCell, legacyPriceVenues } from "@mobile/menu-v2";\n' +
    result
  );
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
  // Keep the static preview until the first tiles have actually settled, with a bounded retry.
  result = once(
    result,
    "    await map.ready;\n    return map;",
    `    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let listening = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (listening) map.map.off("idle", onIdle);
          if (error) reject(error); else resolve();
        };
        const onIdle = () => { if (map.map.loaded()) finish(); };
        const timer = window.setTimeout(() => finish(new Error("Map tiles timed out")), 12000);
        void map.ready.then(
          () => {
            if (settled) return;
            map.map.on("idle", onIdle);
            listening = true;
            onIdle();
          },
          () => finish(new Error("Map style unavailable")),
        );
      });
      return map;
    } catch (error) {
      map.map.remove();
      throw error;
    }`,
  );
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
  // Show verified price pins at city zoom. The same selected-filter source also has a
  // non-colliding visible dot when MapLibre hides a pin to avoid label collisions.
  result = once(
    result,
    '    map.addLayer({\n      id: "venue-price",',
    `    map.addLayer({
      id: "priced-dot",
      type: "circle",
      source: "prices",
      paint: {
        "circle-radius": 6,
        "circle-color": "#ff5a1f",
        "circle-stroke-color": "#1b1611",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "venue-price",`,
  );
  // The website hides every bar under zoom 13 (SPEC 5.4). The app keeps its own rule, unchanged:
  // price pins from zoom 12, dots and clusters at any zoom.
  result = once(result, "const BARS_FROM_ZOOM = MIN_ZOOM_CELLS;", "const BARS_FROM_ZOOM = 0;");
  result = once(
    result,
    '      id: "venue-price",\n      type: "symbol",\n      minzoom: BARS_FROM_ZOOM,',
    '      id: "venue-price",\n      type: "symbol",\n      minzoom: 12,',
  );
  // A dense price label may be hidden by MapLibre collision handling. Keep the
  // last explicitly viewed price in its selected cork after its sheet closes.
  result = once(
    result,
    "  setSelected(key: string | null) {\n    this.selectedKey = key;",
    "  setSelected(key: string | null) {\n    if (key !== null) this.selectedKey = key;",
  );
  result = once(
    result,
    "    const point = key ? this.points.find((p) => p.key === key) : undefined;",
    '    const point = key ? this.points.find((p) => p.key === key && p.label) : undefined;\n    this.map.getContainer().dataset.selectedPrice = point?.label ?? "";',
  );
  result = once(
    result,
    'for (const id of ["venue-hit", "price-hit", "cluster-hit"])',
    'for (const id of ["venue-hit", "price-hit", "priced-dot", "cluster-hit"])',
  );
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
      const hits = this.map.queryRenderedFeatures(event.point, { layers: ["venue-price", "price-hit", "priced-dot", "venue-hit"] });
      const priceLabel = hits.find((hit) => hit.layer.id === "venue-price");
      const pricedDot = hits.find((hit) => hit.layer.id === "priced-dot");
      const labelCoordinates = priceLabel?.geometry.type === "Point" ? priceLabel.geometry.coordinates : null;
      const labelAnchor = labelCoordinates ? this.map.project([Number(labelCoordinates[0]), Number(labelCoordinates[1])]) : null;
      // The painted 23px price head is centred 33px above its venue anchor.
      const headX = labelAnchor === null ? 0 : event.point.x - labelAnchor.x;
      const headY = labelAnchor === null ? 0 : event.point.y - labelAnchor.y + 33;
      const onVisibleLabelHead = labelAnchor !== null && headX * headX + headY * headY <= 23 * 23;
      const target = (onVisibleLabelHead ? priceLabel : pricedDot ?? priceLabel) ?? hits.find((hit) => hit.layer.id === "price-hit") ?? hits[0];
      if (target?.properties) listener(String(target.properties.key), String(target.properties.cell));
    });
  }` +
    result.slice(click.body.end);
  result = once(
    result,
    "const id = e.features?.[0]?.properties.cluster_id as number | undefined;",
    'if (map.queryRenderedFeatures(e.point, { layers: ["price-hit", "priced-dot", "venue-hit"] }).length) return;\n      const id = e.features?.[0]?.properties.cluster_id as number | undefined;',
  );
  return 'import { mobilePinImage } from "@mobile/map-pins";\n' + result;
}

/** Keep the licensed basemap and website palette unchanged for the app. */
export function mobileMapStyle(original) {
  return structuredClone(original);
}
