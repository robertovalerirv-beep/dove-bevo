package com.dovebevo.app;

/** Keep all six actions visible with 56 dp cells; narrow or enlarged text uses two rows. */
final class BottomNavigationLayout {
    private BottomNavigationLayout() {}
    static int columns(int widthDp, float fontScale) {
        return widthDp / 6f >= 56f * Math.max(1f, fontScale) ? 6 : 3;
    }
}
