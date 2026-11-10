using DoveBevo.Windows;
using System.Text;
using System.Text.Json;

var trusted = new[]
{
    "https://www.dovebevo.com/",
    NavigationPolicy.Home,
    "https://dovebevo.com/bar/n123?c=u0nd9",
};
var untrusted = new[]
{
    "http://www.dovebevo.com/",
    "https://www.dovebevo.com.evil.example/",
    "https://user@www.dovebevo.com/",
    "https://www.dovebevo.com:8443/",
    "file:///C:/temp/private.txt",
};
foreach (var address in trusted)
    Require(NavigationPolicy.IsTrusted(new Uri(address)), "trusted origin rejected");
foreach (var address in untrusted)
    Require(!NavigationPolicy.IsTrusted(new Uri(address)), "untrusted origin accepted");
Require(NavigationPolicy.IsMapRoute(new Uri(NavigationPolicy.Home)) &&
    NavigationPolicy.IsMapRoute(new Uri(NavigationPolicy.Home + "?at=51.50720,-0.12760")) &&
    !NavigationPolicy.IsMapRoute(new Uri(
        "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9")),
    "Mappa must close a venue route and retain actual map routes");
var mapRoutes = new MapRouteTracker();
var londonMap = new Uri(NavigationPolicy.Home + "?at=51.50720,-0.12760");
var londonVenue = new Uri("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=gcpvj");
Require(mapRoutes.Destination(londonVenue) == NavigationPolicy.Home,
    "Mappa without selected city must use Home");
mapRoutes.Observe(new Uri(NavigationPolicy.Home));
mapRoutes.Observe(londonMap); // SourceChanged/HistoryChanged after the app's city pushState.
mapRoutes.Observe(londonVenue);
Require(mapRoutes.Destination(londonVenue) == londonMap.AbsoluteUri,
    "London venue must return to the selected London map");
mapRoutes.ResetHome();
Require(mapRoutes.Destination(londonVenue) == NavigationPolicy.Home,
    "Home must reset the remembered map city");

var venues = new[]
{
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/mobile/index.html?path=%2Fbar%2Fn123&c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=0", "n123", true),
    ("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&offer=menu-123", "n123", true),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n124", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9#secret", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&next=https://evil.example", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=aaaaa", "n123", false),
    ("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=2", "n123", false),
};
foreach (var (address, key, expected) in venues)
    Require(NavigationPolicy.TryVenue(address, key, out _) == expected, "venue route policy mismatch");

Require(NavigationPolicy.TryFocusedVenue(
    "https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", "spritz", 0, out var focusedItalian)
    && focusedItalian?.AbsoluteUri ==
    "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=0",
    "Italian favourite did not focus its drink");
var europeKey = "m" + new string('a', 24);
Require(NavigationPolicy.TryFocusedVenue(
    $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{europeKey}&c=u0nd9",
    europeKey, "negroni", 1, out var focusedEurope)
    && focusedEurope?.AbsoluteUri.EndsWith($"path=%2Fbar%2F{europeKey}&c=u0nd9&drink=negroni&hh=1") == true,
    "Europe favourite did not focus its drink and happy hour");
Require(!NavigationPolicy.TryFocusedVenue(
    "https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", "invalid", 0, out _),
    "invalid favourite drink accepted");
Require(!NavigationPolicy.TryFocusedVenue(
    "https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", "spritz", 2, out _),
    "invalid favourite hour accepted");

var baseVenue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
var legacyCommand = baseVenue + "&save_drink=spritz&band=normal";
Require(NavigationPolicy.Home == "https://www.dovebevo.com/mobile/", "Windows must enter app-only mobile shell");
Require(NavigationPolicy.TrySaveAction(legacyCommand, baseVenue, out var legacyAction)
    && legacyAction is { Kind: "legacy", Item: "spritz", Band: "normal" },
    "exact Italian drink action rejected");
Require(NavigationPolicy.TrySaveAction(baseVenue + "&save_offer=menu-123", baseVenue,
        out var offerAction) && offerAction is { Kind: "offer", Item: "menu-123" },
    "exact menu offer action rejected");
