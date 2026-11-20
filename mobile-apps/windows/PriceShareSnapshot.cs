using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

/// <summary>A read-only image of one visible public price; it never writes a price or a vote.</summary>
internal sealed record PriceShareSnapshot(
    string VenueKey, string VenueName, string Drink, string DrinkName, bool HappyHour,
    int AmountMinor, string Currency, string Serving, string Provenance,
    int Confirmations, string Tier, string Location)
{
    private static readonly HashSet<string> Fields = [
        "href", "version", "venue", "venueName", "drink", "drinkName", "hh",
        "amountMinor", "currency", "serving", "provenance", "confirmations", "tier", "location"
    ];

    internal string AmountLabel => Currency == "GBP"
        ? "£" + (AmountMinor / 100m).ToString("0.00", CultureInfo.GetCultureInfo("en-GB"))
        : (AmountMinor / 100m).ToString("0.00", CultureInfo.GetCultureInfo("it-IT")) + " €";
    internal string BandLabel => HappyHour ? "Happy hour" : "Prezzo normale";
    internal string ServingLabel => Serving.Length == 0 ? "Formato non dichiarato (dati precedenti)"
        : Serving.Equals("drink", StringComparison.OrdinalIgnoreCase) ||
          Serving.Equals("drink singolo", StringComparison.OrdinalIgnoreCase) ? "" : Serving;
    internal string ConfirmationLabel => Confirmations == 1 ? "1 conferma" : $"{Confirmations} conferme";
    internal string? TierLabel => Tier switch {
        "affare" => "Affare", "giusto" => "Giusto", "salato" => "Salato", _ => null
    };

    internal static PriceShareSnapshot? Parse(string? json, string? captured, string? current)
    {
        if (json is null || json.Length > 8192 || captured is null || current != captured ||
            !Uri.TryCreate(captured, UriKind.Absolute, out var address) ||
            !NavigationPolicy.IsTrusted(address) ||
            address.AbsolutePath is not ("/mobile/" or "/mobile/index.html") ||
            address.Fragment.Length != 0) return null;
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions {
                MaxDepth = 4, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow
            });
            if (document.RootElement.ValueKind != JsonValueKind.Object) return null;
            var properties = document.RootElement.EnumerateObject().ToArray();
            if (properties.Length != Fields.Count ||
                properties.Select(property => property.Name).ToHashSet(StringComparer.Ordinal).Count != Fields.Count ||
                properties.Any(property => !Fields.Contains(property.Name))) return null;
            var root = document.RootElement;
            if (Text(root, "href", 600) != captured || Text(root, "version", 1) != "1") return null;
            var venue = Text(root, "venue", 30);
            if (venue is null || !NavigationPolicy.TryVenue(captured, venue, out _)) return null;
            var name = Text(root, "venueName", 120);
            var drink = Text(root, "drink", 20);
            var drinkName = Text(root, "drinkName", 80);
            var hh = Text(root, "hh", 1);
            var amount = Number(root, "amountMinor", 100_000);
            var currency = Text(root, "currency", 3);
            var serving = Text(root, "serving", 160, true);
            var provenance = Text(root, "provenance", 1024);
            var confirmations = Number(root, "confirmations", 1_000_000);
            var tier = Text(root, "tier", 8);
            var location = Text(root, "location", 160, true);
            if (name is null || drinkName is null || drink is null || hh is not ("0" or "1") ||
                amount is null || currency is not ("EUR" or "GBP") || serving is null ||
                provenance is null || confirmations is null ||
                tier is not ("affare" or "giusto" or "salato" or "neutro") || location is null ||
                !AllowedAmount(drink, currency, amount.Value) || !MatchesFocus(address, drink, hh)) return null;
            return new(venue, name, drink, drinkName, hh == "1", amount.Value,
                currency, serving, provenance, confirmations.Value, tier, location);
        }
        catch (JsonException) { return null; }
    }

    internal static string? Text(JsonElement value, string key, int maximum, bool empty = false)
    {
        var item = value.GetProperty(key);
        if (item.ValueKind != JsonValueKind.String) return null;
        var text = item.GetString();
        if (text is null || text.Length > maximum || (!empty && string.IsNullOrWhiteSpace(text)) ||
            text != text.Trim()) return null;
        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            var category = char.GetUnicodeCategory(text, index);
            if (char.IsControl(character) || character == '\uFFFD' ||
                category is UnicodeCategory.Format or UnicodeCategory.LineSeparator or
                    UnicodeCategory.ParagraphSeparator) return null;
            if (char.IsHighSurrogate(character))
            {
                if (++index >= text.Length || !char.IsLowSurrogate(text[index])) return null;
            }
            else if (char.IsLowSurrogate(character)) return null;
        }
        return text;
    }

    private static int? Number(JsonElement value, string key, int maximum)
    {
        var raw = Text(value, key, 7);
        return raw is not null && Regex.IsMatch(raw, "^(?:0|[1-9][0-9]{0,6})$", RegexOptions.CultureInvariant) &&
            int.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number <= maximum
            ? number : null;
    }

    private static bool AllowedAmount(string drink, string currency, int amount)
    {
        var eur = drink switch {
            "beer_draft" => (250, 1200), "spritz" => (250, 1500),
            "negroni" or "sbagliato" or "gin_tonic" or "gin_lemon" => (400, 2000),
            "wine_glass" => (200, 1500), "alcohol_free" => (200, 1200),
            "water" => (50, 600), _ => (0, 0)
        };
        if (eur.Item1 == 0) return false;
        var bounds = currency == "GBP" ? drink switch {
            "water" => (1, 1500), "beer_draft" or "alcohol_free" => (100, 3000),
            _ => (100, 5000)
        } : eur;
        return amount >= bounds.Item1 && amount <= bounds.Item2;
    }

    private static bool MatchesFocus(Uri address, string drink, string hh)
    {
        var pairs = address.Query.TrimStart('?').Split('&');
        var focus = pairs.Where(pair => pair.StartsWith("drink=", StringComparison.Ordinal) ||
            pair.StartsWith("hh=", StringComparison.Ordinal)).ToArray();
        return focus.Length == 0 || focus.Length == 2 &&
            focus.Contains("drink=" + drink) && focus.Contains("hh=" + hh);
    }
}

