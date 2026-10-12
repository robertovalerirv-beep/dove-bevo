import { render } from "preact";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./app";
import type * as MapModule from "./lib/maplibre-map";

// MapLibre (~1 MB of JS) is loaded only when the map is wanted (ADR 0014).
let mapModule: Promise<typeof MapModule> | null = null;
const loadMap = () => (mapModule ??= import("./lib/maplibre-map"));

const root = document.getElementById("app");
if (root) render(<App loadMap={loadMap} />, root);
