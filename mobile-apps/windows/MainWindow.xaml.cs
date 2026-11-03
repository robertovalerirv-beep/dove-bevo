using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace DoveBevo.Windows;

public partial class MainWindow : Window
{
    private readonly BookmarkStore bookmarks = new();
    private bool starting;
    private bool ready;
    private string lastTrustedUrl = NavigationPolicy.Home;

    public MainWindow() => InitializeComponent();

    private async void Window_Loaded(object sender, RoutedEventArgs e) => await StartBrowser();

    private async Task StartBrowser()
    {
        if (starting || ready) return;
        starting = true;
        try
        {
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DoveBevo", "Windows", "WebView2");
            Directory.CreateDirectory(profile);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await Website.EnsureCoreWebView2Async(environment);
            var core = Website.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.NavigationStarting += Browser_NavigationStarting;
            core.NavigationCompleted += Browser_NavigationCompleted;
            core.NewWindowRequested += Browser_NewWindowRequested;
            core.PermissionRequested += Browser_PermissionRequested;
            core.ProcessFailed += Browser_ProcessFailed;
            ready = true;
            Website.Visibility = Visibility.Visible;
            core.Navigate(lastTrustedUrl);
            StatusText.Text = "Caricamento della mappa…";
            UpdateButtons();
        }
        catch (Exception)
        {
            ShowError("WebView2 non è disponibile. Installa Microsoft Edge WebView2 Runtime e riprova.");
        }
        finally
        {
            starting = false;
        }
    }

