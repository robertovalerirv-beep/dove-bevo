package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class BottomNavigationLayoutTest {
    @Test public void ordinaryPhoneKeepsFourDestinationsInOneRow() {
        assertEquals(4, BottomNavigationLayout.columns(308, 1f));
        assertEquals(4, BottomNavigationLayout.columns(348, 1f));
        assertEquals(4, BottomNavigationLayout.columns(390, 1f));
    }
    @Test public void narrowPhoneAndLargeTextKeepAllFourInTwoRows() {
        assertEquals(2, BottomNavigationLayout.columns(200, 1f));
        assertEquals(2, BottomNavigationLayout.columns(320, 1.5f));
        assertEquals(2, BottomNavigationLayout.columns(390, 2f));
        assertEquals(2, BottomNavigationLayout.columns(320, 2f));
    }
    @Test public void wideLandscapeCanKeepLargeTextInOneRow() {
        assertEquals(4, BottomNavigationLayout.columns(640, 1.5f));
    }
}
