package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.widget.Toast;
import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Native explicit-save/list actions; presenting a dialog never replaces the WebView. */
final class SavedVenuesUi {
    private final Activity activity;
    private final SavedVenueStore store;
    private final Supplier<String> eligibleUrl;
    private final Consumer<Consumer<SavedVenueCapture.Venue>> readVenue;
    private final Consumer<String> navigate;
    private AlertDialog currentDialog;
    private long saveRequest;

    SavedVenuesUi(Activity activity, SavedVenueStore store, Supplier<String> eligibleUrl,
                  Consumer<Consumer<SavedVenueCapture.Venue>> readVenue, Consumer<String> navigate) {
        this.activity = activity;
        this.store = store;
        this.eligibleUrl = eligibleUrl;
        this.readVenue = readVenue;
        this.navigate = navigate;
    }

    void saveCurrent() {
        String url = SavedVenueUrl.canonicalize(eligibleUrl.get());
        if (url == null) { message(R.string.save_venue_unavailable); return; }
        long request = ++saveRequest;
        readVenue.accept(venue -> {
            if (request != saveRequest || activity.isFinishing() || activity.isDestroyed()) return;
            saveRequest++;
            if (venue == null || !url.equals(venue.url)
                    || !url.equals(SavedVenueUrl.canonicalize(eligibleUrl.get()))) {
                message(R.string.save_venue_unavailable);
                return;
            }
            SavedVenueStore.Result result = store.save(venue.url, venue.name);
            message(result == SavedVenueStore.Result.SAVED ? R.string.saved_venue_saved
                    : result == SavedVenueStore.Result.FULL ? R.string.saved_venues_full
                    : result == SavedVenueStore.Result.INVALID_LABEL ? R.string.save_venue_unavailable
                    : R.string.saved_venues_storage_error);
        });
    }

    void showList() {
        saveRequest++;
        List<SavedVenueStore.Venue> venues;
        try { venues = store.load(); }
        catch (IOException error) { message(R.string.saved_venues_storage_error); return; }
        AlertDialog.Builder builder = new AlertDialog.Builder(activity).setTitle(R.string.saved_venues)
                .setNegativeButton(R.string.close, null);
        if (venues.isEmpty()) builder.setMessage(R.string.saved_venues_empty);
        else {
            String[] labels = new String[venues.size()];
            for (int i = 0; i < labels.length; i++) labels[i] = venues.get(i).label;
            builder.setItems(labels, (dialog, index) -> showVenue(venues.get(index)));
        }
        AlertDialog dialog = builder.create();
        dialog.setOnShowListener(ignored -> {
            if (dialog.getListView() != null) dialog.getListView().setId(R.id.saved_venues_list);
        });
        present(dialog);
    }

    private void showVenue(SavedVenueStore.Venue venue) {
        saveRequest++;
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(venue.label)
                .setMessage(R.string.saved_venues_online_note)
                .setPositiveButton(R.string.open_saved_venue, (ignored, which) -> {
                    String url = SavedVenueUrl.canonicalize(venue.url);
                    if (url != null) navigate.accept(url);
                    else message(R.string.save_venue_unavailable);
                })
                .setNeutralButton(R.string.remove_saved_venue, null)
                .setNegativeButton(R.string.cancel, null).create();
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setId(R.id.open_saved_venue);
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setId(R.id.remove_saved_venue);
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> {
                saveRequest++;
                SavedVenueStore.Result result = store.remove(venue.url);
                if (result == SavedVenueStore.Result.REMOVED || result == SavedVenueStore.Result.NOT_FOUND) {
                    dialog.dismiss();
                    showList();
                } else message(R.string.saved_venues_storage_error);
            });
        });
        present(dialog);
    }

    private void present(AlertDialog dialog) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        if (currentDialog != null) currentDialog.dismiss();
        currentDialog = dialog;
        dialog.setOnDismissListener(ignored -> { if (currentDialog == dialog) currentDialog = null; });
        dialog.show();
    }

    private void message(int text) { Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }

    void dismiss() {
        saveRequest++;
        if (currentDialog != null) currentDialog.dismiss();
        currentDialog = null;
    }
}
