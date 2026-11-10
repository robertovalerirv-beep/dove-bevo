using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record DiscoveryCategory(string Code, string Name)
{
    public override string ToString() => Name;
}

internal sealed record DiscoveryLocation(string Name, DiscoveryArea Area)
{
    public override string ToString() => Name;
}

internal sealed record DiscoveryRow(string Key, string Cell, string Venue, string City,
    string DrinkCode, string Drink, long AmountMinor, string Currency, int Exponent,
    string Context, string? Condition, string? SourceUrl, DateOnly CheckedOn,
    string? Serving = null, bool IsEurope = false)
{
    public string Display
    {
        get
        {
            var value = AmountMinor / Math.Pow(10, Exponent);
            var price = value.ToString("N" + Exponent, CultureInfo.GetCultureInfo("it-IT"));
            var context = Context == "regular" ? "" : Context == "happy_hour" ? " · Happy hour" : " · Condizione";
            return $"{Venue} · {(City.Length == 0 ? "Località non indicata" : City)}\n{Drink} · {price} {Currency}{context}" +
                   (Serving is null ? "" : $" · {Serving}") +
                   (Condition is null ? "" : $" · {Condition}") +
                   (SourceUrl is null
                       ? $"\nSegnalato da un cliente il {CheckedOn:dd/MM/yyyy}"
                       : $"\nMenu: {new Uri(SourceUrl).DnsSafeHost} · verificato {CheckedOn:dd/MM/yyyy}");
        }
    }

    public Uri? FocusedVenue()
    {
        if (IsEurope)
        {
            var mobile = $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{Key}&c={Cell}";
            return NavigationPolicy.TryVenue(mobile, Key, out var venue) ? venue : null;
        }
        var address = $"https://www.dovebevo.com/bar/{Key}?c={Cell}";
        return NavigationPolicy.TryFocusedVenue(address, Key, DrinkCode,
            Context == "happy_hour" ? 1 : 0, out var focused) ? focused : null;
    }
}

internal sealed record DiscoveryArea(double Latitude, double Longitude, double Zoom)
{
    internal static DiscoveryArea? ParseWebView(string json, Uri? current)
    {
        if (!NavigationPolicy.IsTrusted(current)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 4 ||
                root.GetProperty("href").GetString() != current!.AbsoluteUri) return null;
            var latitude = root.GetProperty("latitude").GetDouble();
            var longitude = root.GetProperty("longitude").GetDouble();
            var zoom = root.GetProperty("zoom").GetDouble();
            return double.IsFinite(latitude) && latitude is >= -85.051129 and <= 85.051129 &&
                double.IsFinite(longitude) && longitude is >= -180 and <= 180 &&
                double.IsFinite(zoom) && zoom is >= 13 and <= 24
                ? new DiscoveryArea(latitude, longitude == 180 ? -180 : longitude, zoom) : null;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or KeyNotFoundException
                                       or FormatException or OverflowException)
        {
            return null;
        }
    }

    internal IReadOnlyList<string> Cells()
    {
        const double step = 360.0 / 8192.0;
        var cells = new HashSet<string>(StringComparer.Ordinal);
        for (var y = -1; y <= 1; y++)
        for (var x = -1; x <= 1; x++)
        {
            var lon = Longitude + x * step;
            if (lon > 180) lon -= 360;
            if (lon < -180) lon += 360;
            cells.Add(Geohash(Latitude + y * step, lon));
        }
        return cells.Order(StringComparer.Ordinal).ToArray();
    }

    internal static string Geohash(double latitude, double longitude)
    {
        const string alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
        var south = -90.0; var north = 90.0;
        var west = -180.0; var east = 180.0;
        Span<char> result = stackalloc char[5];
        for (var character = 0; character < 5; character++)
        {
            var value = 0;
            for (var bit = 0; bit < 5; bit++)
            {
                value <<= 1;
                if (((character * 5 + bit) & 1) == 0)
                {
                    var middle = (west + east) / 2;
                    if (longitude >= middle) { value |= 1; west = middle; }
                    else east = middle;
                }
                else
                {
                    var middle = (south + north) / 2;
                    if (latitude >= middle) { value |= 1; south = middle; }
                    else north = middle;
                }
            }
            result[character] = alphabet[value];
        }
        return new string(result);
    }
}

internal sealed record DiscoverySnapshot(IReadOnlyList<DiscoveryRow> Rows, int UnavailableCells,
    bool EuropeUnavailable = false);

