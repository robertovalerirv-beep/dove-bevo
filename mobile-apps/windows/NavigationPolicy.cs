using System.Globalization;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal static partial class NavigationPolicy
{
    internal const string Home = "https://www.dovebevo.com/mobile/";
    internal const string Privacy = "https://www.dovebevo.com/privacy";

    internal static bool IsTrusted(Uri? uri)
    {
        return uri is { IsAbsoluteUri: true }
            && uri.Scheme == Uri.UriSchemeHttps
            && (uri.DnsSafeHost.Equals("www.dovebevo.com", StringComparison.OrdinalIgnoreCase)
                || uri.DnsSafeHost.Equals("dovebevo.com", StringComparison.OrdinalIgnoreCase))
            && uri.Port == 443
            && uri.UserInfo.Length == 0;
    }

    internal static bool IsMapRoute(Uri? uri)
    {
        if (!IsTrusted(uri) || uri is null || uri.AbsolutePath != "/mobile/" ||
            uri.Fragment.Length != 0) return false;
        if (uri.Query.Length == 0) return true;
        var query = ParseQuery(uri.Query);
        if (query is not { Count: 1 } || !query.TryGetValue("at", out var at)) return false;
        var pair = at.Split(',');
        return pair.Length == 2 &&
            double.TryParse(pair[0], NumberStyles.Float, CultureInfo.InvariantCulture,
                out var latitude) && latitude is >= -90 and <= 90 &&
            double.TryParse(pair[1], NumberStyles.Float, CultureInfo.InvariantCulture,
                out var longitude) && longitude is >= -180 and <= 180;
    }

    internal static string MapDestination(Uri? current, string? lastMapRoute)
    {
        if (IsMapRoute(current)) return current!.AbsoluteUri;
        if (Uri.TryCreate(lastMapRoute, UriKind.Absolute, out var remembered) &&
            IsMapRoute(remembered)) return remembered.AbsoluteUri;
        return Home;
    }

    internal static bool TryVenue(string? address, string? selectedKey, out Uri? canonical)
    {
        canonical = null;
        if (address is not { Length: > 0 and <= 600 }
            || !Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || !IsTrusted(uri)
            || uri.Fragment.Length != 0
            || selectedKey is null
            || !VenueKey().IsMatch(selectedKey))
            return false;

        var path = uri.AbsolutePath;
        var query = ParseQuery(uri.Query);
        if (query is null) return false;
        if (path == "/mobile/" || path == "/mobile/index.html")
        {
            if (!query.TryGetValue("path", out path)
                || !query.TryGetValue("c", out var cell)
                || !Cell().IsMatch(cell)
                || (query.Count != 2 && query.Count != 3 && query.Count != 4)
                || (query.Count == 3 &&
                    (!query.TryGetValue("offer", out var offer) || !OfferId().IsMatch(offer)))
                || (query.Count == 4 &&
                    (!query.TryGetValue("drink", out var drink)
                     || !DrinkCode().IsMatch(drink)
                     || !query.TryGetValue("hh", out var happyHour)
                     || (happyHour != "0" && happyHour != "1"))))
                return false;
        }
        else if (query.Count != 1
                 || !query.TryGetValue("c", out var cell)
                 || !Cell().IsMatch(cell))
            return false;

        if (path != "/bar/" + selectedKey) return false;
        canonical = uri;
        return true;
    }

    internal static bool TryFocusedVenue(
        string? address, string? key, string? drinkCode, int happyHour, out Uri? focused)
    {
        focused = null;
        if (key is null || drinkCode is null || !DrinkCode().IsMatch(drinkCode)
            || (happyHour != 0 && happyHour != 1)
            || !TryVenue(address, key, out var venue) || venue is null)
            return false;
        var query = ParseQuery(venue.Query);
        if (query is null || !query.TryGetValue("c", out var cell) || !Cell().IsMatch(cell))
            return false;
        var target = new Uri($"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{key}&c={cell}&drink={drinkCode}&hh={happyHour}");
        if (!TryVenue(target.AbsoluteUri, key, out _)) return false;
        focused = target;
        return true;
    }

    internal static bool TryOfferVenue(string? address, string? selectedKey, string? offerId, out Uri? focused)
    {
        focused = null;
        if (offerId is null || !OfferId().IsMatch(offerId)
            || !TryVenue(address, selectedKey, out var venue) || venue is null) return false;
        var query = ParseQuery(venue.Query);
        if (query is null || !query.TryGetValue("c", out var cell) || !Cell().IsMatch(cell)) return false;
        var target = new Uri($"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{selectedKey}&c={cell}&offer={Uri.EscapeDataString(offerId)}");
        if (!TryVenue(target.AbsoluteUri, selectedKey, out _)) return false;
        focused = target;
        return true;
    }

    /// <summary>Native-only link from an exact visible drink row. A command is never a display route.</summary>
    internal static bool TrySaveAction(string? address, string? currentAddress, out SaveAction? action)
    {
        action = null;
        if (address is not { Length: > 0 and <= 600 } || currentAddress is null
            || !Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || !IsTrusted(uri) || uri.DnsSafeHost != "www.dovebevo.com"
            || uri.AbsolutePath != "/mobile/" || uri.Fragment.Length != 0
            || !Uri.TryCreate(currentAddress, UriKind.Absolute, out var current)
            || !IsTrusted(current) || current.Fragment.Length != 0) return false;
        var pieces = uri.Query.TrimStart('?').Split('&');
        if (pieces.Length < 3 || pieces.Length > 6) return false;
        var query = ParseQuery(uri.Query);
        if (query is null || !query.TryGetValue("path", out var path)
            || !query.TryGetValue("c", out var cell) || !Cell().IsMatch(cell)
            || !path.StartsWith("/bar/", StringComparison.Ordinal)) return false;
        var key = path[5..];
        if (!VenueKey().IsMatch(key) ||
            !pieces[0].Equals($"path=%2Fbar%2F{key}", StringComparison.Ordinal) ||
            !pieces[1].Equals($"c={cell}", StringComparison.Ordinal) ||
            !SameVenue(current, key, cell)) return false;
        string? kind = null, item = null, band = null, currency = null, serving = null;
        if (pieces.Length == 3 && query.Count == 3 && query.TryGetValue("save_offer", out var offer)
            && OfferId().IsMatch(offer)
            && pieces[2] == "save_offer=" + Uri.EscapeDataString(offer))
        { kind = "offer"; item = offer; }
        else if (pieces.Length == 3 && query.Count == 3 && query.TryGetValue("save_customer", out var customer)
            && CustomerId().IsMatch(customer) && pieces[2] == "save_customer=" + customer)
        { kind = "customer"; item = customer; }
        else if (pieces.Length == 4 && query.Count == 4
            && query.TryGetValue("save_drink", out var drink) && DrinkCode().IsMatch(drink)
            && query.TryGetValue("band", out var italianBand)
            && (italianBand == "normal" || italianBand == "happy_hour")
            && pieces[2] == "save_drink=" + drink && pieces[3] == "band=" + italianBand)
        { kind = "legacy"; item = drink; band = italianBand; }
        else if (pieces.Length == 6 && query.Count == 6
            && query.TryGetValue("save_europe", out var euroDrink) && DrinkCode().IsMatch(euroDrink)
            && query.TryGetValue("band", out var euroBand)
            && (euroBand == "normal" || euroBand == "happy_hour")
            && query.TryGetValue("currency", out var euroCurrency)
            && (euroCurrency == "EUR" || euroCurrency == "GBP")
            && query.TryGetValue("serving", out var euroServing)
            && ValidServing(euroDrink, euroServing)
            && pieces[2] == "save_europe=" + euroDrink && pieces[3] == "band=" + euroBand
            && pieces[4] == "currency=" + euroCurrency
            && pieces[5] == "serving=" + Uri.EscapeDataString(euroServing))
        { kind = "europe"; item = euroDrink; band = euroBand; currency = euroCurrency; serving = euroServing; }
        if (kind is null || item is null) return false;
        action = new SaveAction(key, cell, kind, item, band, currency, serving, uri.AbsoluteUri);
        return true;
    }

    internal static bool TryExactEuropeVenue(string? actionUrl, string? bookmarkUrl, out Uri? venue)
    {
        venue = null;
        if (!TrySaveAction(actionUrl, bookmarkUrl, out var action) || action?.Kind != "europe")
            return false;
        var route = $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{action.VenueKey}&c={action.Cell}";
        return TryVenue(route, action.VenueKey, out venue);
    }

    private static bool SameVenue(Uri current, string key, string cell)
    {
        if (current.AbsolutePath == "/bar/" + key)
        {
            var query = ParseQuery(current.Query);
            return query is { Count: 1 } && query.TryGetValue("c", out var currentCell) && currentCell == cell;
        }
        if (current.AbsolutePath != "/mobile/" && current.AbsolutePath != "/mobile/index.html") return false;
        var parameters = ParseQuery(current.Query);
        return parameters is not null && TryVenue(current.AbsoluteUri, key, out _)
            && parameters.TryGetValue("path", out var path)
            && path == "/bar/" + key && parameters.TryGetValue("c", out var mobileCell)
            && mobileCell == cell;
    }

    private static bool ValidServing(string drink, string serving)
    {
        var match = Serving().Match(serving);
        if (!match.Success) return false;
        var unit = match.Groups[1].Value; var digits = match.Groups[2].Value;
        if (digits.Length > 0 && (!int.TryParse(digits, out var ml) || ml is < 1 or > 2000
            || ml.ToString() != digits)) return false;
        return drink is "beer_draft" or "water" ? unit == "ml" && digits.Length > 0
            : drink == "wine_glass" ? unit == "glass"
            : unit == "drink" && digits.Length == 0;
    }

    internal static bool TrySupportEmail(string? address, out Uri? target)
    {
        target = null;
        if (address is not { Length: > 0 and <= 1024 }
            || !address.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)) return false;
        var queryStart = address.IndexOf('?');
        var recipient = queryStart < 0 ? address[7..] : address[7..queryStart];
        if (!recipient.Equals("dovebevo@gmail.com", StringComparison.OrdinalIgnoreCase)) return false;
        if (queryStart >= 0)
        {
            var query = ParseQuery(address[queryStart..]);
            if (query is null || query.Count != 2
                || !query.TryGetValue("subject", out var subject)
                || !query.TryGetValue("body", out var body)
                || subject.Length is < 1 or > 120 || body.Length is < 1 or > 500
                || subject.Any(char.IsControl) || body.Any(char.IsControl)) return false;
        }
        if (!Uri.TryCreate(address, UriKind.Absolute, out var parsed)
            || parsed.Scheme != "mailto" || parsed.Fragment.Length != 0) return false;
        target = parsed;
        return true;
    }

    private static Dictionary<string, string>? ParseQuery(string raw)
    {
        if (!raw.StartsWith('?')) return null;
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in raw[1..].Split('&'))
        {
            var pieces = pair.Split('=', 2);
            if (pieces.Length != 2 || !result.TryAdd(Uri.UnescapeDataString(pieces[0]),
                    Uri.UnescapeDataString(pieces[1])))
                return null;
        }
        return result;
    }

    [GeneratedRegex("^(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})$")]
    private static partial Regex VenueKey();
    [GeneratedRegex("^[0-9b-hjkmnp-z]{5}$")]
    private static partial Regex Cell();
    [GeneratedRegex("^(?:beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)$")]
    private static partial Regex DrinkCode();
    [GeneratedRegex("^[A-Za-z0-9._:-]{1,128}$")]
    private static partial Regex OfferId();
    [GeneratedRegex("^[oc][0-9a-f]{64}$")]
    private static partial Regex CustomerId();
    [GeneratedRegex("^(drink|glass|ml):([0-9]{0,4})$")]
    private static partial Regex Serving();
}

