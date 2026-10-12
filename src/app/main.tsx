import { render } from "preact";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./app";
import type * as MapModule from "./lib/maplibre-map";

// MapLibre is ~1 MB of JS: start it right after the shell's first paint, so evaluating it never
// delays the shell (FCP/LCP), while still loading in parallel with the user's first look.
const mapModule = new Promise<typeof MapModule>((resolve, reject) => {
  requestAnimationFrame(() => {
    setTimeout(() => {
      import("./lib/maplibre-map").then(resolve, reject);
    }, 0);
  });
});

const root = document.getElementById("app");
if (root) render(<App mapModule={mapModule} />, root);
