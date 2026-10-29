package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.AlertDialog;
import android.app.Instrumentation;
import android.annotation.TargetApi;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.system.Os;
import android.view.View;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.ServiceWorkerController;
import android.webkit.ServiceWorkerClient;
import android.webkit.WebBackForwardList;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Assume;
import org.json.JSONArray;

/**
 * Real app callbacks/native dialogs and real WebViews, with every response local.
 * Launches only bundled welcome (no acceptance/network), then installs an owned
 * fixture layout. Reflection touches our own private seams, never platform internals.
 * This is not a live website, complete Activity recreation, or physical-device test.
 */
@TargetApi(26)
public final class NativeUsabilityRuntimeTest {
    private static final String ONE = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static final String HOLD = "https://www.dovebevo.com/bar/w9?c=sr2y7";
    private static final String FAILURE = "https://www.dovebevo.com/bar/r42?c=u0nd9";
    private static final String FIXTURE_HTML = """
            <!doctype html><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="Content-Security-Policy"
              content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
            <meta name="owned-response" content="OWNED_RESPONSE">
            <title>Owned native fixture</title><p>Local browser fixture</p>
            <button id="open-venue" style="min-height:64px;width:240px"
              onclick="document.querySelector('section.map').setAttribute('data-selected','n123');history.pushState({inApp:true},'', '/bar/n123?c=u0nd9')">Open owned venue fixture</button>
            <section class="map" data-selected="OWNED_VENUE_KEY"></section>
            <dialog class="sheet sheet--bare" open aria-label="Locale di prova">
              <div class="sheet__body"><div class="scontrino"><div class="scontrino__paper">
                <h2 class="scontrino__name">Locale di prova</h2>
              </div></div></div>
            </dialog>
            """;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final AtomicBoolean hold = new AtomicBoolean();
    private final AtomicBoolean serverFailure = new AtomicBoolean(true);
    private final AtomicInteger documentResponses = new AtomicInteger();
    private final CountDownLatch release = new CountDownLatch(1);
    private final CountDownLatch holdStarted = new CountDownLatch(1);
    private MainActivity activity;
    private WebView web;
    private WebViewClient actualClient;
    private SavedVenueStore store;
    private SavedVenuesUi savedUi;
    private File fixtureDirectory;
    private SharedPreferences rules;
    private String oldRulesVersion;
    private boolean hadRulesVersion;
    private boolean priorWorkerBlock;
    private final CopyOnWriteArrayList<String> events = new CopyOnWriteArrayList<>();

    @Before public void setUp() throws Exception {
        Assume.assumeTrue("Fixture delegates require WebView.getWebViewClient on API 26+", Build.VERSION.SDK_INT >= 26);
        assertTrue("Run native fixtures with NativeFixtureRunner and its isolated WebView profile",
                NativeFixtureRunner.isolatedProfileReady);
        rules = instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules", 0);
        hadRulesVersion = rules.contains("accepted_rules_version");
        oldRulesVersion = rules.getString("accepted_rules_version", null);
        assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity = (MainActivity) instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        fixtureDirectory = new File(activity.getCacheDir(), "native-usability-" + UUID.randomUUID());
        assertTrue(fixtureDirectory.mkdir());
        store = new SavedVenueStore(new SavedVenueFile(fixtureDirectory));
        onMain(() -> {
            try {
                assertNotNull(activity.findViewById(R.id.accept_rules));
                assertNull(get("website"));
                priorWorkerBlock = ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getBlockNetworkLoads();
                ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(true);
                LinearLayout layout = new LinearLayout(activity);
                layout.setOrientation(LinearLayout.VERTICAL);
                layout.addView((View) invoke("createBrowserTools"));
                ProgressBar progress = new ProgressBar(activity);
                set("progress", progress); layout.addView(progress);
                FrameLayout content = new FrameLayout(activity);
                set("content", content);
                layout.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
                LinearLayout error = new LinearLayout(activity);
                error.setOrientation(LinearLayout.VERTICAL);
                TextView title = new TextView(activity); set("errorTitle", title); error.addView(title);
                TextView message = new TextView(activity); set("errorMessage", message); error.addView(message);
                Button retry = new Button(activity); retry.setId(R.id.retry); retry.setText(R.string.retry);
                retry.setOnClickListener(view -> invoke("navigate", new Class<?>[]{String.class}, get("lastTrustedUrl")));
                error.addView(retry); error.setVisibility(View.GONE); set("errorPanel", error);
                content.addView(error, new FrameLayout.LayoutParams(-1, -1));
                layout.addView((View) invoke("createBottomNavigation"));
                activity.setContentView(layout);
                installFixtureWebView();
                savedUi = new SavedVenuesUi(activity, store, () -> (String) invoke("eligibleSavedVenue"),
                        callback -> invoke("readSavedVenue", new Class<?>[]{Consumer.class}, callback),
                        url -> invoke("navigate", new Class<?>[]{String.class}, url));
                set("savedVenues", savedUi);
                invoke("updateToolbar");
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    @After public void tearDown() throws Exception {
        release.countDown();
        if (activity != null) onMain(() -> {
            if (savedUi != null) savedUi.dismiss();
            if (web != null) { web.stopLoading(); web.destroy(); }
            try { set("website", null); } catch (Exception error) { throw new AssertionError(error); }
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(priorWorkerBlock);
            activity.finish();
        });
        if (rules != null) {
            SharedPreferences.Editor editor = rules.edit();
            if (hadRulesVersion) editor.putString("accepted_rules_version", oldRulesVersion);
            else editor.remove("accepted_rules_version");
            assertTrue(editor.commit());
        }
        if (fixtureDirectory != null) {
            Os.chmod(fixtureDirectory.getAbsolutePath(), 0700);
            File[] files = fixtureDirectory.listFiles();
            if (files != null) for (File file : files) assertTrue(file.delete());
            assertTrue(fixtureDirectory.delete());
        }
    }

    @Test public void oneActionBookmarkUsesActualHeadingWithoutAFormAndPersistsOpensAndRemoves() throws Exception {
        navigate(ONE);
        WebView original = web;
        onMain(() -> activity.findViewById(R.id.save_venue).performClick());
        await(() -> "Locale di prova".equals(savedLabel()));
        onMain(() -> {
            assertNull(currentDialog());
            assertSame(original, get("website"));
            assertFalse((Boolean) get("favoritesVisible"));
            assertEquals(ONE, web.getUrl());
            assertTrue(activity.findViewById(R.id.map_destination).isSelected());
            assertFalse(activity.findViewById(R.id.save_venue).isSelected());
        });
        assertEquals("Locale di prova", new SavedVenueStore(new SavedVenueFile(fixtureDirectory)).load().get(0).label);
        assertEquals(ONE, store.load().get(0).url);
        // A second explicit bookmark refreshes the actual name without a form.
        onMain(() -> savedUi.saveCurrent());
        instrumentation.waitForIdleSync();
        assertEquals(1, store.load().size());
        navigate(BrowserPolicy.HOME);
        onMain(() -> savedUi.showList());
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getListView().performItemClick(null, 0, 0));
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick());
        await(() -> ONE.equals(web.getUrl()) && (Boolean) get("hasUsablePage") && !(Boolean) get("loading"));
        assertOwnedDocument(1);
        onMain(() -> {
            assertSame(original, get("website"));
            savedUi.showList();
        });
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getListView().performItemClick(null, 0, 0));
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getButton(AlertDialog.BUTTON_NEUTRAL).performClick());
        instrumentation.waitForIdleSync();
        assertTrue(store.load().isEmpty());
    }

