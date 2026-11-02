package com.dovebevo.app;

import java.io.IOException;
import java.util.UUID;
import java.util.function.Supplier;

/** Installation identity only. It is neither a WebView cookie nor a one-human assertion. */
final class RecommendationVoter {
    interface Storage {
        String read() throws IOException;
        /** Create only when absent; never replace an existing identity. Return the persisted value. */
        String create(String value) throws IOException;
    }
    private final Storage storage;
    private final Supplier<String> generate;
    RecommendationVoter(Storage storage) { this(storage, () -> UUID.randomUUID().toString()); }
    RecommendationVoter(Storage storage, Supplier<String> generate) { this.storage = storage; this.generate = generate; }
    synchronized String id() throws IOException {
        String value = storage.read();
        if (value == null) { value = generate.get(); if (!valid(value)) throw new IOException("Installation identity unavailable"); value = storage.create(value); }
        if (!valid(value)) throw new IOException("Installation identity unavailable");
        return value;
    }
    static boolean valid(String value) { return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"); }
}