/// <summary>The selected owner-menu spotlight has no share marker; capture its rendered public row.</summary>
internal sealed record PriceShareOfferSnapshot(string VenueKey, string VenueName, string OfferId,
    string DrinkName, string AmountLabel, string Serving, string Provenance, string Location)
{
    private static readonly HashSet<string> Fields = [
        "kind", "href", "venue", "venueName", "offer", "drinkName", "amountLabel",
        "serving", "provenance", "location"
    ];

    internal bool MatchesVerified(BookmarkPriceResult result) =>
        result.OfferName == DrinkName &&
        result.SourceCheckedOn is { } checkedOn &&
        result.DisplayMeta == Serving &&
        Provenance.EndsWith("Menu verificato il " + checkedOn, StringComparison.Ordinal) &&
        NormalizeAmount(result.Price.Split(" · ", 2)[0]) == NormalizeAmount(AmountLabel);

    internal static PriceShareOfferSnapshot? Parse(string? json, string? captured, string? current)
    {
        if (json is null || json.Length > 8192 || captured is null || current != captured ||
            !Uri.TryCreate(captured, UriKind.Absolute, out var address) ||
            address.AbsolutePath is not ("/mobile/" or "/mobile/index.html")) return null;
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 4 });
            if (document.RootElement.ValueKind != JsonValueKind.Object) return null;
            var properties = document.RootElement.EnumerateObject().ToArray();
            if (properties.Length != Fields.Count ||
                properties.Select(property => property.Name).ToHashSet(StringComparer.Ordinal).Count != Fields.Count ||
                properties.Any(property => !Fields.Contains(property.Name))) return null;
            var root = document.RootElement;
            if (PriceShareSnapshot.Text(root, "kind", 5) != "offer" ||
                PriceShareSnapshot.Text(root, "href", 600) != captured) return null;
            var venue = PriceShareSnapshot.Text(root, "venue", 30);
            var offer = PriceShareSnapshot.Text(root, "offer", 128, true);
            if (venue is null || offer is null || !NavigationPolicy.TryVenue(captured, venue, out _) ||
                offer.Length > 0 && !Regex.IsMatch(offer, "^[A-Za-z0-9._:-]{1,128}$", RegexOptions.CultureInvariant))
                return null;
            var query = address.Query.TrimStart('?').Split('&');
            if (query.Length == 3
                ? offer.Length == 0 || !query.Contains("offer=" + Uri.EscapeDataString(offer))
                : query.Length != 2) return null;
            var name = PriceShareSnapshot.Text(root, "venueName", 512);
            var drink = PriceShareSnapshot.Text(root, "drinkName", 512);
            var amount = PriceShareSnapshot.Text(root, "amountLabel", 32);
            var serving = PriceShareSnapshot.Text(root, "serving", 600, true);
            var provenance = PriceShareSnapshot.Text(root, "provenance", 240);
            var location = PriceShareSnapshot.Text(root, "location", 200, true);
            if (name is null || drink is null || amount is null || serving is null ||
                provenance is null || location is null || !ValidAmount(amount) ||
                !Regex.IsMatch(provenance,
                    "^Prezzo del drink da menu, non totale pagato\\. Supplementi separati\\. Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}$",
                    RegexOptions.CultureInvariant)) return null;
            return new(venue, name, offer, drink, amount, serving, provenance, location);
        }
        catch (JsonException) { return null; }
    }

    private static bool ValidAmount(string label)
    {
        var normalized = NormalizeAmount(label);
        if (!Regex.IsMatch(normalized,
                "^(?:0|[1-9][0-9]{0,2}(?:\\.[0-9]{3})*|[1-9][0-9]*)(?:,[0-9]{1,3})? [€£]$",
                RegexOptions.CultureInvariant)) return false;
        return decimal.TryParse(normalized[..^2], NumberStyles.AllowThousands | NumberStyles.AllowDecimalPoint,
            CultureInfo.GetCultureInfo("it-IT"), out var amount) && amount is > 0 and <= 100_000_000;
    }

    private static string NormalizeAmount(string label) =>
        label.Replace('\u00A0', ' ').Replace('\u202F', ' ');
}
