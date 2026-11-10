using System.IO;
using System.Text.Json;

namespace DoveBevo.Windows;

internal sealed record Bookmark(string VenueKey, string VenueName, string DrinkName, string Url,
    string? ActionUrl = null)
{
    public string Display => $"{DrinkName}{(Url.EndsWith("&hh=1", StringComparison.Ordinal) ||
        ActionUrl?.Contains("band=happy_hour", StringComparison.Ordinal) == true ? " · Happy hour" : "")} · {VenueName}";
    public string Identity => ActionUrl ?? Url;
}

internal sealed record BookmarkView(Bookmark Bookmark, string Price)
{
    public string Display => $"{Bookmark.Display}\n{Price}";
}

internal sealed class BookmarkStore
{
    private readonly string file;
    private List<Bookmark> items = [];
    private bool writable = true;

    public BookmarkStore(string? fileOverride = null)
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DoveBevo", "Windows");
        file = fileOverride ?? Path.Combine(root, "favourite-drinks-v1.json");
        if (!File.Exists(file)) return;
        try
        {
            var loaded = JsonSerializer.Deserialize<List<Bookmark>>(File.ReadAllText(file));
            if (loaded is { Count: <= 200 } && loaded.All(IsValid)) items = loaded;
            else writable = false;
        }
        catch (JsonException) { writable = false; }
        catch (IOException) { writable = false; }
    }

    public IReadOnlyList<Bookmark> Items => items.AsReadOnly();

    public bool Add(Bookmark item)
    {
        if (!writable || !IsValid(item) || items.Count >= 200
            || items.Any(existing => existing.Identity == item.Identity))
            return false;
        var next = new List<Bookmark>(items) { item };
        Persist(next);
        items = next;
        return true;
    }

    public bool Remove(Bookmark item)
    {
        if (!writable) return false;
        var next = items.Where(existing => existing != item).ToList();
        if (next.Count == items.Count) return false;
        Persist(next);
        items = next;
        return true;
    }

    private void Persist(List<Bookmark> next)
    {
        var directory = Path.GetDirectoryName(file)!;
        Directory.CreateDirectory(directory);
        var pending = file + ".new";
        File.WriteAllText(pending, JsonSerializer.Serialize(next));
        File.Move(pending, file, true);
    }

    private static bool IsValid(Bookmark? item)
    {
        return item is not null
            && NavigationPolicy.TryVenue(item.Url, item.VenueKey, out _)
            && (item.ActionUrl is null || NavigationPolicy.TrySaveAction(item.ActionUrl, item.Url, out _))
            && ValidLabel(item.VenueName, 120)
            && ValidLabel(item.DrinkName, 120);
    }

    private static bool ValidLabel(string? text, int max)
    {
        return text is { Length: > 0 } && text.Length <= max && text == text.Trim()
            && !text.Any(char.IsControl);
    }
}
