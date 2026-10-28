package com.dovebevo.app;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** The caller supplies getNoBackupFilesDir(), never preferences, shared storage or a browser profile. */
final class RecommendationVoterFile implements RecommendationVoter.Storage {
    interface Writer { void write(FileDescriptor descriptor, byte[] bytes) throws IOException, ErrnoException; }
    private final File file;
    private final Writer writer;
    RecommendationVoterFile(File directory) { this(directory, RecommendationVoterFile::writeAndSync); }
    RecommendationVoterFile(File directory, Writer writer) {
        file = new File(directory, "recommendation-voter-v1");
        this.writer = writer;
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
        FileDescriptor descriptor;
        try {
            // Android app SELinux denies hard links. Exclusive creation still never follows/replaces an existing entry.
            descriptor = Os.open(file.getAbsolutePath(), OsConstants.O_WRONLY | OsConstants.O_CREAT
                    | OsConstants.O_EXCL | OsConstants.O_NOFOLLOW, 0600);
        } catch (ErrnoException error) {
            if (error.errno == OsConstants.EEXIST) return existing();
            throw new IOException("Installation identity unavailable");
        }
        try {
            writer.write(descriptor, value.getBytes(StandardCharsets.US_ASCII));
        } catch (ErrnoException error) { throw new IOException("Installation identity unavailable"); }
        finally {
            // Preserve even an incomplete first file: silently deleting it would permit identity rotation after a failure.
            try { Os.close(descriptor); }
            catch (ErrnoException error) { throw new IOException("Installation identity unavailable"); }
        }
        return existing();
    }
    private String existing() throws IOException {
        String value = read();
        if (value == null) throw new IOException("Installation identity unavailable");
        return value;
    }
    private static void writeAndSync(FileDescriptor descriptor, byte[] bytes) throws IOException, ErrnoException {
        int offset = 0;
        while (offset < bytes.length) {
            int count = Os.write(descriptor, bytes, offset, bytes.length - offset);
            if (count <= 0) throw new IOException("Installation identity unavailable");
            offset += count;
        }
        Os.fsync(descriptor);
    }
}
