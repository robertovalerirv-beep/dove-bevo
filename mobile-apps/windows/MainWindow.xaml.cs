using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;

namespace DoveBevo.Windows;

public partial class MainWindow : Window
{
    private enum NativeReturnDestination { None, Favourites, Recommendations, Discovery }
    private readonly BookmarkStore bookmarks = new();
    private readonly BookmarkPriceClient bookmarkPrices = new();
    private readonly AreaVotesClient areaVotes = new();
    private readonly MapRouteTracker mapRoutes = new();
    private readonly DiscoveryClient discovery = new();
    private readonly DiscoveryResultGate discoveryResults = new();
    private readonly DiscoveryCityDirectory cityDirectory = new();
    private FeaturedDiscoveryCard[] featuredCards = [];
    private DiscoveryArea? discoveryMapArea;
    private DiscoveryLocation? selectedDiscoveryCity;
    private IReadOnlyList<DiscoveryLocation> discoveryCities = [];
    private CancellationTokenSource? cityCancellation;
    private int cityLoadGeneration;
    private bool changingCityChoices;
    private CancellationTokenSource? discoveryCancellation;
    private bool starting;
    private bool ready;
    private bool recommendationBusy;
    private DiscoveryArea? recommendationArea;
    private CancellationTokenSource? recommendationCancellation;
    private CancellationTokenSource? favouritesCancellation;
    private bool saveBusy;
    private string? pendingExactBookmark;
    private string lastTrustedUrl = NavigationPolicy.Home;
    private NativeReturnDestination returnDestination;

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
            core.SourceChanged += (_, _) => RememberMapRoute();
            core.HistoryChanged += (_, _) => RememberMapRoute();
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
        if (e.Uri.Contains("save_offer=", StringComparison.Ordinal) ||
            e.Uri.Contains("save_drink=", StringComparison.Ordinal) ||
            e.Uri.Contains("save_customer=", StringComparison.Ordinal) ||
            e.Uri.Contains("save_europe=", StringComparison.Ordinal))
        {
            e.Cancel = true;
            if (e.IsUserInitiated && !saveBusy) _ = SaveExactDrinkAsync(e.Uri);
            else StatusText.Text = "Salvataggio non disponibile. Riprova dal drink nel locale.";
            return;
        }
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && NavigationPolicy.IsTrusted(uri))
        {
            if (pendingExactBookmark is not null &&
                !NavigationPolicy.TrySaveAction(pendingExactBookmark, uri.AbsoluteUri, out _))
                pendingExactBookmark = null;
            lastTrustedUrl = uri.AbsoluteUri;
            StatusText.Text = "Caricamento…";
            return;
        }
        e.Cancel = true;
        if (e.IsUserInitiated) OpenExternal(e.Uri);
        else StatusText.Text = "Collegamento esterno bloccato.";
    }

    private async void Browser_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            RememberMapRoute();
            ErrorPanel.Visibility = Visibility.Collapsed;
            ShowWebsiteIfNoOverlay();
            StatusText.Text = "Prezzi e locali aggiornati online.";
            try
            {
                await AdvertiseNativeActionsAsync();
                await HighlightPendingBookmarkAsync();
            }
            catch (Exception) { StatusText.Text = "La pagina è visibile. Riprova l'azione se necessario."; }
        }
        else if (e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
            ShowError("Controlla la connessione e riprova.");
        UpdateButtons();
    }

    private void RememberMapRoute()
    {
        if (!ready) return;
        mapRoutes.Observe(CurrentBrowserRoute());
        // SourceChanged/HistoryChanged also cover same-document venue navigation.
        _ = PublishSavedDrinkKeysAsync();
    }

    private Uri? CurrentBrowserRoute() =>
        Uri.TryCreate(Website.CoreWebView2?.Source, UriKind.Absolute, out var current)
            ? current : Website.Source;

    private async Task AdvertiseNativeActionsAsync()
    {
        // A successfully loaded HTTPS document can still be the old website shell.
        // Advertise native links only after the app marker has actually mounted.
        for (var attempt = 0; attempt < 20; attempt++)
        {
            if (!ready || CurrentBrowserRoute() is not { AbsolutePath: "/mobile/" } source ||
                !NavigationPolicy.IsTrusted(source)) return;
            var assignment = "window.DoveBevoNativeSavedDrinkKeys=" +
                JsonSerializer.Serialize(NativeSavedDrinkKeys.FromBookmarks(bookmarks.Items, source)) + ";";
            var enabled = await Website.CoreWebView2.ExecuteScriptAsync(
                "(()=>{if(location.href!==" + JsonSerializer.Serialize(source.AbsoluteUri) +
                "||location.origin!=='https://www.dovebevo.com'||location.pathname!=='/mobile/'||document.documentElement.getAttribute('data-dovebevo-mobile-shell')!=='1')return false;" +
                assignment +
                "window.DoveBevoNativeOfferSave=true;window.DoveBevoNativeDrinkSave=true;window.DoveBevoNativeCustomerSave=true;window.DoveBevoNativeEuropeSave=true;window.dispatchEvent(new Event('dovebevo-native-ready'));return true})()");
            if (enabled == "true") return;
            await Task.Delay(150);
        }
    }

    private async Task PublishSavedDrinkKeysAsync()
    {
        if (!ready || CurrentBrowserRoute() is not { AbsolutePath: "/mobile/" } source ||
            !NavigationPolicy.IsTrusted(source)) return;
        try
        {
            var assignment = "window.DoveBevoNativeSavedDrinkKeys=" +
                JsonSerializer.Serialize(NativeSavedDrinkKeys.FromBookmarks(bookmarks.Items, source)) + ";";
            await Website.CoreWebView2.ExecuteScriptAsync(
                "(()=>{if(location.href!==" + JsonSerializer.Serialize(source.AbsoluteUri) +
                "||location.origin!=='https://www.dovebevo.com'||location.pathname!=='/mobile/'||document.documentElement.getAttribute('data-dovebevo-mobile-shell')!=='1')return;" +
                assignment + "window.dispatchEvent(new Event('dovebevo-native-favourites-changed'));})()");
        }
        catch (Exception) { /* The next trusted document load republishes the local snapshot. */ }
    }

    private async Task HighlightPendingBookmarkAsync()
    {
        if (!ready || pendingExactBookmark is not { } action) return;
        var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,
            "ExactFavouriteFocus.js"));
        script = script.Replace("__DOVE_BEVO_EXACT_TARGET__", JsonSerializer.Serialize(action),
            StringComparison.Ordinal);
        for (var attempt = 0; attempt < 40; attempt++)
        {
            if (!ready || pendingExactBookmark != action) return;
            if (await Website.CoreWebView2.ExecuteScriptAsync(script) == "true")
            {
                pendingExactBookmark = null;
                StatusText.Text = "Il drink esatto salvato è evidenziato nel locale.";
                return;
            }
            await Task.Delay(250);
        }
        if (pendingExactBookmark == action)
        {
            pendingExactBookmark = null;
            StatusText.Text = "Il drink esatto salvato non è disponibile nel locale ora.";
        }
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
            returnDestination != NativeReturnDestination.None ||
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

    private void Navigate(string address, string? exactBookmark = null,
        NativeReturnDestination source = NativeReturnDestination.None)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || !NavigationPolicy.IsTrusted(uri)) return;
        if (source != NativeReturnDestination.None)
            mapRoutes.BeginNativeVenue(CurrentBrowserRoute());
        pendingExactBookmark = exactBookmark;
        favouritesCancellation?.Cancel();
        recommendationCancellation?.Cancel();
        if (source == NativeReturnDestination.Discovery)
        {
            discoveryCancellation?.Cancel();
            discoveryCancellation?.Dispose();
            discoveryCancellation = null;
            RetireCities();
            DiscoveryPanel.Visibility = Visibility.Collapsed;
        }
        else CloseDiscovery();
        FavouritesPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        ShowWebsiteIfNoOverlay();
        returnDestination = source;
        lastTrustedUrl = uri.AbsoluteUri;
        if (ready) Website.CoreWebView2.Navigate(lastTrustedUrl);
        else _ = StartBrowser();
        UpdateButtons();
    }

    private void Home_Click(object sender, RoutedEventArgs e) => Discover_Click(sender, e);
    private void Map_Click(object sender, RoutedEventArgs e)
    {
        // Keep this return route across Back to a native list: CoreWebView2.Source
        // can still show the old city while its venue navigation is in flight.
        var pendingMapReturn = mapRoutes.ConsumeNativeReturn();
        returnDestination = NativeReturnDestination.None;
        var current = CurrentBrowserRoute();
        favouritesCancellation?.Cancel();
        recommendationCancellation?.Cancel();
        CloseDiscovery();
        FavouritesPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        ShowWebsiteIfNoOverlay();
        if (pendingMapReturn is not null || !ready || !NavigationPolicy.IsMapRoute(current))
            Navigate(pendingMapReturn ?? mapRoutes.Destination(current));
        UpdateButtons();
    }
    private void More_Click(object sender, RoutedEventArgs e)
    {
        if (MoreButton.ContextMenu is { } menu)
        {
            menu.PlacementTarget = MoreButton;
            menu.IsOpen = true;
        }
    }
    private async void Discover_Click(object sender, RoutedEventArgs e)
    {
        returnDestination = NativeReturnDestination.None;
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
        discoveryMapArea = mapArea;
        InvalidateDiscoveryResults(mapArea);
        selectedDiscoveryCity = null;
        DiscoveryCity.Content = mapArea is null ? "Scegli città ⌄" : "Zona della mappa ⌄";
        DiscoveryCityPopup.IsOpen = false;
        DiscoveryDrink.ItemsSource = DiscoveryClient.Categories;
        DiscoveryDrink.SelectedIndex = 1;
        DiscoveryPanel.Visibility = Visibility.Visible;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
        if (discoveryResults.Area is null) StatusText.Text = "Caricamento città per Scopri…";
        _ = LoadDiscoveryCities();
        if (discoveryResults.Area is not null) await LoadDiscovery();
    }
    private void Privacy_Click(object sender, RoutedEventArgs e) => Navigate(NavigationPolicy.Privacy);

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryPanel.Visibility == Visibility.Visible)
        {
            CloseDiscovery();
            return;
        }
        if (FavouritesPanel.Visibility == Visibility.Visible)
        {
            favouritesCancellation?.Cancel();
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
        var source = returnDestination;
        if (source != NativeReturnDestination.None)
        {
            returnDestination = NativeReturnDestination.None;
            if (source == NativeReturnDestination.Favourites) FavouritesPanel.Visibility = Visibility.Visible;
            else if (source == NativeReturnDestination.Recommendations) RecommendationsPanel.Visibility = Visibility.Visible;
            else
            {
                DiscoveryPanel.Visibility = Visibility.Visible;
                if (discoveryCities.Count == 0) _ = LoadDiscoveryCities();
            }
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

    private async void Favourites_Click(object sender, RoutedEventArgs e)
    {
        returnDestination = NativeReturnDestination.None;
        CloseDiscovery();
        favouritesCancellation?.Cancel();
        favouritesCancellation?.Dispose();
        var request = new CancellationTokenSource();
        favouritesCancellation = request;
        var views = bookmarks.Items.Select(item =>
            new BookmarkView(item, "Prezzo in verifica online")).ToArray();
        FavouriteList.ItemsSource = views;
        ErrorPanel.Visibility = Visibility.Collapsed;
        RecommendationsPanel.Visibility = Visibility.Collapsed;
        FavouritesPanel.Visibility = Visibility.Visible;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
        StatusText.Text = bookmarks.Items.Count == 0 ? "Nessun drink salvato." : "Drink preferiti su questo PC.";
        await RefreshFavouritePricesAsync(views, request);
    }

    private async Task RefreshFavouritePricesAsync(BookmarkView[] views, CancellationTokenSource request)
    {
        using var gate = new SemaphoreSlim(3);
        var work = views.Select(async (view, index) =>
        {
            await gate.WaitAsync(request.Token);
            try
            {
                var price = await bookmarkPrices.RefreshAsync(view.Bookmark, request.Token);
                if (request.IsCancellationRequested || FavouritesPanel.Visibility != Visibility.Visible)
                    return;
                views[index] = new BookmarkView(view.Bookmark, price);
                FavouriteList.ItemsSource = views.ToArray();
            }
            catch (OperationCanceledException) { }
            finally { gate.Release(); }
        }).ToArray();
        try { await Task.WhenAll(work); }
        catch (OperationCanceledException) { }
    }

    private async Task SaveExactDrinkAsync(string address)
    {
        if (!ready || saveBusy) return;
        saveBusy = true;
        try
        {
            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,
                "SaveLinkCapture.js"));
            script = script.Replace("__DOVE_BEVO_SAVE_TARGET__", JsonSerializer.Serialize(address),
                StringComparison.Ordinal);
            using var document = JsonDocument.Parse(await Website.CoreWebView2.ExecuteScriptAsync(script));
            var result = document.RootElement;
            if (result.ValueKind != JsonValueKind.Object ||
                result.GetProperty("status").GetString() != "ready" ||
                result.GetProperty("target").GetString() != address ||
                !NavigationPolicy.TrySaveAction(address, result.GetProperty("href").GetString(),
                    out var action) || action is null)
                throw new InvalidDataException("No visible exact drink action");
            var venueName = result.GetProperty("venueName").GetString();
            var drinkName = result.GetProperty("drinkName").GetString();
            if (venueName is not { Length: > 0 and <= 120 } ||
                drinkName is not { Length: > 0 and <= 120 } ||
                venueName.Any(char.IsControl) || drinkName.Any(char.IsControl))
                throw new InvalidDataException("Invalid drink name");
            var venueUrl = $"https://www.dovebevo.com/bar/{action.VenueKey}?c={action.Cell}";
            Uri? focused = null;
            var valid = action.Kind switch
            {
                "offer" => NavigationPolicy.TryOfferVenue(venueUrl, action.VenueKey, action.Item,
                    out focused),
                "legacy" => NavigationPolicy.TryFocusedVenue(venueUrl, action.VenueKey,
                    action.Item, action.Band == "happy_hour" ? 1 : 0, out focused),
                "europe" => NavigationPolicy.TryVenue(
                    $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{action.VenueKey}&c={action.Cell}",
                    action.VenueKey, out focused),
                "customer" => NavigationPolicy.TryVenue(
                    $"https://www.dovebevo.com/mobile/?path=%2Fbar%2F{action.VenueKey}&c={action.Cell}",
                    action.VenueKey, out focused),
                _ => false,
            };
            if (!valid || focused is null) throw new InvalidDataException("Invalid drink destination");
            var item = new Bookmark(action.VenueKey, venueName, drinkName,
                focused.AbsoluteUri, action.CommandUrl);
            var saved = bookmarks.Add(item);
            StatusText.Text = saved
                ? $"{drinkName} da {venueName} salvato nei Preferiti di questo PC."
                : "Drink già salvato o archivio dei Preferiti pieno.";
            if (saved) await PublishSavedDrinkKeysAsync();
        }
        catch (Exception)
        {
            StatusText.Text = "Non riesco a salvare questo drink. Riapri il locale e riprova.";
        }
        finally { saveBusy = false; }
    }

    private async void Recommendations_Click(object sender, RoutedEventArgs e)
    {
        returnDestination = NativeReturnDestination.None;
        if (recommendationBusy) return;
        if (DiscoveryPanel.Visibility == Visibility.Visible) CloseDiscovery();
        if (RecommendationsPanel.Visibility != Visibility.Visible)
        {
            favouritesCancellation?.Cancel();
            FavouritesPanel.Visibility = Visibility.Collapsed;
            ErrorPanel.Visibility = Visibility.Collapsed;
            ShowWebsiteIfNoOverlay();
            try
            {
                if (ready)
                {
                    var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,
                        "MapAreaReader.js"));
                    recommendationArea = DiscoveryArea.ParseWebView(
                        await Website.CoreWebView2.ExecuteScriptAsync(script), Website.Source);
                }
                if (recommendationArea is null)
                {
                    StatusText.Text = "Apri la mappa e attendi che la zona sia caricata per vedere i consigli.";
                    return;
                }
                RecommendationVenue.Text = "I drink consigliati da tutti nella zona della mappa.";
                RecommendationsPanel.Visibility = Visibility.Visible;
                ShowWebsiteIfNoOverlay();
                UpdateButtons();
            }
            catch (Exception)
            {
                StatusText.Text = "Non riesco a leggere la zona della mappa. Riprova.";
                return;
            }
        }
        await LoadRecommendations();
    }

    private async Task LoadRecommendations()
    {
        if (recommendationBusy || recommendationArea is null) return;
        recommendationBusy = true;
        recommendationCancellation?.Cancel();
        recommendationCancellation?.Dispose();
        var request = new CancellationTokenSource();
        recommendationCancellation = request;
        RecommendationList.ItemsSource = Array.Empty<AreaVoteRow>();
        StatusText.Text = "Caricamento dei consigli condivisi…";
        try
        {
            var snapshot = await areaVotes.LoadAsync(recommendationArea, request.Token);
            if (request.IsCancellationRequested || RecommendationsPanel.Visibility != Visibility.Visible) return;
            RecommendationList.ItemsSource = snapshot.Rows.ToArray();
            StatusText.Text = snapshot.HasMore
                ? $"{snapshot.Rows.Count} consigli mostrati; altri disponibili in questa zona."
                : snapshot.Rows.Count == 0
                    ? "Nessun drink consigliato ancora in questa zona."
                    : $"{snapshot.Rows.Count} drink consigliati dagli utenti in questa zona.";
        }
        catch (OperationCanceledException) { }
        catch (Exception)
        {
            if (!request.IsCancellationRequested)
                StatusText.Text = "Consigli non disponibili. Controlla la connessione e premi Ricarica.";
        }
        finally
        {
            recommendationBusy = false;
        }
    }

    private void OpenRecommendedVenue_Click(object sender, RoutedEventArgs e)
    {
        if (RecommendationList.SelectedItem is AreaVoteRow row)
            Navigate(row.VenueUrl, source: NativeReturnDestination.Recommendations);
    }

    private void OpenFavourite_Click(object sender, RoutedEventArgs e)
    {
        if (FavouriteList.SelectedItem is not BookmarkView item) return;
        var bookmark = item.Bookmark;
        if (bookmark.ActionUrl is not null &&
            NavigationPolicy.TryExactEuropeVenue(bookmark.ActionUrl, bookmark.Url, out var exactVenue) &&
            exactVenue is not null)
            Navigate(exactVenue.AbsoluteUri, bookmark.ActionUrl, NativeReturnDestination.Favourites);
        else Navigate(bookmark.Url, source: NativeReturnDestination.Favourites);
    }

    private void RemoveFavourite_Click(object sender, RoutedEventArgs e)
    {
        if (FavouriteList.SelectedItem is not BookmarkView view) return;
        var item = view.Bookmark;
        try
        {
            if (!bookmarks.Remove(item)) return;
            _ = PublishSavedDrinkKeysAsync();
            StatusText.Text = "Drink rimosso dai Preferiti.";
            Favourites_Click(sender, e);
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

    private void DiscoveryCity_Click(object sender, RoutedEventArgs e)
    {
        DiscoveryCitySearch.Text = "";
        RefreshDiscoveryCityChoices();
        DiscoveryCityPopup.IsOpen = true;
        DiscoveryCitySearch.Focus();
    }

    private void DiscoveryCitySearch_TextChanged(object sender, TextChangedEventArgs e) =>
        RefreshDiscoveryCityChoices();

    private void DiscoveryCitySearch_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape) { DiscoveryCityPopup.IsOpen = false; e.Handled = true; }
        if (e.Key != Key.Enter || DiscoveryCityChoices.Items.Count == 0) return;
        if (DiscoveryCityChoices.Items[0] is DiscoveryLocation first)
        {
            DiscoveryCityChoices.SelectedItem = first;
            e.Handled = true;
        }
    }

    private async void DiscoveryCityChoices_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (changingCityChoices || DiscoveryCityPopup.IsOpen != true ||
            DiscoveryCityChoices.SelectedItem is not DiscoveryLocation choice) return;
        selectedDiscoveryCity = choice.Country.Length == 0 ? null : choice;
        InvalidateDiscoveryResults(choice.Area);
        DiscoveryCity.Content = choice + " ⌄";
        DiscoveryCityPopup.IsOpen = false;
        if (DiscoveryPanel.Visibility == Visibility.Visible) await LoadDiscovery();
    }

    private void DiscoveryCityRetry_Click(object sender, RoutedEventArgs e) => _ = LoadDiscoveryCities();

    private void RefreshDiscoveryCityChoices()
    {
        if (DiscoveryCityChoices is null || DiscoveryCitySearch is null) return;
        var blank = DiscoveryCitySearch.Text.Trim().Length == 0;
        var choices = DiscoveryCityDirectory.Visible(discoveryCities, DiscoveryCitySearch.Text);
        changingCityChoices = true;
        DiscoveryCityChoices.ItemsSource = blank && discoveryMapArea is not null
            ? new[] { new DiscoveryLocation("Zona della mappa", discoveryMapArea) }.Concat(choices).ToArray()
            : choices;
        DiscoveryCityChoices.SelectedIndex = -1;
        changingCityChoices = false;
        if (DiscoveryCityMessage is not null && DiscoveryCityChoices.Items.Count == 0 &&
            DiscoveryCityRetry?.Visibility != Visibility.Visible)
            DiscoveryCityMessage.Text = "Nessuna città trovata.";
    }

    private async Task LoadDiscoveryCities()
    {
        RetireCities();
        var request = new CancellationTokenSource();
        cityCancellation = request;
        var generation = cityLoadGeneration;
        DiscoveryCityMessage.Text = "Caricamento città…";
        DiscoveryCityRetry.Visibility = Visibility.Collapsed;
        try
        {
            var result = await cityDirectory.LoadAsync(request.Token);
            if (request.IsCancellationRequested || generation != cityLoadGeneration ||
                DiscoveryPanel.Visibility != Visibility.Visible) return;
            discoveryCities = result.Cities;
            DiscoveryCityRetry.Visibility = result.ItalianUnavailable || result.EuropeanUnavailable ||
                result.Cities.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            DiscoveryCityMessage.Text = result.Cities.Count == 0 ? "Elenco città non disponibile. Riprova."
                : result.ItalianUnavailable || result.EuropeanUnavailable ?
                    "Elenco città parziale. Riprova per altre città." : "";
            var previous = selectedDiscoveryCity;
            var missingSelectedCity = false;
            if (previous is not null)
            {
                var updated = result.Cities.FirstOrDefault(city => city.Key == previous.Key);
                if (updated is not null)
                {
                    selectedDiscoveryCity = updated;
                    if (discoveryResults.Area != updated.Area) InvalidateDiscoveryResults(updated.Area);
                    DiscoveryCity.Content = updated + " ⌄";
                }
                else if (!(previous.Country == "IT" ? result.ItalianUnavailable : result.EuropeanUnavailable))
                {
                    selectedDiscoveryCity = null;
                    InvalidateDiscoveryResults(discoveryMapArea);
                    missingSelectedCity = true;
                    DiscoveryCity.Content = discoveryMapArea is null ? "Scegli città ⌄" : "Zona della mappa ⌄";
                    DiscoveryCityMessage.Text = discoveryMapArea is null
                        ? "La città selezionata non è più disponibile. Scegline un'altra."
                        : "La città selezionata non è più disponibile. Mostro la zona della mappa.";
                }
            }
            if (discoveryResults.Area is null && !missingSelectedCity && result.Cities.Count > 0)
            {
                var preferred = result.Cities[mapRoutes.PreferredCityIndex(result.Cities)];
                selectedDiscoveryCity = preferred;
                InvalidateDiscoveryResults(preferred.Area);
                DiscoveryCity.Content = preferred + " ⌄";
            }
            RefreshDiscoveryCityChoices();
            if (discoveryResults.Area is null) StatusText.Text = result.Cities.Count == 0
                ? "Elenco città non disponibile. Riprova per cercare i prezzi."
                : "Scegli una città per cercare i prezzi.";
            if (discoveryResults.Area is not null &&
                (previous is null || previous.Area != discoveryResults.Area))
                await LoadDiscovery();
        }
        catch (OperationCanceledException) { }
        catch (Exception)
        {
            if (request.IsCancellationRequested || generation != cityLoadGeneration) return;
            DiscoveryCityMessage.Text = "Elenco città non disponibile. Riprova.";
            DiscoveryCityRetry.Visibility = Visibility.Visible;
        }
    }

    private void RetireCities()
    {
        cityLoadGeneration++;
        cityCancellation?.Cancel();
        cityCancellation?.Dispose();
        cityCancellation = null;
    }

    private async void ReloadDiscovery_Click(object sender, RoutedEventArgs e) => await LoadDiscovery();

    private long InvalidateDiscoveryResults(DiscoveryArea? area)
    {
        discoveryCancellation?.Cancel();
        discoveryCancellation?.Dispose();
        discoveryCancellation = null;
        var request = discoveryResults.Begin(area);
        DiscoveryList.ItemsSource = discoveryResults.Rows;
        featuredCards = [];
        FeaturedCards.ItemsSource = featuredCards;
        UpdateFeaturedVisibility();
        return request;
    }

    private async Task LoadDiscovery()
    {
        var area = discoveryResults.Area;
        if (area is null || DiscoveryDrink.SelectedItem is not DiscoveryCategory category) return;
        var generation = InvalidateDiscoveryResults(area);
        var request = new CancellationTokenSource();
        discoveryCancellation = request;
        StatusText.Text = $"Cerco prezzi pubblici per {category.Name.ToLowerInvariant()} qui vicino…";
        try
        {
            var snapshot = await discovery.LoadAsync(area, category.Code, request.Token);
            if (request.IsCancellationRequested || DiscoveryPanel.Visibility != Visibility.Visible ||
                !discoveryResults.Publish(generation, area, snapshot.Rows)) return;
            DiscoveryList.ItemsSource = discoveryResults.Rows;
            featuredCards = FeaturedDiscoveryCards.FromRows(snapshot.Rows);
            FeaturedCards.ItemsSource = featuredCards;
            UpdateFeaturedVisibility();
            StatusText.Text = snapshot.EuropeUnavailable
                ? $"Prezzi europei non disponibili ora; {snapshot.Rows.Count} prezzi di altre fonti mostrati. Riprova Aggiorna."
                : snapshot.UnavailableCells > 0
                ? $"{snapshot.Rows.Count} prezzi trovati; {snapshot.UnavailableCells} fonti non disponibili. Riprova Aggiorna."
                : snapshot.Rows.Count == 0
                    ? "Nessun prezzo pubblico per questo drink qui vicino. Prova un altro drink o sposta la mappa."
                    : $"{snapshot.Rows.Count} prezzi pubblici nella zona selezionata.";
        }
        catch (OperationCanceledException) { }
        catch (Exception)
        {
            if (!request.IsCancellationRequested) StatusText.Text = "Non riesco a caricare i prezzi. Riprova Aggiorna.";
        }
    }

    private void CloseDiscovery()
    {
        DiscoveryCityPopup.IsOpen = false;
        RetireCities();
        InvalidateDiscoveryResults(null);
        DiscoveryPanel.Visibility = Visibility.Collapsed;
        discoveryMapArea = null;
        selectedDiscoveryCity = null;
        ShowWebsiteIfNoOverlay();
        UpdateButtons();
    }

    private void OpenDiscoveryVenue_Click(object sender, RoutedEventArgs e)
    {
        if (DiscoveryList.SelectedItem is not DiscoveryRow row) return;
        OpenDiscoveryTarget(row.FocusedVenue());
    }

    private void OpenFeaturedVenue_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not FeaturedDiscoveryCard card) return;
        OpenDiscoveryTarget(card.Target);
    }

    private void OpenDiscoveryTarget(Uri? target)
    {
        if (target is null) { StatusText.Text = "Non riesco ad aprire questo locale."; return; }
        Navigate(target.AbsoluteUri, source: NativeReturnDestination.Discovery);
    }

    private void DiscoveryPanel_SizeChanged(object sender, SizeChangedEventArgs e) => UpdateFeaturedVisibility();

    private void UpdateFeaturedVisibility()
    {
        if (DiscoveryPanel is null || FeaturedTitle is null || FeaturedSubtitle is null ||
            FeaturedScroller is null) return;
        var visible = featuredCards.Length > 0 && DiscoveryPanel.Visibility == Visibility.Visible &&
                      DiscoveryPanel.ActualHeight >= 570;
        FeaturedTitle.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        FeaturedSubtitle.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        FeaturedScroller.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    }
}
