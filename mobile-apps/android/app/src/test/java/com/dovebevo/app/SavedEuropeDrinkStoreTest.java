package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class SavedEuropeDrinkStoreTest {
    static final String LONDON="https://www.dovebevo.com/bar/n91?c=gcpvj";
    static final class Memory implements SavedVenueStore.Storage {
        byte[] bytes;boolean fail;
        public byte[] read(){return bytes==null?null:bytes.clone();}
        public void write(byte[] value)throws IOException{if(fail)throw new IOException("storage failure");bytes=value.clone();}
    }
    private static SavedEuropeDrinkStore.Entry entry(EuropePrices.Price price){
        return SavedEuropeDrinkStore.verified(SavedVenueStore.reference(LONDON,"Actual venue name"),price);
    }
    @Test public void eachServingBandAndCurrencyIsAnIndependentPrivateChoice()throws Exception{
        Memory data=new Memory();SavedEuropeDrinkStore store=new SavedEuropeDrinkStore(data);
        EuropePrices.Cell rows=EuropePricesTest.cell(EuropePricesTest.beer(250,600,0)+","+EuropePricesTest.beer(500,800,0)+","+EuropePricesTest.beer(500,500,1));
        for(EuropePrices.Price price:rows.prices)assertEquals(SavedEuropeDrinkStore.Result.SAVED,store.save(entry(price)));
        List<SavedEuropeDrinkStore.Entry> items=store.load();assertEquals(3,items.size());
        assertNotEquals(items.get(0).key(),items.get(1).key());assertNotEquals(items.get(0).key(),items.get(2).key());
        assertTrue(items.get(0).matches(rows.prices.get(2)));assertFalse(items.get(0).matches(rows.prices.get(1)));
        assertEquals("GBP",items.get(0).currency);assertEquals("ml:500",items.get(0).serving.key());
        assertEquals("Actual venue name",items.get(0).venue.label);assertEquals(LONDON,items.get(0).venue.url);
        String encoded=new String(data.bytes,StandardCharsets.ISO_8859_1);
        for(String forbidden:new String[]{"amount_minor","revision","observed_on","source_url",EuropePricesTest.REVISION,"800","600"})assertFalse(forbidden,encoded.contains(forbidden));
        assertEquals(SavedEuropeDrinkStore.Result.REMOVED,store.remove(items.get(0)));assertEquals(2,store.load().size());
    }
    @Test public void liveVenueIdentityMustMatchExactRowAndNeverCrossCurrency()throws Exception{
        EuropePrices.Price london=EuropePricesTest.cell(EuropePricesTest.wine(175,720)).prices.get(0);
        SavedEuropeDrinkStore.Entry correct=entry(london);assertNotNull(correct);assertTrue(correct.matches(london));
        SavedVenueStore.Venue wrongCell=SavedVenueStore.reference("https://www.dovebevo.com/bar/n91?c=u09tv","Wrong cell");
        assertNull(SavedEuropeDrinkStore.verified(wrongCell,london));
        SavedVenueStore.Venue wrongVenue=SavedVenueStore.reference("https://www.dovebevo.com/bar/n92?c=gcpvj","Wrong venue");
        assertNull(SavedEuropeDrinkStore.verified(wrongVenue,london));
        EuropePrices.Price euros=new EuropePrices.Price(london.venue,london.cell,london.drink,"EUR",london.band,london.amountMinor,london.serving,
                london.observedOn,london.confirmedOn,london.confirmations,london.revision,london.sourceKind,london.sourceUrl,london.sourceCheckedOn,
                london.sourceSha256,london.menuItem,london.catalogVersion,london.old);
        assertFalse(correct.matches(euros));
    }
    @Test public void savedIdentityReadsCurrentPriceWithoutFreezingOldAmountOrUsingAnotherServing()throws Exception{
        SavedEuropeDrinkStore.Entry saved=entry(EuropePricesTest.cell(EuropePricesTest.wine(175,720)).prices.get(0));
        EuropePrices.Cell refreshed=EuropePricesTest.cell(EuropePricesTest.wine(175,900)+","+EuropePricesTest.wine(250,400));
        FavoriteComparison.Cell current=FavoriteComparison.withEurope(null,refreshed);
        assertEquals(900,SavedEuropeDrinkStore.current(saved,current).amountMinor);
        assertNull(SavedEuropeDrinkStore.current(saved,FavoriteComparison.withEurope(null,EuropePricesTest.cell(EuropePricesTest.wine(250,400)))));
        assertNull(SavedEuropeDrinkStore.current(saved,null));
    }
    @Test public void invalidDataAndWriteFailurePreservePreviousBytes()throws Exception{
        Memory data=new Memory();SavedEuropeDrinkStore store=new SavedEuropeDrinkStore(data);
        EuropePrices.Price wine=EuropePricesTest.cell(EuropePricesTest.wine(175,720)).prices.get(0);
        assertEquals(SavedEuropeDrinkStore.Result.SAVED,store.save(entry(wine)));byte[] previous=data.bytes.clone();
        SavedVenueStore.Venue venue=SavedVenueStore.reference(LONDON,"Name");
        assertNull(SavedEuropeDrinkStore.validated(venue,RecommendationDrink.BEER_DRAFT,0,"GBP",new EuropePrices.Serving("drink",null)));
        assertNull(SavedEuropeDrinkStore.validated(venue,RecommendationDrink.SPRITZ,0,"GBP",new EuropePrices.Serving("drink",50)));
        assertNull(SavedEuropeDrinkStore.validated(venue,RecommendationDrink.WINE_GLASS,0,"USD",new EuropePrices.Serving("glass",175)));
        assertEquals(SavedEuropeDrinkStore.Result.INVALID,store.save(null));assertArrayEquals(previous,data.bytes);
        data.fail=true;assertEquals(SavedEuropeDrinkStore.Result.STORAGE_ERROR,store.remove(store.load().get(0)));assertArrayEquals(previous,data.bytes);
        data.fail=false;
        for(byte[] corrupt:new byte[][]{new byte[0],new byte[]{1,2},Arrays.copyOf(previous,previous.length-1),new byte[65537]}){
            data.bytes=corrupt;assertThrows(IOException.class,store::load);
            assertEquals(SavedEuropeDrinkStore.Result.STORAGE_ERROR,store.save(entry(wine)));assertArrayEquals(corrupt,data.bytes);
        }
    }
}
