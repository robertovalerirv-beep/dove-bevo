using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace DoveBevo.Windows;

/// <summary>Local image preview and export. Opening this window has no public side effect.</summary>
internal sealed class PriceShareWindow : Window
{
    private sealed record Card(string VenueName, string DrinkName, string AmountLabel,
        string ServingLabel, string BandLabel, string Provenance, string? ConfirmationLabel,
        string? TierLabel, string Location, string? Drink);
    private static readonly Brush Ink = Brush("#111A22");
    private static readonly Brush Muted = Brush("#52606A");
    private static readonly Brush Cream = Brush("#FFFAF0");
    private static readonly Brush Green = Brush("#247236");
    private readonly BitmapSource poster;
    private readonly string publicUrl;
    private readonly TextBlock feedback = new() { Foreground = Ink, Margin = new Thickness(12, 8, 12, 0) };

    internal PriceShareWindow(PriceShareSnapshot snapshot, string publicUrl)
        : this(new Card(snapshot.VenueName, snapshot.DrinkName, snapshot.AmountLabel,
            snapshot.ServingLabel, snapshot.BandLabel, snapshot.Provenance,
            snapshot.ConfirmationLabel, snapshot.TierLabel, snapshot.Location, snapshot.Drink), publicUrl) { }

    internal PriceShareWindow(PriceShareOfferSnapshot snapshot, string publicUrl)
        : this(new Card(snapshot.VenueName, snapshot.DrinkName, snapshot.AmountLabel,
            snapshot.Serving, "", snapshot.Provenance, null, null, snapshot.Location, null), publicUrl) { }