var customerKey = "c" + new string('a', 64);
Require(NavigationPolicy.TrySaveAction(baseVenue + "&save_customer=" + customerKey, baseVenue,
        out var customerAction) && customerAction is { Kind: "customer" },
    "exact customer price action rejected");
var euroVenue = $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{europeKey}&c=u0nd9";
Require(NavigationPolicy.TrySaveAction(euroVenue +
        "&save_europe=beer_draft&band=happy_hour&currency=GBP&serving=ml%3A568",
        euroVenue, out var euroAction)
    && euroAction is { Kind: "europe", Item: "beer_draft", Currency: "GBP", Serving: "ml:568" },
    "exact GBP beer action rejected");
Require(NavigationPolicy.TryExactEuropeVenue(euroAction!.CommandUrl, euroVenue, out var exactEuropeVenue)
    && exactEuropeVenue?.AbsoluteUri == euroVenue &&
    !exactEuropeVenue.Query.Contains("drink=", StringComparison.Ordinal),
    "exact European bookmark must reopen the venue without ambiguous drink focus");
Require(!NavigationPolicy.TryExactEuropeVenue(legacyCommand, baseVenue, out _),
    "Italian drink mistaken for a European exact bookmark");
foreach (var invalid in new[] {
    baseVenue + "&save_drink=spritz&band=normal&extra=1",
    baseVenue + "&save_drink=spritz&band=normal&band=normal",
    baseVenue + "&save_offer=menu-123#fragment",
    baseVenue + "&save_customer=" + customerKey[..^1],
    euroVenue + "&save_europe=beer_draft&band=normal&currency=EUR&serving=ml%3A0",
}) Require(!NavigationPolicy.TrySaveAction(invalid, baseVenue, out _), "invalid save command accepted");
Require(!NavigationPolicy.TrySaveAction(legacyCommand,
    "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn124&c=u0nd9", out _),
    "cross-venue save command accepted");

var storeFile = Path.Combine("mobile-apps", "windows", "out", $"bookmark-smoke-{Guid.NewGuid():N}.json");
try
{
    var store = new BookmarkStore(storeFile);
    var regular = new Bookmark("n123", "Test Bar", "Spritz", focusedItalian!.AbsoluteUri);
    Require(NavigationPolicy.TryFocusedVenue(
        "https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", "spritz", 1, out var focusedHappyHour),
        "happy hour link was not created");
    var happyHour = new Bookmark("n123", "Test Bar", "Spritz", focusedHappyHour!.AbsoluteUri);
    Require(store.Add(regular) && store.Add(happyHour) && !store.Add(regular),
        "favourites must separate regular and happy-hour offers without duplicating either");
    var reopened = new BookmarkStore(storeFile);
    Require(reopened.Items.Count == 2 && reopened.Items.Any(item => item.Display.Contains("Happy hour")),
        "favourite offers were not retained distinctly");
    var exact = new Bookmark("n123", "Test Bar", "Spritz", focusedItalian.AbsoluteUri,
        legacyCommand);
    Require(store.Add(exact) && !store.Add(exact) && new BookmarkStore(storeFile).Items.Count == 3,
        "native exact drink action not retained once");
    var exactEurope = new Bookmark(europeKey, "London Bar", "Birra 568 ml", euroVenue,
        euroAction.CommandUrl);
    Require(store.Add(exactEurope) && new BookmarkStore(storeFile).Items.Count == 4,
        "exact European serving and currency bookmark not retained");
}
finally
{
    if (File.Exists(storeFile)) File.Delete(storeFile);
    if (File.Exists(storeFile + ".new")) File.Delete(storeFile + ".new");
}

var emailLinks = new[]
{
    ("mailto:dovebevo@gmail.com", true),
    ("mailto:dovebevo@gmail.com?subject=Segnalazione%20locale%20m123&body=Milano%20bar", true),
    ("mailto:other@example.com", false),
    ("mailto:dovebevo@gmail.com?subject=Hello&cc=other@example.com", false),
    ("mailto:dovebevo@gmail.com?subject=Hello%0D%0ABcc&body=Bar", false),
    ("mailto:dovebevo@gmail.com?subject=Hello&body=Bar#fragment", false),
};
foreach (var (address, expected) in emailLinks)
    Require(NavigationPolicy.TrySupportEmail(address, out _) == expected,
        "support email policy mismatch");

