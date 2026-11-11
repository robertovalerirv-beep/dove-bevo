using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record BookmarkPriceResult(string Price, string? VerifiedCategory,
    string? VerifiedServing);

/// <summary>Refreshes an exact private favourite from public GET routes; it never submits a price.</summary>
internal sealed class BookmarkPriceClient
{
    private static readonly Regex SmallBeer = new(@"\b(?:piccola|piccolo|small|mini)\b",
        RegexOptions.CultureInvariant);
    private static readonly Regex LargeBeer = new(@"\b(?:grande|large|pinta|pint)\b",
        RegexOptions.CultureInvariant);
    private static readonly Regex MediumBeer = new(@"\b(?:media|medium)\b",
        RegexOptions.CultureInvariant);
    private static readonly Regex Quantity = new(@"\b(\d+(?:[.,]\d+)?)\s*(ml|cl|lt|l)\b",
        RegexOptions.CultureInvariant);
    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false, UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(12) };

    internal async Task<BookmarkPriceResult> RefreshAsync(Bookmark bookmark, CancellationToken cancellation)
    {
        if (bookmark.ActionUrl is null || !NavigationPolicy.TrySaveAction(bookmark.ActionUrl,
                bookmark.Url, out var action) || action is null)
            return new("Prezzo online nel locale", null, null);
        try
        {
            if (action.Kind == "offer") return await OfferAsync(action, cancellation);
            var price = action.Kind switch
            {
                "legacy" => await LegacyAsync(action, cancellation),
                "europe" => await EuropeAsync(action, cancellation),
                "customer" => await CustomerAsync(action, cancellation),
                _ => null,
            };
            return new(price ?? "Prezzo non disponibile ora", null, null);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { return new("Prezzo non verificabile. Riprova più tardi.", null, null); }
    }

    private static async Task<string?> LegacyAsync(SaveAction action, CancellationToken cancellation)
    {
        var scope = await EuropeDiscoveryClient.LoadAsync([action.Cell], action.Item, cancellation);
        if (!scope.AllowsLegacy(action.VenueKey, action.Cell)) return null;
        using var page = await ReadAsync($"https://www.dovebevo.com/api/prices/{action.Cell}", cancellation);
        return ParseLegacy(page, action);
    }

    private static async Task<string?> EuropeAsync(SaveAction action, CancellationToken cancellation)
    {
        using var catalog = await ReadAsync("https://www.dovebevo.com/mobile-data/catalog.json", cancellation);
        var version = catalog.RootElement.GetProperty("version").GetString();
        if (catalog.RootElement.GetProperty("schema_version").GetInt32() != 1 ||
            string.IsNullOrEmpty(version) ||
            !catalog.RootElement.GetProperty("venues").EnumerateArray().Any(venue =>
                venue.GetProperty("key").GetString() == action.VenueKey &&
                venue.GetProperty("cell").GetString() == action.Cell &&
                venue.GetProperty("currency").GetString() == action.Currency))
            throw new InvalidDataException("Catalogue identity mismatch");
        using var page = await ReadAsync($"https://www.dovebevo.com/api/mobile/prices/venues/{action.VenueKey}?cell={action.Cell}",
            cancellation);
        return ParseEurope(page, action, version);
    }

    internal static string? ParseEurope(JsonDocument page, SaveAction action, string version)
    {
        var root = page.RootElement;
        if (root.GetProperty("schema_version").GetInt32() != 1 ||
            root.GetProperty("catalog_version").GetString() != version)
            throw new InvalidDataException("European price version mismatch");
        // A row cannot make a moderated or legacy-overridden venue available.
        if (root.GetProperty("hidden").EnumerateArray().Any(key =>
                key.GetString() == action.VenueKey) ||
            root.GetProperty("legacy_venues").EnumerateArray().Any(key =>
                key.GetString() == action.VenueKey))
            throw new InvalidDataException("European venue is excluded");
        string? value = null;
        foreach (var row in root.GetProperty("rows").EnumerateArray())
        {
            var serving = row.GetProperty("serving");
            var unit = serving.GetProperty("unit").GetString();
            var ml = serving.TryGetProperty("ml", out var mlValue) && mlValue.ValueKind != JsonValueKind.Null
                ? mlValue.GetInt32().ToString(CultureInfo.InvariantCulture) : "";
            if (row.GetProperty("venue").GetString() != action.VenueKey ||
                row.GetProperty("cell").GetString() != action.Cell ||
                row.GetProperty("drink").GetString() != action.Item ||
                row.GetProperty("hh").GetInt32() != (action.Band == "happy_hour" ? 1 : 0) ||
                row.GetProperty("currency").GetString() != action.Currency ||
                unit + ":" + ml != action.Serving ||
                row.GetProperty("status").GetString() != "active") continue;
            if (value is not null) throw new InvalidDataException("Duplicate European price");
            value = Money(row.GetProperty("amount_minor").GetInt64(), action.Currency!, 2) +
                " · prezzo online aggiornato";
        }
        return value;
    }

    private static async Task<BookmarkPriceResult> OfferAsync(SaveAction action, CancellationToken cancellation)
    {
        string? after = null;
        for (var index = 0; index < 10; index++)
        {
            var endpoint = $"https://www.dovebevo.com/api/mobile/v2/menu/venues/{action.VenueKey}?cell={action.Cell}&limit=100" +
                (after is null ? "" : "&after=" + Uri.EscapeDataString(after));
            using var page = await ReadAsync(endpoint, cancellation);
            var result = ParseOffer(page, action);
            if (result.Price is not null) return new(result.Price, result.Category, result.Serving);
            if (result.Next is null) return new("Prezzo non disponibile ora", null, null);
            if (result.Next == after) throw new InvalidDataException("Repeated offer cursor");
            after = result.Next;
        }
        throw new InvalidDataException("Offer page limit");
    }

    internal static (string? Price, string? Next, string? Category, string? Serving) ParseOffer(
        JsonDocument page, SaveAction action)
    {
        var root = page.RootElement;
        var venue = root.GetProperty("venue");
        if (root.GetProperty("schema_version").GetInt32() != 2 ||
            root.GetProperty("price_scope").GetString() != "menu_item_only" ||
            venue.GetProperty("key").GetString() != action.VenueKey ||
            venue.GetProperty("cell").GetString() != action.Cell)
            throw new InvalidDataException("Offer identity mismatch");
        string? price = null;
        string? category = null;
        string? serving = null;
        foreach (var offer in root.GetProperty("offers").EnumerateArray())
        {
            if (offer.GetProperty("id").GetString() != action.Item) continue;
            if (price is not null) throw new InvalidDataException("Duplicate menu offer");
            price = Money(offer.GetProperty("amount_minor").GetInt64(),
                offer.GetProperty("currency").GetString()!,
                offer.GetProperty("currency_exponent").GetInt32()) + " · prezzo da menu, supplementi separati";
            category = VerifiedOfferCategory(offer);
            serving = VerifiedOfferServing(offer);
        }
        var cursor = root.GetProperty("next_after");
        return (price, cursor.ValueKind == JsonValueKind.Null ? null : cursor.GetString(),
            category, serving);
    }

    private static string? VerifiedOfferServing(JsonElement offer)
    {
        if (!offer.TryGetProperty("serving", out var serving) ||
            serving.ValueKind != JsonValueKind.Object) return null;
        string? label = null;
        if (serving.TryGetProperty("label", out var labelValue) &&
            labelValue.ValueKind == JsonValueKind.String)
            label = labelValue.GetString()?.Trim();
        if (label is { Length: > 256 } || label?.Any(char.IsControl) == true) return null;
        if (label?.Length == 0 || label?.Equals("drink", StringComparison.OrdinalIgnoreCase) == true ||
            label?.Equals("Drink singolo", StringComparison.OrdinalIgnoreCase) == true) label = null;
        var ml = serving.TryGetProperty("ml", out var mlValue) &&
            mlValue.ValueKind == JsonValueKind.Number && mlValue.TryGetInt32(out var amount) &&
            amount is >= 1 and <= 100_000 ? amount : (int?)null;
        return label is null ? ml is null ? "Formato non dichiarato" : ml + " ml"
            : ml is null ? label : label + " · " + ml + " ml";
    }

    private static string? VerifiedOfferCategory(JsonElement offer)
    {
        if (!offer.TryGetProperty("category", out var value) || value.ValueKind != JsonValueKind.String)
            return null;
        var category = value.GetString();
        if (!DiscoveryClient.Categories.Any(item => item.Code == category)) return null;
        return category == "beer_draft" &&
            (!offer.TryGetProperty("serving", out var serving) || !IsMediumDraftBeer(serving))
            ? null : category;
    }

    // A quantified 400–600 ml serving or an explicit medium label can be
    // compared as Birra media; small, conflicting and unknown sizes cannot.
    private static bool IsMediumDraftBeer(JsonElement serving)
    {
        if (serving.ValueKind != JsonValueKind.Object) return false;
        string? label = null;
        if (serving.TryGetProperty("label", out var labelValue) &&
            labelValue.ValueKind == JsonValueKind.String)
            label = labelValue.GetString()?.Normalize(NormalizationForm.FormKC).ToLowerInvariant();
        if (label is not null && SmallBeer.IsMatch(label)) return false;
        var quantities = label is null ? Match.Empty : Quantity.Match(label);
        if (quantities.Success && quantities.NextMatch().Success) return false;
        decimal? labelledMl = null;
        if (quantities.Success)
        {
            var amount = quantities.Groups[1].Value.Replace(',', '.');
            if (!decimal.TryParse(amount, NumberStyles.AllowDecimalPoint,
                    CultureInfo.InvariantCulture, out var value)) return false;
            labelledMl = quantities.Groups[2].Value switch
            {
                "l" or "lt" => value * 1000,
                "cl" => value * 10,
                _ => value,
            };
        }
        if (serving.TryGetProperty("ml", out var mlValue) &&
            mlValue.ValueKind != JsonValueKind.Null)
        {
            if (mlValue.ValueKind != JsonValueKind.Number || !mlValue.TryGetInt32(out var ml) ||
                ml is < 1 or > 100_000 ||
                labelledMl is not null && Math.Abs(labelledMl.Value - ml) > 1) return false;
            return ml is >= 400 and <= 600;
        }
        if (label is null || LargeBeer.IsMatch(label)) return false;
        return labelledMl is null ? MediumBeer.IsMatch(label)
            : labelledMl is >= 400 and <= 600;
    }

    private static async Task<string?> CustomerAsync(SaveAction action, CancellationToken cancellation)
    {
        string? after = null;
        for (var index = 0; index < 10; index++)
        {
            var endpoint = $"https://www.dovebevo.com/api/mobile/v2/customer-prices/venues/{action.VenueKey}?cell={action.Cell}&limit=50" +
                (after is null ? "" : "&after=" + Uri.EscapeDataString(after));
            using var page = await ReadAsync(endpoint, cancellation);
            var result = ParseCustomer(page, action);
            if (result.Price is not null) return result.Price;
            if (result.Next is null) return null;
            if (result.Next == after) throw new InvalidDataException("Repeated customer cursor");
            after = result.Next;
        }
        throw new InvalidDataException("Customer page limit");
    }

    internal static (string? Price, string? Next) ParseCustomer(JsonDocument page, SaveAction action)
    {
        var root = page.RootElement;
        var venue = root.GetProperty("venue");
        if (root.GetProperty("schema_version").GetInt32() != 1 ||
            root.GetProperty("price_scope").GetString() != "customer_reported_drink_item" ||
            venue.GetProperty("key").GetString() != action.VenueKey ||
            venue.GetProperty("cell").GetString() != action.Cell)
            throw new InvalidDataException("Customer price identity mismatch");
        string? price = null;
        foreach (var row in root.GetProperty("rows").EnumerateArray())
        {
            if (row.GetProperty("item_key").GetString() != action.Item) continue;
            if (price is not null) throw new InvalidDataException("Duplicate customer price");
            price = Money(row.GetProperty("amount_minor").GetInt64(),
                row.GetProperty("currency").GetString()!,
                row.GetProperty("currency_exponent").GetInt32()) + " · segnalato da un cliente";
        }
        var cursor = root.GetProperty("next_after");
        return (price, cursor.ValueKind == JsonValueKind.Null ? null : cursor.GetString());
    }

    internal static string? ParseLegacy(JsonDocument page, SaveAction action)
    {
        string? price = null;
        foreach (var row in page.RootElement.GetProperty("p").EnumerateArray())
        {
            if (row.GetArrayLength() != 7 || row[0].GetString() != action.VenueKey ||
                row[1].GetString() != action.Item ||
                row[2].GetInt32() != (action.Band == "happy_hour" ? 1 : 0)) continue;
            if (price is not null) throw new InvalidDataException("Duplicate legacy price");
            price = Money(row[3].GetInt64(), "EUR", 2) + " · prezzo segnalato";
        }
        return price;
    }

    private static string Money(long minor, string currency, int exponent)
    {
        if (minor is < 1 or > 100_000_000 || exponent is < 0 or > 3 ||
            currency is not ("EUR" or "GBP")) throw new InvalidDataException("Invalid amount");
        var amount = (minor / (decimal)Math.Pow(10, exponent)).ToString("N" + exponent,
            CultureInfo.GetCultureInfo("it-IT"));
        return amount + " " + (currency == "EUR" ? "€" : "£");
    }

    private static async Task<JsonDocument> ReadAsync(string endpoint, CancellationToken cancellation)
    {
        var url = new Uri(endpoint);
        if (!NavigationPolicy.IsTrusted(url) || url.DnsSafeHost != "www.dovebevo.com")
            throw new InvalidDataException("Invalid price endpoint");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.ParseAdd("application/json");
        using var response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead,
            cancellation);
        if (response.StatusCode != HttpStatusCode.OK ||
            response.Content.Headers.ContentType?.MediaType != "application/json" ||
            response.Content.Headers.ContentLength > 1024 * 1024)
            throw new InvalidDataException("Price route unavailable");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
        using var buffer = new MemoryStream();
        var block = new byte[8192]; int count;
        while ((count = await stream.ReadAsync(block, cancellation)) > 0)
        {
            if (buffer.Length + count > 1024 * 1024) throw new InvalidDataException("Price response too large");
            buffer.Write(block, 0, count);
        }
        return JsonDocument.Parse(buffer.ToArray());
    }
}
