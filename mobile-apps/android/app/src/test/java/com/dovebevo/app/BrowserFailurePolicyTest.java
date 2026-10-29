package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class BrowserFailurePolicyTest {
    @Test public void onlyTheExplicitNativeAbortMarkerIsCancellation() {
        assertTrue(BrowserFailurePolicy.isCancelled(-1, "net::ERR_ABORTED"));
        assertTrue(BrowserFailurePolicy.isCancelled(-1, new StringBuilder("net::ERR_ABORTED")));
        assertFalse(BrowserFailurePolicy.isCancelled(-2, "net::ERR_ABORTED"));
        assertFalse(BrowserFailurePolicy.isCancelled(-1, null));
        assertFalse(BrowserFailurePolicy.isCancelled(-1, "net::ERR_ABORTED_BY_RESPONSE"));
        assertFalse(BrowserFailurePolicy.isCancelled(-1, "net::ERR_FAILED"));
        assertFalse(BrowserFailurePolicy.isCancelled(-6, "Connection failed"));
        assertFalse(BrowserFailurePolicy.isCancelled(-2, "Host lookup failed"));
    }
}
