using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;

namespace DoveBevo.Windows;

public partial class MainWindow : Window
{
    private readonly BookmarkStore bookmarks = new();
    private readonly RecommendationClient recommendations = new();
    private readonly DiscoveryClient discovery = new();
    private DiscoveryArea? discoveryArea;
    private CancellationTokenSource? discoveryCancellation;
    private bool starting;
    private bool ready;
    private bool recommendationBusy;
    private string? recommendationVenueUrl;
    private string? recommendationVenueKey;
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
            ShowWebsiteIfNoOverlay();
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
            ShowWebsiteIfNoOverlay();
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
        var email = NavigationPolicy.TrySupportEmail(address, out var emailUri);
        if (!email && (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length != 0))
        {
            StatusText.Text = "Collegamento non aperto.";
            return;
        }
        var target = email ? emailUri! : new Uri(address);
        var prompt = email ? "Aprire l'app email per scrivere a Dove Bevo?"
            : $"Aprire {target.DnsSafeHost} nel browser?";
        if (MessageBox.Show(this, prompt,
                "Collegamento esterno", MessageBoxButton.YesNo, MessageBoxImage.Question)
            != MessageBoxResult.Yes) return;
        try
        {
            Process.Start(new ProcessStartInfo(target.AbsoluteUri) { UseShellExecute = true });
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
        BackButton.IsEnabled = DiscoveryPanel.Visibility == Visibility.Visible ||
            FavouritesPanel.Visibility == Visibility.Visible ||
            RecommendationsPanel.Visibility == Visibility.Visible ||
            ready && Website.CoreWebView2?.CanGoBack == true;
        ForwardButton.IsEnabled = ready && Website.CoreWebView2?.CanGoForward == true;
    }

    // WPF WebView2 is an HWND and paints above WPF siblings. Hide it whenever
    // a native panel is open; otherwise the panel is interactive but invisible.
    private void ShowWebsiteIfNoOverlay()
    {
        Website.Visibility = ready && ErrorPanel.Visibility != Visibility.Visible &&
            DiscoveryPanel.Visibility != Visibility.Visible &&
            FavouritesPanel.Visibility != Visibility.Visible &&
            RecommendationsPanel.Visibility != Visibility.Visible
            ? Visibility.Visible : Visibility.Hidden;
    }