    @Test public void visibleRecommendationEntryUsesActualVenueReaderAndOnlyInjectedApi() throws Exception {
        AtomicReference<String> requested = new AtomicReference<>();
        AtomicReference<RecommendationsUi> nativeUi = new AtomicReference<>();
        AtomicInteger posts = new AtomicInteger();
        onMain(() -> {
            RecommendationsUi.Api api = new RecommendationsUi.Api() {
                public DrinkRecommendations get(String canonical, RecommendationsClient.Cancellation cancellation) throws IOException {
                    cancellation.check(); requested.set(canonical); return RecommendationsRuntimeTest.fixtureSnapshot(false);
                }
                public DrinkRecommendations set(String canonical, RecommendationDrink drink, boolean selected, RecommendationsClient.Cancellation cancellation) throws IOException {
                    posts.incrementAndGet(); return RecommendationsRuntimeTest.fixtureSnapshot(selected);
                }
            };
            RecommendationsUi ui = new RecommendationsUi(activity, api, TestLabPolicy.detect(() -> null), () -> (String) invoke("eligibleSavedVenue"));
            nativeUi.set(ui); set("recommendations", ui);
            Button entry = activity.findViewById(R.id.recommendation_entry);
            invoke("updateToolbar");
            assertEquals(View.VISIBLE, entry.getVisibility()); assertFalse(entry.isEnabled());
        });
        navigate(ONE);
        onMain(() -> {
            Button entry = activity.findViewById(R.id.recommendation_entry);
            assertEquals(View.VISIBLE, entry.getVisibility()); assertTrue(entry.isEnabled()); entry.performClick();
        });
        await(() -> ONE.equals(requested.get()));
        onMain(() -> {
            try {
                Field field = RecommendationsUi.class.getDeclaredField("dialog"); field.setAccessible(true);
                AlertDialog dialog = (AlertDialog) field.get(nativeUi.get());
                assertNotNull(dialog); assertTrue(dialog.isShowing());
                ArrayList<View> names = new ArrayList<>(); dialog.getWindow().getDecorView().findViewsWithText(names, "Locale di prova", View.FIND_VIEWS_WITH_TEXT);
                assertEquals(1, names.size());
                assertSame(web, get("website"));
                nativeUi.get().dismiss();
            } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
        });
        navigate(BrowserPolicy.HOME);
        onMain(() -> {
            assertEquals(View.VISIBLE, activity.findViewById(R.id.recommendation_entry).getVisibility());
            assertFalse(activity.findViewById(R.id.recommendation_entry).isEnabled());
        });
        assertEquals("Entry/GET must not publish a recommendation", 0, posts.get());
    }

