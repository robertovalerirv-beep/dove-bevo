using DoveBevo.Windows;
using System.Text;
using System.Text.Json;

var trusted = new[]
{
    "https://www.dovebevo.com/",
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

var venues = new[]
{
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/mobile/index.html?path=%2Fbar%2Fn123&c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=0", "n123", true),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n124", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9#secret", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&next=https://evil.example", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=aaaaa", "n123", false),
    ("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=2", "n123", false),
};
foreach (var (address, key, expected) in venues)
    Require(NavigationPolicy.TryVenue(address, key, out _) == expected, "venue route policy mismatch");

Require(NavigationPolicy.TryRecommendationEndpoint(
    "https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", out var endpoint)
    && endpoint?.AbsoluteUri == "https://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9",
    "recommendation endpoint mismatch");
Require(!NavigationPolicy.TryRecommendationEndpoint(
    "https://www.dovebevo.com/bar/m" + new string('a', 24) + "?c=u0nd9",
    "m" + new string('a', 24), out _), "unsupported catalogue vote accepted");

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

var codes = new[] { "beer_draft", "spritz", "negroni", "sbagliato", "gin_tonic",
    "gin_lemon", "wine_glass", "alcohol_free", "water" };
var rows = codes.Select((drink, index) =>
    new { drink, count = index == 1 ? 5 : 0, recommended = index == 1 }).ToArray();
var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { venue_key = "n123", drinks = rows }));
var snapshot = RecommendationClient.Parse(payload, "n123");
Require(snapshot.Count == 9 && snapshot[0].Code == "spritz"
    && snapshot[0].Count == 5 && snapshot[0].Recommended, "recommendation totals mismatch");
var duplicate = rows.ToArray();
duplicate[0] = duplicate[1];
ExpectInvalid(() => RecommendationClient.Parse(
    Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { venue_key = "n123", drinks = duplicate })), "n123"));
ExpectInvalid(() => RecommendationClient.Parse(payload, "n124"));

Require(DiscoveryArea.Geohash(45.4635, 9.18839) == "u0nd9", "Milano geohash mismatch");
var area = DiscoveryArea.ParseWebView(
    "{\"href\":\"https://www.dovebevo.com/\",\"latitude\":45.4635,\"longitude\":9.18839,\"zoom\":15}",
    new Uri(NavigationPolicy.Home));
Require(area is not null && area.Cells().Contains("u0nd9") && area.Cells().Count <= 9,
    "visible map discovery area mismatch");
Require(DiscoveryArea.ParseWebView(
    "{\"href\":\"https://evil.example/\",\"latitude\":45.4635,\"longitude\":9.18839,\"zoom\":15}",
    new Uri(NavigationPolicy.Home)) is null, "foreign map area accepted");
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

Console.WriteLine("Windows policy: origin, venue, focus, bookmark, email, vote schema, and 6 discovery cases passed.");

static void Require(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

static void ExpectInvalid(Action action)
{
    try { action(); }
    catch (InvalidDataException) { return; }
    throw new Exception("invalid recommendation response accepted");
}
