import { render } from "preact";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./app";

// MapLibre is the heaviest part: start loading it now, in parallel with the shell (SPEC 4).
const mapModule = import("./lib/maplibre-map");

const root = document.getElementById("app");
if (root) render(<App mapModule={mapModule} />, root);
