package com.dovebevo.app;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

/** App-only visual tokens. These styles never classify a price or change an action. */
final class NativeAppearance {
    private NativeAppearance() {}

    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static GradientDrawable shape(Context context, int fill, int radius, boolean outlined) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(context.getColor(fill));
        background.setCornerRadius(dp(context, radius));
        if (outlined) background.setStroke(dp(context, 1), context.getColor(R.color.surface_line));
        return background;
    }

    static void card(View view) {
        Context context = view.getContext();
        view.setBackground(shape(context, R.color.surface, 16, true));
        int padding = dp(context, 16);
        view.setPadding(padding, padding, padding, padding);
    }

    static void title(TextView view) {
        view.setTextColor(view.getContext().getColor(R.color.shell_text));
        view.setTypeface(null, Typeface.BOLD);
    }

    static void muted(TextView view) {
        view.setTextColor(view.getContext().getColor(R.color.muted_text));
    }

    static void price(TextView view) {
        Context context = view.getContext();
        view.setBackground(shape(context, R.color.shell_background, 12, false));
        view.setPadding(dp(context, 12), dp(context, 8), dp(context, 12), dp(context, 8));
        view.setTextColor(context.getColor(R.color.shell_text));
        view.setTypeface(null, Typeface.BOLD);
    }

    static void button(Button button, boolean primary) {
        Context context = button.getContext();
        button.setAllCaps(false);
        button.setTextSize(15);
        button.setMinHeight(dp(context, 48));
        button.setMinimumHeight(dp(context, 48));
        button.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10));
        button.setStateListAnimator(null);
        button.setElevation(0);
        button.setBackgroundTintList(null);
        android.graphics.drawable.StateListDrawable state = new android.graphics.drawable.StateListDrawable();
        state.addState(new int[]{-android.R.attr.state_enabled}, shape(context, R.color.surface_line, 12, false));
        state.addState(new int[]{}, shape(context, primary ? R.color.shell_text : R.color.surface, 12, !primary));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22101820), state, null));
        button.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},
                new int[]{context.getColor(R.color.muted_text),context.getColor(primary ? R.color.surface : R.color.shell_text)}));
    }

    static void destination(Button button, boolean selected) {
        Context context = button.getContext();
        int ink = context.getColor(R.color.shell_text);
        button.setSelected(selected);
        button.setTypeface(null, selected ? Typeface.BOLD : Typeface.NORMAL);
        button.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},
                new int[]{context.getColor(R.color.muted_text),ink}));
        button.setStateListAnimator(null);
        button.setElevation(0);
        button.setBackgroundTintList(null);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22101820),
                shape(context, selected ? R.color.selected_surface : R.color.surface, 12, false), null));
        for (android.graphics.drawable.Drawable icon : button.getCompoundDrawables()) {
            if (icon != null) icon.mutate().setTint(ink);
        }
    }

    static void recommendation(Button button, boolean selected) {
        button(button, false);
        Context context = button.getContext();
        button.setGravity(android.view.Gravity.START | android.view.Gravity.CENTER_VERTICAL);
        button.setTextSize(16);
        button.setMinHeight(dp(context, 92));
        button.setMinimumHeight(dp(context, 92));
        button.setPadding(dp(context, 16), dp(context, 14), dp(context, 16), dp(context, 14));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22216C3A),
                shape(context, selected ? R.color.positive_surface : R.color.surface, 16, true), null));
        button.setTextColor(context.getColor(selected ? R.color.positive_text : R.color.shell_text));
        button.setCompoundDrawablesWithIntrinsicBounds(0, 0, R.drawable.native_thumb, 0);
        button.setCompoundDrawablePadding(dp(context, 12));
        for (android.graphics.drawable.Drawable icon : button.getCompoundDrawables()) {
            if (icon != null) icon.mutate().setTint(context.getColor(selected ? R.color.positive_text : R.color.muted_text));
        }
        button.setAlpha(button.isEnabled() ? 1f : .65f);
    }
}
