using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record DiscoveryCityDirectoryResult(IReadOnlyList<DiscoveryLocation> Cities,
    bool ItalianUnavailable, bool EuropeanUnavailable);

/// <summary>City centres come from the public map places and app venue catalogue.</summary>
internal sealed class DiscoveryCityDirectory
{
    private const int Limit = 2 * 1024 * 1024;
    private static readonly string[] FeaturedItalian =
    [
        "Milano", "Roma", "Torino", "Napoli", "Firenze", "Bologna", "Venezia", "Genova",
        "Palermo", "Bari",
    ];
    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false, UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(12) };
    private readonly Func<string, int, CancellationToken, Task<byte[]>> read;

    internal DiscoveryCityDirectory() : this(ReadAsync) { }

    internal DiscoveryCityDirectory(Func<string, int, CancellationToken, Task<byte[]>> read) =>
        this.read = read;

    internal async Task<DiscoveryCityDirectoryResult> LoadAsync(CancellationToken cancellation)
    {
        var italianTask = LoadItalianAsync(cancellation);
        var europeanTask = LoadEuropeanAsync(cancellation);
        var italian = await italianTask;
        var european = await europeanTask;
        cancellation.ThrowIfCancellationRequested();
        return Merge(italian.Cities, european.Cities, italian.Unavailable, european.Unavailable);
    }

    private async Task<(IReadOnlyList<DiscoveryLocation> Cities, bool Unavailable)> LoadItalianAsync(
        CancellationToken cancellation)
    {
        try
        {
            using var health = JsonDocument.Parse(await read("https://www.dovebevo.com/api/health", 8192,
                cancellation));
            var version = health.RootElement.GetProperty("data_version").GetString();
            if (health.RootElement.GetProperty("status").GetString() != "ok" || version is null ||
                !Regex.IsMatch(version, "^[0-9]{8}$", RegexOptions.CultureInvariant))
                throw new InvalidDataException("Invalid map version");
            using var places = JsonDocument.Parse(await read(
                $"https://www.dovebevo.com/data/{version}/places.json", Limit, cancellation));
            return (ParseItalianPlaces(places), false);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
        catch (Exception) { return ([], true); }
    }

    private async Task<(IReadOnlyList<DiscoveryLocation> Cities, bool Unavailable)> LoadEuropeanAsync(
        CancellationToken cancellation)
    {
        try
        {
            using var catalog = JsonDocument.Parse(await read(
                "https://www.dovebevo.com/mobile-data/catalog.json", Limit, cancellation));
            return (ParseCatalogue(catalog), false);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
        catch (Exception) { return ([], true); }
    }

    internal static IReadOnlyList<DiscoveryLocation> ParseItalianPlaces(JsonDocument document)
    {
        var rows = document.RootElement;
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 50_000)
            throw new InvalidDataException("Invalid places list");
        var byName = new Dictionary<string, (DiscoveryLocation City, int Bars)>(StringComparer.Ordinal);
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() != 5)
                throw new InvalidDataException("Invalid place");
            var fields = row.EnumerateArray().ToArray();
            var id = fields[0].GetInt64();
            var name = Text(fields[1], 120);
            var latitude = fields[2].GetDouble();
            var longitude = fields[3].GetDouble();
            var bars = fields[4].GetInt32();
            if (id < 1 || id > 9_007_199_254_740_991 || !double.IsFinite(latitude) ||
                latitude is < 35.2 or > 47.2 || !double.IsFinite(longitude) ||
                longitude is < 6.5 or > 18.6 || bars is < 0 or > 1_000_000)
                throw new InvalidDataException("Invalid place centre");
            // The published file orders duplicate municipality names by venue count.
            byName.TryAdd(Fold(name), (new DiscoveryLocation(name,
                new DiscoveryArea(latitude, longitude, 14), "IT"), bars));
        }
        var featured = new List<DiscoveryLocation>();
        foreach (var name in FeaturedItalian)
            if (byName.Remove(Fold(name), out var place)) featured.Add(place.City);
        featured.AddRange(byName.Values.Where(place => place.Bars > 0)
            .OrderByDescending(place => place.Bars)
            .ThenBy(place => place.City.Name, StringComparer.Create(CultureInfo.GetCultureInfo("it-IT"),
                ignoreCase: true))
            .Select(place => place.City));
        return featured;
    }

    internal static IReadOnlyList<DiscoveryLocation> ParseCatalogue(JsonDocument document)
    {
        // Reuse the app's validated catalogue identity/currency/cell contract.
        EuropeDiscoveryClient.ParseCatalog(document);
        var grouped = new Dictionary<string, (string Name, string Country, double Latitude,
            double Longitude, int Count)>(StringComparer.Ordinal);
        foreach (var venue in document.RootElement.GetProperty("venues").EnumerateArray())
        {
            var name = venue.GetProperty("city").GetString()!;
            var country = venue.GetProperty("country").GetString()!;
            var key = country + "|" + Fold(name);
            var lat = venue.GetProperty("lat").GetDouble();
            var lon = venue.GetProperty("lon").GetDouble();
            if (grouped.TryGetValue(key, out var current))
                grouped[key] = (current.Name, country, current.Latitude + lat,
                    current.Longitude + lon, current.Count + 1);
            else grouped.Add(key, (name, country, lat, lon, 1));
        }
        return grouped.Values.Select(group => new DiscoveryLocation(group.Name,
                new DiscoveryArea(group.Latitude / group.Count, group.Longitude / group.Count, 14),
                group.Country))
            .OrderBy(city => city.Country == "IT" ? 0 : 1)
            .ThenBy(city => city.Name, StringComparer.Create(CultureInfo.GetCultureInfo("it-IT"),
                ignoreCase: true))
            .ThenBy(city => city.Country, StringComparer.Ordinal)
            .ToArray();
    }

    internal static DiscoveryCityDirectoryResult Merge(IReadOnlyList<DiscoveryLocation> italian,
        IReadOnlyList<DiscoveryLocation> catalogue, bool italianUnavailable = false,
        bool europeanUnavailable = false)
    {
        var cities = new List<DiscoveryLocation>(italian);
        var seen = italian.Select(city => city.Key).ToHashSet(StringComparer.Ordinal);
        foreach (var city in catalogue)
            if (seen.Add(city.Key)) cities.Add(city);
        return new DiscoveryCityDirectoryResult(cities, italianUnavailable, europeanUnavailable);
    }

    /// <summary>A short Italian-first preview, with search over every loaded city.</summary>
    internal static IReadOnlyList<DiscoveryLocation> Visible(IReadOnlyList<DiscoveryLocation> cities,
        string query)
    {
        var search = Fold(query.Trim());
        if (search.Length == 0)
            return cities.Where(city => city.Country == "IT").Take(10)
                .Concat(cities.Where(city => city.Country != "IT").Take(8)).ToArray();
        var prefix = cities.Where(city => Fold(city.Name).StartsWith(search, StringComparison.Ordinal));
        var contains = cities.Where(city => !Fold(city.Name).StartsWith(search, StringComparison.Ordinal) &&
            (Fold(city.Name).Contains(search, StringComparison.Ordinal) ||
             Fold(city.CountryName).Contains(search, StringComparison.Ordinal)));
        return prefix.Concat(contains).Take(40).ToArray();
    }

    private static string Text(JsonElement value, int max)
    {
        var text = value.GetString() ?? "";
        if (text.Length is < 2 || text.Length > max || text != text.Trim() || text.Any(char.IsControl))
            throw new InvalidDataException("Invalid city text");
        return text;
    }

    internal static string Fold(string text)
    {
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var result = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
                result.Append(char.ToUpperInvariant(character));
        return result.ToString();
    }

    private static async Task<byte[]> ReadAsync(string address, int maximum,
        CancellationToken cancellation)
    {
        var uri = new Uri(address);
        if (!NavigationPolicy.IsTrusted(uri) || uri.DnsSafeHost != "www.dovebevo.com")
            throw new InvalidDataException("Untrusted city URL");
        using var response = await Client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead,
            cancellation);
        if (response.StatusCode != HttpStatusCode.OK ||
            response.Content.Headers.ContentType?.MediaType != "application/json" ||
            response.Content.Headers.ContentLength > maximum)
            throw new InvalidDataException("City source unavailable");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
        using var buffer = new MemoryStream();
        var block = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(block, cancellation)) != 0)
        {
            if (buffer.Length + count > maximum) throw new InvalidDataException("City source too large");
            buffer.Write(block, 0, count);
        }
        return buffer.ToArray();
    }
}
