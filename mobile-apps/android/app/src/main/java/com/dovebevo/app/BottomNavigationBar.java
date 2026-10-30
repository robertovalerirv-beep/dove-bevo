package com.dovebevo.app;

import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;

/** Five persistent controls. Only Mappa and Preferiti are selectable destinations. */
final class BottomNavigationBar extends LinearLayout {
    private final Button[] controls;
    private int columns;
    BottomNavigationBar(Context context, Runnable home, Runnable map, Runnable favorites,
            Runnable save, Runnable recommendations) {
        super(context);
        setId(R.id.bottom_navigation);
        setOrientation(VERTICAL);
        setBackgroundColor(context.getColor(R.color.surface));
        setPadding(dp(6), dp(6), dp(6), dp(6));
        controls = new Button[]{
            control(R.id.home, R.string.home, R.string.home, R.drawable.native_home, home),
            control(R.id.map_destination, R.string.map_destination, R.string.map_destination, R.drawable.native_map, map),
            control(R.id.favorites_destination, R.string.saved_venues, R.string.saved_venues, R.drawable.native_bookmark, favorites),
            control(R.id.save_venue, R.string.save_venue_short, R.string.save_venue, R.drawable.native_bookmark_add, save),
            control(R.id.recommendation_entry, R.string.recommendation_short, R.string.recommendation_entry, R.drawable.native_thumb, recommendations),
        };
        android.content.res.Configuration config = getResources().getConfiguration();
        arrange(BottomNavigationLayout.columns(config.screenWidthDp, config.fontScale));
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        // The Activity retains its WebView across orientation/screen-size changes.
        // Measure the space actually assigned by the window, including split screen,
        // instead of freezing the constructor's initial device width.
        int available = View.MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight();
        if (View.MeasureSpec.getMode(widthSpec) != View.MeasureSpec.UNSPECIFIED && available > 0) {
            int widthDp = (int)(available / getResources().getDisplayMetrics().density);
            arrange(BottomNavigationLayout.columns(widthDp, getResources().getConfiguration().fontScale));
        }
        super.onMeasure(widthSpec, heightSpec);
    }

    private void arrange(int desiredColumns) {
        if (columns == desiredColumns) return;
        columns = desiredColumns;
        for (Button control : controls) {
            if (control.getParent() instanceof ViewGroup) ((ViewGroup)control.getParent()).removeView(control);
        }
        removeAllViews();
        LinearLayout row = null;
        for (int i = 0; i < controls.length; i++) {
            if (i % columns == 0) {
                row = new LinearLayout(getContext());
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
        NativeAppearance.destination(button, false);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
