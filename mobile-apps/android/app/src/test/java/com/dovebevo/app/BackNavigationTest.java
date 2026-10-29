package com.dovebevo.app;

import static org.junit.Assert.*;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import androidx.activity.ComponentActivity;

public class BackNavigationTest {
    @Test public void existingPageHistoryNavigatesOnceWithoutClosing() {
        AtomicInteger back = new AtomicInteger();
        AtomicInteger close = new AtomicInteger();
        BackNavigation.perform(true, back::incrementAndGet, close::incrementAndGet);
        assertEquals(1, back.get());
        assertEquals(0, close.get());
    }

    @Test public void rootBackClosesWithoutAttemptingMissingHistory() {
        AtomicInteger back = new AtomicInteger();
        AtomicInteger close = new AtomicInteger();
        BackNavigation.perform(false, back::incrementAndGet, close::incrementAndGet);
        assertEquals(0, back.get());
        assertEquals(1, close.get());
    }

    @Test public void activityUsesCompatDispatcherInsteadOfLegacyBackOverride() {
        assertEquals(ComponentActivity.class, MainActivity.class.getSuperclass());
        for (Method method : MainActivity.class.getDeclaredMethods()) assertNotEquals("onBackPressed", method.getName());
    }
}
