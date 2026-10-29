package com.dovebevo.app;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class RulesAcceptanceTest {
    @Test public void missingStaleOrUnexpectedVersionNeverOpensWebsite() {
        AtomicInteger welcome = new AtomicInteger();
        AtomicInteger website = new AtomicInteger();
        for (String stored : new String[]{null, "", "2026-10-25", "2026-10-27", "2026-10-26 "}) {
            RulesAcceptance.route(stored, welcome::incrementAndGet, website::incrementAndGet);
        }
        assertEquals(5, welcome.get());
        assertEquals(0, website.get());
    }

    @Test public void currentVersionRestartsAtWebsiteWithoutAnotherGate() {
        AtomicInteger welcome = new AtomicInteger();
        AtomicInteger website = new AtomicInteger();
        RulesAcceptance.route("2026-10-26", welcome::incrementAndGet, website::incrementAndGet);
        assertEquals(0, welcome.get());
        assertEquals(1, website.get());
    }

    @Test public void failedPersistenceDoesNotStartWebsite() {
        AtomicInteger persist = new AtomicInteger();
        AtomicInteger website = new AtomicInteger();
        assertFalse(RulesAcceptance.accept(() -> { persist.incrementAndGet(); return false; }, website::incrementAndGet));
        assertEquals(1, persist.get());
        assertEquals(0, website.get());
    }

    @Test public void explicitAcceptancePersistsBeforeOpeningWebsiteOnce() {
        List<String> actions = new ArrayList<>();
        assertTrue(RulesAcceptance.accept(() -> { actions.add("persist"); return true; }, () -> actions.add("website")));
        assertEquals(List.of("persist", "website"), actions);
    }
}
