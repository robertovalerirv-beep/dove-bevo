import { render } from "preact";
import { SearchSheet } from "../components/SearchSheet";
import { installTrustedTypes } from "@site/app/lib/trusted-types";
import "@site/app/styles/base.css";
import "@site/app/styles/app.css";
import "../shell.css";
import "../components/sheets.css";

installTrustedTypes();
const root = document.getElementById("app");
if (!root) throw new Error("Missing fixture root");
render(
  <SearchSheet
    origin={null}
    cheapest={[]}
    drink="Spritz"
    onPlace={(place) => {
      root.dataset.selected = place[1];
    }}
    onBar={() => {
      throw new Error("Unexpected fixture bar selection");
    }}
    onCheap={() => {
      throw new Error("Unexpected fixture price selection");
    }}
    onPropose={() => {
      root.dataset.proposed = "true";
    }}
    onClose={() => {
      render(null, root);
    }}
  />,
  root,
);
