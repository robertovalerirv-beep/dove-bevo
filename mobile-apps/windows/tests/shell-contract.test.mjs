import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, "..", name), "utf8");

test("the Windows bottom bar has the four agreed destinations and no Search or Save tab", () => {
  const xaml = read("MainWindow.xaml");
  const bar = xaml.match(/<UniformGrid Columns="4"[^>]*>([\s\S]*?)<\/UniformGrid>/)?.[1];
  assert.ok(bar, "four-item bottom bar missing");
  const buttons = [...bar.matchAll(/Content="([^"]+)" Click="([^"]+)"/g)].map((match) => [
    match[1],
    match[2],
  ]);
  assert.deepEqual(buttons, [
    ["Home", "Home_Click"],
    ["Mappa", "Map_Click"],
    ["Preferiti", "Favourites_Click"],
    ["Consigliati", "Recommendations_Click"],
  ]);
  assert.doesNotMatch(xaml, /Click="(?:SaveDrink|Vote)_Click"/);
  const window = read("MainWindow.xaml.cs");
  assert.match(window, /private void Home_Click\([^)]*\) => Discover_Click\(sender, e\)/);
  assert.doesNotMatch(window, /mapRoutes\.ResetHome\(/);
  assert.equal((xaml.match(/Content="Torna alla mappa" Click="Map_Click"/g) ?? []).length, 3);
  assert.doesNotMatch(xaml, /Header="Scopri prezzi"/);
  assert.match(
    window,
    /private void Back_Click\([^)]*\)[\s\S]*?if \(DiscoveryPanel\.Visibility == Visibility\.Visible\)\s*\{\s*CloseDiscovery\(\);\s*return;/,
  );
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

test("source Back wins over web history and Mappa cancels a pending venue load", () => {
  const window = read("MainWindow.xaml.cs");
  const back = window.slice(window.indexOf("private void Back_Click("), window.indexOf("private void Forward_Click("));
  assert.ok(back.indexOf("var source = returnDestination;") >= 0);
  assert.ok(back.indexOf("var source = returnDestination;") < back.indexOf("Website.CoreWebView2.GoBack()"));
  assert.doesNotMatch(back, /ConsumeNativeReturn/);
  const map = window.slice(window.indexOf("private void Map_Click("), window.indexOf("private void More_Click("));
  assert.match(window, /if \(source != NativeReturnDestination\.None\)\s*mapRoutes\.BeginNativeVenue\(CurrentBrowserRoute\(\)\)/);
  assert.match(map, /var pendingMapReturn = mapRoutes\.ConsumeNativeReturn\(\);/);
  assert.match(map, /if \(pendingMapReturn is not null \|\| !ready \|\| !NavigationPolicy\.IsMapRoute\(current\)\)\s*Navigate\(pendingMapReturn \?\? mapRoutes\.Destination\(current\)\)/);
  assert.match(window, /core\.SourceChanged \+= \(_, _\) => RememberMapRoute\(\)/);
  assert.match(window, /core\.HistoryChanged \+= \(_, _\) => RememberMapRoute\(\)/);
  assert.match(window, /private void RememberMapRoute\(\)[\s\S]*?PublishSavedDrinkKeysAsync\(\)/);
});