    private void Browser_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && NavigationPolicy.IsTrusted(uri))
        {
            lastTrustedUrl = uri.AbsoluteUri;
            StatusText.Text = "Caricamento…";
            return;
        }
        e.Cancel = true;
        if (e.IsUserInitiated) OpenExternal(e.Uri);
        else StatusText.Text = "Collegamento esterno bloccato.";
    }

    private void Browser_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            ErrorPanel.Visibility = Visibility.Collapsed;
            Website.Visibility = Visibility.Visible;
            StatusText.Text = "Prezzi e locali aggiornati online.";
        }
        else if (e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
            ShowError("Controlla la connessione e riprova.");
        UpdateButtons();
    }

    private void Browser_ProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        ShowError("Il browser si è interrotto. Premi Riprova per riaprire Dove Bevo.");
        ready = false;
    }

    private void Browser_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!e.IsUserInitiated) return;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && NavigationPolicy.IsTrusted(uri))
            Website.CoreWebView2.Navigate(uri.AbsoluteUri);
        else OpenExternal(e.Uri);
    }

    private void Browser_PermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        if (e.PermissionKind != CoreWebView2PermissionKind.Geolocation
            || !Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)
            || !NavigationPolicy.IsTrusted(uri))
        {
            e.State = CoreWebView2PermissionState.Deny;
            return;
        }
        e.State = MessageBox.Show(this,
            "Vuoi usare la posizione per trovare locali vicini? Puoi continuare senza posizione.",
            "Posizione", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes
            ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
    }

    private void OpenExternal(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length != 0)
        {
            StatusText.Text = "Collegamento non aperto.";
            return;
        }
        if (MessageBox.Show(this, $"Aprire {uri.DnsSafeHost} nel browser?",
                "Collegamento esterno", MessageBoxButton.YesNo, MessageBoxImage.Question)
            != MessageBoxResult.Yes) return;
        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch (Exception)
        {
            StatusText.Text = "Non riesco ad aprire il browser esterno.";
        }
    }

    private void ShowError(string message)
    {
        ErrorText.Text = message;
        StatusText.Text = "Dove Bevo non disponibile.";
        Website.Visibility = Visibility.Hidden;
        ErrorPanel.Visibility = Visibility.Visible;
        UpdateButtons();
    }

    private void UpdateButtons()
    {
        BackButton.IsEnabled = ready && Website.CoreWebView2?.CanGoBack == true;
        ForwardButton.IsEnabled = ready && Website.CoreWebView2?.CanGoForward == true;
    }

    private void Navigate(string address)
    {
        FavouritesPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || !NavigationPolicy.IsTrusted(uri)) return;
        lastTrustedUrl = uri.AbsoluteUri;
        if (ready) Website.CoreWebView2.Navigate(lastTrustedUrl);
        else _ = StartBrowser();
    }

    private void Home_Click(object sender, RoutedEventArgs e) => Navigate(NavigationPolicy.Home);
    private void Privacy_Click(object sender, RoutedEventArgs e) => Navigate(NavigationPolicy.Privacy);

    private async void Search_Click(object sender, RoutedEventArgs e)
    {
        FavouritesPanel.Visibility = Visibility.Collapsed;
        if (!ready) { Navigate(NavigationPolicy.Home); return; }
        try
        {
            await Website.CoreWebView2.ExecuteScriptAsync(
                "document.querySelector('.top__row .search-field, .europe-search')?.click()");
            StatusText.Text = "Cerca una città o un locale.";
        }
        catch (Exception)
        {
            StatusText.Text = "Attendi che la mappa sia caricata e riprova.";
        }
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (FavouritesPanel.Visibility == Visibility.Visible)
        {
            FavouritesPanel.Visibility = Visibility.Collapsed;
            return;
        }
        if (ready && Website.CoreWebView2.CanGoBack) Website.CoreWebView2.GoBack();
    }

    private void Forward_Click(object sender, RoutedEventArgs e)
    {
        if (ready && Website.CoreWebView2.CanGoForward) Website.CoreWebView2.GoForward();
    }

    private async void Reload_Click(object sender, RoutedEventArgs e)
    {
        ErrorPanel.Visibility = Visibility.Collapsed;
        if (ready) Website.CoreWebView2.Reload();
        else await StartBrowser();
    }

    private void Share_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(lastTrustedUrl);
            StatusText.Text = "Link copiato. Puoi condividerlo.";
        }
        catch (Exception)
        {
            StatusText.Text = "Non riesco a copiare il link.";
        }
    }

    private void Favourites_Click(object sender, RoutedEventArgs e)
    {
        FavouriteList.ItemsSource = bookmarks.Items.ToArray();
        ErrorPanel.Visibility = Visibility.Collapsed;
        FavouritesPanel.Visibility = Visibility.Visible;
        StatusText.Text = bookmarks.Items.Count == 0 ? "Nessun drink salvato." : "Drink preferiti su questo PC.";
    }

    private async void SaveDrink_Click(object sender, RoutedEventArgs e)
    {
        if (!ready || FavouritesPanel.Visibility == Visibility.Visible
            || !Uri.TryCreate(Website.Source?.AbsoluteUri, UriKind.Absolute, out var current)
            || !NavigationPolicy.IsTrusted(current))
        {
            StatusText.Text = "Apri un locale sulla mappa per salvare un drink.";
            return;
        }
        try
        {
            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "VenueCapture.js"));
            using var result = JsonDocument.Parse(await Website.CoreWebView2.ExecuteScriptAsync(script));
            var root = result.RootElement;
            var state = root.TryGetProperty("status", out var status) ? status.GetString() : null;
            if (state == "choose_one")
            {
                StatusText.Text = "Seleziona un solo drink in «Scegli cosa bere», poi riprova.";
                return;
            }
            if (state != "ready")
            {
                StatusText.Text = "Apri un locale e attendi che la sua scheda sia visibile.";
                return;
            }
            var href = root.GetProperty("href").GetString();
            var key = root.GetProperty("key").GetString();
            var name = root.GetProperty("name").GetString();
            var drink = root.GetProperty("drink").GetString();
            if (href is null || key is null || name is null || drink is null
                || !NavigationPolicy.TryVenue(href, key, out _))
            {
                StatusText.Text = "Impossibile verificare questo locale.";
                return;
            }
            StatusText.Text = bookmarks.Add(new Bookmark(key, name, drink, href))
                ? $"{drink} da {name} salvato nei Preferiti."
                : "Già salvato, oppure l'archivio dei Preferiti è pieno.";
        }
        catch (Exception)
        {
            StatusText.Text = "Impossibile salvare il drink. Riprova dalla scheda del locale.";
        }
    }

    private void OpenFavourite_Click(object sender, RoutedEventArgs e)
    {
        if (FavouriteList.SelectedItem is Bookmark item) Navigate(item.Url);
    }

    private void RemoveFavourite_Click(object sender, RoutedEventArgs e)
    {
        if (FavouriteList.SelectedItem is not Bookmark item) return;
        try
        {
            if (!bookmarks.Remove(item)) return;
            FavouriteList.ItemsSource = bookmarks.Items.ToArray();
            StatusText.Text = "Drink rimosso dai Preferiti.";
        }
        catch (IOException)
        {
            StatusText.Text = "Non riesco ad aggiornare i Preferiti su questo PC.";
        }
    }
}
