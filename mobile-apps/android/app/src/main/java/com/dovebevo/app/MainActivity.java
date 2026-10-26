package com.dovebevo.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

/** The live website stays in its normal browser origin and cookie context. */
public final class MainActivity extends ComponentActivity {
    private static final int LOCATION_REQUEST = 71;
    private WebView website;
    private WebView popup;
    private FrameLayout content;
    private LinearLayout errorPanel;
    private TextView offline;
    private ProgressBar progress;
    private String lastTrustedUrl = BrowserPolicy.HOME;
    private boolean foreground;
    private boolean failed;
    private boolean destroyed;
    private String locationOrigin;
    private GeolocationPermissions.Callback locationCallback;
    private boolean requestingLocationPermission;
    private boolean locationResultReady;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(false);
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(getColor(R.color.shell_background));
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
        LinearLayout tools = new LinearLayout(this);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        tools.addView(button(R.id.back, R.string.back, this::goBack), toolSize());
        tools.addView(button(R.id.home, R.string.home, () -> navigate(BrowserPolicy.HOME)), toolSize());
        tools.addView(button(R.id.share, R.string.share, this::share), toolSize());
        tools.addView(button(R.id.refresh, R.string.refresh, this::refresh), toolSize());
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
        errorPanel.addView(text(R.string.unavailable_title, 22));
        TextView message = text(R.string.unavailable_body, 16);
        message.setPadding(0, dp(16), 0, dp(16));
        errorPanel.addView(message);
        errorPanel.addView(button(R.id.retry, R.string.retry, () -> navigate(lastTrustedUrl)), new LinearLayout.LayoutParams(-2, -2));
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
        setContentView(shell);
        shell.requestApplyInsets();
        monitorNetwork();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });
        if (state != null && BrowserPolicy.target(state.getString("trusted_url")) == BrowserPolicy.Target.INTERNAL)
            lastTrustedUrl = state.getString("trusted_url");
        navigate(lastTrustedUrl);
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
        button.setOnClickListener(view -> action.run());
        return button;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebsite() {
        website = new WebView(this);
        website.setId(R.id.website);
        WebSettings settings = website.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        // Keep the stock User-Agent and browser storage for the website's Turnstile flow.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(website, true);
        website.setWebViewClient(new WebsiteClient());
        website.setWebChromeClient(new ChromeClient());
        website.setDownloadListener((url, userAgent, disposition, mime, length) -> openExternal(url));
        content.addView(website, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private void navigate(String url) {
        if (destroyed || BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return;
        cancelLocation();
        if (website == null) createWebsite();
        failed = false;
        lastTrustedUrl = url;
        errorPanel.setVisibility(View.GONE);
        website.setVisibility(View.VISIBLE);
        progress.setVisibility(View.VISIBLE);
        website.loadUrl(url); // Explicit GET: never replay a form submission on retry.
    }
    private void refresh() {
        String url = website == null ? null : website.getUrl();
        navigate(BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL ? url : lastTrustedUrl);
    }
    private void goBack() {
        BackNavigation.perform(website != null && website.canGoBack(), () -> {
            failed = false;
            progress.setVisibility(View.VISIBLE);
            website.goBack();
        }, this::finish);
    }

    private boolean handleNavigation(String url) {
        BrowserPolicy.Target target = BrowserPolicy.target(url);
        if (target == BrowserPolicy.Target.INTERNAL) return false;
        if (target == BrowserPolicy.Target.EXTERNAL || target == BrowserPolicy.Target.EMAIL || target == BrowserPolicy.Target.MAP) openExternal(url);
        else toast(R.string.blocked_link);
        return true;
    }
    private void openExternal(String url) {
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
        String url = BrowserPolicy.shareUrl(website == null ? null : website.getUrl());
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                .putExtra(Intent.EXTRA_TITLE, getString(R.string.app_name));
        try { startActivity(Intent.createChooser(send, getString(R.string.share))); }
        catch (ActivityNotFoundException error) { toast(R.string.external_unavailable); }
    }
    private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
    private void showFailure() {
        if (destroyed) return;
        failed = true;
        cancelLocation();
        progress.setVisibility(View.GONE);
        if (website != null) website.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
        errorPanel.bringToFront();
    }

    private final class WebsiteClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Challenge iframes remain browser content; only top-level links open apps.
            return request.isForMainFrame() && handleNavigation(request.getUrl().toString());
        }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
            cancelLocation();
            if (BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) {
                view.stopLoading();
                showFailure();
                return;
            }
            lastTrustedUrl = url;
            failed = false;
            progress.setVisibility(View.VISIBLE);
        }
        @Override public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            if (!failed && BrowserPolicy.target(url) == BrowserPolicy.Target.INTERNAL) {
                errorPanel.setVisibility(View.GONE);
                view.setVisibility(View.VISIBLE);
            }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showFailure();
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            // Cloudflare can serve an interactive browser challenge as HTTP 403.
            // Keep 4xx pages visible instead of hiding the existing challenge UI.
            if (request.isForMainFrame() && response.getStatusCode() >= 500) showFailure();
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showFailure();
        }
        @Override public void onFormResubmission(WebView view, Message dontResend, Message resend) {
            dontResend.sendToTarget();
            toast(R.string.no_resubmit);
        }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view == website) {
                content.removeView(view);
                website = null;
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
            popup = new WebView(MainActivity.this);
            WebView created = popup;
            created.getSettings().setAllowFileAccess(false);
            created.getSettings().setAllowContentAccess(false);
            created.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            created.setWebViewClient(new WebViewClient() {
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
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        destroyed = true;
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
