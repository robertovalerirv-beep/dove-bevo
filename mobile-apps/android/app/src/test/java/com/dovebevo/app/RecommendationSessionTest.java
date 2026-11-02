package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class RecommendationSessionTest {
    private DrinkRecommendations snapshot(boolean selected) throws Exception {
        return DrinkRecommendations.parse(DrinkRecommendationsTest.snapshot("n123", "spritz", selected ? 1 : 0, selected), "n123");
    }

    @Test public void serializesWritesAndDoesNotOptimisticallyClaimSuccess() throws Exception {
        RecommendationSession session = new RecommendationSession("n123");
        assertNull(session.toggle(RecommendationDrink.SPRITZ));
        RecommendationSession.Request read = session.refresh();
        assertTrue(session.accept(read, snapshot(false)));
        RecommendationSession.Request write = session.toggle(RecommendationDrink.SPRITZ);
        assertTrue(write.recommended);
        assertNull(session.toggle(RecommendationDrink.WATER));
        assertNull(session.refresh());
        assertFalse(session.snapshot().row(RecommendationDrink.SPRITZ).recommended);
        assertTrue(session.accept(write, snapshot(true)));
        assertFalse(session.toggle(RecommendationDrink.SPRITZ).recommended);
    }

    @Test public void unknownWriteRequiresAuthoritativeReadBeforeRetry() throws Exception {
        RecommendationSession session = new RecommendationSession("n123");
        session.accept(session.refresh(), snapshot(false));
        RecommendationSession.Request write = session.toggle(RecommendationDrink.SPRITZ);
        assertTrue(session.fail(write));
        assertFalse(session.canWrite());
        assertNull(session.toggle(RecommendationDrink.SPRITZ));
        RecommendationSession.Request reconcile = session.refresh();
        assertTrue(session.accept(reconcile, snapshot(true)));
        assertFalse(session.toggle(RecommendationDrink.SPRITZ).recommended);
    }

    @Test public void deactivationAndOldCallbacksCannotConsumeNewerRequest() throws Exception {
        RecommendationSession session = new RecommendationSession("n123");
        RecommendationSession.Request old = session.refresh();
        session.pause();
        assertNull(session.refresh());
        session.resume();
        RecommendationSession.Request current = session.refresh();
        assertFalse(session.accept(old, snapshot(false)));
        assertFalse(session.fail(old));
        assertTrue(session.accept(current, snapshot(true)));
        assertTrue(session.canWrite());
    }
}
