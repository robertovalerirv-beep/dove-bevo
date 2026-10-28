package com.dovebevo.app;

import android.system.ErrnoException;
import android.system.Os;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** App-private local file. The app's existing backup policy remains unchanged. */
final class SavedVenueFile implements SavedVenueStore.Storage {
    private final File file;
    private final File temporary;

    SavedVenueFile(File directory) {
        file = new File(directory, "saved-venues-v1.bin");
        temporary = new File(directory, "saved-venues-v1.tmp");
    }

    @Override public byte[] read() throws IOException {
        try (InputStream input = new FileInputStream(file); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (bytes.size() + read > SavedVenueStore.MAX_BYTES) return new byte[SavedVenueStore.MAX_BYTES + 1];
                bytes.write(buffer, 0, read);
            }
            return bytes.toByteArray();
        } catch (FileNotFoundException error) {
            if (file.exists()) throw error;
            return new byte[0];
        }
    }

    @Override public void write(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length > SavedVenueStore.MAX_BYTES) throw new IOException("Invalid saved venues size");
        try {
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(bytes);
                output.getFD().sync();
            }
            // Public API since Android 5: same-directory POSIX rename either
            // atomically replaces the prior file or reports an explicit error.
            Os.rename(temporary.getAbsolutePath(), file.getAbsolutePath());
        } catch (ErrnoException error) {
            throw new IOException("Saved venues could not be replaced", error);
        } finally {
            // Only this store's staging file is disposable; never delete the
            // previous committed file on a failed write or rename.
            if (temporary.exists()) temporary.delete();
        }
    }
}
