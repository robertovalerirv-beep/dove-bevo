package com.dovebevo.app;

import java.util.function.BooleanSupplier;

/** Only the accepted public rules version is stored; absence or a stale version opens the gate. */
public final class RulesAcceptance {
    public static final String VERSION = "2026-10-26";

    private RulesAcceptance() {}

    public static void route(String acceptedVersion, Runnable welcome, Runnable website) {
        if (VERSION.equals(acceptedVersion)) website.run();
        else welcome.run();
    }

    /** A failed preference write keeps the user at the readable offline gate. */
    public static boolean accept(BooleanSupplier persistVersion, Runnable website) {
        if (!persistVersion.getAsBoolean()) return false;
        website.run();
        return true;
    }
}
