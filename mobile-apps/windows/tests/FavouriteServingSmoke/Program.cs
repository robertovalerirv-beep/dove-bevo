using System.Reflection;
using DoveBevo.Windows;

var assembly = typeof(MainWindow).Assembly;
var bookmarkType = assembly.GetType("DoveBevo.Windows.Bookmark", throwOnError: true)!;
var constructor = bookmarkType.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic |
    BindingFlags.Instance).Single(value => value.GetParameters().Length == 5);
var formatter = typeof(MainWindow).GetMethod("FavouriteServing",
    BindingFlags.NonPublic | BindingFlags.Static)!;
var identity = bookmarkType.GetProperty("Identity")!;
const string venue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";

Check("wine_glass", "glass:175", "EUR", "EUR · calice · 175 ml");
Check("wine_glass", "glass:250", "EUR", "EUR · calice · 250 ml");
Check("wine_glass", "glass:", "EUR", "EUR · calice");
Check("spritz", "drink:", "GBP", "GBP");
Check("beer_draft", "ml:568", "GBP", "GBP · 568 ml");
Console.WriteLine("Windows favourite serving labels and exact identities passed.");

void Check(string drink, string serving, string currency, string expected)
{
    var action = venue + "&save_europe=" + drink + "&band=normal&currency=" + currency +
        "&serving=" + Uri.EscapeDataString(serving);
    var bookmark = constructor.Invoke(["n123", "Test Bar", "Saved drink", venue, action]);
    var actual = formatter.Invoke(null, [bookmark]) as string;
    if (actual != expected || identity.GetValue(bookmark) as string != action)
        throw new Exception($"Serving {serving}: expected {expected}, got {actual}; identity changed.");
}
