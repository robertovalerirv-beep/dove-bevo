using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record EuropeVenue(string Key, string Cell, string Name, string City, string Currency);
internal sealed record EuropeDiscoverySnapshot(IReadOnlyList<DiscoveryRow> Rows,
    int UnavailableCells, bool CatalogUnavailable);

/// <summary>Reads original-currency app catalogue prices without publishing contributions.</summary>
internal static class EuropeDiscoveryClient
{
    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false, UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly Regex Version = new("^[A-Za-z0-9._-]{1,100}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private const int Limit = 2 * 1024 * 1024;

    internal static async Task<EuropeDiscoverySnapshot> LoadAsync(IReadOnlyList<string> cells,
        string category, CancellationToken cancellation)
    {
        (string Version, IReadOnlyDictionary<string, EuropeVenue> Venues) catalog;
        try
        {
            using var document = await ReadAsync("https://www.dovebevo.com/mobile-data/catalog.json",
                cancellation);
            catalog = ParseCatalog(document);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
        catch (Exception) { return new EuropeDiscoverySnapshot([], 0, true); }

        var relevant = cells.Where(cell => catalog.Venues.Values.Any(venue => venue.Cell == cell))
            .Distinct(StringComparer.Ordinal).ToArray();
        using var gate = new SemaphoreSlim(3);
        var tasks = relevant.Select(async cell =>
        {
            await gate.WaitAsync(cancellation);
            try
            {
                using var page = await ReadAsync($"https://www.dovebevo.com/api/mobile/prices/cells/{cell}",
                    cancellation);
                return ParseCell(page, cell, category, catalog.Version, catalog.Venues);
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
            catch (Exception) { return null; }
            finally { gate.Release(); }
        }).ToArray();
        var pages = await Task.WhenAll(tasks);
        cancellation.ThrowIfCancellationRequested();
        return new EuropeDiscoverySnapshot(pages.Where(page => page is not null)
            .SelectMany(page => page!).ToArray(), pages.Count(page => page is null), false);
    }

    internal static (string Version, IReadOnlyDictionary<string, EuropeVenue> Venues)
        ParseCatalog(JsonDocument document)
    {
        var root = document.RootElement;
        var version = root.GetProperty("version").GetString() ?? "";
        if (root.GetProperty("schema_version").GetInt32() != 1 || !Version.IsMatch(version))
            throw new InvalidDataException("Invalid European catalogue version");
        var rows = root.GetProperty("venues");
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 5000)
            throw new InvalidDataException("Invalid European catalogue size");
        var venues = new Dictionary<string, EuropeVenue>(StringComparer.Ordinal);
        foreach (var row in rows.EnumerateArray())
        {
            var key = row.GetProperty("key").GetString() ?? "";
            var cell = row.GetProperty("cell").GetString() ?? "";
            var name = Text(row.GetProperty("name"), 120);
            var city = Text(row.GetProperty("city"), 120);
            var country = row.GetProperty("country").GetString();
            var currency = row.GetProperty("currency").GetString() ?? "";
            var latitude = row.GetProperty("lat").GetDouble();
            var longitude = row.GetProperty("lon").GetDouble();
            if (!NavigationPolicy.TryVenue(
                    $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{key}&c={cell}", key, out _) ||
                !double.IsFinite(latitude) || latitude is < -90 or > 90 ||
                !double.IsFinite(longitude) || longitude is < -180 or > 180 ||
                DiscoveryArea.Geohash(latitude, longitude) != cell ||
                country is not ("IT" or "GB" or "FR" or "ES" or "DE") ||
                currency != (country == "GB" ? "GBP" : "EUR") ||
                !venues.TryAdd(key, new EuropeVenue(key, cell, name, city, currency)))
                throw new InvalidDataException("Invalid European catalogue venue");
        }
        return (version, venues);
    }

    internal static IReadOnlyList<DiscoveryRow> ParseCell(JsonDocument document, string cell,
        string category, string version, IReadOnlyDictionary<string, EuropeVenue> catalog)
    {
        var root = document.RootElement;
        if (root.GetProperty("schema_version").GetInt32() != 1 ||
            root.GetProperty("catalog_version").GetString() != version)
            throw new InvalidDataException("European snapshot version mismatch");
        var rows = root.GetProperty("rows");
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 5000)
            throw new InvalidDataException("European snapshot size mismatch");
        var hidden = Excluded(root.GetProperty("hidden"), cell, catalog);
        var legacy = Excluded(root.GetProperty("legacy_venues"), cell, catalog);
        var result = new List<DiscoveryRow>();
        var identities = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows.EnumerateArray())
        {
            var key = row.GetProperty("venue").GetString() ?? "";
            if (!catalog.TryGetValue(key, out var venue) || venue.Cell != cell ||
                row.GetProperty("cell").GetString() != cell ||
                row.GetProperty("currency").GetString() != venue.Currency)
                throw new InvalidDataException("European price venue mismatch");
            var drink = row.GetProperty("drink").GetString() ?? "";
            if (!DiscoveryClient.Categories.Any(value => value.Code == drink))
                throw new InvalidDataException("European drink category mismatch");
            var hh = row.GetProperty("hh").GetInt32();
            var amount = row.GetProperty("amount_minor").GetInt64();
            var status = row.GetProperty("status").GetString();
            if (hh is not (0 or 1) || amount is < 1 or > 100_000 ||
                status is not ("active" or "quarantined"))
                throw new InvalidDataException("European price value mismatch");
            var serving = Serving(row.GetProperty("serving"), drink);
            if (!identities.Add($"{key}|{drink}|{hh}|{venue.Currency}|{serving}"))
                throw new InvalidDataException("Duplicate European price identity");
            if (hidden.Contains(key) || legacy.Contains(key) || drink != category) continue;
            var provenance = row.GetProperty("provenance");
            var kind = provenance.GetProperty("kind").GetString();
            string name;
            string? source;
            DateOnly day;
            if (kind == "online_menu")
            {
                name = Text(provenance.GetProperty("menu_item"), 240);
                source = provenance.GetProperty("source_url").GetString();
                var hash = provenance.GetProperty("source_sha256").GetString() ?? "";
                if (!ValidHttps(source) || hash.Length != 64 || !hash.All(Uri.IsHexDigit) ||
                    !Day(provenance.GetProperty("source_checked_on"), out day))
                    throw new InvalidDataException("Invalid European menu source");
            }
            else if (kind == "customer")
            {
                name = DiscoveryClient.Categories.Single(value => value.Code == drink).Name;
                source = null;
                if (!Day(row.GetProperty("observed_on"), out day))
                    throw new InvalidDataException("Invalid European customer date");
            }
            else throw new InvalidDataException("Invalid European provenance");
            result.Add(new DiscoveryRow(key, cell, venue.Name, venue.City, drink, name, amount,
                venue.Currency, 2, hh == 1 ? "happy_hour" : "regular",
                status == "quarantined" ? "Da confermare" : null, source, day,
                serving, true));
        }
        return result;
    }

    private static HashSet<string> Excluded(JsonElement values, string cell,
        IReadOnlyDictionary<string, EuropeVenue> catalog)
    {
        if (values.ValueKind != JsonValueKind.Array) throw new InvalidDataException("Invalid exclusions");
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var value in values.EnumerateArray())
        {
            var key = value.GetString() ?? "";
            if (!catalog.TryGetValue(key, out var venue) || venue.Cell != cell || !result.Add(key))
                throw new InvalidDataException("Invalid excluded venue");
        }
        return result;
    }

