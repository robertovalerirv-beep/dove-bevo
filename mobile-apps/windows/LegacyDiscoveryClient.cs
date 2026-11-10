using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record LegacyDiscoverySnapshot(IReadOnlyList<DiscoveryRow> Rows, int UnavailableSources);

// The public Italian map data remains a separate source from owner menu offers.
// Reading it here keeps Windows Scopri in step with the phone apps.
internal static class LegacyDiscoveryClient
{
    private sealed record Venue(string Name, string City);
    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(12) };

    internal static async Task<LegacyDiscoverySnapshot> LoadAsync(IReadOnlyList<string> cells,
        string category, CancellationToken cancellation)
    {
        if (!DiscoveryClient.Categories.Any(item => item.Code == category))
            throw new ArgumentException("Unknown drink", nameof(category));
        var italianCells = cells.Where(IsItalianCell).ToArray();
        if (italianCells.Length == 0) return new LegacyDiscoverySnapshot([], 0);
        string version;
        try
        {
            using var health = JsonDocument.Parse(await ReadAsync("https://www.dovebevo.com/api/health", 8192, cancellation));
            version = health.RootElement.GetProperty("data_version").GetString() ?? "";
            Require(health.RootElement.GetProperty("status").GetString() == "ok" &&
                    Regex.IsMatch(version, "^[0-9]{8}$"), "Invalid map version");
        }
        catch (Exception error) when (ReadFailure(error))
        {
            cancellation.ThrowIfCancellationRequested();
            return new LegacyDiscoverySnapshot([], italianCells.Length);
        }

        using var gate = new SemaphoreSlim(3);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Europe/Rome")));
        var tasks = italianCells.Select(async cell =>
        {
            await gate.WaitAsync(cancellation);
            try
            {
                var price = await ReadAsync($"https://www.dovebevo.com/api/prices/{cell}", 512 * 1024, cancellation);
                byte[]? staticData = null;
                try
                {
                    staticData = await ReadAsync($"https://www.dovebevo.com/data/{version}/v/{cell}.json",
                        2 * 1024 * 1024, cancellation);
                }
                catch (Exception error) when (ReadFailure(error))
                {
                    cancellation.ThrowIfCancellationRequested();
                    // Approved user venues can still be resolved without the OSM asset.
                }
                IReadOnlyList<DiscoveryRow> rows;
                try { rows = ParseCell(staticData, price, cell, category, today); }
                catch (InvalidDataException) when (staticData is not null)
                {
                    // An invalid OSM asset cannot erase separately validated user venues.
                    rows = ParseCell(null, price, cell, category, today);
                    staticData = null;
                }
                return (Rows: rows, Unavailable: staticData is null ? 1 : 0);
            }
            catch (Exception error) when (ReadFailure(error))
            {
                cancellation.ThrowIfCancellationRequested();
                return (Rows: (IReadOnlyList<DiscoveryRow>)[], Unavailable: 1);
            }
            finally { gate.Release(); }
        }).ToArray();
        var pages = await Task.WhenAll(tasks);
        cancellation.ThrowIfCancellationRequested();
        return new LegacyDiscoverySnapshot(pages.SelectMany(page => page.Rows).ToArray(),
            pages.Sum(page => page.Unavailable));
    }

    private static async Task<byte[]> ReadAsync(string url, int maximum, CancellationToken cancellation)
    {
        using var response = await Client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellation);
        Require(response.StatusCode == HttpStatusCode.OK &&
                response.Content.Headers.ContentType?.MediaType == "application/json" &&
                (response.Content.Headers.ContentLength is not { } length || length <= maximum),
            "Map data unavailable");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
        using var buffer = new MemoryStream();
        var block = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(block, cancellation)) != 0)
        {
            Require(buffer.Length + count <= maximum, "Map data too large");
            buffer.Write(block, 0, count);
        }
        return buffer.ToArray();
    }

    internal static IReadOnlyList<DiscoveryRow> ParseCell(byte[]? staticData, byte[] priceData,
        string cell, string category, DateOnly today)
    {
        try
        {
            Require(Regex.IsMatch(cell, "^[0-9b-hjkmnp-z]{5}$") &&
                    DiscoveryClient.Categories.Any(item => item.Code == category) &&
                    priceData.Length <= 512 * 1024, "Invalid map request");
            var venues = staticData is null ? new Dictionary<string, Venue>(StringComparer.Ordinal)
                : ParseStatic(staticData, cell);
            using var document = JsonDocument.Parse(priceData);
            var root = document.RootElement;
            Require(root.ValueKind == JsonValueKind.Object, "Invalid price data");
            var keys = root.EnumerateObject().Select(item => item.Name).ToArray();
            Require(keys.Distinct(StringComparer.Ordinal).Count() == keys.Length &&
                    keys.Contains("p") && keys.Contains("u") && keys.Contains("pend") && keys.Contains("h") &&
                    keys.All(key => key is "p" or "u" or "pend" or "h" or "g"), "Invalid price fields");
            var approved = root.GetProperty("u");
            var pending = root.GetProperty("pend");
            var hidden = root.GetProperty("h");
            var prices = root.GetProperty("p");
            Require(approved.ValueKind == JsonValueKind.Array && pending.ValueKind == JsonValueKind.Array &&
                    hidden.ValueKind == JsonValueKind.Array && prices.ValueKind == JsonValueKind.Array,
                    "Invalid price arrays");
            var pendingKeys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in approved.EnumerateArray())
            {
                Require(row.ValueKind == JsonValueKind.Array && row.GetArrayLength() == 5, "Invalid approved venue");
                var key = Key(row[0], "u");
                var name = Text(row[1], 1, 120);
                Integer(row[2], 0, 4);
                Coordinates(row[3], row[4], cell);
                Require(venues.TryAdd(key, new Venue(name, "")), "Duplicate venue");
            }
            foreach (var row in pending.EnumerateArray())
            {
                Require(row.ValueKind == JsonValueKind.Array && row.GetArrayLength() == 6, "Invalid pending venue");
                var key = Key(row[0], "u");
                Text(row[1], 1, 120);
                Integer(row[2], 0, 4);
                Coordinates(row[3], row[4], cell);
                Integer(row[5], 0, int.MaxValue);
                Require(!venues.ContainsKey(key) && pendingKeys.Add(key), "Duplicate pending venue");
            }
            var hiddenKeys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in hidden.EnumerateArray())
                Require(hiddenKeys.Add(Key(item, "nwru")), "Duplicate hidden venue");
            if (root.TryGetProperty("g", out var verified))
            {
                Require(verified.ValueKind == JsonValueKind.Array, "Invalid verification list");
                var verifiedKeys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var item in verified.EnumerateArray())
                    Require(verifiedKeys.Add(Key(item, "nwru")), "Duplicate verified venue");
            }
            var pairs = new HashSet<string>(StringComparer.Ordinal);
            var rows = new List<DiscoveryRow>();
            foreach (var item in prices.EnumerateArray())
            {
                Require(item.ValueKind == JsonValueKind.Array && item.GetArrayLength() == 7, "Invalid price row");
                var key = Key(item[0], "nwru");
                var drink = Text(item[1], 1, 32);
                Require(DiscoveryClient.Categories.Any(value => value.Code == drink), "Unknown drink");
                var hour = Integer(item[2], 0, 1);
                var amount = Integer(item[3], 1, 100_000);
                var bounds = Bounds(drink);
                Require(amount >= bounds.Min && amount <= bounds.Max, "Price out of range");
                var date = Date(item[4], today);
                Integer(item[5], 0, int.MaxValue);
                var quarantined = Integer(item[6], 0, 1) == 1;
                Require(pairs.Add($"{key}|{drink}|{hour}"), "Duplicate price");
                if (drink != category || quarantined || hiddenKeys.Contains(key) ||
                    pendingKeys.Contains(key) || !venues.TryGetValue(key, out var venue)) continue;
                rows.Add(new DiscoveryRow(key, cell, venue.Name, venue.City, drink,
                    DiscoveryClient.Categories.Single(value => value.Code == drink).Name, amount, "EUR", 2,
                    hour == 1 ? "happy_hour" : "regular", null, null, date));
            }
            return rows;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or
                                       ArgumentOutOfRangeException or FormatException or OverflowException)
        {
            throw new InvalidDataException("Invalid public Italian map data", error);
        }
    }

    private static Dictionary<string, Venue> ParseStatic(byte[] payload, string cell)
    {
        Require(payload.Length <= 2 * 1024 * 1024, "Map asset too large");
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        Require(root.ValueKind == JsonValueKind.Object &&
                root.EnumerateObject().Select(item => item.Name).Order().SequenceEqual(new[] { "c", "v" }),
                "Invalid map asset");
        var cityRows = root.GetProperty("c");
        var venueRows = root.GetProperty("v");
        Require(cityRows.ValueKind == JsonValueKind.Array && venueRows.ValueKind == JsonValueKind.Array,
            "Invalid map asset arrays");
        var cities = new List<string>();
        foreach (var row in cityRows.EnumerateArray())
        {
            Require(row.ValueKind == JsonValueKind.Array && row.GetArrayLength() == 2, "Invalid city");
            Integer(row[0], 1, long.MaxValue);
            cities.Add(Text(row[1], 1, 120));
        }
        var venues = new Dictionary<string, Venue>(StringComparer.Ordinal);
        foreach (var row in venueRows.EnumerateArray())
        {
            Require(row.ValueKind == JsonValueKind.Array && row.GetArrayLength() == 7, "Invalid venue");
            var key = Key(row[0], "nwr");
            var name = Text(row[1], 1, 120);
            Integer(row[2], 0, 4);
            Coordinates(row[3], row[4], cell);
            Text(row[5], 0, 240);
            var cityIndex = Integer(row[6], -1, cities.Count - 1);
            Require(venues.TryAdd(key, new Venue(name, cityIndex < 0 ? "" : cities[(int)cityIndex])),
                "Duplicate venue");
        }
        return venues;
    }

    private static string Key(JsonElement value, string prefixes)
    {
        var key = Text(value, 2, 17);
        Require(prefixes.Contains(key[0]) && Regex.IsMatch(key, "^[nwru][1-9][0-9]{0,14}$"),
            "Invalid venue key");
        return key;
    }

    private static string Text(JsonElement value, int minimum, int maximum)
    {
        Require(value.ValueKind == JsonValueKind.String, "Invalid text");
        var text = value.GetString() ?? "";
        Require(text.Length >= minimum && text.Length <= maximum && text == text.Trim() &&
                !text.Any(char.IsControl), "Invalid text");
        return text;
    }

    private static long Integer(JsonElement value, long minimum, long maximum)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var number))
            throw new InvalidDataException("Invalid integer");
        Require(number >= minimum && number <= maximum, "Invalid integer");
        return number;
    }

    private static void Coordinates(JsonElement latitude, JsonElement longitude, string cell)
    {
        Require(latitude.ValueKind == JsonValueKind.Number && longitude.ValueKind == JsonValueKind.Number &&
                latitude.TryGetDouble(out var lat) && longitude.TryGetDouble(out var lon) &&
                double.IsFinite(lat) && double.IsFinite(lon) && lat is >= -90 and <= 90 &&
                lon is >= -180 and <= 180 && DiscoveryArea.Geohash(lat, lon) == cell, "Invalid coordinates");
    }

    private static DateOnly Date(JsonElement value, DateOnly today)
    {
        var text = Text(value, 10, 10);
        Require(DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var date) && date <= today, "Invalid observation date");
        return date;
    }

    private static (long Min, long Max) Bounds(string drink) => drink switch
    {
        "beer_draft" => (250, 1200),
        "spritz" => (250, 1500),
        "negroni" or "sbagliato" or "gin_tonic" or "gin_lemon" => (400, 2000),
        "wine_glass" => (200, 1500),
        "alcohol_free" => (200, 1200),
        "water" => (50, 600),
        _ => throw new InvalidDataException("Unknown drink"),
    };

    // Same coarse geohash-cell intersection used by iOS for legacy Italian data.
    internal static bool IsItalianCell(string cell)
    {
        const string alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
        if (cell.Length != 5) return false;
        var south = -90.0; var north = 90.0; var west = -180.0; var east = 180.0;
        var even = true;
        foreach (var character in cell)
        {
            var value = alphabet.IndexOf(character);
            if (value < 0) return false;
            for (var bit = 4; bit >= 0; bit--)
            {
                var high = (value & (1 << bit)) != 0;
                if (even)
                {
                    var middle = (west + east) / 2;
                    if (high) west = middle; else east = middle;
                }
                else
                {
                    var middle = (south + north) / 2;
                    if (high) south = middle; else north = middle;
                }
                even = !even;
            }
        }
        return north >= 35 && south <= 48 && east >= 6 && west <= 19;
    }

    private static bool ReadFailure(Exception error) => error is HttpRequestException or IOException or
        JsonException or InvalidDataException or TaskCanceledException or InvalidOperationException or
        KeyNotFoundException or FormatException or OverflowException;

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidDataException(message);
    }
}
