using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal static partial class NavigationPolicy
{
    internal const string Home = "https://www.dovebevo.com/";
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
            if (query.Count != 2
                || !query.TryGetValue("path", out path)
                || !query.TryGetValue("c", out var cell)
                || !Cell().IsMatch(cell))
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
}
