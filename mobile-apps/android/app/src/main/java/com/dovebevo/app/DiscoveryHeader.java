package com.dovebevo.app;

import android.content.Context;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

/** Keeps the drink band below the title and outside the overlaid native menu. */
final class DiscoveryHeader extends LinearLayout {
    DiscoveryHeader(Context context, TextView title, Spinner band) {
        super(context);
        setTag("discovery.header");
        setOrientation(VERTICAL);
        setGravity(android.view.Gravity.CENTER_VERTICAL);
        title.setMinHeight(dp(48));
        title.setPadding(0, 0, dp(56), 0);
        addView(title, new LayoutParams(-1, -2));
        band.setMinimumHeight(dp(48));
        addView(band, new LayoutParams(-1, -2));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
