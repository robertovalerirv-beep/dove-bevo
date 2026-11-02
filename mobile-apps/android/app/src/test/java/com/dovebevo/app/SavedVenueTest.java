package com.dovebevo.app;

import static org.junit.Assert.*;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class SavedVenueTest {
    private static final String ONE = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static final String TWO = "https://www.dovebevo.com/bar/w9?c=sr2y7";

    @Test public void emptyNamesNeverCreateAnIdPlaceholderOrChangeExistingBookmarks() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        assertEquals(SavedVenueStore.Result.SAVED, store.save(ONE, "Camparino in Galleria"));
        byte[] before = storage.bytes.clone();
        for (String name : new String[]{null, "", "  ", "\u2003"})
            assertEquals(SavedVenueStore.Result.INVALID_LABEL, store.save(TWO, name));
        assertArrayEquals(before, storage.bytes);
        assertEquals(1, storage.writes);
    }

    @Test public void canonicalLinksAcceptBothWebsiteOriginsAndAllVenuePrefixes() {
        for (String prefix : new String[]{"n", "w", "r", "u"}) {
            assertEquals("https://www.dovebevo.com/bar/" + prefix + "123?c=u0nd9",
                    SavedVenueUrl.canonicalize("HTTPS://DOVEBEVO.COM:443/bar/" + prefix + "123?c=u0nd9"));
        }
        assertEquals("https://www.dovebevo.com/bar/n999999999999999?c=00000",
                SavedVenueUrl.canonicalize("https://www.dovebevo.com/bar/n999999999999999?c=00000"));
    }

    @Test public void rejectsUntrustedOrAmbiguousLinksInsteadOfFallingBackToHome() {
        for (String invalid : new String[]{null, "", "https://www.dovebevo.com/", "https://www.dovebevo.com/admin",
                "https://www.dovebevo.com/?at=45,9", "http://www.dovebevo.com/bar/n123?c=u0nd9",
                "https://www.dovebevo.com.evil.invalid/bar/n123?c=u0nd9", "https://user@www.dovebevo.com/bar/n123?c=u0nd9",
                "https://www.dovebevo.com:444/bar/n123?c=u0nd9", "https://www.dovebevo.com:/bar/n123?c=u0nd9",
                "https://www.dovebevo.com/bar/n123?c=u0nd9#", "https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9",
                "https://www.dovebevo.com/bar/n123?c=u0nd9&token=private", "https://www.dovebevo.com/bar/n123?c=u0nd9&",
                "https://www.dovebevo.com/bar/%6e123?c=u0nd9", "https://www.dovebevo.com/bar/n123?c=%750nd9",
                "https://www.dovebevo.com/bar/n123/?c=u0nd9", "https://www.dovebevo.com/bar/N123?c=u0nd9",
                "https://www.dovebevo.com/bar/n0123?c=u0nd9", "https://www.dovebevo.com/bar/n0?c=u0nd9",
                "https://www.dovebevo.com/bar/n1234567890123456?c=u0nd9", "https://www.dovebevo.com/bar/n١٢٣?c=u0nd9",
                "https://www.dovebevo.com/bar/n123?c=U0ND9", "https://www.dovebevo.com/bar/n123?c=u0nda",
                "https://www.dovebevo.com/bar/n123?c=u0nd9\n", "https://www.dovebevo.com\\bar/n123?c=u0nd9"}) {
            assertNull(String.valueOf(invalid), SavedVenueUrl.canonicalize(invalid));
        }
    }

    @Test public void explicitSavePersistsOnlyCanonicalLinkAndActualNameAcrossStoreInstances() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        assertEquals(SavedVenueStore.Result.SAVED, store.save("https://dovebevo.com/bar/n123?c=u0nd9", "  Bar di prova  "));
        SavedVenueStore reopened = new SavedVenueStore(storage);
        assertEquals(1, reopened.load().size());
        assertEquals(ONE, reopened.load().get(0).url);
        assertEquals("Bar di prova", reopened.load().get(0).label);
        assertEquals(SavedVenueStore.Result.INVALID_LABEL, reopened.save(TWO, "  "));
        assertEquals(1, reopened.load().size());
        assertEquals(1, storage.writes);
    }

    @Test public void duplicateUpdatesLabelAndMovesToFrontWithoutGrowingTheList() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        store.save(ONE, "Uno"); store.save(TWO, "Due");
        assertEquals(SavedVenueStore.Result.SAVED, store.save("https://dovebevo.com:443/bar/n123?c=u0nd9", "Uno aggiornato"));
        List<SavedVenueStore.Venue> venues = store.load();
        assertEquals(2, venues.size());
        assertEquals(ONE, venues.get(0).url);
        assertEquals("Uno aggiornato", venues.get(0).label);
        assertEquals(TWO, venues.get(1).url);
    }

    @Test public void capacityNeverSilentlyEvictsAndRebookmarkingCanRefreshAnActualName() throws Exception {
        SavedVenueStore store = new SavedVenueStore(new MemoryStorage());
        for (int i = 1; i <= 50; i++) assertEquals(SavedVenueStore.Result.SAVED,
                store.save("https://www.dovebevo.com/bar/n" + i + "?c=u0nd9", "Locale " + i));
        assertEquals(SavedVenueStore.Result.FULL, store.save(TWO, "Nuovo"));
        assertEquals(50, store.load().size());
        assertEquals(SavedVenueStore.Result.SAVED, store.save("https://www.dovebevo.com/bar/n1?c=u0nd9", "Nome aggiornato"));
        assertEquals("Nome aggiornato", store.load().get(0).label);
        assertEquals(50, store.load().size());
    }

    @Test public void invalidLabelsAndUrlsDoNotWriteOrChangePriorRecords() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        store.save(ONE, "Uno");
        byte[] before = storage.bytes.clone();
        for (String label : new String[]{"x".repeat(121), "Nome\nnota", "Nome\u0000", "Nome\u0085", "Nome\ud800"})
            assertEquals(SavedVenueStore.Result.INVALID_LABEL, store.save(TWO, label));
        assertEquals(SavedVenueStore.Result.INVALID_URL, store.save(BrowserPolicy.HOME, "Home"));
        assertArrayEquals(before, storage.bytes);
        assertEquals(1, storage.writes);
        assertEquals(SavedVenueStore.Result.SAVED, store.save(TWO, "🍷".repeat(80)));
        assertEquals(80, store.load().get(0).label.codePointCount(0, store.load().get(0).label.length()));
    }

    @Test public void existingCustomAndIdLabelsAndLegacyLongEmojiRemainReadableUnchanged() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        storage.bytes = encoded(new String[][]{{ONE, "🍷".repeat(80)}, {TWO, "Locale w9"}});
        SavedVenueStore store = new SavedVenueStore(storage);
        assertEquals("🍷".repeat(80), store.load().get(0).label);
        assertEquals("Locale w9", store.load().get(1).label);
        assertEquals(SavedVenueStore.Result.SAVED, store.save(ONE, "x".repeat(120)));
        assertEquals("x".repeat(120), store.load().get(0).label);
        assertEquals("Locale w9", store.load().get(1).label);
    }

    @Test public void removingRevalidatesAndNeverChangesAnUnrelatedVenue() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        store.save(ONE, "Uno"); store.save(TWO, "Due");
        assertEquals(SavedVenueStore.Result.NOT_FOUND, store.remove("https://www.dovebevo.com/bar/u8?c=u0nd9"));
        assertEquals(SavedVenueStore.Result.INVALID_URL, store.remove("https://evil.invalid/bar/n123?c=u0nd9"));
        assertEquals(SavedVenueStore.Result.REMOVED, store.remove("https://dovebevo.com/bar/n123?c=u0nd9"));
        assertEquals(1, store.load().size());
        assertEquals(TWO, store.load().get(0).url);
    }

    @Test public void storageFailuresAreReportedWithoutFalseSuccessOrDestroyingPriorRecords() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        SavedVenueStore store = new SavedVenueStore(storage);
        store.save(ONE, "Uno");
        byte[] before = storage.bytes.clone();
        storage.failWrite = true;
        assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.save(TWO, "Due"));
        assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.remove(ONE));
        assertArrayEquals(before, storage.bytes);
        storage.failWrite = false;
        storage.failRead = true;
        assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.save(TWO, "Due"));
        assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.remove(ONE));
        try { store.load(); fail("Unreadable storage must not be presented as an empty list"); }
        catch (IOException expected) { assertEquals("read failed", expected.getMessage()); }
        assertArrayEquals(before, storage.bytes);
    }

    @Test public void malformedRecordsAreDiscardedAndUnknownOrTruncatedDataIsSafe() throws Exception {
        MemoryStorage storage = new MemoryStorage();
        storage.bytes = encoded(new String[][]{{ONE, "Uno"}, {"https://evil.invalid/bar/n123?c=u0nd9", "Bad"},
                {"https://dovebevo.com/bar/n123?c=u0nd9", "Duplicate"}, {TWO, "\nBad"}});
        SavedVenueStore store = new SavedVenueStore(storage);
        assertEquals(1, store.load().size());
        assertEquals("Uno", store.load().get(0).label);
        for (byte[] corrupt : new byte[][]{new byte[0], new byte[]{1, 2, 3}, Arrays.copyOf(storage.bytes, 6),
                new byte[SavedVenueStore.MAX_BYTES + 1], encoded(new String[51][2])}) {
            storage.bytes = corrupt;
            try { store.load(); fail("Whole-file corruption must not be presented as empty"); }
            catch (IOException expected) { assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.save(ONE, "Uno")); }
            assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.remove(ONE));
            assertArrayEquals(corrupt, storage.bytes);
        }
    }

    private static byte[] encoded(String[][] records) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream output = new DataOutputStream(bytes);
        output.writeInt(0x44425631); output.writeInt(records.length);
        for (String[] record : records) { output.writeUTF(record[0] == null ? "" : record[0]); output.writeUTF(record[1] == null ? "" : record[1]); }
        output.close();
        return bytes.toByteArray();
    }

    private static final class MemoryStorage implements SavedVenueStore.Storage {
        byte[] bytes;
        boolean failRead;
        boolean failWrite;
        int writes;
        @Override public byte[] read() throws IOException { if (failRead) throw new IOException("read failed"); return bytes == null ? null : bytes.clone(); }
        @Override public void write(byte[] value) throws IOException {
            if (failWrite) throw new IOException("write failed");
            bytes = value.clone(); writes++;
        }
    }
}
