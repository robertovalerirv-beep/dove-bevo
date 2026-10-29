package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class MobilePresentationTest {
    @Test public void onlyTheExactCurrentWebsiteDocumentMayReceiveTheBundledInstaller() {
        String venue="https://www.dovebevo.com/bar/n123?c=u0nd9";
        assertTrue(MobilePresentation.allows(BrowserPolicy.HOME,BrowserPolicy.HOME));
        assertTrue(MobilePresentation.allows(venue,venue));
        assertFalse(MobilePresentation.allows(venue,BrowserPolicy.HOME));
        for(String url:new String[]{null,"http://www.dovebevo.com/","https://dovebevo.com/",
                "https://www.dovebevo.com.evil.test/","https://www.dovebevo.com@evil.test/",
                "https://user@www.dovebevo.com/","https://www.dovebevo.com:443/",
                "https://www.dovebevo.com:8443/","file:///android_asset/mobile-app-theme.js",
                "about:blank","javascript:alert(1)","https://challenges.cloudflare.com/"}) {
            assertFalse(String.valueOf(url),MobilePresentation.allows(url,url));
        }
    }

    @Test public void missingOversizedAndInvalidUTF8AssetsFailClosedWithoutPartialCode() throws Exception {
        byte[] exact="(() => { 'use strict'; })();".getBytes(StandardCharsets.UTF_8);
        assertEquals(new String(exact,StandardCharsets.UTF_8),MobilePresentation.read(new ByteArrayInputStream(exact)));
        for(byte[] invalid:new byte[][]{new byte[0],new byte[MobilePresentation.MAX_BYTES+1],new byte[]{(byte)0xc3,0x28}}) {
            try{MobilePresentation.read(new ByteArrayInputStream(invalid));fail("Invalid bundled code accepted");}
            catch(IOException expected){}
        }
    }
}
