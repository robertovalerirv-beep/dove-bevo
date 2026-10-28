package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import org.junit.Test;

public final class RecommendationVoterTest {
    private static final String ID = "12345678-1234-4abc-8abc-123456789abc";
    static final class Memory implements RecommendationVoter.Storage {
        String value; int creates; boolean fail;
        public String read() { return value; }
        public String create(String next) throws IOException { creates++; if (fail) throw new IOException(); if(value==null)value=next; return value; }
    }

    @Test public void createsOnceAndKeepsExistingInstallationAcrossClients() throws Exception {
        Memory storage = new Memory();
        assertEquals(ID, new RecommendationVoter(storage, () -> ID).id());
        assertEquals(ID, new RecommendationVoter(storage, () -> "11111111-1111-4111-8111-111111111111").id());
        assertEquals(1, storage.creates);
    }

    @Test public void malformedOrUnreadableIdentityNeverSilentlyResetsVotes() throws Exception {
        for(String bad:new String[]{"",ID.toUpperCase(),"12345678-1234-1abc-8abc-123456789abc",ID+"\n","wrong"}) {
            Memory storage=new Memory();storage.value=bad;
            try {new RecommendationVoter(storage,()->ID).id();fail("Reset invalid identity");} catch(IOException expected) { }
            assertEquals(0,storage.creates);
        }
        Memory storage=new Memory();storage.fail=true;
        try{new RecommendationVoter(storage,()->ID).id();fail("False persistence success");}catch(IOException expected) { }
        assertNull(storage.value);
        RecommendationVoter.Storage unreadable = new RecommendationVoter.Storage() {
            public String read() throws IOException { throw new IOException(); }
            public String create(String value) { throw new AssertionError("Unreadable identity replaced"); }
        };
        try { new RecommendationVoter(unreadable, () -> ID).id(); fail("Unreadable identity accepted"); } catch (IOException expected) { }
    }
}
