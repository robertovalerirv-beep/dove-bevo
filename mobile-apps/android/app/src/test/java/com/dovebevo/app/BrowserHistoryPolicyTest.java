package com.dovebevo.app;

import static org.junit.Assert.*;

import java.util.Arrays;
import org.junit.Test;

public final class BrowserHistoryPolicyTest {
    @Test public void acceptsBoundedTrustedHistoryIncludingAForwardEntry() {
        assertTrue(BrowserHistoryPolicy.accepts(new String[]{BrowserPolicy.HOME,
                "https://www.dovebevo.com/bar/n123?c=u0nd9", "https://www.dovebevo.com/privacy"}, 1, 4096));
        String[] fifty = new String[50]; Arrays.fill(fifty, BrowserPolicy.HOME);
        assertTrue(BrowserHistoryPolicy.accepts(fifty, 49, 131072));
    }

    @Test public void rejectsOversizedMissingOrInvalidHistoryAndEveryUntrustedDestination() {
        String[] fiftyOne = new String[51]; Arrays.fill(fiftyOne, BrowserPolicy.HOME);
        assertFalse(BrowserHistoryPolicy.accepts(fiftyOne, 0, 4096));
        assertFalse(BrowserHistoryPolicy.accepts(null, 0, 4096));
        assertFalse(BrowserHistoryPolicy.accepts(new String[0], 0, 4096));
        for (int index : new int[]{-1, 1, Integer.MAX_VALUE})
            assertFalse(BrowserHistoryPolicy.accepts(new String[]{BrowserPolicy.HOME}, index, 4096));
        for (int bytes : new int[]{0, -1, 131073, Integer.MAX_VALUE})
            assertFalse(BrowserHistoryPolicy.accepts(new String[]{BrowserPolicy.HOME}, 0, bytes));
        for (String url : new String[]{null, "http://www.dovebevo.com/", "https://evil.invalid/",
                "javascript:alert(1)", "file:///private", "https://user@www.dovebevo.com/", "https://www.dovebevo.com:444/"})
            assertFalse(String.valueOf(url), BrowserHistoryPolicy.accepts(new String[]{BrowserPolicy.HOME, url}, 0, 4096));
    }
}