Require(DiscoveryArea.Geohash(45.4635, 9.18839) == "u0nd9", "Milano geohash mismatch");
var area = DiscoveryArea.ParseWebView(
    "{\"href\":\"https://www.dovebevo.com/mobile/\",\"latitude\":45.4635,\"longitude\":9.18839,\"zoom\":15}",
    new Uri(NavigationPolicy.Home));
Require(area is not null && area.Cells().Contains("u0nd9") && area.Cells().Count <= 9,
    "visible map discovery area mismatch");
Require(DiscoveryArea.ParseWebView(
    "{\"href\":\"https://evil.example/\",\"latitude\":45.4635,\"longitude\":9.18839,\"zoom\":15}",
    new Uri(NavigationPolicy.Home)) is null, "foreign map area accepted");
var cells = new[] { "u0nd9" };
Require(AreaVotesClient.Endpoint(cells) ==
    "https://www.dovebevo.com/api/mobile/v2/drink-votes/area?cells=u0nd9&limit=50&include_europe=1",
    "area votes GET must opt into Europe without posting");
var areaPayload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
    schema_version = 1, scope = new { cells }, items = new[] { new {
        venue = new { key = "n123", cell = "u0nd9", name = "Test Bar", city = "Milano" },
        target = new { kind = "legacy", drink = "spritz", band = "normal" },
        drink = new { name = "Spritz", category = "spritz", serving_label = (string?)null },
        count = 2,
    } }, next_after = (string?)null,
}));
var areaPage = AreaVotesClient.Parse(areaPayload, cells);
Require(areaPage.Rows.Count == 1 && areaPage.Rows[0].Count == 2 &&
    areaPage.Rows[0].VenueName == "Test Bar", "read-only area totals mismatch");
ExpectInvalid(() => AreaVotesClient.Parse(areaPayload, new[] { "u33db" }));
using var legacyPriceJson = JsonDocument.Parse("{\"p\":[[\"n123\",\"spritz\",0,550,\"2026-11-10\",0,0]]}");
Require(BookmarkPriceClient.ParseLegacy(legacyPriceJson, legacyAction!)?.Contains("5,50 €") == true,
    "current exact Italian price not shown");
Require(BookmarkPriceClient.ParseLegacy(legacyPriceJson, euroAction!) is null,
    "other currency or venue must not borrow an Italian price");
using var offerPriceJson = JsonDocument.Parse(JsonSerializer.Serialize(new {
    schema_version = 2, price_scope = "menu_item_only",
    venue = new { key = "n123", cell = "u0nd9" },
    offers = new[] {
        new { id = "menu-123", amount_minor = 850, currency = "EUR", currency_exponent = 2 },
        new { id = "menu-456", amount_minor = 420, currency = "EUR", currency_exponent = 2 },
    }, next_after = (string?)null,
}));
Require(BookmarkPriceClient.ParseOffer(offerPriceJson, offerAction!).Price?.Contains("8,50 €") == true,
    "exact menu offer price missing");
using var customerPriceJson = JsonDocument.Parse(JsonSerializer.Serialize(new {
    schema_version = 1, price_scope = "customer_reported_drink_item",
    venue = new { key = "n123", cell = "u0nd9" },
    rows = new[] { new { item_key = customerKey, amount_minor = 570,
        currency = "EUR", currency_exponent = 2 } }, next_after = (string?)null,
}));
Require(BookmarkPriceClient.ParseCustomer(customerPriceJson, customerAction!).Price?.Contains("5,70 €") == true,
    "exact customer drink price missing");
