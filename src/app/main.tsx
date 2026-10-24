import { render } from "preact";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./app";
import { listenForInstall } from "./lib/install";
import { watchTheme } from "./lib/theme";
import type * as MapModule from "./lib/maplibre-map";

// MapLibre (~1 MB of JS) is loaded only when the map is wanted (ADR 0014).
let mapModule: Promise<typeof MapModule> | null = null;
const loadMap = () => (mapModule ??= import("./lib/maplibre-map"));

watchTheme(); // Bancone by day, Fuori orario from 21:30 (ADR 0025)

const root = document.getElementById("app");
if (root && /^\/admin\/?$/.test(location.pathname)) {
  // Admin page: its own chunk, never loaded by visitors (SPEC 15 shell budget).
  void import("./views/AdminPage").then(({ AdminPage }) => {
    render(<AdminPage />, root);
  });
} else if (root && /^\/(privacy|regole)\/?$/.test(location.pathname)) {
  // Legal pages: their own chunk too, the map and its code are not loaded.
  const kind = location.pathname.startsWith("/privacy") ? "privacy" : "rules";
  void import("./views/LegalPage").then(({ LegalPage }) => {
    render(<LegalPage kind={kind} />, root);
  });
} else if (root) {
  listenForInstall();
  render(<App loadMap={loadMap} />, root);
  // The shell works offline (SPEC 7.7); only in the real build, never under the dev server.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}
