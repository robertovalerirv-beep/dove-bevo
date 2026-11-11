package com.dovebevo.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebBackForwardList;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.io.IOException;
import java.io.InputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** The live website stays in its normal browser origin and cookie context. */
public final class MainActivity extends ComponentActivity {
    private static final int LOCATION_REQUEST = 71;
    private static final int RETURN_NONE = 0, RETURN_FAVORITES = 1, RETURN_DISCOVERY = 2, RETURN_RECOMMENDATIONS = 3;
    private WebView website;
    private WebView popup;
    private FrameLayout content;
    private LinearLayout topActions;
    private LinearLayout errorPanel;
    private TextView offline;
    private ProgressBar progress;
    private TextView errorTitle;
    private TextView errorMessage;
    private Button backButton;
    private Button forwardButton;
    private SavedVenuesUi savedVenues;
    private SavedDrinkUi savedDrinks;
    private SavedDrinkStore drinkStore;
    private SavedMenuOfferStore offerStore;
    private SavedMenuOfferStore customerStore;
    private SavedEuropeDrinkStore europeStore;
    private MenuV2Loader offerVerifier;
    private MenuV2Loader.Batch offerVerifyBatch;
    private EuropeDrinkVerifier europeVerifier;
    private EuropeDrinkVerifier.Batch europeVerifyBatch;
    private AlertDialog offerSaveDialog;
    private long offerSaveGeneration;
    private long drinkCapture;
    private FavoritesScreen favorites;
    private boolean favoritesVisible;
    private DiscoveryScreen discovery;
    private boolean discoveryVisible;
    private long discoveryCapture;
    private boolean restoreFavoritesPending;
    private boolean restoreDiscoveryPending,restoreAreaPending;
    private Button mapDestination,favoritesDestination;
    private ExactVoteAreaScreen areaScreen;
    private DiscoveryArea selectedArea;
    private long favoritesAreaCapture;
    private boolean areaVisible,areaCapturing;
    private int returnDestination = RETURN_NONE;
    private String lastMapRoute = MobileEntry.HOME, pendingMapReturn;
    private long areaCapture;
    private Button recommendationButton;
    private long venueCaptureEpoch;
    private AlertDialog locationHelpDialog;
    private String lastTrustedUrl = MobileEntry.HOME;
    private long documentCheckGeneration;
    private boolean foreground;
    private boolean failed;
    private boolean destroyed;
    private boolean websiteStarted;
    private boolean loading;
    private boolean hasUsablePage;
    private boolean searchPending;
    private boolean searchOpening;
    private long searchCallbackGeneration;
    private boolean documentHasHttpError;
    private boolean awaitingDocumentStart;
    private String stoppedUrl;
    private String preparedNavigationUrl;
    private String locationOrigin;
    private GeolocationPermissions.Callback locationCallback;
    private boolean requestingLocationPermission;
    private boolean locationResultReady;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private AlertDialog privacyDialog;
    private android.app.Dialog shareDialog, informationDialog;
    private long shareCapture;
    private TestLabPolicy testLabPolicy;
    private String mobileThemeScript;
    private long presentationRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Light system navigation surfaces require dark controls, introduced in API 26.
        // The resource fallback stays dark on API 24-25, where those controls are white.
        if (Build.VERSION.SDK_INT >= 26) {
            getWindow().setNavigationBarColor(getColor(R.color.shell_background));
            getWindow().getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility()
                    | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        // Firebase's documented signal, read once before any WebView can be created.
        testLabPolicy = TestLabPolicy.detect(
                () -> Settings.System.getString(getContentResolver(), "firebase.test.lab"));
        SharedPreferences rules = getSharedPreferences("dovebevo_rules", MODE_PRIVATE);
        RulesAcceptance.route(rules.getString("accepted_rules_version", null),
                () -> showWelcome(state, rules), () -> showWebsiteShell(state));
    }

    private LinearLayout createShell() {
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(getColor(R.color.shell_background));
        if (testLabPolicy.isReadOnly()) {
            TextView banner = text(R.string.test_lab_read_only_banner, 14);
            banner.setPadding(dp(12), dp(8), dp(12), dp(8));
            banner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
            shell.addView(banner, new LinearLayout.LayoutParams(-1, -2));
        }
        shell.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        return shell;
    }

