package com.dovebevo.app;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** The caller supplies getNoBackupFilesDir(), never preferences, shared storage or a browser profile. */
final class RecommendationVoterFile implements RecommendationVoter.Storage {
    private final File directory;
    private final File file;
    RecommendationVoterFile(File directory) {
        this.directory = directory;
        file = new File(directory, "recommendation-voter-v1");
    }
    @Override public String read() throws IOException {
        FileDescriptor descriptor;
        try {
            descriptor = Os.open(file.getAbsolutePath(), OsConstants.O_RDONLY | OsConstants.O_NOFOLLOW, 0);
        } catch (ErrnoException error) {
            if (error.errno == OsConstants.ENOENT) return null;
            throw new IOException("Installation identity unavailable");
        }
        // Android's FileInputStream(FileDescriptor) is non-owning. Os.open's owner must close it on every path.
        try (FileInputStream input = new FileInputStream(descriptor)) {
                byte[] bytes = new byte[37]; int length = 0, read;
                while (length < bytes.length && (read = input.read(bytes, length, bytes.length - length)) != -1) length += read;
                if (length != 36) throw new IOException("Installation identity unavailable");
                String value = new String(bytes, 0, length, StandardCharsets.US_ASCII);
                if (!RecommendationVoter.valid(value)) throw new IOException("Installation identity unavailable");
                return value;
        } finally {
            try { Os.close(descriptor); }
            catch (ErrnoException error) { throw new IOException("Installation identity unavailable"); }
        }
    }
    @Override public String create(String value) throws IOException {
        if (!RecommendationVoter.valid(value)) throw new IOException("Installation identity unavailable");
        File temporary = File.createTempFile("recommendation-voter-", ".tmp", directory);
        try {
            Os.chmod(temporary.getAbsolutePath(), 0600);
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(value.getBytes(StandardCharsets.US_ASCII)); output.getFD().sync();
            }
            // link is create-only: a competing writer can win, but an existing identity is never replaced.
            try { Os.link(temporary.getAbsolutePath(), file.getAbsolutePath()); }
            catch (ErrnoException error) { if (error.errno != OsConstants.EEXIST) throw error; }
            String persisted = read();
            if (persisted == null) throw new IOException("Installation identity unavailable");
            return persisted;
        } catch (ErrnoException error) { throw new IOException("Installation identity unavailable"); }
        finally { temporary.delete(); }
    }
}
