package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;
import org.json.JSONObject;
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
          return {origin: location.origin, path: location.pathname.slice(0,100), title, challenge,
            marker: document.documentElement.getAttribute('data-dovebevo-mobile-shell') === '1',
            search: !!document.querySelector('header.top button.search-field'),
            input: !!document.querySelector('input[role="combobox"][aria-autocomplete="list"]'),
            milanoOptions: milano.length, ready: map?.getAttribute('data-ready') === 'true',
            center: (map?.getAttribute('data-center') || '').slice(0,60),
            zoom: Number(map?.getAttribute('data-zoom') || 0),
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
