package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
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
    private RecommendationDrink focused;
    private RecommendationSession session;
    private RecommendationsClient.Cancellation cancellation;
    private TextView status;
    private LinearLayout rows;
    private boolean paused, closed;
    private int message;
    RecommendationsUi(Activity activity, Api api, TestLabPolicy policy, Supplier<String> eligible) {
        this(activity, api, policy, eligible, Executors.newSingleThreadExecutor());
    }
    RecommendationsUi(Activity activity, Api api, TestLabPolicy policy, Supplier<String> eligible, ExecutorService worker) {
        this.activity = activity; this.api = api; this.policy = policy; this.eligible = eligible; this.worker = worker;
    }
    void show(SavedVenueCapture.Venue selected) {
        show(selected,null);
    }
    void show(SavedVenueCapture.Venue selected,RecommendationDrink focus) {
        dismiss();
        if (closed || paused || selected == null || !selected.url.equals(eligible.get())) return;
        venue = selected;
        focused=focus;
        String key = selected.url.substring(selected.url.indexOf("/bar/") + 5, selected.url.indexOf('?'));
        session = new RecommendationSession(key);
        LinearLayout body = new LinearLayout(activity); body.setOrientation(LinearLayout.VERTICAL);
        body.setBackgroundColor(activity.getColor(R.color.shell_background));
        int padding = Math.round(16 * activity.getResources().getDisplayMetrics().density);
        body.setPadding(padding, padding, padding, padding);
        LinearLayout titleRow = new LinearLayout(activity); titleRow.setGravity(Gravity.CENTER_VERTICAL);
        titleRow.setBackgroundColor(activity.getColor(R.color.shell_background));
        titleRow.setPadding(padding, NativeAppearance.dp(activity,8), padding, 0);
        TextView title = new TextView(activity); title.setText(R.string.recommendation_title); title.setTextSize(22);
        NativeAppearance.title(title); titleRow.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button more = new Button(activity); more.setTag("recommendations.more"); more.setText("⋯");
        more.setContentDescription(activity.getString(R.string.more_options)); more.setTextSize(24);
        NativeAppearance.button(more, false);
        titleRow.addView(more, new LinearLayout.LayoutParams(NativeAppearance.dp(activity,48), NativeAppearance.dp(activity,48)));
        more.setOnClickListener(view -> createOverflow(more).show());
        TextView heading = new TextView(activity); heading.setText(selected.name); heading.setTextSize(24); NativeAppearance.title(heading); body.addView(heading);
        TextView explanation = new TextView(activity); explanation.setText(R.string.recommendation_explanation); explanation.setTextSize(15); NativeAppearance.muted(explanation);
        explanation.setPadding(0, NativeAppearance.dp(activity,8), 0, NativeAppearance.dp(activity,12)); body.addView(explanation);
        status = new TextView(activity); status.setId(R.id.recommendation_status);
        status.setTextSize(14); NativeAppearance.muted(status);status.setPadding(0,0,0,NativeAppearance.dp(activity,12));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); body.addView(status);
        rows = new LinearLayout(activity); rows.setId(R.id.recommendation_rows); rows.setOrientation(LinearLayout.VERTICAL);
        rows.setPadding(0,NativeAppearance.dp(activity,4),0,0);
        body.addView(rows, new LinearLayout.LayoutParams(-1, -2));
        // The entire content scrolls, so large system text cannot squeeze the drink rows out below a fixed header.
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        AlertDialog current = new AlertDialog.Builder(activity).setCustomTitle(titleRow).setView(scroll)
                .setNegativeButton(R.string.close, (value, which) -> {}).create();
        dialog = current;
        current.setOnDismissListener(value -> { if (dialog == current) retire(); });
        dialog.show();
        // Give the native list bounded space while preserving small-screen scrolling.
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(NativeAppearance.shape(activity,R.color.surface,16,false));
            dialog.getWindow().setLayout(-1, Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.85f));
        }
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
    PopupMenu createOverflow(View anchor) {
        PopupMenu menu = new PopupMenu(activity, anchor);
        boolean ready = contextValid() && session != null && !session.isPending();
        boolean retry = session != null && session.snapshot() == null && !session.isPending();
        menu.getMenu().add(Menu.NONE, R.id.recommendation_refresh, Menu.NONE, retry ? "Riprova" : activity.getString(R.string.refresh))
                .setEnabled(ready);
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() != R.id.recommendation_refresh) return false;
            if (contextValid() && session != null && !session.isPending()) request(session.refresh());
            return true;
        });
        return menu;
    }
    private void render() {
        if (dialog == null || session == null) return;
        status.setText(policy.isReadOnly() ? activity.getString(R.string.recommendation_read_only) + "\n" + activity.getString(message) : activity.getString(message));
        rows.removeAllViews();
        DrinkRecommendations snapshot = session.snapshot();
        if (snapshot == null) return;
        List<DrinkRecommendations.Row> display=new ArrayList<>(snapshot.sortedRows());
        if(focused!=null)display.sort((left,right)->Boolean.compare(right.drink==focused,left.drink==focused));
        for (DrinkRecommendations.Row row : display) {
            Button button = new Button(activity); button.setAllCaps(false); button.setId(R.id.recommendation_row); button.setTag(row.drink.code);
            String count = row.count == 0 ? activity.getString(R.string.recommendation_zero)
                    : activity.getResources().getQuantityString(R.plurals.recommendation_count, row.count == 1 ? 1 : 2, row.count);
            String action = activity.getString(row.recommended ? R.string.recommendation_undo : R.string.recommendation_add);
            String label = row.drink.label + " · " + count + "\n" + action;
            button.setText(label); button.setContentDescription(label); button.setSelected(row.recommended);
            button.setEnabled(!paused && !policy.isReadOnly() && session.canWrite());
            NativeAppearance.recommendation(button,row.recommended);
            button.setOnClickListener(view -> { if (contextValid() && !policy.isReadOnly()) request(session.toggle(row.drink)); });
            LinearLayout.LayoutParams cardSize=new LinearLayout.LayoutParams(-1,-2);cardSize.topMargin=NativeAppearance.dp(activity,10);rows.addView(button,cardSize);
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
        session = null; venue = null; focused=null; dialog = null;
    }
    void close() { closed = true; dismiss(); worker.shutdownNow(); }
}
