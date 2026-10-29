package com.dovebevo.app;

import android.content.Context;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;

/** Five persistent controls. Only Mappa and Preferiti are selectable destinations. */
final class BottomNavigationBar extends LinearLayout {
    BottomNavigationBar(Context context, Runnable home, Runnable map, Runnable favorites,
            Runnable save, Runnable recommendations) {
        super(context);
        setId(R.id.bottom_navigation);
        setOrientation(VERTICAL);
        setBackgroundColor(context.getColor(R.color.shell_background));
        Button[] controls = {
            control(R.id.home, R.string.home, R.string.home, R.drawable.native_home, home),
            control(R.id.map_destination, R.string.map_destination, R.string.map_destination, R.drawable.native_map, map),
            control(R.id.favorites_destination, R.string.saved_venues, R.string.saved_venues, R.drawable.native_bookmark, favorites),
            control(R.id.save_venue, R.string.save_venue_short, R.string.save_venue, R.drawable.native_bookmark_add, save),
            control(R.id.recommendation_entry, R.string.recommendation_short, R.string.recommendation_entry, R.drawable.native_thumb, recommendations),
        };
        android.content.res.Configuration config = getResources().getConfiguration();
        int columns = BottomNavigationLayout.columns(config.screenWidthDp, config.fontScale);
        LinearLayout row = null;
        for (int i = 0; i < controls.length; i++) {
            if (i % columns == 0) {
                row = new LinearLayout(context);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setBaselineAligned(false);
                addView(row, new LayoutParams(-1, -2));
            }
            row.addView(controls[i], new LayoutParams(0, -1, 1));
        }
    }

    private Button control(int id, int label, int description, int icon, Runnable action) {
        Button button = new Button(getContext());
        button.setId(id);
        button.setText(label);
        button.setContentDescription(getContext().getString(description));
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setMinWidth(dp(48)); button.setMinimumWidth(dp(48));
        button.setMinHeight(dp(64)); button.setMinimumHeight(dp(64));
        button.setPadding(dp(2), dp(6), dp(2), dp(6));
        button.setMaxLines(3);
        button.setCompoundDrawablePadding(dp(4));
        button.setCompoundDrawablesWithIntrinsicBounds(0, icon, 0, 0);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
