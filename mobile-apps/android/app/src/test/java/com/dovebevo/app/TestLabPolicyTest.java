package com.dovebevo.app;

import static org.junit.Assert.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class TestLabPolicyTest {
    @Test public void onlyExactDocumentedTrueFlagSelectsReadOnlyMode() {
        assertTrue(TestLabPolicy.detect(() -> "true").isReadOnly());
        for (String value : new String[]{null, "", "false", "TRUE", "True", " true", "true ", "1", "unexpected"}) {
            assertFalse(String.valueOf(value), TestLabPolicy.detect(() -> value).isReadOnly());
        }
    }

    @Test public void unreadableSystemSettingFailsConservativelyReadOnly() {
        TestLabPolicy policy = TestLabPolicy.detect(() -> { throw new SecurityException("denied"); });
        assertTrue(policy.isReadOnly());
        assertFalse(policy.allowsMethod("POST"));
        assertFalse(policy.allowsExternalActions());
    }

    @Test public void detectionIsReadOnceAndPolicyDoesNotChangeForBackgroundCallbacks() {
        AtomicInteger reads = new AtomicInteger();
        TestLabPolicy policy = TestLabPolicy.detect(() -> reads.incrementAndGet() == 1 ? "true" : null);
        assertTrue(policy.isReadOnly());
        assertTrue(policy.isReadOnly());
        assertFalse(policy.allowsMethod("POST"));
        assertEquals(1, reads.get());
    }

    @Test public void ordinaryUsersKeepAllExistingMethodsAndExternalActions() {
        TestLabPolicy policy = TestLabPolicy.detect(() -> null);
        assertTrue(policy.allowsExternalActions());
        for (String method : new String[]{"GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE", "CONNECT", "TRACE", "CUSTOM", "get", "", null}) {
            assertTrue(String.valueOf(method), policy.allowsMethod(method));
        }
    }

    @Test public void testLabAllowsOnlyExactSafeMethods() {
        TestLabPolicy policy = TestLabPolicy.detect(() -> "true");
        for (String method : new String[]{"GET", "HEAD", "OPTIONS"}) assertTrue(method, policy.allowsMethod(method));
        for (String method : new String[]{"POST", "PUT", "PATCH", "DELETE", "CONNECT", "TRACE", "CUSTOM", "get", "head", "options", " GET", "GET ", "GET\n", "", null}) {
            assertFalse(String.valueOf(method), policy.allowsMethod(method));
        }
        assertFalse(policy.allowsExternalActions());
    }
}
