package com.dovebevo.app;

/** Keep every action visible; narrow or enlarged text uses a second bottom row, never a scroller. */
final class BottomNavigationLayout {
    private BottomNavigationLayout() {}
    static int columns(int widthDp, float fontScale) {
        return widthDp / 5f >= 72f * Math.max(1f, fontScale) ? 5 : 3;
    }
}