    private PriceShareWindow(Card snapshot, string publicUrl)
    {
        this.publicUrl = publicUrl;
        poster = RenderPoster(snapshot);
        Title = "Condividi il prezzo · Dove Bevo";
        Width = 620;
        Height = 820;
        MinWidth = 420;
        MinHeight = 520;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = Cream;
        var panel = new DockPanel { LastChildFill = true };
        var actions = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(16, 8, 16, 16) };
        DockPanel.SetDock(actions, Dock.Bottom);
        var buttons = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Center };
        buttons.Children.Add(ActionButton("Copia immagine", CopyImage));
        buttons.Children.Add(ActionButton("Salva PNG", SavePng));
        buttons.Children.Add(ActionButton("Copia link", CopyLink));
        actions.Children.Add(buttons);
        actions.Children.Add(feedback);
        panel.Children.Add(actions);
        var preview = new Image {
            Source = poster, Stretch = Stretch.Uniform, Margin = new Thickness(20),
            ToolTip = snapshot.Drink is null ? "Logo Dove Bevo, non foto del drink o del locale"
                : "Illustrazione del drink, non foto del locale"
        };
        var scroll = new ScrollViewer { Content = preview, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        panel.Children.Add(scroll);
        Content = panel;
    }

    private static Button ActionButton(string label, RoutedEventHandler action)
    {
        var button = new Button {
            Content = label, MinWidth = 120, MinHeight = 44,
            Margin = new Thickness(4), Padding = new Thickness(12, 5, 12, 5)
        };
        button.Click += action;
        return button;
    }

    private void CopyImage(object sender, RoutedEventArgs e)
    {
        try
        {
            var data = new DataObject();
            data.SetImage(poster);
            data.SetText(publicUrl);
            Clipboard.SetDataObject(data, true);
            feedback.Text = "Immagine e link copiati. Scegli tu dove condividerli.";
        }
        catch (Exception) { feedback.Text = "Non riesco a copiare l'immagine. Puoi salvarla come PNG."; }
    }

    private void CopyLink(object sender, RoutedEventArgs e)
    {
        try { Clipboard.SetText(publicUrl); feedback.Text = "Link copiato."; }
        catch (Exception) { feedback.Text = "Non riesco a copiare il link."; }
    }

    private void SavePng(object sender, RoutedEventArgs e)
    {
        var chooser = new SaveFileDialog {
            Title = "Salva immagine del prezzo", FileName = "dove-bevo-prezzo.png",
            DefaultExt = ".png", Filter = "Immagine PNG (*.png)|*.png", AddExtension = true,
            OverwritePrompt = true
        };
        if (chooser.ShowDialog(this) != true) return;
        try
        {
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(poster));
            using var file = new FileStream(chooser.FileName, FileMode.Create, FileAccess.Write, FileShare.None);
            encoder.Save(file);
            feedback.Text = "Immagine salvata.";
        }
        catch (Exception) { feedback.Text = "Non riesco a salvare l'immagine. Scegli un'altra cartella."; }
    }

    private static BitmapSource RenderPoster(Card value)
    {
        const double width = 1080;
        const double textWidth = 952;
        var details = string.Join(" · ", new[] { value.Location, value.ServingLabel, value.BandLabel }
            .Where(part => part.Length > 0));
        var lines = new List<(FormattedText Text, double Gap)> {
            (Line(value.DrinkName, 56, FontWeights.Bold, Ink, textWidth), 18),
            (Line(value.VenueName, 42, FontWeights.SemiBold, Ink, textWidth), 18)
        };
        if (details.Length > 0) lines.Add((Line(details, 29, FontWeights.Normal, Muted, textWidth), 18));
        lines.Add((Line(value.Provenance, 29, FontWeights.Normal, Muted, textWidth), 18));
        if (value.ConfirmationLabel is { } confirmations)
            lines.Add((Line(confirmations, 29, FontWeights.Normal, Muted, textWidth), 18));
        if (value.TierLabel is { } tier)
            lines.Add((Line(tier, 32, FontWeights.SemiBold, tier == "Affare" ? Green : Ink, textWidth), 18));
        var height = Math.Max(1100, 700 + lines.Sum(item => item.Text.Height + item.Gap) + 105);
        var visual = new DrawingVisual();
        using (var drawing = visual.RenderOpen())
        {
            drawing.DrawRectangle(Cream, null, new Rect(0, 0, width, height));
            drawing.DrawImage(Artwork("brand-mark.png"), new Rect(58, 42, 80, 80));
            drawing.DrawText(Line("Dove Bevo", 44, FontWeights.Bold, Ink, 600), new Point(154, 44));
            drawing.DrawText(Line("Prezzi reali. Persone reali.", 25, FontWeights.Normal, Ink, 700), new Point(154, 96));
            var photoBox = new Rect(64, 162, textWidth, 490);
            var art = Artwork(value.Drink is null ? "brand-mark.png" : ImageName(value.Drink));
            drawing.DrawRoundedRectangle(Brushes.White, null, photoBox, 28, 28);
            if (value.Drink is null)
                drawing.DrawImage(art, new Rect(photoBox.X + (photoBox.Width - 300) / 2,
                    photoBox.Y + (photoBox.Height - 300) / 2, 300, 300));
            else
            {
                var scale = Math.Max(photoBox.Width / art.PixelWidth, photoBox.Height / art.PixelHeight);
                var image = new Rect(photoBox.X + (photoBox.Width - art.PixelWidth * scale) / 2,
                    photoBox.Y + (photoBox.Height - art.PixelHeight * scale) / 2,
                    art.PixelWidth * scale, art.PixelHeight * scale);
                drawing.PushClip(new RectangleGeometry(photoBox, 28, 28));
                drawing.DrawImage(art, image);
                drawing.Pop();
            }
            drawing.DrawRoundedRectangle(Brushes.White, null, new Rect(620, 540, 368, 88), 44, 44);
            drawing.DrawText(Line(value.AmountLabel, 48, FontWeights.Bold, Ink, 330), new Point(644, 552));
            var y = 700.0;
            foreach (var (text, gap) in lines)
            {
                drawing.DrawText(text, new Point(64, y));
                y += text.Height + gap;
            }
            drawing.DrawText(Line(value.Drink is null ? "Logo Dove Bevo, non foto del drink o del locale"
                    : "Immagine illustrativa del drink, non foto del locale", 22,
                FontWeights.Normal, Muted, textWidth), new Point(64, height - 56));
        }
        var bitmap = new RenderTargetBitmap((int)width, (int)Math.Ceiling(height),
            96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return bitmap;
    }

    private static FormattedText Line(string value, double size, FontWeight weight, Brush color, double width)
    {
        return new FormattedText(value, CultureInfo.GetCultureInfo("it-IT"), FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, weight, FontStretches.Normal),
            size, color, 1.0) { MaxTextWidth = width };
    }

    private static BitmapImage Artwork(string file)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.UriSource = new Uri(Path.Combine(AppContext.BaseDirectory, "Assets", "Drinks", file));
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.EndInit();
        image.Freeze();
        return image;
    }

    private static string ImageName(string drink) => drink switch {
        "beer_draft" => "beer-scene.jpg", "spritz" => "spritz-scene.jpg",
        "negroni" => "negroni-scene.jpg", "sbagliato" => "sbagliato-scene.jpg",
        "gin_tonic" or "gin_lemon" => "gin-tonic-scene.jpg", "wine_glass" => "wine-scene.jpg",
        "alcohol_free" => "alcohol-free-scene.jpg", "water" => "water-scene.jpg",
        _ => throw new ArgumentOutOfRangeException(nameof(drink))
    };

    private static Brush Brush(string hex) => new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
}
