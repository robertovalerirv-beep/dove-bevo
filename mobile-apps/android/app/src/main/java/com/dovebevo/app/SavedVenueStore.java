package com.dovebevo.app;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Bounded explicit choices only; no browsing history, coordinates, cookies or prices. */
public final class SavedVenueStore {
    public static final int MAX_VENUES = 50;
    public static final int MAX_LABEL_CODE_POINTS = 120;
    public static final int MAX_BYTES = 65536;
    private static final int MAGIC = 0x44425631;

    public interface Storage {
        /** Null means no file has been created; empty or malformed files are corruption. */
        byte[] read() throws IOException;
        /** Replace atomically, or throw with the previous contents preserved. */
        void write(byte[] bytes) throws IOException;
    }

    public enum Result { SAVED, REMOVED, INVALID_URL, INVALID_LABEL, FULL, NOT_FOUND, STORAGE_ERROR }

    public static final class Venue {
        public final String url;
        public final String label;
        private Venue(String url, String label) { this.url = url; this.label = label; }
    }

    private final Storage storage;

    public SavedVenueStore(Storage storage) { this.storage = storage; }

    public List<Venue> load() throws IOException {
        byte[] bytes = storage.read();
        if (bytes == null) return Collections.emptyList();
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("Saved venues are unreadable");
        List<Venue> venues = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(bytes))) {
            if (input.readInt() != MAGIC) throw new IOException("Unknown saved venues format");
            int count = input.readInt();
            if (count < 0 || count > MAX_VENUES) throw new IOException("Invalid saved venues count");
            for (int i = 0; i < count; i++) {
                String url = SavedVenueUrl.canonicalize(input.readUTF());
                String label = normalizedLabel(input.readUTF());
                if (url != null && label != null && !label.isEmpty() && seen.add(url)) venues.add(new Venue(url, label));
            }
            if (input.available() != 0) throw new IOException("Unexpected saved venues data");
            return Collections.unmodifiableList(venues);
        } catch (IOException | RuntimeException malformed) { throw new IOException("Saved venues are unreadable", malformed); }
    }

    public Result save(String rawUrl, String requestedLabel) {
        String url = SavedVenueUrl.canonicalize(rawUrl);
        if (url == null) return Result.INVALID_URL;
        String label = normalizedLabel(requestedLabel == null ? "" : requestedLabel);
        if (label == null || label.isEmpty()) return Result.INVALID_LABEL;
        try {
            List<Venue> previous = load();
            List<Venue> next = new ArrayList<>();
            next.add(new Venue(url, label));
            boolean duplicate = false;
            for (Venue venue : previous) {
                if (venue.url.equals(url)) duplicate = true;
                else next.add(venue);
            }
            if (!duplicate && previous.size() >= MAX_VENUES) return Result.FULL;
            storage.write(encode(next));
            return Result.SAVED;
        } catch (IOException | RuntimeException error) { return Result.STORAGE_ERROR; }
    }

    public Result remove(String rawUrl) {
        String url = SavedVenueUrl.canonicalize(rawUrl);
        if (url == null) return Result.INVALID_URL;
        try {
            List<Venue> previous = load();
            List<Venue> next = new ArrayList<>();
            for (Venue venue : previous) if (!venue.url.equals(url)) next.add(venue);
            if (next.size() == previous.size()) return Result.NOT_FOUND;
            storage.write(encode(next));
            return Result.REMOVED;
        } catch (IOException | RuntimeException error) { return Result.STORAGE_ERROR; }
    }

    private static byte[] encode(List<Venue> venues) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeInt(MAGIC);
            output.writeInt(venues.size());
            for (Venue venue : venues) { output.writeUTF(venue.url); output.writeUTF(venue.label); }
        }
        if (bytes.size() > MAX_BYTES) throw new IOException("Saved venues are too large");
        return bytes.toByteArray();
    }

    private static String normalizedLabel(String value) {
        for (int i = 0; i < value.length();) {
            int codePoint = value.codePointAt(i);
            if (Character.isISOControl(codePoint) || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
            i += Character.charCount(codePoint);
        }
        int first = 0;
        int last = value.length();
        while (first < last && isSpace(value.codePointAt(first))) first += Character.charCount(value.codePointAt(first));
        while (last > first && isSpace(value.codePointBefore(last))) last -= Character.charCount(value.codePointBefore(last));
        String trimmed = value.substring(first, last);
        if (trimmed.codePointCount(0, trimmed.length()) > MAX_LABEL_CODE_POINTS) return null;
        for (int i = 0; i < trimmed.length();) {
            int codePoint = trimmed.codePointAt(i);
            if (Character.isISOControl(codePoint) || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
            i += Character.charCount(codePoint);
        }
        return trimmed;
    }

    private static boolean isSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint);
    }
}
