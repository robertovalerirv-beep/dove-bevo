package com.dovebevo.app;

/** Keep four destinations visible with 56 dp cells; large text uses two rows. */
final class BottomNavigationLayout {
    private BottomNavigationLayout() {}
    static int columns(int widthDp, float fontScale) {
        return widthDp / 4f >= 56f * Math.max(1f, fontScale) ? 4 : 2;
    }
}