    @Test public void fiveBottomControlsRemainVisibleAndOverflowHasNoDestinationDuplicates() throws Exception {
        onMain(() -> {
            android.view.ViewGroup bottom = activity.findViewById(R.id.bottom_navigation);
            assertNotNull(bottom);
            for (int id : new int[]{R.id.home, R.id.map_destination, R.id.favorites_destination,
                    R.id.save_venue, R.id.recommendation_entry}) {
                View control = bottom.findViewById(id);
                assertNotNull(control); assertEquals(View.VISIBLE, control.getVisibility());
            }
            assertFalse(activity.findViewById(R.id.save_venue).isEnabled());
            assertFalse(activity.findViewById(R.id.recommendation_entry).isEnabled());
            android.view.ViewGroup top = activity.findViewById(R.id.browser_tools);
            assertEquals(3, top.getChildCount());
            assertNull(top.findViewById(R.id.home)); assertNull(top.findViewById(R.id.save_venue));
            assertNull(activity.findViewById(R.id.share)); assertNull(activity.findViewById(R.id.refresh));
            android.view.Menu menu = browserMenu().getMenu();
            assertNotNull(menu.findItem(R.id.share)); assertNotNull(menu.findItem(R.id.refresh));
            for (int id : new int[]{R.id.home, R.id.map_destination, R.id.favorites_destination,
                    R.id.saved_venues, R.id.save_venue, R.id.recommendation_entry}) assertNull(menu.findItem(id));
        });
        navigate(ONE);
        WebView original = web;
        onMain(() -> {
            assertTrue(activity.findViewById(R.id.save_venue).isEnabled());
            assertTrue(activity.findViewById(R.id.recommendation_entry).isEnabled());
            FavoritePricesClient client = new FavoritePricesClient((url,max,call) -> {
                throw new IOException("Empty owned favourites must not fetch");
            }, () -> "2026-10-29");
            FavoritesScreen screen = new FavoritesScreen(activity, store,
                    url -> invoke("navigate", new Class<?>[]{String.class}, url),
                    () -> (Boolean) get("foreground"),
                    new FavoritesLoader(client, task -> activity.runOnUiThread(task)));
            set("favorites", screen); ((FrameLayout)get("content")).addView(screen.view());
            screen.view().setVisibility(View.GONE);
            int index = web.copyBackForwardList().getCurrentIndex();
            activity.findViewById(R.id.favorites_destination).performClick();
            assertSame(screen, get("favorites")); assertTrue((Boolean)get("favoritesVisible"));
            assertTrue(activity.findViewById(R.id.favorites_destination).isSelected());
            assertFalse(activity.findViewById(R.id.save_venue).isEnabled());
            assertFalse(activity.findViewById(R.id.recommendation_entry).isEnabled());
            assertFalse(browserMenu().getMenu().findItem(R.id.share).isEnabled());
            assertFalse(browserMenu().getMenu().findItem(R.id.refresh).isEnabled());
            activity.findViewById(R.id.map_destination).performClick();
            assertSame(original, get("website")); assertEquals(index, web.copyBackForwardList().getCurrentIndex());
            assertEquals(ONE, web.getUrl()); assertFalse((Boolean)get("favoritesVisible"));
            activity.findViewById(R.id.favorites_destination).performClick();
            activity.findViewById(R.id.home).performClick();
            assertFalse((Boolean)get("favoritesVisible"));
            assertTrue(activity.findViewById(R.id.map_destination).isSelected());
            assertFalse(activity.findViewById(R.id.home).isSelected());
            assertSame(original, get("website"));
        });
        await(() -> BrowserPolicy.HOME.equals(web.getUrl()) && !(Boolean)get("loading"));
        assertOwnedDocument(2);
    }

    @Test public void actualBottomLayoutFitsNarrowLargeTextAndLandscapeWithoutClippingOrHiddenActions() {
        onMain(() -> {
            for (float[] fixture : new float[][]{{390,1f},{320,1.5f},{320,2f},{640,1.5f}}) {
                android.content.res.Configuration config = new android.content.res.Configuration(activity.getResources().getConfiguration());
                config.screenWidthDp = (int)fixture[0]; config.fontScale = fixture[1];
                android.content.Context context = new android.view.ContextThemeWrapper(activity.createConfigurationContext(config), R.style.AppTheme);
                BottomNavigationBar bar = new BottomNavigationBar(context, () -> {}, () -> {}, () -> {}, () -> {}, () -> {});
                float density = context.getResources().getDisplayMetrics().density;
                int width = Math.round(fixture[0] * density);
                bar.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                bar.layout(0, 0, width, bar.getMeasuredHeight());
                java.util.ArrayList<android.graphics.Rect> boxes = new java.util.ArrayList<>();
                for (int id : new int[]{R.id.home,R.id.map_destination,R.id.favorites_destination,R.id.save_venue,R.id.recommendation_entry}) {
                    Button button = bar.findViewById(id); assertNotNull(button);
                    assertEquals(View.VISIBLE, button.getVisibility());
                    assertTrue(button.getWidth() >= 48*density); assertTrue(button.getHeight() >= 48*density);
                    assertNotNull(button.getLayout());
                    assertTrue(button.getLayout().getHeight() <= button.getHeight()-button.getCompoundPaddingTop()-button.getCompoundPaddingBottom());
                    for(int line=0;line<button.getLineCount();line++) {
                        assertEquals(0,button.getLayout().getEllipsisCount(line));
                        assertTrue(button.getLayout().getLineWidth(line) <= button.getWidth()-button.getCompoundPaddingLeft()-button.getCompoundPaddingRight()+1);
                    }
                    android.graphics.Rect box = new android.graphics.Rect(0,0,button.getWidth(),button.getHeight());
                    bar.offsetDescendantRectToMyCoords(button,box);
                    assertTrue(new android.graphics.Rect(0,0,width,bar.getHeight()).contains(box));
                    for(android.graphics.Rect other:boxes) assertFalse(android.graphics.Rect.intersects(other,box));
                    boxes.add(box);
                }
            }
        });
    }

