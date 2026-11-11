using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record AreaVoteRow(string VenueKey, string VenueUrl, string VenueName,
    string TargetKey, string DrinkName, string? Serving, long Count)
{
    public string Display => $"👍 {Count} · {DrinkName}{(Serving is { Length: > 0 } ? " · " + Serving : "")}\n{VenueName}";
}

internal sealed record AreaVoteSnapshot(IReadOnlyList<AreaVoteRow> Rows, bool HasMore);

/// <summary>Read-only shared totals near the selected map; this client has no vote POST.</summary>
internal sealed class AreaVotesClient
{
    private static readonly HttpClient Client = new(new HttpClientHandler
    {
        AllowAutoRedirect = false, UseCookies = false,
    }) { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly Regex Cursor = new("^[A-Za-z0-9_-]{1,512}={0,2}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    internal static string Endpoint(IReadOnlyList<string> cells, string? after = null)
    {
        if (cells.Count is < 1 or > 12 || cells.Distinct(StringComparer.Ordinal).Count() != cells.Count
            || cells.Any(cell => !Regex.IsMatch(cell, "^[0-9b-hjkmnp-z]{5}$"))
            || cells.Order(StringComparer.Ordinal).Where((cell, index) => cell != cells[index]).Any()
            || after is not null && !Cursor.IsMatch(after))
            throw new InvalidDataException("Invalid recommendation area");
        return "https://www.dovebevo.com/api/mobile/v2/drink-votes/area?cells=" +
            string.Join(',', cells) + "&limit=50&include_europe=1" +
            (after is null ? "" : "&after=" + Uri.EscapeDataString(after));
    }

    internal async Task<AreaVoteSnapshot> LoadAsync(DiscoveryArea area, CancellationToken cancellation)
    {
        var cells = area.Cells();
        var rows = new List<AreaVoteRow>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        string? after = null;
        for (var pageIndex = 0; pageIndex < 10; pageIndex++)
        {
            var url = Endpoint(cells, after);
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.ParseAdd("application/json");
            using var response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead,
                cancellation);
            if (response.StatusCode != HttpStatusCode.OK ||
                response.Content.Headers.ContentType?.MediaType != "application/json" ||
                response.Content.Headers.ContentLength > 256 * 1024)
                throw new InvalidDataException("Recommendations unavailable");
            await using var stream = await response.Content.ReadAsStreamAsync(cancellation);
            using var buffer = new MemoryStream();
            var block = new byte[8192]; int count;
            while ((count = await stream.ReadAsync(block, cancellation)) > 0)
            {
                if (buffer.Length + count > 256 * 1024) throw new InvalidDataException("Recommendations too large");
                buffer.Write(block, 0, count);
            }
            var page = Parse(buffer.ToArray(), cells);
            foreach (var row in page.Rows)
                if (seen.Add(row.VenueUrl + "|" + row.TargetKey)) rows.Add(row);
            if (page.Next is null) return new AreaVoteSnapshot(rows, false);
            if (page.Next == after) throw new InvalidDataException("Repeated recommendation cursor");
            after = page.Next;
        }
        return new AreaVoteSnapshot(rows, true);
    }

    internal static (IReadOnlyList<AreaVoteRow> Rows, string? Next) Parse(byte[] bytes,
        IReadOnlyList<string> requestedCells)
    {
        if (bytes.Length > 256 * 1024) throw new InvalidDataException("Recommendations too large");
        using var document = JsonDocument.Parse(bytes);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || root.GetProperty("schema_version").GetInt32() != 1)
            throw new InvalidDataException("Invalid recommendation schema");
        var cells = root.GetProperty("scope").GetProperty("cells").EnumerateArray()
            .Select(value => value.GetString()).ToArray();
        if (!cells.SequenceEqual(requestedCells)) throw new InvalidDataException("Recommendation scope mismatch");
        var items = root.GetProperty("items");
        if (items.ValueKind != JsonValueKind.Array || items.GetArrayLength() > 50)
            throw new InvalidDataException("Recommendation page limit");
        var rows = new List<AreaVoteRow>();
        long previous = long.MaxValue;
        foreach (var item in items.EnumerateArray())
        {
            var venue = item.GetProperty("venue");
            var key = venue.GetProperty("key").GetString() ?? "";
            var cell = venue.GetProperty("cell").GetString() ?? "";
            var name = Text(venue.GetProperty("name"), 512);
            if (!requestedCells.Contains(cell) ||
                !NavigationPolicy.TryVenue($"https://www.dovebevo.com/bar/{key}?c={cell}", key, out _))
                throw new InvalidDataException("Invalid recommendation venue");
            var target = item.GetProperty("target");
            var kind = target.GetProperty("kind").GetString();
            if (kind is not ("offer" or "customer" or "legacy" or "europe"))
                throw new InvalidDataException("Invalid recommendation target");
            string identity;
            if (kind is "offer" or "customer")
            {
                var id = target.GetProperty("id").GetString() ?? "";
                var pattern = kind == "offer" ? "^[A-Za-z0-9._:-]{1,128}$" : "^c[0-9a-f]{64}$";
                if (!Regex.IsMatch(id, pattern)) throw new InvalidDataException("Invalid recommendation item");
                identity = id;
            }
            else
            {
                var code = target.GetProperty("drink").GetString() ?? "";
                var band = target.GetProperty("band").GetString() ?? "";
                if (!Regex.IsMatch(code, "^(beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)$")
                    || band is not ("normal" or "happy_hour"))
                    throw new InvalidDataException("Invalid recommendation drink");
                identity = code + "/" + band;
                if (kind == "europe")
                {
                    var currency = target.GetProperty("currency").GetString() ?? "";
                    var rawServing = target.GetProperty("serving");
                    var unit = rawServing.GetProperty("unit").GetString() ?? "";
                    var ml = rawServing.TryGetProperty("ml", out var amount) && amount.ValueKind != JsonValueKind.Null
                        ? amount.GetInt32().ToString() : "";
                    var command = $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{key}&c={cell}" +
                        $"&save_europe={code}&band={band}&currency={currency}&serving={unit}%3A{ml}";
                    var current = $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{key}&c={cell}";
                    if (!NavigationPolicy.TrySaveAction(command, current, out _))
                        throw new InvalidDataException("Invalid European vote target");
                    identity += "/" + currency + "/" + unit + ":" + ml;
                }
            }
            var drink = item.GetProperty("drink");
            var drinkName = Text(drink.GetProperty("name"), 512);
            if (kind is "legacy" or "europe" && drink.GetProperty("category").GetString() !=
                target.GetProperty("drink").GetString())
                throw new InvalidDataException("Recommendation category mismatch");
            var serving = drink.GetProperty("serving_label").ValueKind == JsonValueKind.Null
                ? null : Text(drink.GetProperty("serving_label"), 256);
            if (kind == "europe" && target.GetProperty("serving").GetProperty("unit").GetString() == "drink" &&
                (serving is "drink" or "Drink singolo")) serving = null;
            var count = item.GetProperty("count").GetInt64();
            if (count is < 1 or > 9_007_199_254_740_991 || count > previous)
                throw new InvalidDataException("Invalid recommendation count");
            previous = count;
            rows.Add(new AreaVoteRow(key, $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{key}&c={cell}",
                name, kind + "/" + identity, drinkName, serving, count));
        }
        var cursorValue = root.GetProperty("next_after");
        var next = cursorValue.ValueKind == JsonValueKind.Null ? null : cursorValue.GetString();
        if (next is not null && (!Cursor.IsMatch(next) || rows.Count == 0))
            throw new InvalidDataException("Invalid recommendation cursor");
        return (rows, next);
    }

    private static string Text(JsonElement value, int max)
    {
        var text = value.GetString();
        if (text is null || text.Length is < 1 || text.Length > max || text != text.Trim()
            || text.Any(char.IsControl)) throw new InvalidDataException("Invalid recommendation text");
        return text;
    }
}