    private void Navigate(string address)
    {
        CloseDiscovery();
        FavouritesPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        ShowWebsiteIfNoOverlay();
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || !NavigationPolicy.IsTrusted(uri)) return;
        lastTrustedUrl = uri.AbsoluteUri;
        if (ready) Website.CoreWebView2.Navigate(lastTrustedUrl);
        else _ = StartBrowser();
    }

    private void Home_Click(object sender, RoutedEventArgs e) => Navigate(NavigationPolicy.Home);
    private async void Discover_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryPanel.Visibility == Visibility.Visible) { await LoadDiscovery(); return; }
        DiscoveryArea? mapArea = null;
        try
        {
            if (ready)
            {
                var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "MapAreaReader.js"));
                mapArea = DiscoveryArea.ParseWebView(
                    await Website.CoreWebView2.ExecuteScriptAsync(script), Website.Source);
            }
        }
        catch (Exception) { /* The explicit city list remains available when the map is not ready. */ }
        FavouritesPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        DiscoveryPanel.Visibility = Visibility.Collapsed;
        DiscoveryCity.ItemsSource = mapArea is null
            ? DiscoveryClient.Cities
            : new[] { new DiscoveryLocation("Zona della mappa", mapArea) }
                .Concat(DiscoveryClient.Cities).ToArray();
        DiscoveryCity.SelectedIndex = 0;
        discoveryArea = ((DiscoveryLocation)DiscoveryCity.SelectedItem).Area;
        DiscoveryDrink.ItemsSource = DiscoveryClient.Categories;
        DiscoveryDrink.SelectedIndex = 1;
        DiscoveryPanel.Visibility = Visibility.Visible;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
        await LoadDiscovery();
    }
    private void Privacy_Click(object sender, RoutedEventArgs e) => Navigate(NavigationPolicy.Privacy);

    private async void Search_Click(object sender, RoutedEventArgs e)
    {
        CloseDiscovery();
        FavouritesPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ShowWebsiteIfNoOverlay();
        if (!ready) { Navigate(NavigationPolicy.Home); return; }
        try
        {
            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "SearchClick.js"));
            var opened = await Website.CoreWebView2.ExecuteScriptAsync(script);
            StatusText.Text = opened == "true"
                ? "Cerca una città o un locale."
                : "Torna alla mappa e riprova Cerca.";
        }
        catch (Exception)
        {
            StatusText.Text = "Attendi che la mappa sia caricata e riprova.";
        }
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryPanel.Visibility == Visibility.Visible)
        {
            CloseDiscovery();
            return;
        }
        if (FavouritesPanel.Visibility == Visibility.Visible)
        {
            FavouritesPanel.Visibility = Visibility.Collapsed;
            ShowWebsiteIfNoOverlay();
            UpdateButtons();
            return;
        }
        if (RecommendationsPanel.Visibility == Visibility.Visible)
        {
            RecommendationsPanel.Visibility = Visibility.Collapsed;
            ShowWebsiteIfNoOverlay();
            UpdateButtons();
            return;
        }
        if (ready && Website.CoreWebView2.CanGoBack) Website.CoreWebView2.GoBack();
    }

    private void Forward_Click(object sender, RoutedEventArgs e)
    {
        CloseDiscovery();
        if (ready && Website.CoreWebView2.CanGoForward) Website.CoreWebView2.GoForward();
    }

    private async void Reload_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryPanel.Visibility == Visibility.Visible) { await LoadDiscovery(); return; }
        ErrorPanel.Visibility = Visibility.Collapsed;
        if (ready) Website.CoreWebView2.Reload();
        else await StartBrowser();
    }

    private void Share_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var current = Website.Source;
            Clipboard.SetText(ready && NavigationPolicy.IsTrusted(current)
                ? current!.AbsoluteUri : lastTrustedUrl);
            StatusText.Text = "Link copiato. Puoi condividerlo.";
        }
        catch (Exception)
        {
            StatusText.Text = "Non riesco a copiare il link.";
        }
    }

    private void Favourites_Click(object sender, RoutedEventArgs e)
    {
        CloseDiscovery();
        FavouriteList.ItemsSource = bookmarks.Items.ToArray();
        ErrorPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        FavouritesPanel.Visibility = Visibility.Visible;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
        StatusText.Text = bookmarks.Items.Count == 0 ? "Nessun drink salvato." : "Drink preferiti su questo PC.";
    }

    private async void SaveDrink_Click(object sender, RoutedEventArgs e)
    {
        if (FavouritesPanel.Visibility == Visibility.Visible || RecommendationsPanel.Visibility == Visibility.Visible ||
            DiscoveryPanel.Visibility == Visibility.Visible)
        {
            StatusText.Text = "Torna alla scheda del locale per salvare un drink.";
            return;
        }
        try
        {
            var venue = await CaptureVenue();
            if (venue is null)
            {
                StatusText.Text = "Apri un locale e attendi che la sua scheda sia visibile.";
                return;
            }
            if (venue.Value.Drink is null || venue.Value.DrinkCode is null)
            {
                StatusText.Text = "Seleziona un solo drink in «Scegli cosa bere», poi riprova.";
                return;
            }
            if (!NavigationPolicy.TryFocusedVenue(venue.Value.Href, venue.Value.Key,
                    venue.Value.DrinkCode, venue.Value.HappyHour, out var focused) || focused is null)
            {
                StatusText.Text = "Non riesco a creare il link del drink. Riprova.";
                return;
            }
            StatusText.Text = bookmarks.Add(new Bookmark(venue.Value.Key, venue.Value.Name,
                    venue.Value.Drink, focused.AbsoluteUri))
                ? $"{venue.Value.Drink} da {venue.Value.Name} salvato nei Preferiti."
                : "Già salvato, oppure l'archivio dei Preferiti è pieno.";
        }
        catch (Exception)
        {
            StatusText.Text = "Impossibile salvare il drink. Riprova dalla scheda del locale.";
        }
    }

    private async Task<(string Href, string Key, string Name, string? Drink,
        string? DrinkCode, int HappyHour)?> CaptureVenue()
    {
        if (!ready || !Uri.TryCreate(Website.Source?.AbsoluteUri, UriKind.Absolute, out var current)
            || !NavigationPolicy.IsTrusted(current)) return null;
        var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "VenueCapture.js"));
        using var result = JsonDocument.Parse(await Website.CoreWebView2.ExecuteScriptAsync(script));
        var root = result.RootElement;
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("status", out var status) || status.GetString() != "ready")
            return null;
        var href = root.GetProperty("href").GetString();
        var key = root.GetProperty("key").GetString();
        var name = root.GetProperty("name").GetString();
        var drink = root.GetProperty("drink").GetString();
        var drinkCode = root.GetProperty("drinkCode").GetString();
        var happyHour = root.GetProperty("hh").GetInt32();
        if (href is null || key is null || name is null || name.Length is < 1 or > 120
            || !NavigationPolicy.TryVenue(href, key, out _)
            || (drink is not null && (drink.Length is < 1 or > 80 || drink.Any(char.IsControl)))
            || (happyHour != 0 && happyHour != 1))
            return null;
        return (href, key, name, drink, drinkCode, happyHour);
    }

    private async void Recommendations_Click(object sender, RoutedEventArgs e)
    {
        if (recommendationBusy) return;
        if (DiscoveryPanel.Visibility == Visibility.Visible) CloseDiscovery();
        if (RecommendationsPanel.Visibility != Visibility.Visible)
        {
            try
            {
                var venue = await CaptureVenue();
                if (venue is null)
                {
                    StatusText.Text = "Apri la scheda di un locale prima di vedere i consigli.";
                    return;
                }
                if (!NavigationPolicy.TryRecommendationEndpoint(venue.Value.Href, venue.Value.Key, out _))
                {
                    StatusText.Text = "I consigli condivisi non sono disponibili per questo locale.";
                    return;
                }
                recommendationVenueUrl = venue.Value.Href;
                recommendationVenueKey = venue.Value.Key;
                RecommendationVenue.Text = venue.Value.Name;
                FavouritesPanel.Visibility = Visibility.Collapsed;
                ErrorPanel.Visibility = Visibility.Collapsed;
                RecommendationsPanel.Visibility = Visibility.Visible;
                ShowWebsiteIfNoOverlay();
                UpdateButtons();
            }
            catch (Exception)
            {
                StatusText.Text = "Non riesco a leggere questo locale. Riprova dalla sua scheda.";
                return;
            }
        }
        await LoadRecommendations();
    }

    private async Task LoadRecommendations(string? drink = null, bool recommended = false)
    {
        if (recommendationBusy || recommendationVenueUrl is null || recommendationVenueKey is null) return;
        recommendationBusy = true;
        StatusText.Text = drink is null ? "Caricamento dei consigli…" : "Aggiornamento del consiglio…";
        try
        {
            RecommendationList.ItemsSource = (await recommendations.LoadAsync(
                recommendationVenueUrl, recommendationVenueKey, drink, recommended)).ToArray();
            StatusText.Text = "I totali sono condivisi con tutti. Puoi annullare il tuo consiglio.";
        }
        catch (Exception)
        {
            StatusText.Text = "Consigli non disponibili. Controlla la connessione e premi Ricarica.";
        }
        finally
        {
            recommendationBusy = false;
        }
    }

    private async void Vote_Click(object sender, RoutedEventArgs e)
    {
        if (RecommendationList.SelectedItem is not RecommendationRow row || recommendationBusy) return;
        await LoadRecommendations(row.Code, !row.Recommended);
    }

    private void CloseRecommendations_Click(object sender, RoutedEventArgs e)
    {
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
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

    private async void DiscoveryDrink_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (DiscoveryPanel.Visibility == Visibility.Visible) await LoadDiscovery();
    }

    private async void DiscoveryCity_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (DiscoveryCity.SelectedItem is not DiscoveryLocation location) return;
        discoveryArea = location.Area;
        if (DiscoveryPanel.Visibility == Visibility.Visible) await LoadDiscovery();
    }

    private async void ReloadDiscovery_Click(object sender, RoutedEventArgs e) => await LoadDiscovery();

    private async Task LoadDiscovery()
    {
        if (discoveryArea is null || DiscoveryDrink.SelectedItem is not DiscoveryCategory category) return;
        discoveryCancellation?.Cancel();
        discoveryCancellation?.Dispose();
        var request = new CancellationTokenSource();
        discoveryCancellation = request;
        DiscoveryList.ItemsSource = Array.Empty<DiscoveryRow>();
        StatusText.Text = $"Cerco {category.Name.ToLowerInvariant()} nei menu verificati qui vicino…";
        try
        {
            var snapshot = await discovery.LoadAsync(discoveryArea, category.Code, request.Token);
            if (request.IsCancellationRequested || DiscoveryPanel.Visibility != Visibility.Visible) return;
            DiscoveryList.ItemsSource = snapshot.Rows.ToArray();
            StatusText.Text = snapshot.UnavailableCells > 0
                ? $"{snapshot.Rows.Count} prezzi trovati; {snapshot.UnavailableCells} zone non disponibili. Riprova Aggiorna."
                : snapshot.Rows.Count == 0
                    ? "Nessun prezzo verificato per questo drink qui vicino. Prova un altro drink o sposta la mappa."
                    : $"{snapshot.Rows.Count} prezzi verificati nella zona selezionata.";
        }
        catch (OperationCanceledException) { }
        catch (Exception)
        {
            if (!request.IsCancellationRequested) StatusText.Text = "Non riesco a caricare i prezzi. Riprova Aggiorna.";
        }
    }

    private void CloseDiscovery()
    {
        discoveryCancellation?.Cancel();
        discoveryCancellation?.Dispose();
        discoveryCancellation = null;
        DiscoveryPanel.Visibility = Visibility.Collapsed;
        discoveryArea = null;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
    }

    private void CloseDiscovery_Click(object sender, RoutedEventArgs e) => CloseDiscovery();

    private void OpenDiscoveryVenue_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryList.SelectedItem is not DiscoveryRow row) return;
        var target = row.FocusedVenue();
        if (target is null) { StatusText.Text = "Non riesco ad aprire questo locale."; return; }
        Navigate(target.AbsoluteUri);
    }
}