    private static string Serving(JsonElement value, string drink)
    {
        var unit = value.GetProperty("unit").GetString();
        var ml = value.TryGetProperty("ml", out var count) && count.ValueKind != JsonValueKind.Null
            ? count.GetInt32() : (int?)null;
        if (ml is < 1 or > 2000 ||
            (drink is "beer_draft" or "water" && (unit != "ml" || ml is null)) ||
            (drink == "wine_glass" && unit != "glass") ||
            (drink is not ("beer_draft" or "water" or "wine_glass") &&
                (unit != "drink" || ml is not null)))
            throw new InvalidDataException("Invalid European serving");
        return unit switch
        {
            "ml" => $"{ml} ml",
            "glass" => ml is null ? "Calice" : $"Calice · {ml} ml",
            "drink" => "Drink singolo",
            _ => throw new InvalidDataException("Invalid European serving unit"),
        };
    }

    private static bool Day(JsonElement value, out DateOnly day) =>
        DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out day) && day <= DateOnly.FromDateTime(DateTime.UtcNow);

    private static string Text(JsonElement value, int max)
    {
        var text = value.GetString() ?? "";
        if (text.Length is < 2 || text.Length > max || text != text.Trim() ||
            text.Any(char.IsControl)) throw new InvalidDataException("Invalid European text");
        return text;
    }

    private static bool ValidHttps(string? value) =>
        value is { Length: > 0 and <= 2048 } &&
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps &&
        uri.UserInfo.Length == 0 && uri.Fragment.Length == 0 && uri.Port == 443;

    private static async Task<JsonDocument> ReadAsync(string address, CancellationToken cancellation)
    {
        var uri = new Uri(address);
        if (!NavigationPolicy.IsTrusted(uri) || uri.DnsSafeHost != "www.dovebevo.com")
            throw new InvalidDataException("Untrusted European price URL");
        using var response = await Client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead,
            cancellation);
        if (response.StatusCode != HttpStatusCode.OK ||
            response.Content.Headers.ContentType?.MediaType != "application/json" ||
            response.Content.Headers.ContentLength > Limit)
            throw new InvalidDataException("European price route unavailable");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
        using var buffer = new MemoryStream();
        var block = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(block, cancellation)) != 0)
        {
            if (buffer.Length + count > Limit) throw new InvalidDataException("European response too large");
            buffer.Write(block, 0, count);
        }
        return JsonDocument.Parse(buffer.ToArray());
    }
}
