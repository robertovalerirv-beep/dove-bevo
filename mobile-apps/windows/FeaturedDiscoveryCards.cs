using System.Globalization;

namespace DoveBevo.Windows;

internal sealed record FeaturedDiscoveryCard(DiscoveryRow Row)
{
    public string Drink => Row.Drink;
    public string Venue => Row.Venue;
    public string Price => (Row.AmountMinor / Math.Pow(10, Row.Exponent))
        .ToString("N" + Row.Exponent, CultureInfo.GetCultureInfo("it-IT")) + " " + Row.Currency;
    public string Details => (Row.Serving is { Length: > 0 } ? Row.Serving + " · " : "") +
        (Row.SourceUrl is null ? "Segnalato da cliente" : "Menu online") +
        (Row.Context == "happy_hour" ? " · Happy hour" : Row.Context == "conditional" ? " · Condizione" : "") +
        (Row.Condition is null ? "" : " · " + Row.Condition) +
        " · " + Row.CheckedOn.ToString("dd/MM/yyyy", CultureInfo.GetCultureInfo("it-IT"));
    public string MinimumSpend => Row.MinimumSpendNotice;
    public Uri? Target => Row.FocusedVenue();
}

internal static class FeaturedDiscoveryCards
{
    public static FeaturedDiscoveryCard[] FromRows(IReadOnlyList<DiscoveryRow> sortedRows) =>
        sortedRows.Where(row => row.FocusedVenue() is not null)
            .DistinctBy(row => (row.Key, row.Cell))
            .Take(3)
            .Select(row => new FeaturedDiscoveryCard(row))
            .ToArray();
}
