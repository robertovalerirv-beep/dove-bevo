using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal static partial class NavigationPolicy
{
    internal const string Home = "https://www.dovebevo.com/";
    internal const string Discover = "https://www.dovebevo.com/mobile/";
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
                || (query.Count != 2 && query.Count != 4)
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

    internal static bool TryRecommendationEndpoint(string? address, string? key, out Uri? endpoint)
    {
        endpoint = null;
        if (key is null || !LegacyVenueKey().IsMatch(key)
            || !TryVenue(address, key, out var venue) || venue is null)
            return false;
        var query = ParseQuery(venue.Query);
        if (query is null || !query.TryGetValue("c", out var cell) || !Cell().IsMatch(cell))
            return false;
        endpoint = new Uri($"https://www.dovebevo.com/api/mobile/venues/{key}/recommendations?c={cell}");
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
    [GeneratedRegex("^[nwru][1-9][0-9]{0,14}$")]
    private static partial Regex LegacyVenueKey();
    [GeneratedRegex("^[0-9b-hjkmnp-z]{5}$")]
    private static partial Regex Cell();
    [GeneratedRegex("^(?:beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)$")]
    private static partial Regex DrinkCode();
}