    private void showWelcome(Bundle state, SharedPreferences rules) {
        LinearLayout shell = createShell();
        ScrollView scroll = new ScrollView(this);
        scroll.setId(R.id.rules_scroll);
        LinearLayout reading = new LinearLayout(this);
        reading.setOrientation(LinearLayout.VERTICAL);
        reading.setPadding(dp(24), dp(24), dp(24), dp(24));
        TextView title = text(R.string.welcome_title, 24);
        title.setPadding(0, 0, 0, dp(16));
        reading.addView(title);
        TextView introduction = text(R.string.welcome_body, 16);
        introduction.setGravity(Gravity.START);
        introduction.setPadding(0, 0, 0, dp(16));
        reading.addView(introduction);
        TextView document = new TextView(this);
        document.setId(R.id.rules_document);
        document.setTextSize(16);
        document.setTextColor(getColor(R.color.shell_text));
        document.setTextIsSelectable(true);
        boolean readable;
        try (InputStream asset = getAssets().open("terms.md")) {
            document.setText(PrivacyDocument.read(asset));
            readable = true;
        } catch (IOException error) {
            document.setText(R.string.rules_unavailable);
            readable = false;
        }
        reading.addView(document, new LinearLayout.LayoutParams(-1, -2));
        scroll.addView(reading, new ScrollView.LayoutParams(-1, -2));
        shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        Button accept = button(R.id.accept_rules, R.string.accept_rules, () -> {});
        accept.setOnClickListener(view -> {
            view.setEnabled(false);
            // Confirm the small version-only write before any WebView or network setup.
            boolean saved = RulesAcceptance.accept(
                    () -> rules.edit().putString("accepted_rules_version", RulesAcceptance.VERSION).commit(),
                    () -> showWebsiteShell(state));
            if (!saved) { view.setEnabled(true); toast(R.string.rules_not_saved); }
        });
        accept.setTextSize(16);
        accept.setPadding(dp(12), dp(8), dp(12), dp(8));
        accept.setEnabled(readable);
        shell.addView(accept, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout actions = new LinearLayout(this);
        actions.addView(button(R.id.privacy, R.string.privacy, this::showPrivacy), toolSize());
        actions.addView(button(R.id.decline_rules, R.string.decline_rules, this::finish), toolSize());
        shell.addView(actions, new LinearLayout.LayoutParams(-1, -2));
        setContentView(shell);
        shell.requestApplyInsets();
    }

    private void showWebsiteShell(Bundle state) {
        if (destroyed || websiteStarted) return;
        websiteStarted = true;
        // The first WebView and network observer are created only after current rules acceptance.
        WebView.setWebContentsDebuggingEnabled(false);
        LinearLayout shell = createShell();
        // Preserve browser history for Android Back and the top overflow.
        backButton = button(R.id.back, R.string.back, this::goBack);
        forwardButton = button(R.id.forward, R.string.forward, this::goForward);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setContentDescription(getString(R.string.loading));
        shell.addView(progress, new LinearLayout.LayoutParams(-1, dp(4)));
        offline = text(R.string.offline, 14);
        offline.setId(R.id.offline);
        offline.setPadding(dp(12), dp(8), dp(12), dp(8));
        offline.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        offline.setVisibility(View.GONE);
        shell.addView(offline, new LinearLayout.LayoutParams(-1, -2));
        content = new FrameLayout(this);
        shell.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        shell.addView(createBottomNavigation(),new LinearLayout.LayoutParams(-1,-2));
        errorPanel = new LinearLayout(this);
        errorPanel.setId(R.id.load_error);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorPanel.setBackgroundColor(getColor(R.color.shell_background));
        errorTitle = text(R.string.unavailable_title, 22);
        errorPanel.addView(errorTitle);
        errorMessage = text(R.string.unavailable_body, 16);
        errorMessage.setPadding(0, dp(16), 0, dp(16));
        errorPanel.addView(errorMessage);
        errorPanel.addView(button(R.id.retry, R.string.retry, () -> navigate(lastTrustedUrl)), new LinearLayout.LayoutParams(-2, -2));
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
        setContentView(shell);
        shell.requestApplyInsets();
        monitorNetwork();
        SavedVenueStore savedStore=new SavedVenueStore(new SavedVenueFile(getFilesDir()));
        savedVenues = new SavedVenuesUi(this, savedStore,
                this::eligibleSavedVenue, this::readSavedVenue, this::navigate);
        drinkStore=new SavedDrinkStore(new SavedVenueFile(getFilesDir(),"saved-drinks-v1"));
        offerStore=new SavedMenuOfferStore(new SavedVenueFile(getFilesDir(),"saved-owner-offers-v1"));
        customerStore=new SavedMenuOfferStore(new SavedVenueFile(getFilesDir(),"saved-customer-drinks-v1"));
        europeStore=new SavedEuropeDrinkStore(new SavedVenueFile(getFilesDir(),"saved-europe-drinks-v1"));
        offerVerifier=new MenuV2Loader(new MenuV2Prices(),task->new android.os.Handler(android.os.Looper.getMainLooper()).post(task));
        europeVerifier=new EuropeDrinkVerifier(task->new android.os.Handler(android.os.Looper.getMainLooper()).post(task));
        savedDrinks=new SavedDrinkUi(this,drinkStore,this::eligibleSavedVenue,this::readSavedVenue,()->venueCaptureEpoch,this::publishNativeSavedKeys);
        favorites=new FavoritesScreen(this,savedStore,url->openFromNative(url,RETURN_FAVORITES),()->foreground&&!destroyed,drinkStore,offerStore,customerStore,europeStore);
        content.addView(favorites.view(),new FrameLayout.LayoutParams(-1,-1));favorites.view().setVisibility(View.GONE);
        discovery=new DiscoveryScreen(this,url->openFromNative(url,RETURN_DISCOVERY),()->foreground&&!destroyed);
        content.addView(discovery.view(),new FrameLayout.LayoutParams(-1,-1));discovery.view().setVisibility(View.GONE);
        areaScreen=new ExactVoteAreaScreen(this,url->openFromNative(url,RETURN_RECOMMENDATIONS),this::openMapSearch,()->foreground&&!destroyed);
        content.addView(areaScreen.view(),new FrameLayout.LayoutParams(-1,-1));areaScreen.view().setVisibility(View.GONE);
        topActions = createTopActions();
        content.addView(topActions, new FrameLayout.LayoutParams(-2, dp(48), Gravity.TOP | Gravity.END));
        if(state!=null){favorites.restoreSelection(state.getString("favorite_drink"),state.getInt("favorite_band",0));favorites.restorePane(state.getBoolean("favorite_drinks_visible",false));}
        if(state!=null)discovery.restoreSelection(state.getString("discovery_drink"),state.getInt("discovery_band",0));
        if(state!=null) {
            int savedReturn=state.getInt("native_return_destination",RETURN_NONE);
            if(savedReturn>=RETURN_FAVORITES&&savedReturn<=RETURN_RECOMMENDATIONS)returnDestination=savedReturn;
            String savedMap=state.getString("last_map_route"),savedPending=state.getString("pending_map_return");
            if(MapReturnRoute.valid(savedMap))lastMapRoute=savedMap;
            if(MapReturnRoute.valid(savedPending))pendingMapReturn=savedPending;
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });
        if (state != null && BrowserPolicy.target(state.getString("trusted_url")) == BrowserPolicy.Target.INTERNAL)
            lastTrustedUrl = state.getString("trusted_url");
        createWebsite();
        if (!restoreHistory(state)) navigate(lastTrustedUrl);
        updateToolbar();
        restoreDestination(state);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout createTopActions() {
        // The overflow shares the map's first row instead of reserving an
        // otherwise empty native toolbar above the WebView.
        LinearLayout topActions = new LinearLayout(this);
        topActions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        topActions.setPadding(0, 0, dp(8), 0);
        Button more = button(R.id.more, R.string.more_symbol, () -> {});
        more.setContentDescription(getString(R.string.more_options));
        more.setTextSize(26);
        more.setMinWidth(dp(48)); more.setMinimumWidth(dp(48));
        more.setOnClickListener(this::showMenu);
        topActions.addView(more, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return topActions;
    }
    private void setWebMenuClearance(boolean needed) {
        if (website == null || !(website.getLayoutParams() instanceof FrameLayout.LayoutParams)) return;
        FrameLayout.LayoutParams layout = (FrameLayout.LayoutParams) website.getLayoutParams();
        int top = needed ? dp(48) : 0;
        if (layout.topMargin == top) return;
        layout.topMargin = top;
        website.setLayoutParams(layout);
    }
    private LinearLayout createBottomNavigation() {
        BottomNavigationBar bottom = new BottomNavigationBar(this, this::goHome,
                this::showMap, this::showFavorites, this::openAreaRecommendations);
        mapDestination = bottom.findViewById(R.id.map_destination);
        favoritesDestination = bottom.findViewById(R.id.favorites_destination);
        recommendationButton = bottom.findViewById(R.id.recommendation_entry);
        return bottom;
    }
    private LinearLayout.LayoutParams toolSize() { return new LinearLayout.LayoutParams(0, -2, 1); }
    private TextView text(int label, int size) {
        TextView view = new TextView(this);
        view.setText(label);
        view.setTextSize(size);
        view.setTextColor(getColor(R.color.shell_text));
        view.setGravity(Gravity.CENTER);
        return view;
    }
    private Button button(int id, int label, Runnable action) {
        Button button = new Button(this);
        button.setId(id);
        button.setText(label);
        button.setContentDescription(getString(label));
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setMinHeight(dp(48));
        button.setMinimumHeight(dp(48));
        button.setPadding(dp(2), dp(4), dp(2), dp(4));
        button.setMaxLines(2);
        NativeAppearance.button(button, false);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebsite() {
        website = configuredWebView();
        website.setId(R.id.website);
        WebSettings settings = website.getSettings();
        settings.setJavaScriptEnabled(true);
        MobilePresentation.installDocumentStart(website);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        // Keep the stock User-Agent and browser storage for the website's Turnstile flow.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(website, true);
        website.setWebViewClient(new WebsiteClient(testLabPolicy));
        website.setWebChromeClient(new ChromeClient());
        website.setDownloadListener((url, userAgent, disposition, mime, length) -> openExternal(url));
        content.addView(website, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    /** Only called after rules acceptance, for the website and every popup WebView. */
    private WebView configuredWebView() {
        final TestLabPolicy policy = testLabPolicy;
        // minSdk is 24. Install before a WebView/page can start a service worker.
        // Also replace any previous activity's policy with normal pass-through when appropriate.
        // Capture only immutable policy: the process-wide client must not retain this activity.
        ServiceWorkerController.getInstance().setServiceWorkerClient(new TestLabServiceWorkerClient(policy));
        WebView view = new WebView(this);
        view.setBackgroundColor(getColor(R.color.shell_background));
        WebSettings settings = view.getSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.setWebViewClient(new TestLabClient(policy));
        return view;
    }

    private static WebResourceResponse testLabResponse(TestLabPolicy policy, WebResourceRequest request) {
        TestLabResponse response = TestLabResponse.forRequest(policy, request == null ? null : request.getMethod());
        if (response == null) return null;
        // A fixed in-memory response prevents dispatch; never forward or replay the blocked request.
        return new WebResourceResponse(response.mimeType(), response.encoding(), response.statusCode(),
                response.reasonPhrase(), response.headers(), response.openBody());
    }

    private static class TestLabClient extends WebViewClient {
        private final TestLabPolicy policy;
        TestLabClient(TestLabPolicy policy) { this.policy = policy; }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return testLabResponse(policy, request);
        }
    }

    private static final class TestLabServiceWorkerClient extends ServiceWorkerClient {
        private final TestLabPolicy policy;
        TestLabServiceWorkerClient(TestLabPolicy policy) { this.policy = policy; }
        @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return testLabResponse(policy, request);
        }
    }

    private void openFromNative(String url,int source) {
        if(!foreground||destroyed||BrowserPolicy.target(url)!=BrowserPolicy.Target.INTERNAL)return;
        showMap(false);
        pendingMapReturn=lastMapRoute;
        returnDestination=source;
        navigate(url);
        updateToolbar();
    }

    private String nativeSavedKeysAssignment(String current) {
        if(drinkStore==null||offerStore==null||customerStore==null||europeStore==null)
            return "window.DoveBevoNativeSavedDrinkKeys=null;";
        try {
            String venue=NativeSavedDrinkKeys.venuePrefix(current);
            java.util.List<String> keys=NativeSavedDrinkKeys.load(drinkStore,offerStore,customerStore,europeStore);
            keys.removeIf(key->venue==null||!key.startsWith(venue));
            return "window.DoveBevoNativeSavedDrinkKeys="+
                    new JSONArray(keys).toString()+";";
        } catch(IOException|RuntimeException unreadable) {
            return "window.DoveBevoNativeSavedDrinkKeys=null;";
        }
    }

    private void publishNativeSavedKeys() {
        publishNativeSavedKeys(website==null?null:website.getUrl());
    }
    private void publishNativeSavedKeys(String current) {
        if(destroyed||website==null||!hasUsablePage||!MobileEntry.isDocument(current))return;
        String expected=JSONObject.quote(current);
        website.evaluateJavascript("(function(){if(location.href!=="+expected+
                "||location.origin!=='https://www.dovebevo.com'"+
                "||!['/mobile/','/mobile/index.html'].includes(location.pathname)"+
                "||document.documentElement.getAttribute('data-dovebevo-mobile-shell')!=='1')return;"+
                nativeSavedKeysAssignment(current)+
                "window.dispatchEvent(new Event('dovebevo-native-favourites-changed'));})()",null);
    }

    private void navigate(String url) {
        if (destroyed || BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return;
        url = MobileEntry.documentURL(url);
        cancelLocation();
        if (website == null) createWebsite();
        prepareNavigation(url);
        errorPanel.setVisibility(View.GONE);
        website.setVisibility(View.VISIBLE);
        setLoading(true);
        website.loadUrl(url); // Explicit GET: never replay a form submission on retry.
    }
    private void refresh() {
        if (loading && website != null) {
            venueCaptureEpoch++;
            // navigate() records its target before WebView exposes a new URL.
            stoppedUrl = lastTrustedUrl;
            awaitingDocumentStart = false;
            cancelLocation();
            website.stopLoading();
            setLoading(false);
            if (!hasUsablePage) showFailure(R.string.loading_stopped_title, R.string.loading_stopped_body);
            return;
        }
        String url = website == null ? null : website.getUrl();
        navigate(BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL ? url : lastTrustedUrl);
    }
    private void goBack() {
        if(areaVisible){showMap();return;}
        if(discoveryVisible){showMap();return;}
        if(favoritesVisible){showMap();return;}
        if(returnDestination!=RETURN_NONE){
            int destination=returnDestination;
            returnDestination=RETURN_NONE;
            if(destination==RETURN_FAVORITES)showFavoritesNow();
            else if(destination==RETURN_DISCOVERY)showDiscovery(selectedArea);
            else if(destination==RETURN_RECOMMENDATIONS)showAreaRecommendations(selectedArea);
            return;
        }
        BackNavigation.perform(website != null && website.canGoBack(), () -> {
            areaCapture++;areaCapturing=false;
            venueCaptureEpoch++;
            failed = false;
            preparedNavigationUrl = null;
            awaitingDocumentStart = false;
            stoppedUrl = null;
            documentHasHttpError = false;
            cancelLocation();
            errorPanel.setVisibility(View.GONE);
            website.setVisibility(View.VISIBLE);
            setLoading(false); // Same-document history may not emit a page-start callback.
            website.goBack();
            website.post(this::updateToolbar);
        }, this::finish);
    }

    private void goForward() {
        if (website == null || !website.canGoForward()) return;
        areaCapture++;areaCapturing=false;
        venueCaptureEpoch++;
        failed = false;
        preparedNavigationUrl = null;
        awaitingDocumentStart = false;
        stoppedUrl = null;
        documentHasHttpError = false;
        cancelLocation();
        errorPanel.setVisibility(View.GONE);
        website.setVisibility(View.VISIBLE);
        setLoading(false);
        website.goForward();
        website.post(this::updateToolbar);
    }

    private void setLoading(boolean value) {
        if (value && !loading) venueCaptureEpoch++;
        loading = value;
        progress.setVisibility(value&&!nativeDestinationVisible() ? View.VISIBLE : View.GONE);
        updateToolbar();
    }

    private void prepareNavigation(String url) {
        areaCapture++;areaCapturing=false;
        documentCheckGeneration++;
        venueCaptureEpoch++;
        failed = false;
        documentHasHttpError = false;
        stoppedUrl = null;
        lastTrustedUrl = url;
        preparedNavigationUrl = url;
        awaitingDocumentStart = true;
    }

    private boolean isCurrentDocument(WebView source, String url) {
        if (source != website || url == null || url.equals(stoppedUrl)) return false;
        String expected = preparedNavigationUrl != null ? preparedNavigationUrl : source.getUrl();
        return url.equals(expected) && BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL;
    }

    private void retainEarlyDocumentFailure(String url) {
        // Some providers deliver the main HTTP/network failure before the
        // corresponding onPageStarted. Preserve it through that start event.
        lastTrustedUrl = url;
        preparedNavigationUrl = url;
    }

    private void updateToolbar() {
        if (backButton == null) return;
        if (topActions != null) topActions.bringToFront();
        backButton.setEnabled(foreground && !destroyed && (nativeDestinationVisible() || returnDestination!=RETURN_NONE || website != null && website.canGoBack()));
        forwardButton.setEnabled(foreground && !destroyed && !nativeDestinationVisible() && website != null && website.canGoForward());
        if (recommendationButton != null) {
            recommendationButton.setEnabled(foreground && !destroyed && !areaCapturing);
            recommendationButton.setAlpha(recommendationButton.isEnabled() ? 1f : .5f);
        }
        if(mapDestination!=null){styleDestination(mapDestination,!nativeDestinationVisible());styleDestination(favoritesDestination,favoritesVisible);}
        for(int id:new int[]{R.id.home,R.id.map_destination,R.id.favorites_destination,R.id.more}){
            View control=findViewById(id);if(control!=null)control.setEnabled(foreground&&!destroyed);
        }
        for(int id:new int[]{R.id.home}){
            Button control=findViewById(id);if(control!=null)styleDestination(control,id==R.id.home&&discoveryVisible);
        }
        if(recommendationButton!=null)styleDestination(recommendationButton,areaVisible);
    }

    private void styleDestination(Button button,boolean selected){
        NativeAppearance.destination(button, selected);
    }
    private boolean nativeDestinationVisible(){return favoritesVisible||discoveryVisible||areaVisible;}

    private void restoreDestination(Bundle state){
        if(state!=null){
            if(state.getBoolean("selected_area_valid",false))try{
                selectedArea=new DiscoveryArea(state.getDouble("selected_area_lat"),state.getDouble("selected_area_lon"),state.getDouble("selected_area_zoom"));
            }catch(IOException invalid){selectedArea=null;}
            restoreFavoritesPending=state.getBoolean("favorites_visible",false);
            restoreAreaPending=!restoreFavoritesPending&&state.getBoolean("recommendation_area_visible",false);
            restoreDiscoveryPending=!restoreFavoritesPending&&!restoreAreaPending&&state.getBoolean("discovery_visible",false);
        }
        // onCreate precedes onResume. Keep the destination intent until foreground
        // rather than bypassing the same foreground guard used by user actions.
        if(restoreDiscoveryPending&&foreground&&!destroyed&&discovery!=null){restoreDiscoveryPending=false;goHome();return;}
        if(restoreAreaPending&&foreground&&!destroyed&&areaScreen!=null){restoreAreaPending=false;showAreaRecommendations(selectedArea);return;}
        if(!restoreFavoritesPending||!foreground||destroyed||favorites==null)return;
        restoreFavoritesPending=false;
        showFavoritesNow();
    }
    private void showFavorites(){
        if(!foreground||destroyed||favorites==null||favoritesVisible)return;
        if(discoveryVisible){selectedArea=discovery==null?null:discovery.area();showFavoritesNow();return;}
        if(areaVisible){showFavoritesNow();return;}
        // Capture while the active map document is still visible. Hiding the
        // WebView before the JS callback can suppress its visibility guard.
        String capturedUrl=website==null?null:website.getUrl();WebView source=website;
        selectedArea=null;
        if(!DiscoveryArea.visitor(capturedUrl)||failed||loading||awaitingDocumentStart||!hasUsablePage||documentHasHttpError){showFavoritesNow();return;}
        long request=++favoritesAreaCapture,epoch=venueCaptureEpoch;
        source.postDelayed(()->{
            if(request!=favoritesAreaCapture||epoch!=venueCaptureEpoch||!foreground||destroyed||source!=website)return;
            favoritesAreaCapture++;showFavoritesNow();
        },700);
        try{source.evaluateJavascript(DiscoveryArea.SCRIPT,result->{
            if(request!=favoritesAreaCapture||epoch!=venueCaptureEpoch||!foreground||destroyed||source!=website)return;
            favoritesAreaCapture++;
            selectedArea=DiscoveryArea.decode(result,capturedUrl,source.getUrl(),epoch,venueCaptureEpoch);
            showFavoritesNow();
        });}catch(RuntimeException unavailable){if(request==favoritesAreaCapture){favoritesAreaCapture++;showFavoritesNow();}}
    }
    private void showFavoritesNow(){
        if(!foreground||destroyed||favorites==null||favoritesVisible)return;
        returnDestination=RETURN_NONE;
        searchPending=false;searchOpening=false;searchCallbackGeneration++;
        discoveryCapture++;if(discovery!=null){discovery.hide();discovery.view().setVisibility(View.GONE);}discoveryVisible=false;
        areaCapture++;areaCapturing=false;hideArea();venueCaptureEpoch++;
        cancelLocation();disposePopup();
        if(savedVenues!=null)savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        retireOfferSave();favoritesVisible=true;
        if(website!=null){website.setVisibility(View.GONE);website.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);}
        errorPanel.setVisibility(View.GONE);errorPanel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        progress.setVisibility(View.GONE);favorites.view().setVisibility(View.VISIBLE);favorites.view().bringToFront();favorites.show();updateToolbar();
    }
    private void showMap(){showMap(true);}
    private void showMap(boolean restoreCity){
        if(!foreground||destroyed)return;
        returnDestination=RETURN_NONE;
        favoritesAreaCapture++;
        areaCapture++;areaCapturing=false;hideArea();
        discoveryCapture++;if(discovery!=null){discovery.hide();discovery.view().setVisibility(View.GONE);}discoveryVisible=false;
        if(favorites!=null){favorites.hide();favorites.view().setVisibility(View.GONE);}
        favoritesVisible=false;
        if(website!=null){website.setVisibility(failed?View.GONE:View.VISIBLE);website.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}
        if(errorPanel!=null){errorPanel.setVisibility(failed?View.VISIBLE:View.GONE);errorPanel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}
        if(progress!=null)progress.setVisibility(loading?View.VISIBLE:View.GONE);updateToolbar();
        String restore=restoreCity?pendingMapReturn:null;
        if(restoreCity)pendingMapReturn=null;
        // A pending venue load may not have updated WebView.getUrl() yet. An
        // explicit Mappa tap must cancel it even if the old city is still shown.
        if(MapReturnRoute.valid(restore)&&website!=null){
            navigate(restore);
            return;
        }
        publishNativeSavedKeys();
        dispatchPendingSearch();
    }
    private void openMapSearch(){
        if(!foreground||destroyed)return;
        returnDestination=RETURN_NONE;
        retireSharePresentation();
        searchCallbackGeneration++;
        searchPending=true;
        searchOpening=true;
        venueCaptureEpoch++;
        showMap();
        if(website==null||!MobileEntry.isDocument(website.getUrl())){navigate(MobileEntry.HOME);return;}
        dispatchPendingSearch();
    }
    private void dispatchPendingSearch(){
        if(!searchPending||!foreground||destroyed||nativeDestinationVisible()||website==null||
                !hasUsablePage||failed||loading||awaitingDocumentStart||documentHasHttpError||
                !MobileEntry.isDocument(website.getUrl()))return;
        searchPending=false;
        WebView source=website;String captured=source.getUrl();
        long searchGeneration=searchCallbackGeneration,documentGeneration=documentCheckGeneration,venueGeneration=venueCaptureEpoch;
        source.evaluateJavascript(MobileEntry.SEARCH_SCRIPT,result->{
            if(searchGeneration!=searchCallbackGeneration||source!=website||!foreground||destroyed||
                    nativeDestinationVisible()||!hasUsablePage||failed||loading||awaitingDocumentStart||documentHasHttpError)return;
            searchOpening=false;
            updateToolbar();
            if(!"true".equals(result)&&searchFailureIsCurrent(source,captured,searchGeneration,documentGeneration,venueGeneration))
                Toast.makeText(this,"Cerca non disponibile. Riprova quando la mappa è pronta.",Toast.LENGTH_SHORT).show();
        });
    }
    private boolean searchFailureIsCurrent(WebView source,String captured,long searchGeneration,long documentGeneration,long venueGeneration){
        return foreground&&!destroyed&&!nativeDestinationVisible()&&source==website&&captured!=null&&
                captured.equals(source.getUrl())&&MobileEntry.isDocument(source.getUrl())&&
                searchGeneration==searchCallbackGeneration&&documentGeneration==documentCheckGeneration&&
                venueGeneration==venueCaptureEpoch&&hasUsablePage&&!failed&&!loading&&
                !awaitingDocumentStart&&!documentHasHttpError;
    }
    private void goHome(){
        if(!foreground||destroyed)return;
        searchPending=false;searchOpening=false;searchCallbackGeneration++;
        if(discoveryVisible){discovery.refresh();return;}
        venueCaptureEpoch++;areaCapture++;areaCapturing=false;
        if(savedVenues!=null)savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        disposePopup();showMap();
        if(discovery==null)return;
        String capturedUrl=website==null?null:website.getUrl();WebView source=website;
        if(!DiscoveryArea.visitor(capturedUrl)||failed||loading||awaitingDocumentStart||!hasUsablePage||documentHasHttpError){showDiscovery(null);return;}
        long capture=++discoveryCapture,epoch=venueCaptureEpoch;
        source.postDelayed(()->{
            if(capture==discoveryCapture&&epoch==venueCaptureEpoch&&foreground&&!destroyed&&source==website)showDiscovery(null);
        },5000);
        source.post(()->{
            if(capture!=discoveryCapture||epoch!=venueCaptureEpoch||!foreground||destroyed||source!=website)return;
            try{source.evaluateJavascript(DiscoveryArea.SCRIPT,result->{
                if(capture!=discoveryCapture||!foreground||destroyed||source!=website||epoch!=venueCaptureEpoch||failed||loading||awaitingDocumentStart)return;
                showDiscovery(DiscoveryArea.decode(result,capturedUrl,source.getUrl(),epoch,venueCaptureEpoch));
            });}catch(RuntimeException unavailable){if(capture==discoveryCapture)showDiscovery(null);}
        });
    }
    private void showDiscovery(DiscoveryArea area){
        if(!foreground||destroyed||discovery==null)return;
        returnDestination=RETURN_NONE;
        if(area!=null)selectedArea=area;
        discoveryCapture++;areaCapture++;areaCapturing=false;hideArea();venueCaptureEpoch++;
        cancelLocation();disposePopup();if(savedVenues!=null)savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        retireOfferSave();if(favorites!=null){favorites.hide();favorites.view().setVisibility(View.GONE);}favoritesVisible=false;discoveryVisible=true;
        if(website!=null){website.setVisibility(View.GONE);website.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);}
        errorPanel.setVisibility(View.GONE);errorPanel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);progress.setVisibility(View.GONE);
        discovery.view().setVisibility(View.VISIBLE);discovery.view().bringToFront();discovery.show(area);updateToolbar();
    }

    private void openAreaRecommendations(){
        if(!foreground||destroyed||areaScreen==null||areaCapturing)return;
        favoritesAreaCapture++;
        if(areaVisible){areaScreen.refresh();return;}
        if(discoveryVisible){showAreaRecommendations(discovery==null?null:discovery.area());return;}
        if(favoritesVisible){showAreaRecommendations(selectedArea);return;}
        String capturedUrl=website==null?null:website.getUrl();WebView source=website;
        if(!DiscoveryArea.visitor(capturedUrl)||failed||loading||awaitingDocumentStart||!hasUsablePage||documentHasHttpError){showAreaRecommendations(null);return;}
        long request=++areaCapture,epoch=venueCaptureEpoch;areaCapturing=true;updateToolbar();
        source.postDelayed(()->{
            if(request!=areaCapture||!areaCapturing||epoch!=venueCaptureEpoch||source!=website||!capturedUrl.equals(source.getUrl()))return;
            areaCapturing=false;showAreaRecommendations(null);
        },5000);
        try{source.evaluateJavascript(DiscoveryArea.SCRIPT,result->{
            if(request!=areaCapture||!areaCapturing||!foreground||destroyed||source!=website||epoch!=venueCaptureEpoch)return;
            areaCapturing=false;
            showAreaRecommendations(DiscoveryArea.decode(result,capturedUrl,source.getUrl(),epoch,venueCaptureEpoch));
        });}catch(RuntimeException unavailable){if(request==areaCapture){areaCapturing=false;showAreaRecommendations(null);}}
    }
    private void showAreaRecommendations(DiscoveryArea area){
        if(!foreground||destroyed||areaScreen==null)return;
        returnDestination=RETURN_NONE;
        selectedArea=area;
        areaCapture++;areaCapturing=false;searchPending=false;searchOpening=false;searchCallbackGeneration++;
        discoveryCapture++;if(discovery!=null){discovery.hide();discovery.view().setVisibility(View.GONE);}discoveryVisible=false;
        if(favorites!=null){favorites.hide();favorites.view().setVisibility(View.GONE);}favoritesVisible=false;
        venueCaptureEpoch++;cancelLocation();disposePopup();retireOfferSave();
        if(savedVenues!=null)savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        if(website!=null){website.setVisibility(View.GONE);website.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);}
        errorPanel.setVisibility(View.GONE);errorPanel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);progress.setVisibility(View.GONE);
        areaVisible=true;areaScreen.view().setVisibility(View.VISIBLE);areaScreen.view().bringToFront();areaScreen.show(area);updateToolbar();
    }
    private void hideArea(){
        if(areaScreen!=null){areaScreen.hide();areaScreen.view().setVisibility(View.GONE);}
        areaVisible=false;
    }

    private String eligibleSavedVenue() {
        if (destroyed || searchOpening || nativeDestinationVisible() || website == null || failed || loading || awaitingDocumentStart || !hasUsablePage
                || documentHasHttpError || stoppedUrl != null) return null;
        return SavedVenueUrl.canonicalize(website.getUrl());
    }

    private void readSavedVenue(java.util.function.Consumer<SavedVenueCapture.Venue> completion) {
        String url = eligibleSavedVenue();
        if (!foreground || url == null) { completion.accept(null); return; }
        WebView source = website;
        SavedVenueCapture capture = new SavedVenueCapture(url, venueCaptureEpoch);
        try {
            source.evaluateJavascript(VenueHeadingReader.SCRIPT, result -> {
                if (!foreground || source != website) { completion.accept(null); return; }
                completion.accept(VenueHeadingReader.decode(result, capture, eligibleSavedVenue(), venueCaptureEpoch));
            });
        } catch (RuntimeException unavailable) { completion.accept(null); }
    }

    private boolean restoreHistory(Bundle state) {
        if (state == null || website == null) return false;
        WebView restoring = website;
        try {
            Bundle historyState = state.getBundle("browser_history");
            WebBackForwardList history = BrowserHistoryState.restore(restoring, historyState);
            if (history == null) return false;
            prepareNavigation(history.getCurrentItem().getUrl());
            setLoading(true);
            return true;
        } catch (RuntimeException invalid) {
            // Recreate rather than unblocking an invalid, partially restored view.
            content.removeView(restoring);
            restoring.destroy();
            website = null;
            createWebsite();
            return false;
        }
    }

    private void beginOfferSave(String raw) {
        String active=eligibleSavedVenue(),id=OfferSaveCommand.offerId(raw,active);
        if(active==null||id==null||offerVerifier==null||offerStore==null||offerSaveDialog!=null)return;
        SavedVenueStore.Venue provisional=SavedVenueStore.reference(active,"Locale "+java.net.URI.create(active).getPath().substring(5));
        if(provisional==null)return;
        retireOfferSave();long token=offerSaveGeneration;
        try{offerVerifyBatch=offerVerifier.load(java.util.Collections.singletonList(provisional),values->{
            if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
            offerVerifyBatch=null;
            MenuV2Prices.Venue menu=values.get(active);MenuV2Prices.Price verified=null;
            if(menu!=null)for(MenuV2Prices.Price item:menu.prices)if(id.equals(item.id)&&!item.customer){verified=item;break;}
            SavedVenueStore.Venue venue=menu==null?null:SavedVenueStore.reference(active,menu.name);
            SavedMenuOfferStore.Entry saved=SavedMenuOfferStore.verified(venue,verified);
            if(saved==null){Toast.makeText(this,"Questo drink non e piu disponibile nel menu verificato. Nessun preferito salvato.",Toast.LENGTH_LONG).show();return;}
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Salva nei Preferiti?")
                .setMessage(saved.name+" - "+saved.venue.label+". Il prezzo si aggiorna online e non viene salvato sul telefono.")
                .setNegativeButton("Annulla",(d,w)->{}).setPositiveButton("Salva",(d,w)->{
                    if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
                    SavedMenuOfferStore.Result result=offerStore.save(saved);
                    if(result==SavedMenuOfferStore.Result.SAVED)publishNativeSavedKeys();
                    Toast.makeText(this,result==SavedMenuOfferStore.Result.SAVED?"Drink salvato nei Preferiti.":"Drink non salvato. I preferiti precedenti sono stati mantenuti.",Toast.LENGTH_LONG).show();
                }).create();
            offerSaveDialog=dialog;dialog.setOnDismissListener(ignored->{if(offerSaveDialog==dialog)offerSaveDialog=null;});dialog.show();
        });}
        catch(IOException unavailable){Toast.makeText(this,"Menu non disponibile. Riprova quando sei online.",Toast.LENGTH_LONG).show();}
    }
    private void beginCustomerSave(DrinkActionCommand command){
        String active=eligibleSavedVenue();
        if(active==null||command==null||command.kind!=DrinkActionCommand.Kind.SAVE_CUSTOMER
                ||offerVerifier==null||customerStore==null||offerSaveDialog!=null)return;
        SavedVenueStore.Venue provisional=SavedVenueStore.reference(active,"Locale "+java.net.URI.create(active).getPath().substring(5));
        if(provisional==null)return;
        retireOfferSave();long token=offerSaveGeneration;
        try{offerVerifyBatch=offerVerifier.load(java.util.Collections.singletonList(provisional),values->{
            if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
            offerVerifyBatch=null;
            MenuV2Prices.Venue menu=values.get(active);MenuV2Prices.Price verified=null;
            if(menu!=null)for(MenuV2Prices.Price item:menu.customerPrices)
                if(command.itemKey.equals(item.id)&&item.customer){verified=item;break;}
            SavedVenueStore.Venue venue=menu==null?null:SavedVenueStore.reference(active,menu.name);
            SavedMenuOfferStore.Entry saved=SavedMenuOfferStore.verifiedCustomer(venue,verified);
            if(saved==null){Toast.makeText(this,"Questa segnalazione non e piu disponibile. Nessun preferito salvato.",Toast.LENGTH_LONG).show();return;}
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Salva nei Preferiti?")
                .setMessage(saved.name+" · "+saved.venue.label+". Il prezzo si aggiorna online e non viene salvato sul telefono.")
                .setNegativeButton("Annulla",(d,w)->{}).setPositiveButton("Salva",(d,w)->{
                    if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
                    SavedMenuOfferStore.Result result=customerStore.save(saved);
                    if(result==SavedMenuOfferStore.Result.SAVED)publishNativeSavedKeys();
                    Toast.makeText(this,result==SavedMenuOfferStore.Result.SAVED?"Drink salvato nei Preferiti.":"Drink non salvato. I preferiti precedenti sono stati mantenuti.",Toast.LENGTH_LONG).show();
                }).create();
            offerSaveDialog=dialog;dialog.setOnDismissListener(ignored->{if(offerSaveDialog==dialog)offerSaveDialog=null;});dialog.show();
        });}
        catch(IOException unavailable){Toast.makeText(this,"Prezzo non disponibile. Riprova quando sei online.",Toast.LENGTH_LONG).show();}
    }
    private void beginEuropeSave(EuropeDrinkSaveCommand command){
        String active=eligibleSavedVenue();
        if(active==null||command==null||!active.equals(command.venueUrl)||europeVerifier==null||europeStore==null||offerSaveDialog!=null)return;
        retireOfferSave();long token=offerSaveGeneration;
        Toast.makeText(this,"Verifico il prezzo del drink...",Toast.LENGTH_SHORT).show();
        try{europeVerifyBatch=europeVerifier.load(command,verified->{
            if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
            europeVerifyBatch=null;
            if(verified==null){Toast.makeText(this,"Prezzo non disponibile ora. Nessun preferito salvato; riprova quando sei online.",Toast.LENGTH_LONG).show();return;}
            SavedEuropeDrinkStore.Entry saved=verified.entry;
            String detail=NativePricePresentation.category(saved.drink)+" · "+saved.serving.label()+" · "+saved.currency;
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Salva nei Preferiti?")
                .setMessage(detail+" · "+saved.venue.label+". Il prezzo si aggiorna online e non viene salvato sul telefono.")
                .setNegativeButton("Annulla",(d,w)->{}).setPositiveButton("Salva",(d,w)->{
                    if(token!=offerSaveGeneration||!foreground||destroyed||!active.equals(eligibleSavedVenue()))return;
                    SavedEuropeDrinkStore.Result result=europeStore.save(saved);
                    if(result==SavedEuropeDrinkStore.Result.SAVED)publishNativeSavedKeys();
                    Toast.makeText(this,result==SavedEuropeDrinkStore.Result.SAVED?"Drink salvato nei Preferiti.":"Drink non salvato. I preferiti precedenti sono stati mantenuti.",Toast.LENGTH_LONG).show();
                }).create();
            offerSaveDialog=dialog;dialog.setOnDismissListener(ignored->{if(offerSaveDialog==dialog)offerSaveDialog=null;});dialog.show();
        });}
        catch(IOException unavailable){Toast.makeText(this,"Prezzo non disponibile. Riprova quando sei online.",Toast.LENGTH_LONG).show();}
    }
    private void retireOfferSave(){
        offerSaveGeneration++;
        if(offerVerifyBatch!=null){offerVerifyBatch.cancel();offerVerifyBatch=null;}
        if(europeVerifyBatch!=null){europeVerifyBatch.cancel();europeVerifyBatch=null;}
        if(offerSaveDialog!=null){AlertDialog old=offerSaveDialog;offerSaveDialog=null;old.dismiss();}
    }

    private boolean handleNavigation(String url) {
        BrowserPolicy.Target target = BrowserPolicy.target(url);
        if (target == BrowserPolicy.Target.INTERNAL && !url.equals(MobileEntry.documentURL(url))) {
            navigate(url);
            return true;
        }
        if (target == BrowserPolicy.Target.INTERNAL) return false;
        if (target == BrowserPolicy.Target.EXTERNAL || target == BrowserPolicy.Target.EMAIL || target == BrowserPolicy.Target.MAP) openExternal(url);
        else toast(R.string.blocked_link);
        return true;
    }
    private void openExternal(String url) {
        if (!testLabPolicy.allowsExternalActions()) { toast(R.string.test_lab_external_disabled); return; }
        BrowserPolicy.Target target = BrowserPolicy.target(url);
        if (target != BrowserPolicy.Target.EXTERNAL && target != BrowserPolicy.Target.EMAIL && target != BrowserPolicy.Target.MAP) {
            toast(R.string.blocked_link);
            return;
        }
        Intent intent = new Intent(target == BrowserPolicy.Target.EMAIL ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW, Uri.parse(url));
        if (target == BrowserPolicy.Target.EXTERNAL) intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try { startActivity(intent); }
        catch (ActivityNotFoundException | SecurityException error) { toast(R.string.external_unavailable); }
    }
    private boolean canSharePrice(WebView source,String captured,long epoch,long request) {
        return foreground&&!destroyed&&(informationDialog==null||!informationDialog.isShowing())&&(privacyDialog==null||!privacyDialog.isShowing())&&(locationHelpDialog==null||!locationHelpDialog.isShowing())&&testLabPolicy.allowsExternalActions()&&source==website&&!nativeDestinationVisible()&&epoch==venueCaptureEpoch&&request==shareCapture
            &&!failed&&!loading&&!awaitingDocumentStart&&hasUsablePage&&!documentHasHttpError&&captured.equals(source.getUrl());
    }
    private void retireSharePresentation() {
        drinkCapture++;if(savedDrinks!=null)savedDrinks.dismiss();
        shareCapture++;if(shareDialog!=null){shareDialog.dismiss();shareDialog=null;}
    }
    private void readFeaturedDrink(java.util.function.Consumer<PriceShareSnapshot> completion) {
        if(website==null||eligibleSavedVenue()==null||!foreground||destroyed){completion.accept(null);return;}
        WebView source=website;String captured=source.getUrl();long epoch=venueCaptureEpoch,request=++drinkCapture;
        final boolean[] done={false};
        java.util.function.BooleanSupplier current=()->foreground&&!destroyed&&!nativeDestinationVisible()&&source==website&&epoch==venueCaptureEpoch&&request==drinkCapture&&captured.equals(source.getUrl())&&eligibleSavedVenue()!=null&&(informationDialog==null||!informationDialog.isShowing())&&(privacyDialog==null||!privacyDialog.isShowing())&&(locationHelpDialog==null||!locationHelpDialog.isShowing());
        source.postDelayed(()->{if(!done[0]&&current.getAsBoolean()){done[0]=true;completion.accept(null);}},5000);
        try{source.evaluateJavascript(PriceShareSnapshot.SCRIPT,result->{
            if(done[0]||!current.getAsBoolean())return;done[0]=true;
            completion.accept(PriceShareSnapshot.decode(result,captured,source.getUrl(),epoch,venueCaptureEpoch));
        });}catch(RuntimeException unavailable){if(!done[0]&&current.getAsBoolean()){done[0]=true;completion.accept(null);}}
    }
    private void share() {
        if (!testLabPolicy.allowsExternalActions()) { toast(R.string.test_lab_external_disabled); return; }
        if(website==null||!foreground||destroyed||nativeDestinationVisible())return;
        WebView source=website;String captured=source.getUrl();long epoch=venueCaptureEpoch,request=++shareCapture;
        if(eligibleSavedVenue()==null||!MobileEntry.isDocument(captured)){shareUrl();return;}
        final boolean[] finished={false};
        source.postDelayed(()->{if(!finished[0]&&canSharePrice(source,captured,epoch,request)){finished[0]=true;shareUrl();}},5000);
        try{source.evaluateJavascript(PriceShareSnapshot.SCRIPT,result->{
            if(finished[0]||!canSharePrice(source,captured,epoch,request))return;finished[0]=true;
            PriceShareSnapshot snapshot=PriceShareSnapshot.decode(result,captured,source.getUrl(),epoch,venueCaptureEpoch);
            if(snapshot==null){shareUrl();return;}
            if(shareDialog!=null)shareDialog.dismiss();
            shareDialog=PriceShareUi.show(this,snapshot,()->canSharePrice(source,captured,epoch,request));
        });}catch(RuntimeException unavailable){if(!finished[0]&&canSharePrice(source,captured,epoch,request)){finished[0]=true;shareUrl();}}
    }
    private void shareUrl() {
        if (!testLabPolicy.allowsExternalActions()) { toast(R.string.test_lab_external_disabled); return; }
        String url = BrowserPolicy.shareUrl(website == null ? null : website.getUrl());
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                .putExtra(Intent.EXTRA_TITLE, getString(R.string.app_name));
        try { startActivity(Intent.createChooser(send, getString(R.string.share))); }
        catch (ActivityNotFoundException error) { toast(R.string.external_unavailable); }
    }
    private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
    private void showMenu(View anchor) {
        if(!foreground||destroyed)return;
        retireSharePresentation();createBrowserMenu(anchor).show();
    }
    private PopupMenu createBrowserMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        boolean mapActive=foreground&&!destroyed&&!nativeDestinationVisible()&&website!=null;
        boolean nativeRefresh=discoveryVisible&&discovery!=null&&discovery.canRefresh()
                ||favoritesVisible&&favorites!=null&&favorites.canRefresh()
                ||areaVisible&&areaScreen!=null&&areaScreen.canRefresh();
        menu.getMenu().add(Menu.NONE, R.id.share, Menu.NONE, R.string.share)
                .setEnabled(mapActive&&hasUsablePage&&!failed&&!loading&&!awaitingDocumentStart);
        menu.getMenu().add(Menu.NONE, R.id.refresh, Menu.NONE, mapActive&&loading?R.string.stop_loading:R.string.refresh)
                .setEnabled(mapActive||nativeRefresh);
        menu.getMenu().add(Menu.NONE, R.id.back, Menu.NONE, R.string.back)
                .setEnabled(foreground && (nativeDestinationVisible() || website != null && website.canGoBack()));
        menu.getMenu().add(Menu.NONE, R.id.forward, Menu.NONE, R.string.forward)
                .setEnabled(mapActive && website.canGoForward());
        menu.getMenu().add(Menu.NONE, R.id.information, Menu.NONE, "Informazioni");
        menu.getMenu().add(Menu.NONE, R.id.location_help, Menu.NONE, R.string.location_help);
        menu.getMenu().add(Menu.NONE, R.id.privacy, Menu.NONE, R.string.privacy);
        menu.getMenu().add(Menu.NONE, R.id.support, Menu.NONE, R.string.support);
        menu.setOnMenuItemClickListener(item -> {
            // Recheck current context: a menu may have been opened before background/navigation.
            if(!foreground||destroyed)return false;
            if (item.getItemId() == R.id.share) {
                if(!nativeDestinationVisible()&&website!=null&&hasUsablePage&&!failed&&!loading&&!awaitingDocumentStart)share();
                return true;
            }
            if (item.getItemId() == R.id.refresh) {
                if(discoveryVisible&&discovery!=null&&discovery.canRefresh())discovery.refresh();
                else if(favoritesVisible&&favorites!=null&&favorites.canRefresh())favorites.refresh();
                else if(areaVisible&&areaScreen!=null&&areaScreen.canRefresh())areaScreen.refresh();
                else if(!nativeDestinationVisible()&&website!=null)refresh();
                return true;
            }
            if (item.getItemId() == R.id.back) { goBack(); return true; }
            if (item.getItemId() == R.id.forward) {
                if(!nativeDestinationVisible()&&website!=null)goForward();return true;
            }
            if (item.getItemId() == R.id.information) { showInformation(); return true; }
            if (item.getItemId() == R.id.location_help) { showLocationHelp(); return true; }
            if (item.getItemId() == R.id.privacy) { showPrivacy(); return true; }
            if (item.getItemId() == R.id.support) { openExternal("mailto:dovebevo@gmail.com"); return true; }
            return false;
        });
        return menu;
    }

    private void showInformation() {
        if(!foreground||destroyed)return;retireSharePresentation();if(informationDialog!=null)informationDialog.dismiss();
        NativePanel panel=new NativePanel(this,"Altro",false);informationDialog=panel;
        ScrollView scroll=new ScrollView(this);LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(20),dp(4),dp(20),dp(20));scroll.addView(body);panel.body.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        informationRow(body,"Cambia città / zona",R.drawable.native_map,this::showMap);
        informationRow(body,"Come funziona",android.R.drawable.ic_menu_help,()->{informationDialog=new AlertDialog.Builder(this).setTitle("Come funziona").setMessage("Cerca una città sulla Mappa, scegli un drink e confronta i prezzi. Scopri confronta i prezzi nella zona della Mappa. I drink salvati in Preferiti restano sul tuo dispositivo. Le fonti del menu e le segnalazioni sono indicate nei dettagli disponibili.").setPositiveButton(R.string.close,null).create();informationDialog.show();});
        informationRow(body,"Linee guida della community",android.R.drawable.ic_menu_agenda,this::showBundledRules);
        informationRow(body,getString(R.string.privacy),android.R.drawable.ic_menu_info_details,this::showPrivacy);
        informationRow(body,"Contatti",android.R.drawable.ic_dialog_email,()->openExternal("mailto:dovebevo@gmail.com"));
        String version;try{android.content.pm.PackageInfo installed=getPackageManager().getPackageInfo(getPackageName(),0);long code=Build.VERSION.SDK_INT>=28?installed.getLongVersionCode():installed.versionCode;version=installed.versionName+" ("+code+")";}catch(android.content.pm.PackageManager.NameNotFoundException missing){version="non disponibile";}
        LinearLayout versionRow=new LinearLayout(this);versionRow.setGravity(Gravity.CENTER_VERTICAL);versionRow.setMinimumHeight(dp(52));TextView versionLabel=new TextView(this);versionLabel.setText("Versione app");versionLabel.setTextSize(16);versionLabel.setTextColor(getColor(R.color.shell_text));versionRow.addView(versionLabel,new LinearLayout.LayoutParams(0,-2,1));TextView installed=new TextView(this);installed.setText(version);installed.setTextSize(14);installed.setTextColor(getColor(R.color.muted_text));versionRow.addView(installed);body.addView(versionRow);
        LinearLayout community=new LinearLayout(this);community.setGravity(Gravity.CENTER_VERTICAL);community.setPadding(dp(8),dp(8),dp(12),dp(8));community.setBackground(NativeAppearance.shape(this,R.color.shell_background,12,false));
        try(java.io.InputStream input=getAssets().open("reference-drinks/community-cheers.jpg")){android.widget.ImageView art=new android.widget.ImageView(this);art.setImageBitmap(android.graphics.BitmapFactory.decodeStream(input));art.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);art.setContentDescription("Illustrazione della community Dove Bevo");community.addView(art,new LinearLayout.LayoutParams(dp(128),dp(104)));}catch(IOException missing){/* Optional community illustration. */}
        TextView motto=new TextView(this);motto.setText("Stessi posti.\nPiù trasparenza.");motto.setTextSize(18);NativeAppearance.title(motto);community.addView(motto,new LinearLayout.LayoutParams(0,-2,1));LinearLayout.LayoutParams card=new LinearLayout.LayoutParams(-1,-2);card.topMargin=dp(12);body.addView(community,card);panel.show();
    }
    private void informationRow(LinearLayout body,String title,int icon,Runnable action) {
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(52));row.setPadding(0,dp(8),0,dp(8));row.setFocusable(true);row.setContentDescription(title);row.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,android.view.accessibility.AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.setClassName(Button.class.getName());}});row.setOnClickListener(v->{if(foreground&&!destroyed){informationDialog.dismiss();action.run();}});
        android.widget.ImageView image=new android.widget.ImageView(this);image.setImageResource(icon);image.setColorFilter(getColor(R.color.shell_text));image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);LinearLayout.LayoutParams iconSize=new LinearLayout.LayoutParams(dp(22),dp(22));iconSize.rightMargin=dp(14);row.addView(image,iconSize);
        TextView label=new TextView(this);label.setText(title);label.setTextSize(16);label.setTextColor(getColor(R.color.shell_text));label.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);row.addView(label,new LinearLayout.LayoutParams(0,-2,1));TextView arrow=new TextView(this);arrow.setText("›");arrow.setTextSize(22);arrow.setTextColor(getColor(R.color.muted_text));arrow.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);row.addView(arrow);body.addView(row,new LinearLayout.LayoutParams(-1,-2));View separator=new View(this);separator.setBackgroundColor(getColor(R.color.surface_line));body.addView(separator,new LinearLayout.LayoutParams(-1,dp(1)));
    }
    private void showBundledRules() {
        retireSharePresentation();
        String rules;try(java.io.InputStream input=getAssets().open("terms.md")){rules=PrivacyDocument.read(input);}catch(IOException unavailable){rules=getString(R.string.rules_unavailable);}
        TextView text=new TextView(this);text.setText(rules);text.setTextSize(16);text.setPadding(dp(20),dp(12),dp(20),dp(20));text.setTextIsSelectable(true);ScrollView scroll=new ScrollView(this);scroll.addView(text);
        informationDialog=new AlertDialog.Builder(this).setTitle("Linee guida della community").setView(scroll).setPositiveButton(R.string.close,null).create();informationDialog.show();
    }
    private void showLocationHelp() {
        if (destroyed) return;
        retireSharePresentation();
        cancelLocation();
        locationHelpDialog = new AlertDialog.Builder(this).setTitle(R.string.location_help_title)
                .setMessage(R.string.location_help_body).setNegativeButton(R.string.close, null)
                .setPositiveButton(R.string.open_settings, (dialog, which) -> {
                    if (!testLabPolicy.allowsExternalActions()) { toast(R.string.test_lab_external_disabled); return; }
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", getPackageName(), null));
                    try { startActivity(intent); }
                    catch (ActivityNotFoundException | SecurityException error) { toast(R.string.external_unavailable); }
                }).create();
        locationHelpDialog.setOnDismissListener(dialog -> locationHelpDialog = null);
        locationHelpDialog.show();
    }
    private void showPrivacy() {
        if (destroyed) return;
        retireSharePresentation();
        if (privacyDialog != null) privacyDialog.dismiss();
        String policy;
        try (InputStream asset = getAssets().open("privacy.md")) {
            policy = PrivacyDocument.read(asset);
        } catch (IOException error) {
            policy = getString(R.string.privacy_unavailable);
        }
        TextView document = new TextView(this);
        document.setId(R.id.privacy_document);
        document.setText(policy);
        document.setTextSize(16); // sp: follows the system's font size, including larger accessibility text.
        document.setTextColor(getColor(R.color.shell_text));
        document.setTextIsSelectable(true);
        document.setPadding(dp(24), dp(12), dp(24), dp(24));
        ScrollView scroll = new ScrollView(this);
        scroll.setId(R.id.privacy_scroll);
        scroll.addView(document, new ScrollView.LayoutParams(-1, -2));
        privacyDialog = new AlertDialog.Builder(this).setTitle(R.string.privacy).setView(scroll)
                .setPositiveButton(R.string.close, null)
                .setNeutralButton(R.string.support, (dialog, which) -> openExternal("mailto:dovebevo@gmail.com"))
                .create();
        privacyDialog.setOnDismissListener(dialog -> privacyDialog = null);
        privacyDialog.show();
    }
    private void showFailure() { showFailure(R.string.unavailable_title, R.string.unavailable_body); }

    private void showFailure(int title, int message) {
        if (destroyed) return;
        searchOpening=false;searchCallbackGeneration++;
        venueCaptureEpoch++;
        failed = true;
        cancelLocation();
        setLoading(false);
        errorTitle.setText(title);
        errorMessage.setText(message);
        if (website != null) website.setVisibility(View.GONE);
        errorPanel.setVisibility(nativeDestinationVisible()?View.GONE:View.VISIBLE);
        if(!nativeDestinationVisible())errorPanel.bringToFront();
    }

    private void rejectSslFailure(WebView source, String errorUrl, Runnable cancel) {
        // Rejection is unconditional, including stale or stopped requests.
        // Only the matching active document may replace the native UI.
        cancel.run();
        if (isCurrentDocument(source, errorUrl)) {
            retainEarlyDocumentFailure(errorUrl);
            showFailure();
        }
    }

    private void installMobilePresentation(WebView view, String finishedUrl) {
        if (view != website || failed || destroyed || !MobilePresentation.allows(finishedUrl, view.getUrl())) return;
        try {
            if (mobileThemeScript == null) {
                mobileThemeScript = MobilePresentation.load(this);
            }
            long generation = documentCheckGeneration;
            long request = ++presentationRequest;
            long deadline = android.os.SystemClock.uptimeMillis() + 8000;
            retryMobilePresentation(view, finishedUrl, generation, request, 16, deadline);
        } catch (IOException unavailable) {
            // A missing or invalid bundled skin preserves the original website and its normal security policy.
            setWebMenuClearance(true);
        }
    }

    private boolean currentPresentation(WebView view, String url, long generation, long request) {
        return !destroyed && !failed && foreground && view == website
                && generation == documentCheckGeneration && request == presentationRequest
                && MobilePresentation.allows(url, view.getUrl());
    }

    private void retryMobilePresentation(WebView view, String url, long generation, long request,
                                         int attemptsLeft, long deadline) {
        if (!currentPresentation(view, url, generation, request)) return;
        view.evaluateJavascript(mobileThemeScript, result -> {
            if (!currentPresentation(view, url, generation, request)) return;
            if (!MobileEntry.isDocument(url) || !"true".equals(result)) {
                setWebMenuClearance(true);
                schedulePresentationRetry(view, url, generation, request, attemptsLeft, deadline);
                return;
            }
            view.evaluateJavascript("document.documentElement.getAttribute('data-dovebevo-app-theme')==='1' && document.documentElement.getAttribute('data-dovebevo-mobile-shell')==='1'", marker -> {
                if (!currentPresentation(view, url, generation, request)) return;
                if ("true".equals(marker)) setWebMenuClearance(false);
                else {
                    setWebMenuClearance(true);
                    schedulePresentationRetry(view, url, generation, request, attemptsLeft, deadline);
                }
            });
        });
    }

    private void schedulePresentationRetry(WebView view, String url, long generation, long request,
                                           int attemptsLeft, long deadline) {
        // The verified visitor shell can mount after onPageFinished. Keep the
        // original search clear of native More until that same document mounts.
        if (!MobileEntry.isDocument(url) || attemptsLeft <= 1
                || android.os.SystemClock.uptimeMillis() >= deadline) return;
        view.postDelayed(() -> retryMobilePresentation(view, url, generation, request,
                attemptsLeft - 1, deadline), 350);
    }

    private final class WebsiteClient extends TestLabClient {
        WebsiteClient(TestLabPolicy policy) { super(policy); }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Challenge iframes remain browser content; only top-level links open apps.
            if(!request.isForMainFrame())return false;
            String url=request.getUrl().toString();
            if(url.contains("save_offer=")){beginOfferSave(url);return true;}
            if(EuropeDrinkSaveCommand.requested(url)){
                EuropeDrinkSaveCommand command=EuropeDrinkSaveCommand.parse(url,eligibleSavedVenue());
                if(command!=null)beginEuropeSave(command);
                else Toast.makeText(MainActivity.this,"Drink non disponibile. Riapri il locale e riprova.",Toast.LENGTH_LONG).show();
                return true;
            }
            if(DrinkActionCommand.requested(url)){
                DrinkActionCommand command=DrinkActionCommand.parse(url,eligibleSavedVenue());
                if(command!=null){
                    if(command.kind==DrinkActionCommand.Kind.SAVE_LEGACY&&savedDrinks!=null)savedDrinks.showExact(command.drink,command.band);
                    else if(command.kind==DrinkActionCommand.Kind.SAVE_CUSTOMER)beginCustomerSave(command);
                }
                return true;
            }
            return handleNavigation(url);
        }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
            if (view != website || destroyed) return;
            presentationRequest++;
            searchOpening=false;searchCallbackGeneration++;
            if (!MobileEntry.isDocument(url)) searchPending = false;
            documentCheckGeneration++;
            venueCaptureEpoch++;
            retireOfferSave();
            if (url.equals(stoppedUrl)) { view.stopLoading(); return; }
            cancelLocation();
            if (BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) {
                view.stopLoading();
                showFailure();
                return;
            }
            if (!url.equals(preparedNavigationUrl)) prepareNavigation(url);
            lastTrustedUrl = url;
            preparedNavigationUrl = null;
            awaitingDocumentStart = false;
            setWebMenuClearance(!MobileEntry.isDocument(url));
            setLoading(!failed);
        }
        @Override public void onPageFinished(WebView view, String url) {
            if (view != website || destroyed || awaitingDocumentStart || url.equals(stoppedUrl) || !url.equals(lastTrustedUrl)) return;
            if(MapReturnRoute.valid(url))lastMapRoute=url;
            preparedNavigationUrl = null;
            if (!failed && !documentHasHttpError && MobileEntry.isDocument(url)) {
                // A previously installed website SW can return its cached root page offline.
                // Do not expose that page as the new app interface or enable its native actions.
                long check = ++documentCheckGeneration;
                hasUsablePage = false;
                view.evaluateJavascript(MobileEntry.MARKER, result -> {
                    if (destroyed || view != website || check != documentCheckGeneration || failed
                            || !MobileEntry.isDocument(view.getUrl())) return;
                    documentCheckGeneration++;
                    if (!"true".equals(result)) { showFailure(); return; }
                    hasUsablePage = true;
                    // The verified /mobile/ document also needs the bundled
                    // native presentation. The early document-start guard only
                    // fixes colour mode; without this call the duplicate web
                    // search lens remains visible above native Cerca.
                    installMobilePresentation(view, view.getUrl());
                    view.evaluateJavascript("(function(){if(location.href!=="+JSONObject.quote(view.getUrl())+")return;"+
                            nativeSavedKeysAssignment(view.getUrl())+"window.DoveBevoNativeOfferSave=true;window.DoveBevoNativeDrinkSave=true;window.DoveBevoNativeCustomerSave=true;window.DoveBevoNativeVoteOffer=true;window.DoveBevoNativeVoteCustomer=true;window.DoveBevoNativeVoteDrink=true;"+(europeStore!=null&&europeVerifier!=null?"window.DoveBevoNativeEuropeSave=true;":"")+"window.dispatchEvent(new Event('dovebevo-native-ready'));})()",null);
                    setLoading(false);
                    errorPanel.setVisibility(View.GONE);
                    view.setVisibility(nativeDestinationVisible()?View.GONE:View.VISIBLE);
                    updateToolbar();
                    dispatchPendingSearch();
                });
                view.postDelayed(() -> {
                    if (!destroyed && view == website && check == documentCheckGeneration && !failed) {
                        documentCheckGeneration++;
                        showFailure();
                    }
                }, 5000);
                return;
            }
            setLoading(false);
            if (!failed && BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL) {
                hasUsablePage = !documentHasHttpError;
                if (hasUsablePage) installMobilePresentation(view, url);
                errorPanel.setVisibility(View.GONE);
                view.setVisibility(nativeDestinationVisible()?View.GONE:View.VISIBLE);
            }
            updateToolbar();
        }
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (view != website || destroyed || BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return;
            venueCaptureEpoch++;
            if(MapReturnRoute.valid(url))lastMapRoute=url;
            if (!loading && !failed) lastTrustedUrl = url;
            publishNativeSavedKeys(url);
            // A same-document history notification can arrive before the
            // renderer has committed location.href. Retry only for this exact
            // retained page, so a later route cannot receive stale keys.
            view.postDelayed(() -> {
                if (view == website && url.equals(view.getUrl())) publishNativeSavedKeys(url);
            }, 120);
            updateToolbar();
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Chromium's explicit aborted-navigation marker is cancellation,
            // not a new document failure, even if it arrives after Retry.
            if (BrowserFailurePolicy.isCancelled(error.getErrorCode(), error.getDescription())) return;
            if (request.isForMainFrame() && isCurrentDocument(view, request.getUrl().toString())) {
                retainEarlyDocumentFailure(request.getUrl().toString());
                showFailure();
            }
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            // Cloudflare can serve an interactive browser challenge as HTTP 403.
            // Keep 4xx pages visible instead of hiding the existing challenge UI.
            if (request.isForMainFrame() && isCurrentDocument(view, request.getUrl().toString())) {
                retainEarlyDocumentFailure(request.getUrl().toString());
                documentHasHttpError = response.getStatusCode() >= 400;
                if (response.getStatusCode() >= 500) showFailure();
            }
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            rejectSslFailure(view, error.getUrl(), handler::cancel);
        }
        @Override public void onFormResubmission(WebView view, Message dontResend, Message resend) {
            dontResend.sendToTarget();
            toast(R.string.no_resubmit);
        }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view == website) {
                content.removeView(view);
                website = null;
                hasUsablePage = false;
                view.destroy();
                showFailure();
            }
            return true;
        }
    }

    private final class ChromeClient extends WebChromeClient {
        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            cancelLocation();
            String current = website == null ? null : website.getUrl();
            if (!foreground || nativeDestinationVisible() || !BrowserPolicy.isLocationOrigin(origin) || BrowserPolicy.target(current) != BrowserPolicy.Target.INTERNAL) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocation()) { callback.invoke(origin, true, false); return; }
            locationOrigin = origin;
            locationCallback = callback;
            requestingLocationPermission = true;
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_REQUEST);
        }
        @Override public void onGeolocationPermissionsHidePrompt() { cancelLocation(); }
        @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
            if (!foreground || !userGesture || destroyed) return false;
            disposePopup();
            popup = configuredWebView();
            WebView created = popup;
            created.setWebViewClient(new TestLabClient(testLabPolicy) {
                private boolean handled;
                private boolean dispatch(String url) {
                    if ("about:blank".equals(url)) return false;
                    if (!handled) {
                        handled = true;
                        if (BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL) navigate(url);
                        else handleNavigation(url);
                        created.post(() -> { if (popup == created) disposePopup(); });
                    }
                    return true;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return dispatch(r.getUrl().toString()); }
                @Override public void onPageStarted(WebView v, String url, Bitmap icon) { if (dispatch(url)) v.stopLoading(); }
                @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                    if (popup == v) { popup = null; v.destroy(); }
                    return true;
                }
            });
            ((WebView.WebViewTransport) result.obj).setWebView(created);
            result.sendToTarget();
            created.postDelayed(() -> { if (popup == created) disposePopup(); }, 3000);
            return true;
        }
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    private void cancelLocation() {
        GeolocationPermissions.Callback pending = locationCallback;
        String origin = locationOrigin;
        locationCallback = null;
        locationOrigin = null;
        requestingLocationPermission = false;
        locationResultReady = false;
        if (pending != null) pending.invoke(origin, false, false);
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request != LOCATION_REQUEST || locationCallback == null) return;
        requestingLocationPermission = false;
        locationResultReady = true;
        resolveLocationResult();
    }
    private void resolveLocationResult() {
        if (!foreground || !locationResultReady || locationCallback == null) return;
        GeolocationPermissions.Callback pending = locationCallback;
        String origin = locationOrigin;
        locationCallback = null;
        locationOrigin = null;
        locationResultReady = false;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        pending.invoke(origin, BrowserPolicy.canGrantLocation(origin, website == null ? null : website.getUrl(), foreground, coarse, fine), false);
    }
    private void disposePopup() {
        if (popup != null) {
            popup.stopLoading();
            popup.destroy();
            popup = null;
        }
    }
    private void monitorNetwork() {
        connectivity = getSystemService(ConnectivityManager.class);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { updateNetwork(); }
            @Override public void onLost(Network network) { updateNetwork(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { updateNetwork(); }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
        updateNetwork();
    }
    private void updateNetwork() {
        runOnUiThread(() -> {
            if (destroyed) return;
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
            boolean online = capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            offline.setVisibility(online ? View.GONE : View.VISIBLE);
            // Never reload automatically: a network change must not repeat a contribution.
        });
    }
    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (website != null) website.onResume();
        if (website != null && hasUsablePage) installMobilePresentation(website, website.getUrl());
        if(areaScreen!=null)areaScreen.resume();
        if(favorites!=null)favorites.resume();
        if(discovery!=null)discovery.resume();
        restoreDestination(null);
        updateToolbar();
        resolveLocationResult();
    }
    @Override protected void onPause() {
        presentationRequest++;
        searchPending=false;searchOpening=false;searchCallbackGeneration++;
        shareCapture++;if(shareDialog!=null){shareDialog.dismiss();shareDialog=null;}if(informationDialog!=null){informationDialog.dismiss();informationDialog=null;}
        discoveryCapture++;
        venueCaptureEpoch++;
        retireOfferSave();
        foreground = false;
        areaCapture++;areaCapturing=false;
        if(areaScreen!=null)areaScreen.pause();
        if(savedVenues!=null)savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        if(favorites!=null)favorites.pause();
        if(discovery!=null)discovery.pause();
        // The system permission dialog may pause us. Only deliver its result
        // after resume; an actual stop or navigation invalidates the callback.
        if (!requestingLocationPermission) cancelLocation();
        disposePopup();
        if (website != null) website.onPause();
        updateToolbar();
        super.onPause();
    }
    @Override protected void onStop() {
        cancelLocation();
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putInt("native_return_destination",returnDestination);
        state.putString("last_map_route",lastMapRoute);
        if(pendingMapReturn!=null)state.putString("pending_map_return",pendingMapReturn);
        state.putBoolean("favorites_visible",favoritesVisible||restoreFavoritesPending);
        state.putBoolean("recommendation_area_visible",areaVisible||restoreAreaPending);
        state.putBoolean("discovery_visible",discoveryVisible||restoreDiscoveryPending);
        if(selectedArea!=null){state.putBoolean("selected_area_valid",true);state.putDouble("selected_area_lat",selectedArea.lat);state.putDouble("selected_area_lon",selectedArea.lon);state.putDouble("selected_area_zoom",selectedArea.zoom);}
        if(favorites!=null){state.putString("favorite_drink",favorites.selectedDrink());state.putInt("favorite_band",favorites.selectedBand());state.putBoolean("favorite_drinks_visible",favorites.showingDrinks());}
        if(discovery!=null){state.putString("discovery_drink",discovery.selectedDrink());state.putInt("discovery_band",discovery.selectedBand());}
        state.putString("trusted_url", lastTrustedUrl);
        if (website != null && !failed) {
            try {
                Bundle history = BrowserHistoryState.capture(website);
                if (history != null) state.putBundle("browser_history", history);
            } catch (RuntimeException unavailable) {
                // Keep only the validated URL fallback when state is unavailable.
            }
        }
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        presentationRequest++;
        shareCapture++;if(shareDialog!=null)shareDialog.dismiss();if(informationDialog!=null)informationDialog.dismiss();
        discoveryCapture++;
        venueCaptureEpoch++;
        destroyed = true;
        retireOfferSave();if(offerVerifier!=null)offerVerifier.close();if(europeVerifier!=null)europeVerifier.close();
        areaCapture++;areaCapturing=false;
        if(areaScreen!=null)areaScreen.close();
        if(favorites!=null)favorites.close();
        if(discovery!=null)discovery.close();
        if (privacyDialog != null) privacyDialog.dismiss();
        if (locationHelpDialog != null) locationHelpDialog.dismiss();
        if (savedVenues != null) savedVenues.dismiss();if(savedDrinks!=null)savedDrinks.dismiss();
        cancelLocation();
        disposePopup();
        if (connectivity != null && networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback);
        if (website != null) {
            content.removeView(website);
            website.destroy();
            website = null;
        }
        super.onDestroy();
    }
}
