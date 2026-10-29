import { render } from "preact";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./app";
import { listenForInstall } from "./lib/install";
import { warmUpMapWhenIdle } from "./lib/map-warmup";
import { watchTheme } from "./lib/theme";
import { installTrustedTypes } from "./lib/trusted-types";
import type * as MapModule from "./lib/maplibre-map";

// MapLibre (~1 MB of JS) is loaded only when the map is wanted (ADR 0014).
let mapModule: Promise<typeof MapModule> | null = null;
const loadMap = () => (mapModule ??= import("./lib/maplibre-map"));

installTrustedTypes(); // before MapLibre starts its worker and the service worker registers (ADR 0045)
watchTheme(); // Bancone by day, Fuori orario from 21:30 (ADR 0025)

const root = document.getElementById("app");
if (root && /^\/admin\/?$/.test(location.pathname)) {
  // Admin page: its own chunk, never loaded by visitors (SPEC 15 shell budget).
  void import("./views/AdminPage").then(({ AdminPage }) => {
    render(<AdminPage />, root);
  });
} else if (root && /^\/admin\/verificati\/?$/.test(location.pathname)) {
  // «Gestori verificati» (SPEC 7.10): a chunk of its own, behind the same Cloudflare Access as /admin.
  void import("./views/VerifiedPage").then(({ VerifiedPage }) => {
    render(<VerifiedPage />, root);
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
  warmUpMapWhenIdle(); // the map page only (not /privacy, /regole, /admin); fetches, never runs MapLibre
  // The shell works offline (SPEC 7.7); only in the real build, never under the dev server.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}
