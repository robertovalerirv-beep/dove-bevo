package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class SavedMenuOfferTest {
    private static final String VENUE="https://www.dovebevo.com/bar/m000000000000000000000007?c=u0nd9";
    static final class Memory implements SavedVenueStore.Storage {
        byte[] bytes;boolean fail;
        public byte[] read(){return bytes==null?null:bytes.clone();}
        public void write(byte[] value)throws IOException{if(fail)throw new IOException("owned failure");bytes=value.clone();}
    }
    private SavedMenuOfferStore.Entry item(){
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Bar Milano");
        MenuV2Prices.Price source=new MenuV2Prices.Price("spritz.7","Bar Milano","Spritz della casa","",0,550,"EUR",2,"calice",250,false,"2026-11-03","Servizio escluso");
        return SavedMenuOfferStore.verified(venue,source);
    }
    @Test public void exactOwnerOfferPersistsDisplayWithoutPriceAndCanBeRemoved()throws Exception {
        Memory data=new Memory();SavedMenuOfferStore store=new SavedMenuOfferStore(data);
        SavedMenuOfferStore.Entry item=item();assertNotNull(item);
        assertEquals(SavedMenuOfferStore.Result.SAVED,store.save(item));
        assertEquals(item.key(),store.load().get(0).key());assertEquals(item.name,store.load().get(0).name);
        assertEquals("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&offer=spritz.7",item.focusedUrl());
        String encoded=new String(data.bytes,StandardCharsets.ISO_8859_1);
        for(String forbidden:new String[]{"amount","price","550","currency","EUR","2026-11-03"})assertFalse(forbidden,encoded.contains(forbidden));
        assertEquals(SavedMenuOfferStore.Result.REMOVED,store.remove(item));assertTrue(store.load().isEmpty());
    }
    @Test public void commandIsExactAndNeverAnOrdinaryVenueRoute(){
        String base="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9";
        assertEquals("spritz.7",OfferSaveCommand.offerId(base+"&save_offer=spritz.7",VENUE));
        assertNull(SavedVenueUrl.canonicalize(base+"&save_offer=spritz.7"));
        assertNull(OfferSaveCommand.offerId(base+"&save_offer=spritz.7","https://www.dovebevo.com/bar/n123?c=u0nd9"));
        for(String invalid:new String[]{base+"&save_offer=%73pritz.7",base+"&save_offer=spritz.7&extra=x",base+"&save_offer=spritz.7#x",
                base+"&save_offer=spritz.7&save_offer=other",base.replace("%2Fbar%2F","%252Fbar%252F")+"&save_offer=spritz.7",
                "https://evil.test/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&save_offer=spritz.7"})
            assertNull(invalid,OfferSaveCommand.offerId(invalid,VENUE));
    }
    @Test public void verifiedMetadataAcceptsThePublicV2NameServingAndVolumeBounds(){
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Bar Milano");
        assertNotNull(SavedMenuOfferStore.validated(venue,"long.1","A".repeat(512),null,"B".repeat(256),100000));
        assertNull(SavedMenuOfferStore.validated(venue,"long.1","A".repeat(513),null,"B".repeat(256),100000));
        assertNull(SavedMenuOfferStore.validated(venue,"long.1","A".repeat(512),null,"B".repeat(257),100000));
    }
    @Test public void focusRejectsExtraAndEncodedIdentifiersAndCustomerIsNotAnOwner() {
        String focus=MobileEntry.offerDocument(VENUE,"spritz.7");
        assertEquals(VENUE,MobileEntry.publicVenue(focus));assertEquals(focus,MobileEntry.documentURL(focus));
        assertNull(MobileEntry.publicVenue(focus+"&extra=x"));
        assertNull(MobileEntry.publicVenue(focus.replace("offer=","save_offer=")));
        assertNull(MobileEntry.publicVenue(focus.replace("offer=spritz.7","offer=%73pritz.7")));
        assertNull(MobileEntry.offerDocument(VENUE,"bad/name"));
        MenuV2Prices.Price customer=new MenuV2Prices.Price("spritz.7","Bar Milano","Spritz della casa","",0,100,"EUR",2,"calice",250,true,"2026-11-03","Servizio escluso");
        assertNull(SavedMenuOfferStore.verified(SavedVenueStore.reference(VENUE,"Bar Milano"),customer));
    }
    @Test public void fullAndUnreadableStorePreservePriorBytes()throws Exception {
        Memory data=new Memory();SavedMenuOfferStore store=new SavedMenuOfferStore(data);SavedMenuOfferStore.Entry first=item();
        for(int i=0;i<50;i++)assertEquals(SavedMenuOfferStore.Result.SAVED,store.save(SavedMenuOfferStore.validated(first.venue,"drink."+i,"Drink "+i,null,null,null)));
        byte[] old=data.bytes.clone();assertEquals(SavedMenuOfferStore.Result.FULL,store.save(SavedMenuOfferStore.validated(first.venue,"extra","Extra",null,null,null)));assertArrayEquals(old,data.bytes);
        data.fail=true;assertEquals(SavedMenuOfferStore.Result.STORAGE_ERROR,store.remove(store.load().get(0)));assertArrayEquals(old,data.bytes);
        data.fail=false;data.bytes=new byte[]{1,2};assertThrows(IOException.class,store::load);assertEquals(SavedMenuOfferStore.Result.STORAGE_ERROR,store.save(first));
    }
}
