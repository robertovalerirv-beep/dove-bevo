package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputType;
import android.widget.EditText;
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
    private final Consumer<String> navigate;
    private AlertDialog currentDialog;

    SavedVenuesUi(Activity activity, SavedVenueStore store, Supplier<String> eligibleUrl, Consumer<String> navigate) {
        this.activity = activity;
        this.store = store;
        this.eligibleUrl = eligibleUrl;
        this.navigate = navigate;
    }

    void saveCurrent() {
        String url = SavedVenueUrl.canonicalize(eligibleUrl.get());
        if (url == null) { message(R.string.save_venue_unavailable); return; }
        String existing = "";
        try {
            for (SavedVenueStore.Venue venue : store.load()) if (venue.url.equals(url)) existing = venue.label;
        } catch (IOException error) { message(R.string.saved_venues_storage_error); return; }
        EditText name = new EditText(activity);
        name.setId(R.id.saved_venue_name);
        name.setSingleLine(true);
        name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        name.setHint(R.string.saved_venue_name_hint);
        name.setContentDescription(activity.getString(R.string.saved_venue_name_hint));
        name.setText(existing);
        int padding = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        name.setPadding(padding, padding / 2, padding, padding / 2);
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(R.string.save_venue)
                .setMessage(R.string.saved_venue_name_help).setView(name)
                .setPositiveButton(R.string.save, null).setNegativeButton(R.string.cancel, null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            // A redirect or renderer failure while the dialog is open must not
            // save an earlier page through a fallback URL.
            if (!url.equals(SavedVenueUrl.canonicalize(eligibleUrl.get()))) {
                name.setError(activity.getString(R.string.save_venue_unavailable));
                return;
            }
            SavedVenueStore.Result result = store.save(url, name.getText().toString());
            if (result == SavedVenueStore.Result.SAVED) {
                dialog.dismiss();
                message(R.string.saved_venue_saved);
            } else {
                name.setError(activity.getString(result == SavedVenueStore.Result.INVALID_LABEL
                        ? R.string.saved_venue_name_invalid : result == SavedVenueStore.Result.FULL
                        ? R.string.saved_venues_full : R.string.saved_venues_storage_error));
            }
        }));
        present(dialog);
    }

    void showList() {
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
        if (currentDialog != null) currentDialog.dismiss();
        currentDialog = null;
    }
}
