package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;

/** A frozen venue context with authoritative snapshots and one outstanding request. */
final class RecommendationsUi {
    interface Api {
        DrinkRecommendations get(String canonical, RecommendationsClient.Cancellation cancellation) throws IOException;
        DrinkRecommendations set(String canonical, RecommendationDrink drink, boolean selected, RecommendationsClient.Cancellation cancellation) throws IOException;
    }
    private final Activity activity;
    private final Api api;
    private final TestLabPolicy policy;
    private final Supplier<String> eligible;
    private final ExecutorService worker;
    private final Handler main = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private SavedVenueCapture.Venue venue;
    private RecommendationSession session;
    private RecommendationsClient.Cancellation cancellation;
    private TextView status;
    private LinearLayout rows;
    private Button refresh;
    private boolean paused, closed;
    private int message;
    RecommendationsUi(Activity activity, Api api, TestLabPolicy policy, Supplier<String> eligible) {
        this(activity, api, policy, eligible, Executors.newSingleThreadExecutor());
    }
    RecommendationsUi(Activity activity, Api api, TestLabPolicy policy, Supplier<String> eligible, ExecutorService worker) {
        this.activity = activity; this.api = api; this.policy = policy; this.eligible = eligible; this.worker = worker;
    }
    void show(SavedVenueCapture.Venue selected) {
        dismiss();
        if (closed || paused || selected == null || !selected.url.equals(eligible.get())) return;
        venue = selected;
        String key = selected.url.substring(selected.url.indexOf("/bar/") + 5, selected.url.indexOf('?'));
        session = new RecommendationSession(key);
        LinearLayout body = new LinearLayout(activity); body.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(16 * activity.getResources().getDisplayMetrics().density);
        body.setPadding(padding, padding, padding, padding);
        TextView heading = new TextView(activity); heading.setText(selected.name); heading.setTextSize(20); body.addView(heading);
        TextView explanation = new TextView(activity); explanation.setText(R.string.recommendation_explanation); body.addView(explanation);
        status = new TextView(activity); status.setId(R.id.recommendation_status);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); body.addView(status);
        refresh = new Button(activity); refresh.setId(R.id.recommendation_refresh); refresh.setText(R.string.recommendation_refresh);
        refresh.setOnClickListener(view -> request(session.refresh())); body.addView(refresh);
        rows = new LinearLayout(activity); rows.setId(R.id.recommendation_rows); rows.setOrientation(LinearLayout.VERTICAL);
        body.addView(rows, new LinearLayout.LayoutParams(-1, -2));
        // The entire content scrolls, so large system text cannot squeeze the drink rows out below a fixed header.
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        AlertDialog current = new AlertDialog.Builder(activity).setTitle(R.string.recommendation_title).setView(scroll)
                .setNegativeButton(R.string.close, (value, which) -> {}).create();
        dialog = current;
        current.setOnDismissListener(value -> { if (dialog == current) retire(); });
        dialog.show();
        // Give the native list bounded space while preserving small-screen scrolling.
        if (dialog.getWindow() != null) dialog.getWindow().setLayout(-1, Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.85f));
        request(session.refresh());
    }
    private void request(RecommendationSession.Request request) {
        if (request == null || !contextValid()) return;
        RecommendationSession source = session;
        SavedVenueCapture.Venue context = venue;
        RecommendationsClient.Cancellation call = new RecommendationsClient.Cancellation(); cancellation = call;
        message = R.string.recommendation_loading; render();
        worker.execute(() -> {
            DrinkRecommendations result = null;
            try { result = request.isWrite() ? api.set(context.url, request.drink, request.recommended, call) : api.get(context.url, call); }
            catch (IOException | RuntimeException unavailable) { /* Only fixed native status is shown. */ }
            DrinkRecommendations snapshot = result;
            main.post(() -> {
                if (session != source || !contextValid() || !source.accepts(request)) return;
                cancellation = null;
                if (snapshot != null && source.accept(request, snapshot)) message = R.string.recommendation_ready;
                else { source.fail(request); message = request.isWrite() ? R.string.recommendation_unknown : R.string.recommendation_unavailable; }
                render();
            });
        });
    }
    private boolean contextValid() {
        return !closed && !paused && dialog != null && dialog.isShowing() && venue != null && venue.url.equals(eligible.get());
    }
    private void render() {
        if (dialog == null || session == null) return;
        status.setText(policy.isReadOnly() ? activity.getString(R.string.recommendation_read_only) + "\n" + activity.getString(message) : activity.getString(message));
        refresh.setEnabled(!paused && !session.isPending());
        rows.removeAllViews();
        DrinkRecommendations snapshot = session.snapshot();
        if (snapshot == null) return;
        for (DrinkRecommendations.Row row : snapshot.sortedRows()) {
            Button button = new Button(activity); button.setAllCaps(false); button.setId(R.id.recommendation_row); button.setTag(row.drink.code);
            String count = row.count == 0 ? activity.getString(R.string.recommendation_zero)
                    : activity.getResources().getQuantityString(R.plurals.recommendation_count, row.count == 1 ? 1 : 2, row.count);
            String action = activity.getString(row.recommended ? R.string.recommendation_undo : R.string.recommendation_add);
            String label = row.drink.label + " · " + count + "\n" + action;
            button.setText(label); button.setContentDescription(label); button.setSelected(row.recommended);
            button.setEnabled(!paused && !policy.isReadOnly() && session.canWrite());
            button.setOnClickListener(view -> { if (contextValid() && !policy.isReadOnly()) request(session.toggle(row.drink)); });
            rows.addView(button, new LinearLayout.LayoutParams(-1, -2));
        }
    }
    void contextChanged() { if (venue != null && !venue.url.equals(eligible.get())) dismiss(); }
    void pause() {
        paused = true;
        if (session != null) session.pause();
        if (cancellation != null) cancellation.cancel(); cancellation = null;
        message = R.string.recommendation_paused; render();
    }
    void resume() {
        paused = false;
        if (session == null) return;
        if (!contextValid()) { dismiss(); return; }
        session.resume(); request(session.refresh());
    }
    void dismiss() { AlertDialog previous = dialog; retire(); if (previous != null) previous.dismiss(); }
    private void retire() {
        if (session != null) session.pause();
        if (cancellation != null) cancellation.cancel(); cancellation = null;
        session = null; venue = null; dialog = null;
    }
    void close() { closed = true; dismiss(); worker.shutdownNow(); }
}
