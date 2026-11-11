import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, "..", name), "utf8");

test("Windows Scopri mounts real featured rows above the full list without replacing the dropdown", () => {
  const xaml = read("MainWindow.xaml");
  const source = read("MainWindow.xaml.cs");
  assert.ok(xaml.indexOf('x:Name="FeaturedCards"') > xaml.indexOf('x:Name="DiscoveryDrink"'));
  assert.ok(xaml.indexOf('x:Name="FeaturedCards"') < xaml.indexOf('x:Name="DiscoveryList"'));
  assert.match(xaml, /<ComboBox x:Name="DiscoveryDrink"/);
  assert.match(
    xaml,
    /<Button Tag="\{Binding\}" ToolTip="\{Binding Row\.Display\}"\s+Click="OpenFeaturedVenue_Click"/,
  );
  assert.match(source, /featuredCards = FeaturedDiscoveryCards\.FromRows\(snapshot\.Rows\)/);
  assert.match(source, /FeaturedCards\.ItemsSource = featuredCards/);
  assert.match(source, /featuredCards\.Length > 0[\s\S]*?FeaturedScroller\.Visibility = visible/);
});

test("Windows featured-card tap uses the same exact venue navigation as a list row", () => {
  const source = read("MainWindow.xaml.cs");
  assert.match(
    source,
    /OpenFeaturedVenue_Click\([^)]*\)[\s\S]*?button\.Tag is not FeaturedDiscoveryCard card[\s\S]*?OpenDiscoveryTarget\(card\.Target\)/,
  );
  assert.match(
    source,
    /OpenDiscoveryTarget\(Uri\? target\)[\s\S]*?Navigate\(target\.AbsoluteUri, source: NativeReturnDestination\.Discovery\)/,
  );
  assert.match(
    source,
    /OpenDiscoveryVenue_Click\([^)]*\)[\s\S]*?OpenDiscoveryTarget\(row\.FocusedVenue\(\)\)/,
  );
});
