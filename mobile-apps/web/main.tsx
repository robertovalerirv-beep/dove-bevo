import { render } from "preact";
import "@site/app/styles/base.css";
import "@site/app/styles/app.css";
import "./shell.css";
import "./components/sheets.css";
import { AppHost } from "./AppHost";
import { installTrustedTypes } from "@site/app/lib/trusted-types";
import type * as MapModule from "@site/app/lib/maplibre-map";

// The original entry is deliberately not imported: it installs the website SW
// and time-based theme. This app entry keeps normal browser storage/authentication.
installTrustedTypes();
document.documentElement.dataset.theme = "light";
document.documentElement.dataset.dovebevoMobileShell = "1";
let map: Promise<typeof MapModule> | null = null;
const loadMap = () => (map ??= import("@site/app/lib/maplibre-map"));
const root = document.getElementById("app");
if (root) render(<AppHost loadMap={loadMap} />, root);
