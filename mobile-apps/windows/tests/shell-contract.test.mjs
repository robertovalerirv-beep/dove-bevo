import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, "..", name), "utf8");

test("the Windows bottom bar has the five agreed destinations and no Save tab", () => {
  const xaml = read("MainWindow.xaml");
  const bar = xaml.match(/<UniformGrid Columns="5"[^>]*>([\s\S]*?)<\/UniformGrid>/)?.[1];
  assert.ok(bar, "five-item bottom bar missing");
  const buttons = [...bar.matchAll(/Content="([^"]+)" Click="([^"]+)"/g)].map((match) => [
    match[1],
    match[2],
  ]);
  assert.deepEqual(buttons, [
    ["Home", "Home_Click"],
    ["Cerca", "Search_Click"],
    ["Mappa", "Map_Click"],
    ["Preferiti", "Favourites_Click"],
    ["Consigliati", "Recommendations_Click"],
  ]);
  assert.doesNotMatch(xaml, /Click="(?:SaveDrink|Vote)_Click"/);
});

test("shared Consigliati is a read-only area view and native saves wait for the mobile shell", () => {
  const client = read("AreaVotesClient.cs");
  const window = read("MainWindow.xaml.cs");
  assert.match(client, /HttpRequestMessage\(HttpMethod\.Get, url\)/);
  assert.doesNotMatch(client, /HttpMethod\.Post|\bPostAsync\b/);
  assert.match(window, /data-dovebevo-mobile-shell/);
  assert.doesNotMatch(window, /data-dovebevo-app-theme/);
  assert.match(window, /DoveBevoNativeEuropeSave=true/);
  assert.match(window, /core\.SourceChanged \+=/);
  assert.match(window, /core\.HistoryChanged \+=/);
});