var europeRows = new[] {
        new { venue = europeKey, cell = "u0nd9", drink = "beer_draft", hh = 1,
            currency = "GBP", serving = new { unit = "ml", ml = (int?)568 },
            amount_minor = 650, status = "active" },
        new { venue = europeKey, cell = "u0nd9", drink = "beer_draft", hh = 0,
            currency = "GBP", serving = new { unit = "ml", ml = (int?)568 },
            amount_minor = 550, status = "active" },
    };
using var europePriceJson = JsonDocument.Parse(JsonSerializer.Serialize(new {
    schema_version = 1, catalog_version = "test-version", rows = europeRows,
    hidden = Array.Empty<string>(), legacy_venues = Array.Empty<string>(),
}));
Require(BookmarkPriceClient.ParseEurope(europePriceJson, euroAction!, "test-version")?.Contains("6,50 £") == true,
    "exact GBP serving and happy-hour price missing");
ExpectInvalid(() => BookmarkPriceClient.ParseEurope(europePriceJson, euroAction!, "wrong-version"));
using var hiddenEuropeJson = JsonDocument.Parse(JsonSerializer.Serialize(new {
    schema_version = 1, catalog_version = "test-version", rows = europeRows,
    hidden = new[] { europeKey }, legacy_venues = Array.Empty<string>(),
}));
using var overriddenEuropeJson = JsonDocument.Parse(JsonSerializer.Serialize(new {
    schema_version = 1, catalog_version = "test-version", rows = europeRows,
    hidden = Array.Empty<string>(), legacy_venues = new[] { europeKey },
}));
ExpectInvalid(() => BookmarkPriceClient.ParseEurope(hiddenEuropeJson, euroAction!, "test-version"));
ExpectInvalid(() => BookmarkPriceClient.ParseEurope(overriddenEuropeJson, euroAction!, "test-version"));
var menu = new
{
    schema_version = 2,
    coverage = new { complete = false, basis = "verified_source_items_only" },
    price_scope = "menu_item_only",
    cell = "u0nd9", category = "spritz", categories = new[] { "spritz" },
    venues = new[]
    {
        new
        {
            key = "n10781209907", cell = "u0nd9", name = "The Dome", city = "Milano",
            matching_offer_count = 1,
            sample_offers = new[]
            {
                new
                {
                    name = "Spritz", category = "spritz", amount_minor = 1800,
                    currency = "EUR", currency_exponent = 2,
                    context = new { kind = "regular", condition = (string?)null },
                    source = new { url = "https://menu.example/spritz.pdf", text_sha256 = new string('a', 64), checked_on = "2026-11-03" },
                },
            },
        },
    },
    next_after = (string?)null,
};
var menuBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(menu));
var offer = DiscoveryClient.ParsePage(menuBytes, "u0nd9", "spritz").Rows.Single();
Require(offer.Display.Contains("18,00 EUR") && offer.Display.Contains("menu.example") &&
    offer.FocusedVenue()?.AbsoluteUri.EndsWith("&drink=spritz&hh=0") == true,
    "verified discovery offer/focus mismatch");
ExpectInvalid(() => DiscoveryClient.ParsePage(menuBytes, "u0nd9", "negroni"));
ExpectInvalid(() => DiscoveryClient.ParsePage(Encoding.UTF8.GetBytes(
    Encoding.UTF8.GetString(menuBytes).Replace("https://menu.example/", "http://menu.example/")),
    "u0nd9", "spritz"));
if (args.Contains("--live-discovery"))
{
    var live = await new DiscoveryClient().LoadAsync(new DiscoveryArea(45.4635, 9.18839, 15),
        "spritz", CancellationToken.None);
    Require(live.Rows.Any(row => row.Cell == "u0nd9" && row.Venue == "The Dome"),
        "live Milano menu v2 offer missing");
    Console.WriteLine($"Live Milano discovery: {live.Rows.Count} offers; {live.UnavailableCells} unavailable cells.");
}

Console.WriteLine("Windows policy: origin, exact bookmarks, live-price parsing, area totals, and discovery passed.");

static void Require(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

static void ExpectInvalid(Action action)
{
    try { action(); }
    catch (InvalidDataException) { return; }
    throw new Exception("invalid response accepted");
}
