using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DoveBevo.Windows;

internal sealed record RecommendationRow(string Code, string Name, long Count, bool Recommended)
{
    public string Display => $"{(Recommended ? "👍 " : "")}{Name} · {Count}";
}

internal sealed class RecommendationClient
{
    private static readonly (string Code, string Name)[] Categories =
    [
        ("beer_draft", "Birra media"), ("spritz", "Spritz"), ("negroni", "Negroni"),
        ("sbagliato", "Sbagliato"), ("gin_tonic", "Gin tonic"),
        ("gin_lemon", "Gin lemon"), ("wine_glass", "Calice di vino"),
        ("alcohol_free", "Analcolico"), ("water", "Acqua")
    ];
    private static readonly Regex VoterPattern = new(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private readonly string voterFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DoveBevo", "Windows", "voter-id");

    public async Task<IReadOnlyList<RecommendationRow>> LoadAsync(
        string venueAddress, string venueKey, string? drink = null, bool recommended = false)
    {
        if (!NavigationPolicy.TryRecommendationEndpoint(venueAddress, venueKey, out var endpoint)
            || endpoint is null || (drink is not null && !Categories.Any(row => row.Code == drink)))
            throw new InvalidOperationException("Unsupported venue or drink");

        using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };
        using var request = new HttpRequestMessage(drink is null ? HttpMethod.Get : HttpMethod.Post, endpoint);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.TryAddWithoutValidation("X-DoveBevo-Voter", VoterIdentity());
        if (drink is not null)
        {
            request.Headers.TryAddWithoutValidation("Origin", "https://www.dovebevo.com");
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { drink, recommended }), Encoding.UTF8, "application/json");
        }
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException("Recommendations unavailable for this venue");
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
            throw new InvalidOperationException("Too many recommendation requests");
        if (response.StatusCode != HttpStatusCode.OK
            || response.Content.Headers.ContentType?.MediaType != "application/json"
            || response.Content.Headers.ContentLength > 32 * 1024)
            throw new InvalidDataException("Invalid recommendation response");

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var bytes = new MemoryStream();
        var chunk = new byte[4096];
        while (true)
        {
            var count = await stream.ReadAsync(chunk);
            if (count == 0) break;
            if (bytes.Length + count > 32 * 1024)
                throw new InvalidDataException("Recommendation response too large");
            bytes.Write(chunk, 0, count);
        }
        return Parse(bytes.ToArray(), venueKey);
    }

    internal static IReadOnlyList<RecommendationRow> Parse(byte[] bytes, string key)
    {
        if (bytes.Length > 32 * 1024) throw new InvalidDataException("Recommendation response too large");
        using var document = JsonDocument.Parse(bytes);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 2
            || !root.TryGetProperty("venue_key", out var venue)
            || venue.GetString() != key
            || !root.TryGetProperty("drinks", out var drinks)
            || drinks.ValueKind != JsonValueKind.Array
            || drinks.GetArrayLength() != Categories.Length)
            throw new InvalidDataException("Invalid recommendation schema");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var rows = new List<RecommendationRow>();
        foreach (var row in drinks.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object || row.EnumerateObject().Count() != 3
                || !row.TryGetProperty("drink", out var codeValue)
                || codeValue.ValueKind != JsonValueKind.String
                || !row.TryGetProperty("count", out var countValue)
                || countValue.ValueKind != JsonValueKind.Number
                || !countValue.TryGetInt64(out var count) || count < 0 || count > 9_007_199_254_740_991
                || !row.TryGetProperty("recommended", out var selected)
                || (selected.ValueKind != JsonValueKind.True && selected.ValueKind != JsonValueKind.False))
                throw new InvalidDataException("Invalid recommendation row");
            var code = codeValue.GetString()!;
            var category = Categories.FirstOrDefault(value => value.Code == code);
            if (category.Code is null || !seen.Add(code))
                throw new InvalidDataException("Invalid recommendation drink");
            rows.Add(new RecommendationRow(code, category.Name, count, selected.GetBoolean()));
        }
        if (seen.Count != Categories.Length) throw new InvalidDataException("Missing recommendation drink");
        return rows.OrderByDescending(row => row.Count)
            .ThenBy(row => Array.FindIndex(Categories, category => category.Code == row.Code))
            .ToArray();
    }

    private string VoterIdentity()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(voterFile)!);
        if (File.Exists(voterFile))
        {
            var existing = File.ReadAllText(voterFile);
            if (!VoterPattern.IsMatch(existing)) throw new InvalidDataException("Invalid voter identity");
            return existing;
        }
        var created = Guid.NewGuid().ToString("D");
        File.WriteAllText(voterFile, created);
        return created;
    }
}