    @Test public void nativeFavoritesKeepBrowserHistoryAndLateBrowserFailureBehindTheSelectedTab() throws Exception {
        navigate(ONE);
        WebView original=web;
        AtomicInteger publicReads=new AtomicInteger();
        AtomicReference<FavoritesScreen> nativeFavorites=new AtomicReference<>();
        onMain(()->{
            FavoritesLoader loader=new FavoritesLoader(new FavoritePricesClient((url,max,call)->{publicReads.incrementAndGet();throw new IOException("Owned empty-list transport must not be used");},()->"2026-10-29"),task->activity.runOnUiThread(task));
            FavoritesScreen screen=new FavoritesScreen(activity,store,url->invoke("navigate",new Class<?>[]{String.class},url),()->(Boolean)get("foreground"),loader);
            nativeFavorites.set(screen);set("favorites",screen);((FrameLayout)get("content")).addView(screen.view(),new FrameLayout.LayoutParams(-1,-1));screen.view().setVisibility(View.GONE);
            int historySize=web.copyBackForwardList().getSize(),historyIndex=web.copyBackForwardList().getCurrentIndex();
            invoke("showFavorites");
            assertTrue((Boolean)get("favoritesVisible"));assertEquals(View.VISIBLE,screen.view().getVisibility());assertEquals(View.GONE,web.getVisibility());
            assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,web.getImportantForAccessibility());assertNull(invoke("eligibleSavedVenue"));
            // A genuine app-client callback must update browser state without exposing its hidden document.
            actualClient.onPageFinished(web,ONE);assertEquals(View.GONE,web.getVisibility());
            actualClient.onReceivedHttpError(web,mainFrameRequest(ONE),new WebResourceResponse("text/html","UTF-8",500,"Service Unavailable",Collections.emptyMap(),new ByteArrayInputStream(new byte[0])));
            assertTrue((Boolean)get("failed"));assertEquals(View.GONE,((View)get("errorPanel")).getVisibility());assertEquals(View.VISIBLE,screen.view().getVisibility());
            assertEquals(historySize,web.copyBackForwardList().getSize());assertEquals(historyIndex,web.copyBackForwardList().getCurrentIndex());
            invoke("goBack"); // System Back selects Mappa before touching retained browser history.
            assertFalse((Boolean)get("favoritesVisible"));assertEquals(View.GONE,screen.view().getVisibility());assertEquals(View.VISIBLE,((View)get("errorPanel")).getVisibility());
            assertSame(original,get("website"));assertEquals(historySize,web.copyBackForwardList().getSize());assertEquals(historyIndex,web.copyBackForwardList().getCurrentIndex());
            invoke("showFavorites"); // An already presented map failure must also stay behind the selected native destination.
            assertEquals(View.GONE,((View)get("errorPanel")).getVisibility());assertEquals(View.VISIBLE,screen.view().getVisibility());assertTrue((Boolean)get("failed"));
            invoke("goBack");assertEquals(View.VISIBLE,((View)get("errorPanel")).getVisibility());assertEquals(historyIndex,web.copyBackForwardList().getCurrentIndex());
            nativeFavorites.get().close();set("favorites",null);
        });
        assertEquals(0,publicReads.get());
    }

    @Test public void actualHeadingReaderRejectsUncommittedSelectionOverlayAndHiddenHeading() throws Exception {
        navigate(ONE);
        assertEquals("Locale di prova", readVenue().name);
        fixtureJavascript("document.querySelector('section.map').setAttribute('data-selected','w9')");
        assertNull("Old rendered venue must not be named for a new href", readVenue());
        fixtureJavascript("document.querySelector('section.map').setAttribute('data-selected','n123');const d=document.createElement('dialog');d.className='sheet';d.open=true;d.id='owned-overlay';document.body.appendChild(d)");
        assertNull(readVenue());
        fixtureJavascript("document.getElementById('owned-overlay').remove();document.querySelector('h2').hidden=true");
        assertNull(readVenue());
        fixtureJavascript("document.querySelector('h2').hidden=false;document.querySelector('dialog').setAttribute('aria-label','Different name')");
        assertNull(readVenue());
        fixtureJavascript("const d=document.querySelector('dialog');d.setAttribute('aria-label','Locale di prova');d.style.maxHeight='200px';d.style.overflow='auto';const receipt=document.createElement('div');receipt.style.height='2000px';receipt.textContent='Owned long receipt';d.querySelector('.scontrino__paper').appendChild(receipt);d.scrollTop=1000");
        assertEquals("A heading scrolled above the visible receipt still names the venue", "Locale di prova", readVenue().name);
    }

    @Test public void asynchronousHeadingCaptureCannotSaveAfterNavigationOrUiDismissal() throws Exception {
        navigate(ONE);
        AtomicReference<SavedVenueCapture.Venue> captured = new AtomicReference<>();
        CountDownLatch complete = new CountDownLatch(1);
        onMain(() -> {
            Consumer<SavedVenueCapture.Venue> callback = venue -> { captured.set(venue); complete.countDown(); };
            invoke("readSavedVenue", new Class<?>[]{Consumer.class}, callback);
            invoke("navigate", new Class<?>[]{String.class}, BrowserPolicy.HOME);
        });
        assertTrue(complete.await(5, TimeUnit.SECONDS));
        assertNull("Navigation invalidates the in-flight read", captured.get());
        navigate(ONE);
        AtomicReference<Consumer<SavedVenueCapture.Venue>> pending = new AtomicReference<>();
        onMain(() -> {
            SavedVenuesUi delayed = new SavedVenuesUi(activity, store, () -> ONE, pending::set, url -> fail());
            delayed.saveCurrent();
            delayed.dismiss();
            pending.get().accept(new SavedVenueCapture(ONE, 1).complete(ONE, "Locale di prova", "n123", ONE, 1));
        });
        assertTrue("A dismissed UI must not commit a late bookmark", store.load().isEmpty());
    }

    @Test public void openingFavoritesAndRemovingCannotBeUndoneByAnEarlierSaveCallback() throws Exception {
        navigate(ONE);
        assertEquals(SavedVenueStore.Result.SAVED, store.save(ONE, "Previously saved venue"));
        AtomicReference<Consumer<SavedVenueCapture.Venue>> pending = new AtomicReference<>();
        onMain(() -> {
            savedUi.dismiss();
            savedUi = new SavedVenuesUi(activity, store, () -> (String) invoke("eligibleSavedVenue"),
                    pending::set, url -> invoke("navigate", new Class<?>[]{String.class}, url));
            set("savedVenues", savedUi);
            savedUi.saveCurrent();
            assertNotNull(pending.get());
            // This is the real list/detail/remove path, not explicit dismissal
            // of the object whose save callback is waiting.
            savedUi.showList();
        });
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getListView().performItemClick(null, 0, 0));
        instrumentation.waitForIdleSync();
        onMain(() -> currentDialog().getButton(AlertDialog.BUTTON_NEUTRAL).performClick());
        instrumentation.waitForIdleSync();
        assertTrue(store.load().isEmpty());
        onMain(() -> pending.get().accept(new SavedVenueCapture(ONE, 1)
                .complete(ONE, "Locale di prova", "n123", ONE, 1)));
        assertTrue("Removing a favorite must win over its older pending save", store.load().isEmpty());
        assertTrue("The committed file must remain empty", new SavedVenueStore(new SavedVenueFile(fixtureDirectory)).load().isEmpty());
    }

    @Test public void sameDocumentHistoryControlsAndNativeSavedStateRestoreAForwardEntry() throws Exception {
        navigate(BrowserPolicy.HOME);
        tapOwnedVenueButton();
        await(() -> ONE.equals(web.getUrl()) && ((Button) get("backButton")).isEnabled());
        assertOwnedDocument(1);
        onMain(() -> {
            assertFalse(((Button) get("forwardButton")).isEnabled());
            assertEquals(ONE, invoke("eligibleSavedVenue"));
            ((Button) get("backButton")).performClick();
        });
        await(() -> BrowserPolicy.HOME.equals(web.getUrl()) && ((Button) get("forwardButton")).isEnabled());
        assertOwnedDocument(1);
        Bundle activityState = new Bundle();
        onMain(() -> {
            invoke("onSaveInstanceState", new Class<?>[]{Bundle.class}, activityState);
            assertNotNull(activityState.getBundle("browser_history"));
            FrameLayout content = (FrameLayout) get("content");
            content.removeView(web); web.stopLoading(); web.destroy(); set("website", null);
            set("hasUsablePage", false); set("failed", false);
            installFixtureWebView();
            assertEquals(Boolean.TRUE, invoke("restoreHistory", new Class<?>[]{Bundle.class}, activityState));
        });
        await(() -> BrowserPolicy.HOME.equals(web.getUrl()) && !(Boolean) get("loading"));
        assertOwnedDocument(1);
        onMain(() -> {
            assertFalse(((Button) get("backButton")).isEnabled());
            assertTrue(((Button) get("forwardButton")).isEnabled());
            ((Button) get("forwardButton")).performClick();
        });
        await(() -> ONE.equals(web.getUrl()) && ((Button) get("backButton")).isEnabled());
        assertOwnedDocument(1);
    }

    @Test public void firstLoadStopOffersRetryAndARealServerFailureStillShowsRecovery() throws Exception {
        hold.set(true);
        onMain(() -> invoke("navigate", new Class<?>[]{String.class}, HOLD));
        assertTrue("Held fixture did not start", holdStarted.await(10, TimeUnit.SECONDS));
        onMain(() -> {
            assertEquals(activity.getString(R.string.stop_loading), browserMenu().getMenu().findItem(R.id.refresh).getTitle());
            assertTrue(browserMenu().getMenu().performIdentifierAction(R.id.refresh, 0));
            assertEquals(View.GONE, ((ProgressBar) get("progress")).getVisibility());
            assertEquals(View.VISIBLE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(activity.getString(R.string.loading_stopped_title), ((TextView) get("errorTitle")).getText().toString());
            assertNull(invoke("eligibleSavedVenue"));
        });
        hold.set(false); release.countDown();
        int beforeRetry = documentResponses.get();
        onMain(() -> {
            activity.findViewById(R.id.retry).performClick();
            // Before the replacement's page-start callback, the old stopped
            // request may still report finish with this identical URL.
            actualClient.onPageFinished(web, HOLD);
            assertTrue("An old finish before replacement start must keep loading active", (Boolean) get("loading"));
            assertTrue((Boolean) get("awaitingDocumentStart"));
            assertNull(invoke("eligibleSavedVenue"));
        });
        awaitOwnedResponse(beforeRetry + 1);
        await(() -> HOLD.equals(invoke("eligibleSavedVenue")));
        onMain(() -> {
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(HOLD, invoke("eligibleSavedVenue"));
            invoke("navigate", new Class<?>[]{String.class}, FAILURE);
        });
        await(() -> (Boolean) get("failed"));
        onMain(() -> {
            assertEquals(View.VISIBLE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertNull(invoke("eligibleSavedVenue"));
        });
        serverFailure.set(false);
        int beforeServerRetry = documentResponses.get();
        onMain(() -> activity.findViewById(R.id.retry).performClick());
        awaitOwnedResponse(beforeServerRetry + 1);
        await(() -> FAILURE.equals(invoke("eligibleSavedVenue")));
        onMain(() -> {
            assertFalse((Boolean) get("documentHasHttpError"));
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(FAILURE, invoke("eligibleSavedVenue"));
        });
    }

    @Test public void aRealFileWriteFailurePreservesThePriorCommittedVenue() throws Exception {
        assertEquals(SavedVenueStore.Result.SAVED, store.save(ONE, "Uno"));
        Os.chmod(fixtureDirectory.getAbsolutePath(), 0500);
        try { assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.save(HOLD, "Due")); }
        finally { Os.chmod(fixtureDirectory.getAbsolutePath(), 0700); }
        assertEquals(1, store.load().size());
        assertEquals(ONE, store.load().get(0).url);
        assertEquals(SavedVenueStore.Result.REMOVED, store.remove(ONE));
    }

    @Test public void stoppedSecondLoadIgnoresLateHttpFailureWithoutHidingTheUsableWebView() throws Exception {
        navigate(ONE);
        WebView original = web;
        hold.set(true);
        onMain(() -> invoke("navigate", new Class<?>[]{String.class}, HOLD));
        assertTrue("Held second load did not start", holdStarted.await(10, TimeUnit.SECONDS));
        onMain(() -> {
            assertTrue(browserMenu().getMenu().performIdentifierAction(R.id.refresh, 0));
            assertEquals(HOLD, get("stoppedUrl"));
            assertFalse((Boolean) get("failed"));
            assertTrue((Boolean) get("hasUsablePage"));
            assertEquals(View.VISIBLE, web.getVisibility());
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            String currentUrl = web.getUrl();
            int historySize = web.copyBackForwardList().getSize();
            // Deliver a delayed platform response to the actual app client.
            // No network request is made by this callback regression.
            actualClient.onReceivedHttpError(web, mainFrameRequest(HOLD), new WebResourceResponse(
                    "text/html", "UTF-8", 500, "Service Unavailable", Collections.emptyMap(),
                    new ByteArrayInputStream(new byte[0])));
            assertFalse("A stopped request must not become a new page failure", (Boolean) get("failed"));
            assertFalse((Boolean) get("documentHasHttpError"));
            assertTrue((Boolean) get("hasUsablePage"));
            assertSame(original, get("website"));
            assertEquals(currentUrl, web.getUrl());
            assertEquals(historySize, web.copyBackForwardList().getSize());
            assertEquals(View.VISIBLE, web.getVisibility());
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(View.GONE, ((ProgressBar) get("progress")).getVisibility());
            assertEquals(activity.getString(R.string.refresh), browserMenu().getMenu().findItem(R.id.refresh).getTitle());
            assertNull(invoke("eligibleSavedVenue"));
        });
    }

    @Test public void sslRejectionAlwaysCancelsButOnlyActiveUnstoppedFailuresCoverThePage() throws Exception {
        navigate(ONE);
        AtomicInteger cancelled = new AtomicInteger();
        Runnable cancel = cancelled::incrementAndGet;
        onMain(() -> {
            WebView old = new WebView(activity);
            old.getSettings().setBlockNetworkLoads(true);
            try {
                invoke("rejectSslFailure", new Class<?>[]{WebView.class, String.class, Runnable.class}, old, ONE, cancel);
                invoke("rejectSslFailure", new Class<?>[]{WebView.class, String.class, Runnable.class}, web, BrowserPolicy.HOME, cancel);
                invoke("rejectSslFailure", new Class<?>[]{WebView.class, String.class, Runnable.class}, web, null, cancel);
                assertEquals(3, cancelled.get());
                assertFalse((Boolean) get("failed"));
                assertEquals(View.VISIBLE, web.getVisibility());
                assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            } finally { old.destroy(); }
        });
        hold.set(true);
        onMain(() -> invoke("navigate", new Class<?>[]{String.class}, HOLD));
        assertTrue("Held second load did not start", holdStarted.await(10, TimeUnit.SECONDS));
        onMain(() -> {
            assertTrue(browserMenu().getMenu().performIdentifierAction(R.id.refresh, 0));
            invoke("rejectSslFailure", new Class<?>[]{WebView.class, String.class, Runnable.class}, web, HOLD, cancel);
            assertEquals(4, cancelled.get());
            assertFalse((Boolean) get("failed"));
            assertEquals(View.VISIBLE, web.getVisibility());
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
        });
        hold.set(false); release.countDown();
        navigate(ONE);
        onMain(() -> {
            invoke("rejectSslFailure", new Class<?>[]{WebView.class, String.class, Runnable.class}, web, ONE, cancel);
            assertEquals(5, cancelled.get());
            assertTrue((Boolean) get("failed"));
            assertEquals(View.VISIBLE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertNull(invoke("eligibleSavedVenue"));
        });
    }

    @Test public void oversizedOrForeignHistoryCannotBeRestoredAsAnAllowedWebsite() throws Exception {
        Bundle excessive = new Bundle(); excessive.putByteArray("oversize", new byte[131073]);
        onMain(() -> {
            assertNull(BrowserHistoryState.restore(web, excessive));
            assertTrue(web.getSettings().getBlockNetworkLoads());
        });
        // Build opaque foreign state in a separate network-blocked view whose
        // every response is local, without weakening the real app's URL client.
        AtomicReference<WebView> foreignView = new AtomicReference<>();
        CountDownLatch foreignLoaded = new CountDownLatch(1);
        onMain(() -> {
            WebView foreign = new WebView(activity); foreignView.set(foreign);
            foreign.getSettings().setBlockNetworkLoads(true);
            foreign.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(
                            "<!doctype html><meta http-equiv=Content-Security-Policy content=\"default-src 'none'\"><p>Owned foreign history fixture</p>".getBytes(StandardCharsets.UTF_8)));
                }
                @Override public void onPageFinished(WebView view, String url) { foreignLoaded.countDown(); }
            });
            foreign.loadUrl("https://untrusted.invalid/fixture");
        });
        try {
            assertTrue(foreignLoaded.await(15, TimeUnit.SECONDS));
            onMain(() -> {
                Bundle foreign = new Bundle();
                WebBackForwardList captured = foreignView.get().saveState(foreign);
                assertNotNull(captured);
                try { BrowserHistoryState.restore(web, foreign); fail("Foreign history must be rejected"); }
                catch (IllegalArgumentException expected) { assertTrue(web.getSettings().getBlockNetworkLoads()); }
            });
        } finally { onMain(() -> foreignView.get().destroy()); }
    }

    private void navigate(String url) throws Exception {
        int minimumToken = documentResponses.get() + 1;
        onMain(() -> invoke("navigate", new Class<?>[]{String.class}, url));
        await(() -> url.equals(web.getUrl()) && !(Boolean) get("loading") && (Boolean) get("hasUsablePage"));
        assertOwnedDocument(minimumToken);
    }

    private android.widget.PopupMenu browserMenu() {
        return (android.widget.PopupMenu) invoke("createBrowserMenu", new Class<?>[]{View.class}, activity.findViewById(R.id.more));
    }

    private void assertOwnedDocument(int minimumToken) throws Exception {
        CountDownLatch measured = new CountDownLatch(1);
        AtomicReference<String> identity = new AtomicReference<>();
        onMain(() -> web.evaluateJavascript("(() => {const m=document.querySelector('meta[name=owned-response]');const c=navigator.serviceWorker.controller;const u=c?new URL(c.scriptURL):null;return [m?Number(m.content):-1,u?u.origin+u.pathname:null];})()",
                value -> { identity.set(value); measured.countDown(); }));
        assertTrue("Owned document identity callback missing", measured.await(5, TimeUnit.SECONDS));
        JSONArray actual = new JSONArray(identity.get());
        assertTrue("Navigation must render the owned main document; marker/controller=" + identity.get(),
                actual.getInt(0) >= minimumToken);
        assertTrue("Owned documents must not have a controlling service worker: " + identity.get(), actual.isNull(1));
        onMain(() -> {
            assertTrue(web.getSettings().getBlockNetworkLoads());
            assertTrue(ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getBlockNetworkLoads());
        });
    }

    private void installFixtureWebView() {
        invoke("createWebsite");
        web = (WebView) get("website");
        web.getSettings().setBlockNetworkLoads(true);
        // createWebsite installs the app's worker policy. Replace it only in
        // this isolated fixture profile, before any navigation, and on restore.
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                record("denied-fixture-worker=" + request.getMethod());
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                        Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0]));
            }
        });
        actualClient = web.getWebViewClient();
        WebViewClient delegate = actualClient;
        WebChromeClient actualChrome = web.getWebChromeClient();
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                record("console=" + message.message());
                return actualChrome.onConsoleMessage(message);
            }
            @Override public void onProgressChanged(WebView view, int progress) {
                record("progress=" + progress + " url=" + view.getUrl());
                actualChrome.onProgressChanged(view, progress);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse guarded = delegate.shouldInterceptRequest(view, request);
                if (guarded != null) return guarded;
                int responseToken = request.isForMainFrame() ? documentResponses.incrementAndGet() : 0;
                String key = request.getUrl().getLastPathSegment();
                byte[] bytes = FIXTURE_HTML.replace("OWNED_RESPONSE", Integer.toString(responseToken))
                        .replace("OWNED_VENUE_KEY", key == null ? "" : key).getBytes(StandardCharsets.UTF_8);
                InputStream body = new ByteArrayInputStream(bytes);
                if (hold.get() && HOLD.equals(request.getUrl().toString())) body = new ByteArrayInputStream(bytes) {
                    @Override public synchronized int read(byte[] buffer, int offset, int length) {
                        try { if (!release.await(15, TimeUnit.SECONDS)) return -1; }
                        catch (InterruptedException error) { Thread.currentThread().interrupt(); return -1; }
                        return super.read(buffer, offset, length);
                    }
                };
                int status = !"GET".equals(request.getMethod()) ? 403
                        : FAILURE.equals(request.getUrl().toString()) && serverFailure.get() ? 500 : 200;
                record("response=" + status + " token=" + responseToken + " main=" + request.isForMainFrame() + " url=" + request.getUrl());
                return new WebResourceResponse("text/html", "UTF-8", status,
                        status == 200 ? "OK" : status == 500 ? "Service Unavailable" : "Forbidden",
                        Collections.singletonMap("Cache-Control", "no-store"), body);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return delegate.shouldOverrideUrlLoading(view, request);
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                record("started=" + url);
                delegate.onPageStarted(view, url, icon);
                if (HOLD.equals(url) && hold.get()) holdStarted.countDown();
            }
            @Override public void onPageFinished(WebView view, String url) { record("finished=" + url); delegate.onPageFinished(view, url); }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) { record("history=" + url); delegate.doUpdateVisitedHistory(view, url, reload); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { record("error=" + error.getErrorCode() + " main=" + request.isForMainFrame() + " url=" + request.getUrl()); delegate.onReceivedError(view, request, error); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { record("http=" + response.getStatusCode() + " main=" + request.isForMainFrame() + " url=" + request.getUrl()); delegate.onReceivedHttpError(view, request, response); }
        });
    }

    private void await(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        AtomicBoolean matched = new AtomicBoolean();
        while (System.nanoTime() < deadline) {
            onMain(() -> matched.set(condition.getAsBoolean()));
            if (matched.get()) return;
            Thread.sleep(50);
        }
        AtomicReference<String> state = new AtomicReference<>();
        onMain(() -> state.set("url=" + web.getUrl() + " history=" + web.copyBackForwardList().getSize()
                + " canBack=" + web.canGoBack() + " backEnabled=" + ((Button) get("backButton")).isEnabled()
                + " canForward=" + web.canGoForward() + " forwardEnabled=" + ((Button) get("forwardButton")).isEnabled()
                + " loading=" + get("loading") + " failed=" + get("failed") + " usable=" + get("hasUsablePage")
                + " awaitingStart=" + get("awaitingDocumentStart") + " prepared=" + get("preparedNavigationUrl")
                + " stopped=" + get("stoppedUrl") + " httpError=" + get("documentHasHttpError")));
        fail("Native fixture state did not become ready within 15 seconds: " + state.get() + " events=" + String.join(" | ", events));
    }

    private void record(String event) { if (events.size() < 100) events.add(event); }

    private String savedLabel() {
        try { return store.load().isEmpty() ? null : store.load().get(0).label; }
        catch (IOException error) { throw new AssertionError(error); }
    }

    private SavedVenueCapture.Venue readVenue() throws Exception {
        AtomicReference<SavedVenueCapture.Venue> value = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(1);
        onMain(() -> {
            Consumer<SavedVenueCapture.Venue> callback = venue -> { value.set(venue); ready.countDown(); };
            invoke("readSavedVenue", new Class<?>[]{Consumer.class}, callback);
        });
        assertTrue("Venue heading callback missing", ready.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    private void fixtureJavascript(String script) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        onMain(() -> web.evaluateJavascript("(() => {" + script + "})()", ignored -> ready.countDown()));
        assertTrue("Owned fixture update missing", ready.await(5, TimeUnit.SECONDS));
    }

    private void awaitOwnedResponse(int token) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < deadline) {
            CountDownLatch measured = new CountDownLatch(1);
            AtomicReference<String> response = new AtomicReference<>();
            onMain(() -> web.evaluateJavascript("(function(){const m=document.querySelector('meta[name=owned-response]');return m ? Number(m.content) : -1;})()",
                    result -> { response.set(result); measured.countDown(); }));
            assertTrue("Owned response marker callback missing", measured.await(5, TimeUnit.SECONDS));
            if (Integer.toString(token).equals(response.get())) { assertOwnedDocument(token); return; }
            SystemClock.sleep(25);
        }
        fail("Replacement owned response " + token + " was not rendered; events=" + String.join(" | ", events));
    }

    private void tapOwnedVenueButton() throws Exception {
        CountDownLatch measured = new CountDownLatch(1);
        AtomicReference<String> geometry = new AtomicReference<>();
        AtomicReference<int[]> screen = new AtomicReference<>();
        onMain(() -> {
            int[] origin = new int[2]; web.getLocationOnScreen(origin);
            screen.set(new int[]{origin[0], origin[1], web.getWidth()});
            // Measure only our own fixture; the history mutation must follow a
            // real touch, so Chromium does not mark the entry as skippable.
            web.evaluateJavascript("(function(){const r=document.getElementById('open-venue').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth];})()",
                    result -> { geometry.set(result); measured.countDown(); });
        });
        assertTrue("Owned fixture button geometry missing", measured.await(5, TimeUnit.SECONDS));
        JSONArray point = new JSONArray(geometry.get());
        double scale = screen.get()[2] / point.getDouble(2);
        float x = (float) (screen.get()[0] + point.getDouble(0) * scale);
        float y = (float) (screen.get()[1] + point.getDouble(1) * scale);
        long downAt = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downAt, downAt, MotionEvent.ACTION_DOWN, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { instrumentation.sendPointerSync(down); } finally { down.recycle(); }
        SystemClock.sleep(50);
        MotionEvent up = MotionEvent.obtain(downAt, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { instrumentation.sendPointerSync(up); } finally { up.recycle(); }
    }

    private AlertDialog currentDialog() {
        try {
            Field field = SavedVenuesUi.class.getDeclaredField("currentDialog"); field.setAccessible(true);
            return (AlertDialog) field.get(savedUi);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private Object get(String name) {
        try { Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); return field.get(activity); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private void set(String name, Object value) {
        try { Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); field.set(activity, value); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private Object invoke(String name) { return invoke(name, new Class<?>[0]); }

    private Object invoke(String name, Class<?>[] types, Object... values) {
        try { Method method = MainActivity.class.getDeclaredMethod(name, types); method.setAccessible(true); return method.invoke(activity, values); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private void onMain(Runnable action) {
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Instrumentation runner = instrumentation;
        runner.runOnMainSync(() -> {
            try { action.run(); }
            catch (Throwable error) { failure.set(error); }
        });
        Throwable error = failure.get();
        if (error instanceof Error) throw (Error) error;
        if (error instanceof RuntimeException) throw (RuntimeException) error;
        if (error != null) throw new AssertionError(error);
    }

    private static WebResourceRequest mainFrameRequest(String url) {
        return new WebResourceRequest() {
            @Override public Uri getUrl() { return Uri.parse(url); }
            @Override public boolean isForMainFrame() { return true; }
            @Override public boolean isRedirect() { return false; }
            @Override public boolean hasGesture() { return false; }
            @Override public String getMethod() { return "GET"; }
            @Override public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }

}
