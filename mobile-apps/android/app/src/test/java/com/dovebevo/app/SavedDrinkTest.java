package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public final class SavedDrinkTest {
    static final String ONE="https://www.dovebevo.com/bar/n123?c=u0nd9";
    static final class Memory implements SavedVenueStore.Storage {
        byte[] bytes;boolean fail;
        public byte[] read(){return bytes==null?null:bytes.clone();}
        public void write(byte[] value)throws IOException{if(fail)throw new IOException("Owned failure");bytes=value.clone();}
    }
    @Test public void independentStorePersistsOnlyExplicitTupleAndActualName()throws Exception {
        Memory old=new Memory(),data=new Memory();SavedVenueStore venues=new SavedVenueStore(old);venues.save(ONE,"Locale");byte[] before=old.bytes.clone();
        SavedDrinkStore drinks=new SavedDrinkStore(data);assertEquals(SavedDrinkStore.Result.SAVED,drinks.save(ONE,"Locale",RecommendationDrink.SPRITZ,1));
        SavedDrinkStore.Entry item=new SavedDrinkStore(data).load().get(0);assertEquals("n123/spritz/1",item.key());assertEquals("Locale",item.venue.label);assertEquals(ONE,item.venue.url);
        assertArrayEquals(before,old.bytes);assertEquals(1,venues.load().size());
        String encoded=new String(data.bytes,StandardCharsets.ISO_8859_1);for(String forbidden:new String[]{"price","amount","currency","GBP","EUR","revision","serving","observed","2026"})assertFalse(encoded.contains(forbidden));
        assertEquals(SavedDrinkStore.Result.REMOVED,drinks.remove(item));assertTrue(drinks.load().isEmpty());assertArrayEquals(before,old.bytes);
    }
    @Test public void tupleUpsertIgnoresCellButOtherDrinkAndBandAreIndependent()throws Exception {
        Memory data=new Memory();SavedDrinkStore store=new SavedDrinkStore(data);
        store.save(ONE,"First",RecommendationDrink.SPRITZ,0);store.save(ONE,"First",RecommendationDrink.SPRITZ,1);store.save(ONE,"First",RecommendationDrink.WATER,0);
        store.save("https://www.dovebevo.com/bar/n123?c=sr2y7","Automatic new name",RecommendationDrink.SPRITZ,0);
        assertEquals(3,store.load().size());assertEquals("Automatic new name",store.load().get(0).venue.label);assertTrue(store.load().get(0).venue.url.endsWith("sr2y7"));
        assertEquals(SavedDrinkStore.Result.REMOVED,store.remove(store.load().get(0)));assertEquals(2,store.load().size());assertEquals(1,store.load().stream().filter(e->e.band==1).count());
    }
    @Test public void capacityFailuresAndCorruptionPreservePreviousBytes()throws Exception {
        Memory data=new Memory();SavedDrinkStore store=new SavedDrinkStore(data);
        for(int i=1;i<=50;i++)assertEquals(SavedDrinkStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n"+i+"?c=u0nd9","Venue "+i,RecommendationDrink.SPRITZ,0));
        assertEquals(SavedDrinkStore.Result.FULL,store.save("https://www.dovebevo.com/bar/n51?c=u0nd9","51",RecommendationDrink.SPRITZ,0));
        assertEquals(SavedDrinkStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n1?c=u0nd9","Renamed automatically",RecommendationDrink.SPRITZ,0));
        byte[] before=data.bytes.clone();data.fail=true;assertEquals(SavedDrinkStore.Result.STORAGE_ERROR,store.remove(store.load().get(0)));assertArrayEquals(before,data.bytes);
        assertEquals(SavedDrinkStore.Result.INVALID,store.save(ONE,"",RecommendationDrink.WATER,0));assertEquals(SavedDrinkStore.Result.INVALID,store.save(ONE,"Name",RecommendationDrink.WATER,2));
        for(byte[] corrupt:new byte[][]{new byte[0],new byte[]{1,2},Arrays.copyOf(before,before.length-1),new byte[65537]}){data.bytes=corrupt;assertThrows(IOException.class,store::load);assertEquals(SavedDrinkStore.Result.STORAGE_ERROR,store.save(ONE,"Name",RecommendationDrink.WATER,0));assertArrayEquals(corrupt,data.bytes);}
    }
    @Test public void focusRoutesAreStrictAndCanonicalIdentityStripsOnlyValidatedFocus() {
        for(RecommendationDrink drink:RecommendationDrink.values())for(int band=0;band<2;band++){
            String route=MobileEntry.drinkDocument(ONE,drink,band);assertEquals(ONE,SavedVenueUrl.canonicalize(route));assertEquals(route,MobileEntry.documentURL(route));assertTrue(route.endsWith("&drink="+drink.code+"&hh="+band));
        }
        String base=MobileEntry.venueDocument(ONE);
        for(String suffix:new String[]{"&drink=spritz","&hh=0","&drink=spritz&hh=01","&drink=spritz&hh=2","&drink=spritz&hh=true","&drink=spritz&hh=-1","&drink=nope&hh=0","&drink=%73pritz&hh=0","&%64rink=spritz&hh=0","&drink=spritz&hh=0&hh=1","&drink=spritz&hh=0&extra=x","&drink=spritz&hh=0#x"})assertNull(suffix,SavedVenueUrl.canonicalize(base+suffix));
        assertNull(MobileEntry.drinkDocument(ONE,null,0));assertNull(MobileEntry.drinkDocument(ONE,RecommendationDrink.WATER,2));
    }
    @Test public void ownDrinkAndBandNeverSubstituteCheaperOtherRows()throws Exception {
        Memory data=new Memory();SavedDrinkStore store=new SavedDrinkStore(data);store.save(ONE,"Saved",RecommendationDrink.SPRITZ,1);store.save(ONE,"Saved",RecommendationDrink.WATER,0);
        FavoriteComparison.Cell cell=new FavoriteComparison.Cell(Map.of("n123","Current automatic name"),Map.of("n123/spritz/0",new FavoriteComparison.Price(400,"2026-11-02",0,false),"n123/spritz/1",new FavoriteComparison.Price(700,"2026-11-02",2,false)),true);
        List<SavedDrinkComparison.Row> rows=SavedDrinkComparison.rows(store.load(),Map.of("u0nd9",cell));
        assertEquals(2,rows.size());assertFalse(rows.get(0).price.available());assertEquals(700,rows.get(1).price.price.cents);assertEquals("Current automatic name",rows.get(1).price.name);
        assertFalse(SavedDrinkComparison.rows(store.load(),Collections.emptyMap()).get(0).price.available());
    }
    @Test public void allForeignServingVariantsRemainIndependentWithoutPersistingThem()throws Exception {
        Memory data=new Memory();SavedDrinkStore store=new SavedDrinkStore(data);String url="https://www.dovebevo.com/bar/n91?c=gcpvj";store.save(url,"Saved London",RecommendationDrink.WINE_GLASS,0);byte[] before=data.bytes.clone();
        EuropePrices.Cell europe=EuropePricesTest.cell(EuropePricesTest.wine(175,720)+","+EuropePricesTest.wine(250,920));
        List<SavedDrinkComparison.Row> rows=SavedDrinkComparison.rows(store.load(),Map.of("gcpvj",FavoriteComparison.withEurope(null,europe)));
        assertEquals(2,rows.size());assertEquals("GBP",rows.get(0).price.mobilePrice.currency);assertNotEquals(rows.get(0).price.group(),rows.get(1).price.group());assertArrayEquals(before,data.bytes);
        EuropePrices.Cell hidden=EuropePrices.parse(EuropePricesTest.bytes(EuropePricesTest.body(EuropePricesTest.wine(175,720),"\"n91\"","")),EuropePricesTest.catalog(),"gcpvj",null,EuropePricesTest.TODAY);
        assertFalse(SavedDrinkComparison.rows(store.load(),Map.of("gcpvj",FavoriteComparison.withEurope(null,hidden))).get(0).price.available());
    }
}
