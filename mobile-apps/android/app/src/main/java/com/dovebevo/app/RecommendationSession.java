package com.dovebevo.app;

/** Main-thread state. Writes are serialized and unknown outcomes require an authoritative GET. */
final class RecommendationSession {
    static final class Request {
        final long generation; final RecommendationDrink drink; final boolean recommended;
        private Request(long generation, RecommendationDrink drink, boolean recommended) {
            this.generation = generation; this.drink = drink; this.recommended = recommended;
        }
        boolean isWrite() { return drink != null; }
    }
    private final String venueKey;
    private long generation;
    private boolean active = true;
    private boolean fresh;
    private Request pending;
    private DrinkRecommendations snapshot;
    RecommendationSession(String venueKey) { this.venueKey = venueKey; }
    DrinkRecommendations snapshot() { return snapshot; }
    boolean isPending() { return pending != null; }
    boolean canWrite() { return active && fresh && pending == null && snapshot != null; }
    Request refresh() { if (!active || pending != null) return null; pending = new Request(++generation, null, false); return pending; }
    Request toggle(RecommendationDrink drink) {
        if (!canWrite() || drink == null) return null;
        pending = new Request(++generation, drink, !snapshot.row(drink).recommended); return pending;
    }
    boolean accepts(Request request) { return active && pending == request && request.generation == generation; }
    boolean accept(Request request, DrinkRecommendations value) {
        if (!accepts(request) || value == null || !venueKey.equals(value.venueKey)) return false;
        snapshot = value; fresh = true; pending = null; return true;
    }
    boolean fail(Request request) { if (!accepts(request)) return false; pending = null; fresh = false; return true; }
    void pause() { active = false; fresh = false; pending = null; generation++; }
    void resume() { active = true; fresh = false; }
}
