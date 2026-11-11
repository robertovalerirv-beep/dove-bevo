using System.Reflection;
using DoveBevo.Windows;

var assembly = typeof(MainWindow).Assembly;
var bookmarkType = assembly.GetType("DoveBevo.Windows.Bookmark", throwOnError: true)!;
var constructor = bookmarkType.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic |
    BindingFlags.Instance).Single(value => value.GetParameters().Length == 5);
var formatter = typeof(MainWindow).GetMethod("FavouriteServing",
    BindingFlags.NonPublic | BindingFlags.Static)!;
var viewType = assembly.GetType("DoveBevo.Windows.BookmarkView", throwOnError: true)!;
var viewConstructor = viewType.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic |
    BindingFlags.Instance).Single(value => value.GetParameters().Length == 4);
var filter = typeof(MainWindow).GetMethod("FavouriteDrinkKey",
    BindingFlags.NonPublic | BindingFlags.Static)!;
var displayServing = typeof(MainWindow).GetMethod("FavouriteDisplayServing",
    BindingFlags.NonPublic | BindingFlags.Static)!;
var identity = bookmarkType.GetProperty("Identity")!;
const string venue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";

Check("wine_glass", "glass:175", "EUR", "EUR · calice · 175 ml");
Check("wine_glass", "glass:250", "EUR", "EUR · calice · 250 ml");
Check("wine_glass", "glass:", "EUR", "EUR · calice");
Check("spritz", "drink:", "GBP", "GBP");
Check("beer_draft", "ml:568", "GBP", "GBP · 568 ml");
CheckFilter("Guinness Draught", "&save_offer=menu-123", "beer_draft", "code:beer_draft",
    "Pint · 568 ml");
CheckFilter("Negroni della casa", "&save_offer=menu-456", "negroni", "code:negroni");
CheckFilter("Guinness Draught", "&save_offer=menu-123", null, "name:Guinness Draught");
CheckFilter("Guinness Draught", "&save_offer=menu-123", "beer_drafts", "name:Guinness Draught");
CheckFilter("Birra piccola", "&save_europe=beer_draft&band=normal&currency=EUR&serving=ml%3A250",
    null, "name:Birra piccola");
CheckFilter("Guinness Draught", "&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A568",
    null, "name:Guinness Draught");
CheckFilter("Pint artigianale", "&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A500",
    null, "name:Pint artigianale");
CheckFilter("Birra media", "&save_europe=beer_draft&band=normal&currency=EUR&serving=ml%3A500",
    null, "code:beer_draft");
Console.WriteLine("Windows favourite serving labels, exact identities and category filters passed.");

void Check(string drink, string serving, string currency, string expected)
{
    var action = venue + "&save_europe=" + drink + "&band=normal&currency=" + currency +
        "&serving=" + Uri.EscapeDataString(serving);
    var bookmark = constructor.Invoke(["n123", "Test Bar", "Saved drink", venue, action]);
    var actual = formatter.Invoke(null, [bookmark]) as string;
    if (actual != expected || identity.GetValue(bookmark) as string != action)
        throw new Exception($"Serving {serving}: expected {expected}, got {actual}; identity changed.");
}

void CheckFilter(string name, string actionSuffix, string? verifiedCategory, string expected,
    string? expectedServing = null)
{
    var action = venue + actionSuffix;
    var bookmark = constructor.Invoke(["n123", "Test Bar", name, venue, action]);
    var view = viewConstructor.Invoke([bookmark, "6,50 €", verifiedCategory, expectedServing]);
    var actual = filter.Invoke(null, [view]) as string;
    var shownServing = displayServing.Invoke(null, [view]) as string;
    if (actual != expected || identity.GetValue(bookmark) as string != action ||
        expectedServing is not null && shownServing != expectedServing)
        throw new Exception($"Filter {name}: expected {expected}, got {actual}; identity changed.");
}
