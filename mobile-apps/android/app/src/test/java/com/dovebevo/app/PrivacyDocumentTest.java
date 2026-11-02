package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.Test;

public class PrivacyDocumentTest {
    @Test public void completeItalianPolicyIsPreservedAcrossSingleByteReads() throws Exception {
        String policy = "# Privacy\nResponsabile: Roberto Valeri\nPosizione e città: è facoltativa.\nFine.\n";
        byte[] source = policy.getBytes(StandardCharsets.UTF_8);
        InputStream split = new ByteArrayInputStream(source) {
            @Override public synchronized int read(byte[] target, int offset, int length) {
                return super.read(target, offset, Math.min(1, length));
            }
        };
        assertEquals(policy, PrivacyDocument.read(split));
    }

    @Test public void optionalUtf8BomIsNotShownAsPolicyText() throws Exception {
        assertEquals("Privacy\n", PrivacyDocument.read(bytes("\uFEFFPrivacy\n")));
    }

    @Test public void exactByteLimitRemainsComplete() throws Exception {
        byte[] policy = new byte[PrivacyDocument.MAX_BYTES];
        Arrays.fill(policy, (byte) 'a');
        assertEquals(PrivacyDocument.MAX_BYTES, PrivacyDocument.read(new ByteArrayInputStream(policy)).length());
    }

    @Test public void oversizedInputFailsAfterAtMostOneExcessByte() {
        int[] consumed = {0};
        InputStream endless = new InputStream() {
            @Override public int read() { consumed[0]++; return 'a'; }
            @Override public int read(byte[] target, int offset, int length) {
                Arrays.fill(target, offset, offset + length, (byte) 'a');
                consumed[0] += length;
                return length;
            }
        };
        assertThrows(IOException.class, () -> PrivacyDocument.read(endless));
        assertEquals(PrivacyDocument.MAX_BYTES + 1, consumed[0]);
    }

    @Test public void malformedUtf8AndEmptyDocumentsFailInsteadOfShowingPartialPolicy() {
        assertThrows(IOException.class, () -> PrivacyDocument.read(new ByteArrayInputStream(new byte[]{'a', (byte) 0xC3})));
        assertThrows(IOException.class, () -> PrivacyDocument.read(bytes(" \r\n\t")));
        assertThrows(IOException.class, () -> PrivacyDocument.read(bytes("Privacy\0hidden")));
    }

    @Test public void assetReadErrorDoesNotReturnOnlyTheInitialParagraph() {
        IOException failure = new IOException("Asset read failed");
        InputStream broken = new InputStream() {
            private boolean started;
            @Override public int read() throws IOException {
                if (started) throw failure;
                started = true;
                return 'a';
            }
        };
        assertSame(failure, assertThrows(IOException.class, () -> PrivacyDocument.read(broken)));
    }

    @Test public void zeroLengthReadDoesNotSpinOrDropTheNextCharacter() throws Exception {
        InputStream zeroFirst = new ByteArrayInputStream(new byte[]{'O', 'K'}) {
            private boolean first = true;
            @Override public synchronized int read(byte[] target, int offset, int length) {
                if (first) { first = false; return 0; }
                return super.read(target, offset, length);
            }
        };
        assertEquals("OK", PrivacyDocument.read(zeroFirst));
    }

    private static ByteArrayInputStream bytes(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }
}
