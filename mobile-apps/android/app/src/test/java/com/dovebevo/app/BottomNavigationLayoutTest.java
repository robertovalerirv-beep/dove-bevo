package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class BottomNavigationLayoutTest {
    @Test public void ordinaryPhoneKeepsFiveActionsInOneRow() {
        assertEquals(5, BottomNavigationLayout.columns(390, 1f));
    }
    @Test public void narrowPhoneAndLargeTextKeepAllFiveInTwoRows() {
        assertEquals(3, BottomNavigationLayout.columns(320, 1f));
        assertEquals(3, BottomNavigationLayout.columns(390, 1.5f));
        assertEquals(3, BottomNavigationLayout.columns(320, 2f));
    }
    @Test public void wideLandscapeCanKeepLargeTextInOneRow() {
        assertEquals(5, BottomNavigationLayout.columns(640, 1.5f));
    }
}
