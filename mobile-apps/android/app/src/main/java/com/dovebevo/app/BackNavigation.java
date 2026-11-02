package com.dovebevo.app;

/** Shared action for native toolbar and lifecycle-aware system back callbacks. */
public final class BackNavigation {
    private BackNavigation() {}

    public static void perform(boolean hasWebHistory, Runnable navigateBack, Runnable closeActivity) {
        if (hasWebHistory) navigateBack.run();
        else closeActivity.run();
    }
}
