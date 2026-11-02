package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;

/** Opt-in real HTTPS browsing, never a contribution or a protection bypass. */
public final class PublicBrowseRuntimeTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;
    private WebView web;
    private SharedPreferences rules;
    private boolean hadRulesVersion;
    private String priorRulesVersion;
    private File captureDirectory;
    private boolean runtimeContainmentDiagnostic;
    private final JSONArray capturedImages = new JSONArray();

    // Read only fixed, bounded public document state. Never retain body text, query tokens or storage.
    private static final String STATE = """
        (() => {
          const map = document.querySelector('section.map');
          const canvas = map && map.querySelector('canvas.maplibregl-canvas');
          const title = (document.title || '').replace(/[\\x00-\\x1f\\x7f]/g, '').slice(0, 100);
          const challenge = !!document.querySelector('#challenge-form,#challenge-running,#challenge-stage,[id^="cf-chl-"],iframe[src*="challenges.cloudflare.com"]') ||
            /just a moment|checking your browser|verify you are human|enable javascript and cookies to continue|verifica di essere umano/i.test(title + ' ' + (document.body?.innerText || '').slice(0, 2048));
          const options = [...document.querySelectorAll('[role="listbox"] [role="option"]')];
          const milano = options.filter(o => /-p[0-9]+$/.test(o.id) && o.querySelector('.row__name')?.textContent.trim() === 'Milano');
          const v = window.visualViewport, r = canvas?.getBoundingClientRect();
          const sheet = document.querySelector('dialog[open]')?.getBoundingClientRect();
          const metas = [...document.querySelectorAll('meta[name="viewport"]')];
          const css = e => {if (!e) return null; const s=getComputedStyle(e), out={};
            for(const k of ['width','height','minWidth','maxWidth','minHeight','maxHeight','zoom','transform','position','overflowX','overflowY']) out[k]=(s[k]||'').slice(0,100);
            return out;};
          return {origin: location.origin, path: location.pathname.slice(0,100), title, challenge,
            marker: document.documentElement.getAttribute('data-dovebevo-mobile-shell') === '1',
            search: !!document.querySelector('header.top button.search-field'),
            input: !!document.querySelector('input[role="combobox"][aria-autocomplete="list"]'),
            milanoOptions: milano.length, listOptions: document.querySelectorAll('dialog[open] a.row[href^="/bar/"]').length, ready: map?.getAttribute('data-ready') === 'true',
            center: (map?.getAttribute('data-center') || '').slice(0,60),
            zoom: Number(map?.getAttribute('data-zoom') || 0),
            venueHeading: (document.querySelector('h2.scontrino__name')?.textContent || '').trim().slice(0,120),
            viewport: {innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,scrollX,scrollY,
              screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight},
              topFrame:window.top===window,viewportMetaCount:metas.length,viewportMetas:metas.slice(0,8).map(m=>(m.content||'').slice(0,200)),
              computed:{html:css(document.documentElement),body:css(document.body),app:css(document.querySelector('.app')),
                strip:css(document.querySelector('.mobile-drink-strip')),option:css(document.querySelector('.drink-option'))},
              clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,
              bodyWidth:document.body?.getBoundingClientRect().width,bodyHeight:document.body?.getBoundingClientRect().height,
              documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
              meta:(document.querySelector('meta[name="viewport"]')?.content || '').slice(0,200),
              visual:v?{width:v.width,height:v.height,scale:v.scale,left:v.offsetLeft,top:v.offsetTop}:null,
              canvas:r?{left:r.left,top:r.top,width:r.width,height:r.height}:null,
              sheet:sheet?{left:sheet.left,top:sheet.top,width:sheet.width,height:sheet.height}:null,
              overflow:[...document.querySelectorAll('body *')].map(e=>{const r=e.getBoundingClientRect();
                return {tag:e.tagName,cls:(typeof e.className==='string'?e.className:'').slice(0,80),
                  x:r.x,y:r.y,w:r.width,h:r.height,offsetParent:e.offsetParent?{tag:e.offsetParent.tagName,cls:(typeof e.offsetParent.className==='string'?e.offsetParent.className:'').slice(0,80)}:null};}).filter(r=>r.w>0&&r.h>0&&(r.x<0||r.x+r.w>document.documentElement.clientWidth+2)).slice(0,20)},
            canvas: !!canvas && canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0};
        })()
        """;

    // These are ordinary search UI events, not calls to product handlers or an application bridge.
    private static final String OPEN_SEARCH = """
        (() => {
          const b = document.querySelector('header.top button.search-field');
          if (!b || b.disabled) return false;
          b.click(); return true;
        })()
        """;
    private static final String TYPE_CITY = """
        (() => {
          const input = document.querySelector('input[role="combobox"][aria-autocomplete="list"]');
          if (!input || input.disabled) return false;
          input.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Milano');
          input.dispatchEvent(new Event('input', {bubbles:true}));
          return true;
        })()
        """;
    private static final String CHOOSE_CITY = """
        (() => {
          const matches = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
            .filter(o => /-p[0-9]+$/.test(o.id) && o.querySelector('.row__name')?.textContent.trim() === 'Milano');
          if (matches.length !== 1) return false;
          matches[0].click(); return true;
        })()
        """;

    @Before public void setUp() {
        // Must precede preference changes, Activity launch and every possible network operation.
        Assume.assumeTrue("Opt in explicitly with -e publicBrowse true; default runs remain offline fixtures",
                "true".equals(InstrumentationRegistry.getArguments().getString("publicBrowse")));
        assertTrue("NativeFixtureRunner must select a fresh isolated WebView profile before launch",
                NativeFixtureRunner.isolatedProfileReady);
        rules = instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules", 0);
        hadRulesVersion = rules.contains("accepted_rules_version");
        priorRulesVersion = rules.getString("accepted_rules_version", null);
        // Only local acceptance state changes; the exact original key is restored in tearDown.
        assertTrue(rules.edit().putString("accepted_rules_version", RulesAcceptance.VERSION).commit());
        activity = (MainActivity) instrumentation.startActivitySync(
                new Intent(instrumentation.getTargetContext(), MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        onMain(() -> web = findWebView(activity.getWindow().getDecorView()));
        assertNotNull("Normal MainActivity must create its real browser", web);
    }

    @After public void tearDown() {
        try {
            if (activity != null) onMain(() -> {
                if (web != null) web.stopLoading();
                activity.finish();
            });
        } finally {
            if (rules != null) {
                SharedPreferences.Editor editor = rules.edit();
                if (hadRulesVersion) editor.putString("accepted_rules_version", priorRulesVersion);
                else editor.remove("accepted_rules_version");
                assertTrue("Restore only the original local rules key", editor.commit());
            }
        }
    }

    @Test(timeout = 90000) public void nativeTransportReadsActualEuropeanPricesWithoutBrowserCredentials() throws Exception {
        FavoritePricesClient.Call call = new FavoritePricesClient.Call(System.nanoTime() + TimeUnit.SECONDS.toNanos(60));
        try {
            EuropePricesClient client = new EuropePricesClient(new FavoritePricesClient.HttpsTransport(),
                    () -> java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString());
            EuropePrices.Catalog catalog = client.catalog(call);
            int rows = 0;
            for (String key : new String[]{"n6044678286", "n329135152"}) {
                EuropePrices.Venue venue = catalog.venues.get(key);
                assertNotNull("Actual imported venue must remain in the live catalogue", venue);
                EuropePrices.Cell snapshot = client.venue(key, venue.cell, catalog, call);
                assertFalse("Actual imported prices must be available through the production native transport", snapshot.prices.isEmpty());
                int menus = 0;
                for (EuropePrices.Price price : snapshot.prices) {
                    assertEquals(key, price.venue);
                    assertEquals(venue.currency, price.currency);
                    assertEquals(key.equals("n6044678286") ? "GBP" : "EUR", price.currency);
                    if (price.sourceKind.equals("online_menu")) {
                        assertNull("A source check cannot become a customer observation", price.observedOn);
                        assertNotNull(price.sourceCheckedOn);
                        menus++;
                    }
                }
                assertTrue("At least one genuine imported menu row is required", menus > 0);
                rows += snapshot.prices.size();
            }
            Bundle result = new Bundle();
            result.putString("native_public_prices", "PASS actual GBP and EUR venue prices; catalog=" + catalog.version + "; rows=" + rows);
            instrumentation.sendStatus(0, result);
        } finally { call.cancel(); }
    }

    @Test(timeout = 180000) public void productionMobileSearchSelectsMilanoAndReadiesItsMap() throws Exception {
        awaitState("mobile-document", 45, s -> s.optBoolean("marker") && s.optBoolean("search"));
        assertEquals("Only open normal search", "true", evaluate(OPEN_SEARCH));
        awaitState("search-input", 10, s -> s.optBoolean("input"));
        assertEquals("Only enter the fixed city query", "true", evaluate(TYPE_CITY));
        awaitState("milano-city-option", 30, s -> s.optInt("milanoOptions") == 1);
        assertEquals("Select the unique actual city result, never a venue proposal", "true", evaluate(CHOOSE_CITY));
        JSONObject finalState = awaitState("milano-map", 60, PublicBrowseRuntimeTest::milanoMapReady);
        // Small public state only, suitable for instrumentation output; no screenshots or raw HTML.
        Bundle result = new Bundle();
        result.putString("public_browse", "PASS marker + actual Milano city option + map readiness; " + finalState);
        instrumentation.sendStatus(0, result);
    }

    @Test(timeout = 240000) public void storeCaptureShowsActualMilanoMapDiscoveryAndVenue() throws Exception {
        // A second explicit opt-in is required. Normal public browsing never captures pixels.
        Assume.assumeTrue("Store capture requires -e storeCapture true in addition to publicBrowse",
                "true".equals(InstrumentationRegistry.getArguments().getString("storeCapture")));
        String requestedBuild = InstrumentationRegistry.getArguments().getString("expectedBuildNumber");
        assertNotNull("Store capture requires explicit expectedBuildNumber", requestedBuild);
        assertTrue("expectedBuildNumber must be a positive decimal Android version code",
                requestedBuild.matches("[1-9][0-9]{0,9}"));
        long expectedBuild = Long.parseLong(requestedBuild);
        assertTrue("expectedBuildNumber must not exceed Android's version-code bound",
                expectedBuild <= 2100000000L);
        PackageInfo app = instrumentation.getTargetContext().getPackageManager()
                .getPackageInfo(instrumentation.getTargetContext().getPackageName(), 0);
        assertEquals("Capture only the explicitly intended build number", expectedBuild, app.getLongVersionCode());
        assertEquals("1.0.0", app.versionName);
        captureDirectory = new File(instrumentation.getTargetContext().getFilesDir(),
                "store-captures-20261102/" + UUID.randomUUID());
        assertTrue("Create a fresh owned app capture directory", captureDirectory.mkdirs());
        awaitVisibleBrowser();
        awaitState("initial-mobile-document", 45,
                s -> s.optBoolean("marker") && s.optBoolean("search"));
        Thread.sleep(800);
        Bundle initialProbe = new Bundle(); initialProbe.putString("store_initial_state", new JSONObject(evaluate(STATE)).toString());
        instrumentation.sendStatus(0, initialProbe);
        capture("diagnostic-initial-page", new JSONObject(evaluate(STATE)), app);
        tapDocumentControl("document.querySelector('header.top button.search-field')");
        awaitState("search-input", 10, s -> s.optBoolean("input"));
        tapDocumentControl("document.querySelector('input[role=\"combobox\"][aria-autocomplete=\"list\"]')");
        instrumentation.sendStringSync("Milano");
        awaitState("milano-city-option", 30, s -> s.optInt("milanoOptions") == 1);
        dismissVisibleKeyboard();
        awaitState("search-after-keyboard", 5, s -> s.optBoolean("input") && s.optInt("milanoOptions") == 1);
        tapDocumentControl("[...document.querySelectorAll('[role=\"listbox\"] [role=\"option\"]')].find(o => /-p[0-9]+$/.test(o.id) && o.querySelector('.row__name')?.textContent.trim() === 'Milano')");
        awaitState("milano-map", 60, PublicBrowseRuntimeTest::milanoMapReady);
        Thread.sleep(1500); // Let the genuine map's paint/transition settle after its readiness signal.
        JSONObject mapState = new JSONObject(evaluate(STATE));
        assertVisibleMapGeometry(mapState);
        capture("milano-map", mapState, app);

        onMain(() -> {
            View home = activity.findViewById(R.id.home);
            assertTrue(home.isShown() && home.isEnabled());
            home.performClick();
        });
        awaitDiscovery(false);
        onMain(() -> ((Spinner) activity.findViewById(R.id.discovery_drink))
                .setSelection(RecommendationDrink.BEER_DRAFT.ordinal()));
        JSONObject discovery = awaitDiscovery(true);
        Thread.sleep(400);
        capture("milano-native-scopri-beer", discovery, app);

        onMain(() -> {
            LinearLayout rows = activity.findViewById(R.id.discovery_rows);
            assertTrue("Open only an actually returned production venue", rows.getChildCount() > 0);
            View open = rows.getChildAt(0).findViewById(R.id.discovery_open);
            assertTrue(open.isShown() && open.isEnabled());
            open.performClick();
        });
        awaitState("actual-venue", 45,
                s -> s.optBoolean("marker") && !s.optString("venueHeading").isEmpty());
        Thread.sleep(500);
        JSONObject venueState = new JSONObject(evaluate(STATE));
        assertVisibleVenueGeometry(venueState);
        capture("milano-actual-venue", venueState, app);
    }

    @Test(timeout = 180000) public void diagnosticDrinkContainmentRestoresTheActualViewportWithoutPanning() throws Exception {
        Assume.assumeTrue("Explicit diagnostic only; never a store capture",
                "true".equals(InstrumentationRegistry.getArguments().getString("containmentDiagnostic")));
        runtimeContainmentDiagnostic = true;
        PackageInfo app = instrumentation.getTargetContext().getPackageManager()
                .getPackageInfo(instrumentation.getTargetContext().getPackageName(), 0);
        captureDirectory = new File(instrumentation.getTargetContext().getFilesDir(),
                "viewport-containment-diagnostic-20261102/" + UUID.randomUUID());
        assertTrue(captureDirectory.mkdirs());
        awaitVisibleBrowser();
        awaitState("diagnostic-original-document", 45, s -> s.optBoolean("marker") && s.optBoolean("search"));
        tapDocumentControl("document.querySelector('header.top button.search-field')");
        awaitState("diagnostic-search-input", 10, s -> s.optBoolean("input"));
        tapDocumentControl("document.querySelector('input[role=\"combobox\"][aria-autocomplete=\"list\"]')");
        instrumentation.sendStringSync("Milano");
        awaitState("diagnostic-milano-option", 30, s -> s.optInt("milanoOptions") == 1);
        dismissVisibleKeyboard();
        tapDocumentControl("[...document.querySelectorAll('[role=\"listbox\"] [role=\"option\"]')].find(o => /-p[0-9]+$/.test(o.id) && o.querySelector('.row__name')?.textContent.trim() === 'Milano')");
        awaitState("diagnostic-original-map", 60, PublicBrowseRuntimeTest::milanoMapReady);
        Thread.sleep(500);
        JSONObject before = new JSONObject(evaluate(STATE));
        assertTrue("The original overflow must reproduce before this narrow causal experiment",
                before.getJSONObject("viewport").getDouble("innerWidth") > before.getJSONObject("viewport").getDouble("clientWidth") * 1.5);
        capture("DIAGNOSTIC-ONLY-before-containment", before, app);
        // Explicitly authorized A/B experiment only. Never run in the store-capture method.
        // One CSS property only; no scroll, zoom, viewport, content, security or request changes.
        assertEquals("Exactly the nine actual filter options receive the diagnostic property", "9",
                evaluate("(() => {const options=[...document.querySelectorAll('.mobile-drink-strip .drink-option')]; for(const e of options)e.style.position='relative'; return options.length;})()"));
        JSONObject after = awaitState("diagnostic-contained-map", 10, value -> {
            JSONObject v = value.optJSONObject("viewport");
            return v != null && Math.abs(v.optDouble("innerWidth") - v.optDouble("clientWidth")) <= 2;
        });
        assertVisibleMapGeometry(after);
        Thread.sleep(1000); // Settle the real WebView compositor after the causal layout change.
        capture("DIAGNOSTIC-ONLY-after-containment", new JSONObject(evaluate(STATE)), app);
        Bundle measured = new Bundle(); measured.putString("containment_diagnostic", "DIAGNOSTIC ONLY runtime CSS property; before=" + before + "; after=" + after);
        instrumentation.sendStatus(0, measured);
        // Stay in this actual document: native Scopri reopening would navigate a fresh document
        // and correctly discard the one-off diagnostic property.
        tapDocumentControl("document.querySelector('button.map__list')");
        awaitState("diagnostic-actual-map-list", 10, value -> value.optInt("listOptions") > 0);
        tapDocumentControl("document.querySelector('dialog[open] a.row[href^=\"/bar/\"]')");
        JSONObject venue = awaitState("diagnostic-actual-venue", 45, value -> value.optBoolean("marker") && !value.optString("venueHeading").isEmpty());
        assertVisibleVenueGeometry(venue);
        Thread.sleep(500);
        capture("DIAGNOSTIC-ONLY-contained-venue", new JSONObject(evaluate(STATE)), app);
    }

    private static void assertVisibleMapGeometry(JSONObject state) throws Exception {
        JSONObject viewport = state.getJSONObject("viewport"), visual = viewport.getJSONObject("visual");
        JSONObject canvas = viewport.getJSONObject("canvas");
        double left = visual.getDouble("left"), top = visual.getDouble("top");
        double width = visual.getDouble("width"), height = visual.getDouble("height");
        double visibleWidth = Math.max(0, Math.min(left + width, canvas.getDouble("left") + canvas.getDouble("width"))
                - Math.max(left, canvas.getDouble("left")));
        double visibleHeight = Math.max(0, Math.min(top + height, canvas.getDouble("top") + canvas.getDouble("height"))
                - Math.max(top, canvas.getDouble("top")));
        assertTrue("The actual map must be visible, not merely ready behind a panned viewport: " + viewport,
                visibleWidth >= canvas.getDouble("width") * 0.95 && visibleHeight >= canvas.getDouble("height") * 0.95);
    }

    private static void assertVisibleVenueGeometry(JSONObject state) throws Exception {
        JSONObject viewport = state.getJSONObject("viewport"), visual = viewport.getJSONObject("visual");
        JSONObject sheet = viewport.getJSONObject("sheet");
        assertTrue("The venue sheet must fit the actual visible phone width: " + viewport,
                sheet.getDouble("left") >= visual.getDouble("left") - 2
                && sheet.getDouble("left") + sheet.getDouble("width") <= visual.getDouble("left") + visual.getDouble("width") + 2);
    }

    private JSONObject awaitDiscovery(boolean requireRows) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(65);
        AtomicReference<JSONObject> measured = new AtomicReference<>();
        while (System.nanoTime() < deadline) {
            onMain(() -> {
                View screen = activity.findViewById(R.id.discovery_screen);
                TextView status = activity.findViewById(R.id.discovery_status);
                LinearLayout rows = activity.findViewById(R.id.discovery_rows);
                Spinner drink = activity.findViewById(R.id.discovery_drink);
                View refresh = activity.findViewById(R.id.discovery_refresh);
                JSONObject value = new JSONObject();
                try {
                    value.put("screen", "native-scopri");
                    value.put("visible", screen != null && screen.isShown());
                    value.put("status", status == null ? "" : status.getText().toString());
                    value.put("rows", rows == null ? 0 : rows.getChildCount());
                    value.put("drink", drink == null ? -1 : drink.getSelectedItemPosition());
                    value.put("settled", refresh != null && refresh.isEnabled());
                } catch (org.json.JSONException invalid) { throw new AssertionError(invalid); }
                measured.set(value);
            });
            JSONObject value = measured.get();
            if (value.optBoolean("visible") && value.optBoolean("settled")
                    && (!requireRows || (value.optInt("rows") > 0
                    && value.optInt("drink") == RecommendationDrink.BEER_DRAFT.ordinal()))) return value;
            Thread.sleep(200);
        }
        fail("Actual native Scopri data not ready; no fixture or synthetic fallback: " + measured.get());
        return measured.get();
    }

    private void awaitVisibleBrowser() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        AtomicReference<Boolean> ready = new AtomicReference<>(false);
        while (System.nanoTime() < deadline) {
            onMain(() -> ready.set(web.isShown() && web.hasWindowFocus() && web.getWidth() > 0 && web.getHeight() > 0));
            if (ready.get()) return;
            Thread.sleep(100);
        }
        fail("Do not touch an invisible or unfocused loading browser");
    }

    private void tapDocumentControl(String fixedExpression) throws Exception {
        JSONObject point = new JSONObject(evaluate("(() => { const e=" + fixedExpression
                + "; if (!e || e.disabled) return {}; const r=e.getBoundingClientRect(),v=visualViewport;"
                + "return {x:r.left+r.width/2-(v?.offsetLeft||0),y:r.top+r.height/2-(v?.offsetTop||0),width:r.width,height:r.height}; })()"));
        AtomicReference<float[]> measured = new AtomicReference<>();
        AtomicReference<Integer> imeBottom = new AtomicReference<>(0);
        onMain(() -> {
            int[] origin = new int[2]; web.getLocationOnScreen(origin);
            measured.set(new float[]{origin[0], origin[1], web.getScale(), web.getWidth(), web.getHeight()});
            if (Build.VERSION.SDK_INT >= 30 && activity.getWindow().getDecorView().getRootWindowInsets() != null) {
                WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
                if (insets.isVisible(WindowInsets.Type.ime())) imeBottom.set(insets.getInsets(WindowInsets.Type.ime()).bottom);
            }
        });
        assertTrue("Actual visible control must have geometry", point.optDouble("width") > 0 && point.optDouble("height") > 0);
        float[] frame = measured.get();
        float x = (float) point.getDouble("x") * frame[2], y = (float) point.getDouble("y") * frame[2];
        assertTrue("Do not click an off-screen control", x >= 0 && x < frame[3] && y >= 0 && y < frame[4]);
        Bundle probe = new Bundle();
        probe.putString("store_pointer_geometry", point + " origin=" + frame[0] + "," + frame[1]
                + " scale=" + frame[2] + " native=" + frame[3] + "x" + frame[4] + " imeBottom=" + imeBottom.get());
        instrumentation.sendStatus(0, probe);
        assertTrue("Do not inject into the keyboard window", imeBottom.get() == 0
                || frame[1] + y < activity.getResources().getDisplayMetrics().heightPixels - imeBottom.get());
        long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, frame[0]+x, frame[1]+y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { instrumentation.sendPointerSync(down); } finally { down.recycle(); }
        Thread.sleep(50);
        MotionEvent up = MotionEvent.obtain(time, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, frame[0]+x, frame[1]+y, 0);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { instrumentation.sendPointerSync(up); } finally { up.recycle(); }
    }

    private void dismissVisibleKeyboard() throws Exception {
        AtomicReference<Boolean> visible = new AtomicReference<>(false);
        onMain(() -> {
            WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
            visible.set(Build.VERSION.SDK_INT >= 30 && insets != null && insets.isVisible(WindowInsets.Type.ime()));
        });
        if (!visible.get()) return;
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        Thread.sleep(500);
    }

    private void capture(String name, JSONObject publicState, PackageInfo app) throws Exception {
        assertNotNull("Capture directory exists only after explicit opt-in", captureDirectory);
        instrumentation.waitForIdleSync();
        Bitmap image = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull("UiAutomation must return the original owned-emulator frame", image);
        File target = new File(captureDirectory, name + ".png");
        assertTrue("Never overwrite an original capture", target.createNewFile());
        int width = image.getWidth(), height = image.getHeight();
        try (FileOutputStream stream = new FileOutputStream(target)) {
            assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, stream));
            stream.getFD().sync();
        } finally { image.recycle(); }
        StringBuilder hash = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(java.nio.file.Files.readAllBytes(target.toPath())))
            hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        capturedImages.put(new JSONObject().put("file", target.getName()).put("width", width)
                .put("height", height).put("sha256", hash.toString()).put("captured_at", Instant.now().toString())
                .put("public_state", publicState));
        JSONObject provenance = new JSONObject().put("schema_version", 1).put("package", app.packageName)
                .put("version_name", app.versionName).put("version_code", app.getLongVersionCode())
                .put("sdk_int", Build.VERSION.SDK_INT).put("device_model", Build.MODEL)
                .put("method", "Instrumentation UiAutomation.takeScreenshot; original lossless PNG; no edits")
                .put("production_https", "https://www.dovebevo.com").put("public_contributions", 0)
                .put("purpose", runtimeContainmentDiagnostic ? "DIAGNOSTIC ONLY runtime CSS property; forbidden as store assets" : "unaltered production candidate")
                .put("images", capturedImages);
        AtomicReference<JSONObject> frame = new AtomicReference<>();
        onMain(() -> {
            try {
                frame.set(new JSONObject().put("width", web.getWidth()).put("height", web.getHeight())
                        .put("scroll_x", web.getScrollX()).put("scroll_y", web.getScrollY())
                        .put("scale", web.getScale()).put("wide_viewport", web.getSettings().getUseWideViewPort())
                        .put("overview", web.getSettings().getLoadWithOverviewMode())
                        .put("text_zoom", web.getSettings().getTextZoom()));
                android.util.DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
                android.content.res.Configuration config = activity.getResources().getConfiguration();
                frame.get().put("display_metrics", new JSONObject().put("width_pixels", metrics.widthPixels)
                        .put("height_pixels", metrics.heightPixels).put("density", metrics.density)
                        .put("density_dpi", metrics.densityDpi).put("scaled_density", metrics.scaledDensity));
                frame.get().put("configuration", new JSONObject().put("screen_width_dp", config.screenWidthDp)
                        .put("screen_height_dp", config.screenHeightDp).put("font_scale", config.fontScale));
                if (Build.VERSION.SDK_INT >= 30 && activity.getWindow().getDecorView().getRootWindowInsets() != null) {
                    WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
                    android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    frame.get().put("ime_visible", insets.isVisible(WindowInsets.Type.ime())).put("ime_bottom", ime.bottom);
                }
            } catch (org.json.JSONException invalid) { throw new AssertionError(invalid); }
        });
        capturedImages.getJSONObject(capturedImages.length() - 1).put("native_web_frame", frame.get());
        try (FileOutputStream stream = new FileOutputStream(new File(captureDirectory, "provenance.json"))) {
            stream.write((provenance.toString(2) + "\n").getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
        Bundle result = new Bundle();
        result.putString("store_capture_directory", captureDirectory.getAbsolutePath());
        result.putString("store_capture_image", target.getName() + " sha256=" + hash);
        instrumentation.sendStatus(0, result);
    }

    private JSONObject awaitState(String stage, int seconds, Predicate<JSONObject> condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        JSONObject state = new JSONObject();
        while (System.nanoTime() < deadline) {
            state = new JSONObject(evaluate(STATE));
            if (state.optBoolean("challenge"))
                fail("PUBLIC_BROWSE_BLOCKED_BY_CLOUDFLARE; no challenge interaction attempted; stage=" + stage + " state=" + state);
            String origin = state.optString("origin");
            if (!origin.isEmpty() && !"null".equals(origin)) {
                assertEquals("Unexpected document origin; stage=" + stage + " state=" + state,
                        "https://www.dovebevo.com", origin);
                assertTrue("Unexpected document path; stage=" + stage + " state=" + state,
                        "/mobile/".equals(state.optString("path")) || "/mobile/index.html".equals(state.optString("path")));
            }
            if (condition.test(state)) return state;
            Thread.sleep(200);
        }
        fail("PUBLIC_BROWSE_NOT_READY; stage=" + stage + " public state=" + state);
        return state;
    }

    private static boolean milanoMapReady(JSONObject state) {
        double zoom = state.optDouble("zoom");
        if (!state.optBoolean("marker") || !state.optBoolean("ready") || !state.optBoolean("canvas")
                || state.optBoolean("input") || !Double.isFinite(zoom) || zoom < 13) return false;
        String[] center = state.optString("center").split(",", -1);
        if (center.length != 2) return false;
        try {
            double lat = Double.parseDouble(center[0]), lon = Double.parseDouble(center[1]);
            return Double.isFinite(lat) && Double.isFinite(lon)
                    && lat >= 45.40 && lat <= 45.55 && lon >= 9.08 && lon <= 9.30;
        } catch (NumberFormatException invalid) { return false; }
    }

    private String evaluate(String fixedScript) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        onMain(() -> web.evaluateJavascript(fixedScript, result -> { value.set(result); completed.countDown(); }));
        assertTrue("Public document callback timed out", completed.await(5, TimeUnit.SECONDS));
        assertNotNull("Public document callback missing", value.get());
        return value.get();
    }

    private void onMain(Runnable action) {
        instrumentation.runOnMainSync(action);
        instrumentation.waitForIdleSync();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
}
