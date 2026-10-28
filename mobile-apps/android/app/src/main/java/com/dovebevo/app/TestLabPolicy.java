package com.dovebevo.app;

import java.util.function.Supplier;

/** Immutable policy shared by the UI and WebView request callback threads. */
final class TestLabPolicy {
    private final boolean readOnly;

    private TestLabPolicy(boolean readOnly) { this.readOnly = readOnly; }

    static TestLabPolicy detect(Supplier<String> setting) {
        try {
            return new TestLabPolicy("true".equals(setting.get()));
        } catch (SecurityException denied) {
            // An unreadable flag must not let an automated test publish public content.
            return new TestLabPolicy(true);
        }
    }

    boolean isReadOnly() { return readOnly; }

    boolean allowsMethod(String method) {
        return !readOnly || "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method);
    }

    boolean allowsExternalActions() { return !readOnly; }
}
