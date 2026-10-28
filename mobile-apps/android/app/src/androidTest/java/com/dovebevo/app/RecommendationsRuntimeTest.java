package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.system.Os;
import android.system.ErrnoException;
import android.system.OsConstants;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Real native controller and private-file adapter; every API call uses this local sink. No website is launched. */
public final class RecommendationsRuntimeTest {
    private static final String URL = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;
    private SharedPreferences rules;
    private String previous;
    private boolean hadPrevious;
    private RecommendationsUi ui;
    private final Queue worker = new Queue();
    private final Sink sink = new Sink();
    private String eligible = URL;
    @Before public void setUp() {
        rules = instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules", 0);
        hadPrevious = rules.contains("accepted_rules_version"); previous = rules.getString("accepted_rules_version", null);
        assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity = (MainActivity) instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        onMain(() -> {
            assertNotNull(activity.findViewById(R.id.accept_rules)); assertNull(activity.findViewById(R.id.website));
            ui = new RecommendationsUi(activity, sink, TestLabPolicy.detect(() -> null), () -> eligible, worker);
            ui.show(venue());
        });
    }
    @After public void tearDown() {
        onMain(() -> { if (ui != null) ui.close(); if (activity != null) activity.finish(); });
        SharedPreferences.Editor edit = rules.edit(); if (hadPrevious) edit.putString("accepted_rules_version", previous); else edit.remove("accepted_rules_version");
        assertTrue(edit.commit());
    }
    @Test public void actualNativeRowsToggleUndoSerializeAndReconcileUnknown() throws Exception {
        onMain(() -> assertEquals(0, rows().getChildCount()));
        runNext();
        onMain(() -> {
            assertEquals(9, rows().getChildCount()); assertTrue(row("water").getText().toString().contains("Ancora nessun consiglio"));
            row("water").performClick();
            assertFalse(row("water").isEnabled()); row("spritz").performClick();
            assertEquals(1, worker.tasks.size());
        });
        runNext();
        onMain(() -> { assertTrue(row("water").isSelected()); assertTrue(row("water").getText().toString().contains("1 consiglio")); row("water").performClick(); });
        sink.unknown = true; runNext();
        onMain(() -> {
            assertFalse(row("water").isEnabled());
            assertTrue(status().getText().toString().contains("non verificato"));
            dialog().findViewById(R.id.recommendation_refresh).performClick();
        });
        runNext();
        onMain(() -> { assertFalse(row("water").isSelected()); assertTrue(row("water").isEnabled()); });
        assertEquals(2, sink.posts); assertEquals(2, sink.gets);
    }
    @Test public void pausedSameUrlResultCannotOverwriteResumeSnapshotAndNewVenueDismisses() throws Exception {
        runNext();
        onMain(() -> { row("water").performClick(); ui.pause(); ui.resume(); });
        assertEquals(2, worker.tasks.size());
        runNext(); // cancelled write: an old callback cannot clear the newer GET's pending state
        onMain(() -> assertFalse(dialog().findViewById(R.id.recommendation_refresh).isEnabled()));
        runNext();
        onMain(() -> {
            assertTrue(row("water").isEnabled()); eligible = "https://www.dovebevo.com/bar/w9?c=sr2y7"; ui.contextChanged(); assertNull(dialog());
        });
        assertEquals(0, sink.posts);
    }
    @Test public void restrictedUiHasNoWriteAndDismissedResultNeverReopens() throws Exception {
        onMain(() -> { ui.close(); worker.tasks.clear(); ui = new RecommendationsUi(activity, sink, TestLabPolicy.detect(() -> "true"), () -> eligible, worker); ui.show(venue()); });
        runNext();
        onMain(() -> {
            assertFalse(row("water").isEnabled()); row("water").performClick(); assertEquals(0, worker.tasks.size());
            dialog().findViewById(R.id.recommendation_refresh).performClick(); ui.dismiss();
        });
        runNext(); onMain(() -> assertNull(dialog())); assertEquals(0, sink.posts);
    }
    @Test public void replacingDialogCannotLetOldDismissalRetireTheNewContext() {
        onMain(() -> ui.show(venue()));
        assertEquals(2, worker.tasks.size());
        runNext(); runNext();
        onMain(() -> { assertNotNull(dialog()); assertEquals(9, rows().getChildCount()); assertTrue(row("water").isEnabled()); });
        assertEquals(1, sink.gets); assertEquals(0, sink.posts);
    }
    @Test public void identityFileIsPrivateCreateOnlyAndCorruptionIsPreserved() throws Exception {
        File directory = new File(activity.getNoBackupFilesDir(), "recommendation-test-" + UUID.randomUUID()); assertTrue(directory.mkdir());
        File file = new File(directory, "recommendation-voter-v1");
        try {
            RecommendationVoterFile storage = new RecommendationVoterFile(directory);
            String first = "3b88fc80-93d6-4d17-a110-09f5c57979a3", second = "5e3537ef-e319-4ca3-a261-c4895c6acb5f";
            assertEquals(first, storage.create(first)); assertEquals(first, storage.create(second));
            assertEquals(0600, Os.stat(file.getAbsolutePath()).st_mode & 0777);
            assertEquals(0, identityDescriptors(file));
            for (int i = 0; i < 128; i++) assertEquals(first, storage.read());
            assertEquals("Existing identity reads must close their OS descriptors", 0, identityDescriptors(file));
            try (FileOutputStream output = new FileOutputStream(file)) { output.write("corrupt".getBytes(StandardCharsets.US_ASCII)); }
            for (int i = 0; i < 128; i++) {
                try { storage.read(); fail("Corrupt identity accepted"); } catch (IOException expected) { }
            }
            assertEquals("Error paths must close their OS descriptors", 0, identityDescriptors(file));
            try { storage.create(second); fail("Corrupt identity replaced"); } catch (IOException expected) { }
            assertEquals(7, file.length()); assertEquals(1, directory.list().length);

            assertTrue(file.delete());
            String missing = new File(directory, "missing-target").getAbsolutePath();
            Os.symlink(missing, file.getAbsolutePath());
            try { storage.create(second); fail("Dangling identity link replaced"); } catch (IOException expected) { }
            assertTrue(OsConstants.S_ISLNK(Os.lstat(file.getAbsolutePath()).st_mode));
            assertEquals(missing, Os.readlink(file.getAbsolutePath()));
            assertFalse(new File(missing).exists());
            assertTrue(file.delete());

            RecommendationVoterFile interrupted = new RecommendationVoterFile(directory, (descriptor, bytes) -> {
                assertEquals(8, Os.write(descriptor, bytes, 0, 8));
                throw new IOException("Owned partial-write failure");
            });
            try { interrupted.create(first); fail("Partial identity claimed success"); } catch (IOException expected) { }
            assertEquals(8, file.length()); assertEquals(0, identityDescriptors(file));
            try { storage.create(second); fail("Partial identity regenerated"); } catch (IOException expected) { }
            try (java.io.FileInputStream input = new java.io.FileInputStream(file)) {
                byte[] preserved = new byte[8]; assertEquals(8, input.read(preserved));
                assertEquals(first.substring(0, 8), new String(preserved, StandardCharsets.US_ASCII));
            }
            assertEquals(1, directory.list().length);
        } finally { file.delete(); directory.delete(); }
    }
    private static int identityDescriptors(File file) throws ErrnoException {
        File[] descriptors = new File("/proc/self/fd").listFiles(); assertNotNull(descriptors);
        int count = 0;
        for (File descriptor : descriptors) {
            try { if (file.getAbsolutePath().equals(Os.readlink(descriptor.getAbsolutePath()))) count++; }
            catch (ErrnoException error) { if (error.errno != OsConstants.ENOENT) throw error; }
        }
        return count;
    }
    private SavedVenueCapture.Venue venue() { return new SavedVenueCapture(URL, 1).complete(URL, "Locale di prova", "n123", URL, 1); }
    private void onMain(Runnable action) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync(); }
    private void runNext() { worker.tasks.remove(0).run(); instrumentation.waitForIdleSync(); }
    private AlertDialog dialog() {
        try { Field field = RecommendationsUi.class.getDeclaredField("dialog"); field.setAccessible(true); return (AlertDialog) field.get(ui); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private LinearLayout rows() { return dialog().findViewById(R.id.recommendation_rows); }
    private TextView status() { return dialog().findViewById(R.id.recommendation_status); }
    private Button row(String code) { return rows().findViewWithTag(code); }
    private static final class Queue extends AbstractExecutorService {
        final List<Runnable> tasks = new ArrayList<>();
        public void execute(Runnable task) { tasks.add(task); }
        public void shutdown() { }
        public List<Runnable> shutdownNow() { return new ArrayList<>(); }
        public boolean isShutdown() { return false; } public boolean isTerminated() { return false; }
        public boolean awaitTermination(long time, TimeUnit unit) { return false; }
    }
    private static final class Sink implements RecommendationsUi.Api {
        int gets, posts; boolean selected, unknown;
        public DrinkRecommendations get(String canonical, RecommendationsClient.Cancellation cancellation) throws IOException {
            cancellation.check(); gets++; assertEquals(URL, canonical); return snapshot();
        }
        public DrinkRecommendations set(String canonical, RecommendationDrink drink, boolean value, RecommendationsClient.Cancellation cancellation) throws IOException {
            cancellation.check(); posts++; assertEquals(URL, canonical); assertEquals(RecommendationDrink.WATER, drink); selected = value;
            if (unknown) { unknown = false; throw new IOException("Local lost response after accepted write"); } return snapshot();
        }
        private DrinkRecommendations snapshot() throws IOException { return fixtureSnapshot(selected); }
    }
    static DrinkRecommendations fixtureSnapshot(boolean selected) throws IOException {
            String[] codes = {"beer_draft", "spritz", "negroni", "sbagliato", "gin_tonic", "gin_lemon", "wine_glass", "alcohol_free", "water"};
            StringBuilder json = new StringBuilder("{\"venue_key\":\"n123\",\"drinks\":[");
            for (String code : codes) { if (json.charAt(json.length() - 1) != '[') json.append(',');
                boolean own = selected && code.equals("water"); json.append("{\"drink\":\"").append(code).append("\",\"count\":").append(own ? 1 : 0).append(",\"recommended\":").append(own).append('}'); }
            return DrinkRecommendations.parse(json.append("]}").toString().getBytes(StandardCharsets.UTF_8), "n123");
    }
}