internal sealed class DiscoveryClient
{
    internal static readonly DiscoveryLocation[] Cities =
    [
        new("Milano", new(45.4642, 9.1900, 15)),
        new("Roma", new(41.9028, 12.4964, 15)),
        new("Torino", new(45.0703, 7.6869, 15)),
        new("Napoli", new(40.8518, 14.2681, 15)),
        new("Firenze", new(43.7696, 11.2558, 15)),
        new("Bologna", new(44.4949, 11.3426, 15)),
        new("Venezia", new(45.4408, 12.3155, 15)),
        new("Palermo", new(38.1157, 13.3615, 15)),
        new("Londra", new(51.5072, -0.1276, 15)),
        new("Parigi", new(48.8566, 2.3522, 15)),
        new("Berlino", new(52.5200, 13.4050, 15)),
        new("Madrid", new(40.4168, -3.7038, 15)),
    ];
    internal static readonly DiscoveryCategory[] Categories =
    [
        new("beer_draft", "Birra media"), new("spritz", "Spritz"),
        new("negroni", "Negroni"), new("sbagliato", "Sbagliato"),
        new("gin_tonic", "Gin tonic"), new("gin_lemon", "Americano"),
        new("wine_glass", "Calice di vino"), new("alcohol_free", "Analcolico"),
        new("water", "Acqua"),
    ];

    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(12) };

    internal async Task<DiscoverySnapshot> LoadAsync(DiscoveryArea area, string category, CancellationToken cancellation)
    {
        if (!Categories.Any(row => row.Code == category)) throw new ArgumentException("Unknown drink", nameof(category));
        using var gate = new SemaphoreSlim(3);
        var cells = area.Cells();
        var europeTask = EuropeDiscoveryClient.LoadAsync(cells, category, cancellation);
        var legacyTask = LegacyDiscoveryClient.LoadAsync(cells, category, cancellation);
        var tasks = cells.Select(async cell =>
        {
            await gate.WaitAsync(cancellation);
            try { return await LoadCellAsync(cell, category, cancellation); }
            catch (Exception exception) when (exception is HttpRequestException or IOException or JsonException or
                                           InvalidDataException or TaskCanceledException or InvalidOperationException or
                                           KeyNotFoundException or FormatException or OverflowException)
            { return null; }
            finally { gate.Release(); }
        }).ToArray();
        var pages = await Task.WhenAll(tasks);
        var europe = await europeTask;
        var legacy = await legacyTask;
        cancellation.ThrowIfCancellationRequested();
        var rows = pages.Where(page => page is not null).SelectMany(page => page!)
            .Concat(europe.Rows)
            .Concat(legacy.Rows)
            .GroupBy(row => (row.Key, row.Cell, row.DrinkCode, row.Currency,
                row.Context, row.AmountMinor, row.Serving, row.Drink, row.SourceUrl))
            .Select(group => group.First())
            .OrderBy(row => row.Currency, StringComparer.Ordinal)
            .ThenBy(row => row.AmountMinor / Math.Pow(10, row.Exponent))
            .ThenBy(row => row.Venue, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
        return new DiscoverySnapshot(rows, pages.Count(page => page is null) + europe.UnavailableCells +
            legacy.UnavailableSources,
            europe.CatalogUnavailable);
    }

    private static async Task<IReadOnlyList<DiscoveryRow>> LoadCellAsync(string cell, string category,
        CancellationToken cancellation)
    {
        var rows = new List<DiscoveryRow>();
        string? after = null;
        for (var page = 0; page < 10; page++)
        {
            var address = $"https://www.dovebevo.com/api/mobile/v2/menu/cells/{cell}?category={category}" +
                          (after is null ? "" : "&after=" + Uri.EscapeDataString(after));
            using var response = await Client.GetAsync(address, HttpCompletionOption.ResponseHeadersRead, cancellation);
            if (response.StatusCode != HttpStatusCode.OK ||
                response.Content.Headers.ContentType?.MediaType != "application/json")
                throw new InvalidDataException("Menu API unavailable");
            if (response.Content.Headers.ContentLength > 1_048_576)
                throw new InvalidDataException("Menu page too large");
            await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
            using var buffer = new MemoryStream();
            var block = new byte[8192];
            int n;
            while ((n = await stream.ReadAsync(block, cancellation)) != 0)
            {
                if (buffer.Length + n > 1_048_576) throw new InvalidDataException("Menu page too large");
                buffer.Write(block, 0, n);
            }
            var parsed = ParsePage(buffer.ToArray(), cell, category, after);
            rows.AddRange(parsed.Rows);
            if (parsed.NextAfter is null) return rows;
            after = parsed.NextAfter;
        }
        throw new InvalidDataException("Menu page limit");
    }

    internal static (IReadOnlyList<DiscoveryRow> Rows, string? NextAfter) ParsePage(
        ReadOnlySpan<byte> payload, string cell, string category, string? previousAfter = null)
    {
        using var document = JsonDocument.Parse(payload.ToArray());
        var root = document.RootElement;
        if (root.GetProperty("schema_version").GetInt32() != 2 ||
            root.GetProperty("price_scope").GetString() != "menu_item_only" ||
            root.GetProperty("coverage").GetProperty("complete").GetBoolean() ||
            root.GetProperty("coverage").GetProperty("basis").GetString() != "verified_source_items_only" ||
            root.GetProperty("cell").GetString() != cell ||
            root.GetProperty("category").GetString() != category ||
            root.GetProperty("categories").EnumerateArray().Single().GetString() != category)
            throw new InvalidDataException("Menu identity mismatch");
        var venues = root.GetProperty("venues").EnumerateArray().ToArray();
        if (venues.Length > 50) throw new InvalidDataException("Menu venue limit");
        var rows = new List<DiscoveryRow>();
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var venue in venues)
        {
            var key = venue.GetProperty("key").GetString() ?? "";
            if (!keys.Add(key) || venue.GetProperty("cell").GetString() != cell ||
                !NavigationPolicy.TryVenue($"https://www.dovebevo.com/bar/{key}?c={cell}", key, out _) ||
                venue.GetProperty("matching_offer_count").GetInt32() < 1)
                throw new InvalidDataException("Menu venue mismatch");
            var name = Text(venue.GetProperty("name"), 2, 512);
            var cityElement = venue.GetProperty("city");
            var city = cityElement.ValueKind == JsonValueKind.Null ? "" : Text(cityElement, 2, 200);
            foreach (var offer in venue.GetProperty("sample_offers").EnumerateArray())
            {
                if (offer.GetProperty("category").GetString() != category) throw new InvalidDataException("Menu drink mismatch");
                var drink = Text(offer.GetProperty("name"), 1, 512);
                var amount = offer.GetProperty("amount_minor").GetInt64();
                var currency = offer.GetProperty("currency").GetString() ?? "";
                var exponent = offer.GetProperty("currency_exponent").GetInt32();
                var context = offer.GetProperty("context");
                var kind = context.GetProperty("kind").GetString() ?? "";
                var condition = context.GetProperty("condition").ValueKind == JsonValueKind.Null
                    ? null : Text(context.GetProperty("condition"), 1, 500);
                var source = offer.GetProperty("source");
                var sourceUrl = source.GetProperty("url").GetString() ?? "";
                var hash = source.GetProperty("text_sha256").GetString() ?? "";
                if (amount is < 1 or > 100_000_000 || currency.Length != 3 ||
                    !currency.All(c => c is >= 'A' and <= 'Z') || exponent is < 0 or > 3 ||
                    kind is not ("regular" or "happy_hour" or "conditional") ||
                    !Uri.TryCreate(sourceUrl, UriKind.Absolute, out var sourceUri) ||
                    sourceUri.Scheme != Uri.UriSchemeHttps || sourceUri.UserInfo.Length != 0 ||
                    hash.Length != 64 || !hash.All(Uri.IsHexDigit) ||
                    !DateOnly.TryParseExact(source.GetProperty("checked_on").GetString(), "yyyy-MM-dd",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                    throw new InvalidDataException("Invalid menu offer source");
                rows.Add(new DiscoveryRow(key, cell, name, city, category, drink, amount,
                    currency, exponent, kind, condition, sourceUrl, day));
            }
        }
        var next = root.GetProperty("next_after").ValueKind == JsonValueKind.Null
            ? null : root.GetProperty("next_after").GetString();
        if (next is not null && (next == previousAfter ||
            !NavigationPolicy.TryVenue($"https://www.dovebevo.com/bar/{next}?c={cell}", next, out _)))
            throw new InvalidDataException("Menu cursor mismatch");
        return (rows, next);
    }

    private static string Text(JsonElement value, int min, int max)
    {
        var text = value.GetString() ?? "";
        if (text.Length < min || text.Length > max || text.Any(char.IsControl))
            throw new InvalidDataException("Invalid menu text");
        return text;
    }
}