internal sealed record SaveAction(string VenueKey, string Cell, string Kind, string Item,
    string? Band, string? Currency, string? Serving, string CommandUrl);

internal sealed class MapRouteTracker
{
    private string? lastMapRoute;

    internal void Observe(Uri? route)
    {
        if (NavigationPolicy.IsMapRoute(route)) lastMapRoute = route!.AbsoluteUri;
    }

    internal string Destination(Uri? current) => NavigationPolicy.MapDestination(current, lastMapRoute);

    internal int PreferredCityIndex(IReadOnlyList<DiscoveryLocation> cities)
    {
        if (lastMapRoute is null) return 0;
        var query = Uri.UnescapeDataString(new Uri(lastMapRoute).Query);
        if (!query.StartsWith("?at=", StringComparison.Ordinal)) return 0;
        var coordinates = query[4..].Split(',');
        if (coordinates.Length != 2 ||
            !double.TryParse(coordinates[0], NumberStyles.Float, CultureInfo.InvariantCulture,
                out var latitude) ||
            !double.TryParse(coordinates[1], NumberStyles.Float, CultureInfo.InvariantCulture,
                out var longitude)) return 0;
        for (var index = 0; index < cities.Count; index++)
            if (Math.Abs(cities[index].Area.Latitude - latitude) <= 0.00001 &&
                Math.Abs(cities[index].Area.Longitude - longitude) <= 0.00001)
                return index;
        return 0;
    }
}
