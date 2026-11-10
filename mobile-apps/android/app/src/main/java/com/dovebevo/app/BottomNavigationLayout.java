package com.dovebevo.app;

/** Keep all five destinations visible with 56 dp cells; large text uses two rows. */
final class BottomNavigationLayout {
    private BottomNavigationLayout() {}
    static int columns(int widthDp, float fontScale) {
        return widthDp / 5f >= 56f * Math.max(1f, fontScale) ? 5 : 3;
    }
}
