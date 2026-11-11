namespace DoveBevo.Windows;

/// Exact local favourite identities exposed only to the trusted mobile app document.
internal static class NativeSavedDrinkKeys
{
    internal static IReadOnlyList<string> FromBookmarks(IEnumerable<Bookmark> bookmarks, Uri? current)
    {
        var keys = new List<string>();
        if (current is null || current.AbsolutePath is not ("/mobile/" or "/mobile/index.html"))
            return keys;
        foreach (var bookmark in bookmarks)
        {
            if (bookmark.ActionUrl is null ||
                !NavigationPolicy.TrySaveAction(bookmark.ActionUrl, current.AbsoluteUri, out var action) ||
                action is null) continue;
            var key = $"{action.VenueKey}|{action.Cell}|{action.Kind}|{action.Item}";
            if (action.Kind is "legacy" or "europe")
                key += action.Band == "happy_hour" ? "|1" : "|0";
            if (action.Kind == "europe")
                key += $"|{action.Currency}|{action.Serving}";
            keys.Add(key);
        }
        return keys;
    }
}
