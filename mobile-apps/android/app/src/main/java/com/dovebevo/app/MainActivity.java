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

/** The live website stays in its normal browser origin and cookie context. */
public final class MainActivity extends ComponentActivity {
    private static final int LOCATION_REQUEST = 71;
    private WebView website;
    private WebView popup;
    private FrameLayout content;
    private LinearLayout errorPanel;
    private TextView offline;
    private ProgressBar progress;
    private TextView errorTitle;
    private TextView errorMessage;
    private Button backButton;
    private Button forwardButton;
    private Button refreshButton;
    private Button shareButton;
    private SavedVenuesUi savedVenues;
    private AlertDialog locationHelpDialog;
    private String lastTrustedUrl = BrowserPolicy.HOME;
    private boolean foreground;
    private boolean failed;
    private boolean destroyed;
    private boolean websiteStarted;
    private boolean loading;
    private boolean hasUsablePage;
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
    private TestLabPolicy testLabPolicy;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
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
        LinearLayout tools = new LinearLayout(this);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        backButton = button(R.id.back, R.string.back, this::goBack);
        forwardButton = button(R.id.forward, R.string.forward, this::goForward);
        shareButton = button(R.id.share, R.string.share, this::share);
        refreshButton = button(R.id.refresh, R.string.refresh, this::refresh);
        tools.addView(backButton, toolSize());
        tools.addView(forwardButton, toolSize());
        tools.addView(button(R.id.home, R.string.home, () -> navigate(BrowserPolicy.HOME)), toolSize());
        tools.addView(shareButton, toolSize());
        tools.addView(refreshButton, toolSize());
        Button more = button(R.id.more, R.string.more_options, () -> {});
        more.setText(R.string.more_symbol);
        more.setTextSize(24);
        more.setOnClickListener(this::showMenu);
        tools.addView(more, new LinearLayout.LayoutParams(dp(48), -2));
        shell.addView(tools, new LinearLayout.LayoutParams(-1, -2));
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
        savedVenues = new SavedVenuesUi(this, new SavedVenueStore(new SavedVenueFile(getFilesDir())),
                this::eligibleSavedVenue, this::navigate);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });
        if (state != null && BrowserPolicy.target(state.getString("trusted_url")) == BrowserPolicy.Target.INTERNAL)
            lastTrustedUrl = state.getString("trusted_url");
        createWebsite();
        if (!restoreHistory(state)) navigate(lastTrustedUrl);
        updateToolbar();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
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
        button.setOnClickListener(view -> action.run());
        return button;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebsite() {
        website = configuredWebView();
        website.setId(R.id.website);
        WebSettings settings = website.getSettings();
        settings.setJavaScriptEnabled(true);
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

    private void navigate(String url) {
        if (destroyed || BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return;
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
        BackNavigation.perform(website != null && website.canGoBack(), () -> {
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
        loading = value;
        progress.setVisibility(value ? View.VISIBLE : View.GONE);
        updateToolbar();
    }

    private void prepareNavigation(String url) {
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
        backButton.setEnabled(website != null && website.canGoBack());
        forwardButton.setEnabled(website != null && website.canGoForward());
        shareButton.setEnabled(website != null && hasUsablePage && !failed && !loading && !awaitingDocumentStart);
        int action = loading ? R.string.stop_loading : R.string.refresh;
        refreshButton.setText(action);
        refreshButton.setContentDescription(getString(action));
    }

    private String eligibleSavedVenue() {
        if (destroyed || website == null || failed || loading || awaitingDocumentStart || !hasUsablePage
                || documentHasHttpError || stoppedUrl != null) return null;
        return SavedVenueUrl.canonicalize(website.getUrl());
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

    private boolean handleNavigation(String url) {
        BrowserPolicy.Target target = BrowserPolicy.target(url);
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
    private void share() {
        if (!testLabPolicy.allowsExternalActions()) { toast(R.string.test_lab_external_disabled); return; }
        String url = BrowserPolicy.shareUrl(website == null ? null : website.getUrl());
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                .putExtra(Intent.EXTRA_TITLE, getString(R.string.app_name));
        try { startActivity(Intent.createChooser(send, getString(R.string.share))); }
        catch (ActivityNotFoundException error) { toast(R.string.external_unavailable); }
    }
    private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(Menu.NONE, R.id.save_venue, Menu.NONE, R.string.save_venue).setEnabled(eligibleSavedVenue() != null);
        menu.getMenu().add(Menu.NONE, R.id.saved_venues, Menu.NONE, R.string.saved_venues);
        menu.getMenu().add(Menu.NONE, R.id.location_help, Menu.NONE, R.string.location_help);
        menu.getMenu().add(Menu.NONE, R.id.privacy, Menu.NONE, R.string.privacy);
        menu.getMenu().add(Menu.NONE, R.id.support, Menu.NONE, R.string.support);
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == R.id.save_venue) { savedVenues.saveCurrent(); return true; }
            if (item.getItemId() == R.id.saved_venues) { savedVenues.showList(); return true; }
            if (item.getItemId() == R.id.location_help) { showLocationHelp(); return true; }
            if (item.getItemId() == R.id.privacy) { showPrivacy(); return true; }
            if (item.getItemId() == R.id.support) { openExternal("mailto:dovebevo@gmail.com"); return true; }
            return false;
        });
        menu.show();
    }

    private void showLocationHelp() {
        if (destroyed) return;
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
        failed = true;
        cancelLocation();
        setLoading(false);
        errorTitle.setText(title);
        errorMessage.setText(message);
        if (website != null) website.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
        errorPanel.bringToFront();
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

    private final class WebsiteClient extends TestLabClient {
        WebsiteClient(TestLabPolicy policy) { super(policy); }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Challenge iframes remain browser content; only top-level links open apps.
            return request.isForMainFrame() && handleNavigation(request.getUrl().toString());
        }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
            if (view != website || destroyed) return;
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
            setLoading(!failed);
        }
        @Override public void onPageFinished(WebView view, String url) {
            if (view != website || destroyed || awaitingDocumentStart || url.equals(stoppedUrl) || !url.equals(lastTrustedUrl)) return;
            preparedNavigationUrl = null;
            setLoading(false);
            if (!failed && BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL) {
                hasUsablePage = !documentHasHttpError;
                errorPanel.setVisibility(View.GONE);
                view.setVisibility(View.VISIBLE);
            }
            updateToolbar();
        }
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (view != website || destroyed || BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return;
            if (!loading && !failed) lastTrustedUrl = url;
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
            if (!foreground || !BrowserPolicy.isLocationOrigin(origin) || BrowserPolicy.target(current) != BrowserPolicy.Target.INTERNAL) {
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
        resolveLocationResult();
    }
    @Override protected void onPause() {
        foreground = false;
        // The system permission dialog may pause us. Only deliver its result
        // after resume; an actual stop or navigation invalidates the callback.
        if (!requestingLocationPermission) cancelLocation();
        disposePopup();
        if (website != null) website.onPause();
        super.onPause();
    }
    @Override protected void onStop() {
        cancelLocation();
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
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
        destroyed = true;
        if (privacyDialog != null) privacyDialog.dismiss();
        if (locationHelpDialog != null) locationHelpDialog.dismiss();
        if (savedVenues != null) savedVenues.dismiss();
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
