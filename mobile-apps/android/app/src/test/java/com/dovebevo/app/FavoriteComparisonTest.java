package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public final class FavoriteComparisonTest {
    static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    static final String STATIC = "{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Locale reale\",1,45.4642,9.19,\"Via A\",0],[\"w9\",\"Altro locale\",1,45.4643,9.1901,\"\",0]]}";
    static final String PRICES = "{\"p\":[[\"n123\",\"beer_draft\",0,800,\"2026-10-28\",2,0],[\"n123\",\"beer_draft\",1,500,\"2026-10-27\",1,0],[\"w9\",\"beer_draft\",0,600,\"2026-06-01\",0,0]],\"u\":[],\"pend\":[],\"h\":[],\"g\":[]}";
    private static final String[][] EUROPE = {
            {"Paris", "48.8566", "2.3522", "u09tv"},
            {"Berlin", "52.52", "13.405", "u33dc"},
            {"Madrid", "40.4168", "-3.7038", "ezjmg"}
    };
    static List<SavedVenueStore.Venue> saved() throws Exception {
        SavedVenueStore store = new SavedVenueStore(new SavedVenueStore.Storage() {
            byte[] value; public byte[] read() { return value; } public void write(byte[] next) { value=next; }
        });
        assertEquals(SavedVenueStore.Result.SAVED, store.save("https://www.dovebevo.com/bar/n123?c=u0nd9", "Etichetta precedente"));
        assertEquals(SavedVenueStore.Result.SAVED, store.save("https://www.dovebevo.com/bar/w9?c=u0nd9", "Altro salvato"));
        return store.load();
    }
    @Test public void sameDrinkAndBandSortByCentsWithRealNamesDatesAndNoStoreRewrite() throws Exception {
        FavoriteComparison.Cell cell = FavoriteComparison.parse(bytes(STATIC), bytes(PRICES), "u0nd9", "2026-10-29");
        Map<String,FavoriteComparison.Cell> cells = Collections.singletonMap("u0nd9",cell);
        List<SavedVenueStore.Venue> saved = saved();
        List<FavoriteComparison.Row> normal = FavoriteComparison.rows(saved,cells,RecommendationDrink.BEER_DRAFT,0);
        assertEquals("Altro locale",normal.get(0).name); assertEquals(600,normal.get(0).price.cents); assertTrue(normal.get(0).price.old);
        assertEquals("Locale reale",normal.get(1).name); assertEquals(800,normal.get(1).price.cents); assertEquals(2,normal.get(1).price.confirmations);
        assertEquals("2026-10-28",normal.get(1).price.day);
        List<FavoriteComparison.Row> hh=FavoriteComparison.rows(saved,cells,RecommendationDrink.BEER_DRAFT,1);
        assertEquals(500,hh.get(0).price.cents); assertEquals(FavoriteComparison.State.MISSING,hh.get(1).state);
        assertEquals("Etichetta precedente",saved.get(1).label);
        assertTrue(FavoriteComparison.rows(saved,cells,RecommendationDrink.SPRITZ,0).stream().allMatch(r->r.state==FavoriteComparison.State.MISSING));
    }
    @Test public void hiddenPendingMovedAndQuarantinedNeverBecomeZeroOrRanked() throws Exception {
        String rows=PRICES.replace("\"h\":[]","\"h\":[\"n123\"]").replace(",0,600,",",0,600,").replace("\"2026-06-01\",0,0","\"2026-06-01\",0,1");
        FavoriteComparison.Cell cell=FavoriteComparison.parse(bytes(STATIC),bytes(rows),"u0nd9","2026-10-29");
        List<FavoriteComparison.Row> result=FavoriteComparison.rows(saved(),Collections.singletonMap("u0nd9",cell),RecommendationDrink.BEER_DRAFT,0);
        assertTrue(result.stream().anyMatch(r->r.state==FavoriteComparison.State.UNAVAILABLE));
        assertTrue(result.stream().anyMatch(r->r.state==FavoriteComparison.State.MISSING));
        assertTrue(result.stream().allMatch(r->r.price==null));
        assertTrue(FavoriteComparison.rows(saved(),new HashMap<>(),RecommendationDrink.BEER_DRAFT,0).stream().allMatch(r->r.state==FavoriteComparison.State.UNAVAILABLE));
        FavoriteComparison.Cell wrongCell=FavoriteComparison.parse(bytes(STATIC.replace("9.19","1.19")),bytes(PRICES),"u0nd9","2026-10-29");
        assertFalse(wrongCell.staticVerified); assertTrue(wrongCell.names.isEmpty());
    }
    @Test public void approvedUserRemainsVerifiableWithoutStaticButPendingAndOsmDoNot() throws Exception {
        String data=PRICES.replace("\"u\":[]","\"u\":[[\"u7\",\"Locale approvato\",1,45.4642,9.19]]")
                .replace("\"pend\":[]","\"pend\":[[\"u8\",\"Non approvato\",1,45.4642,9.19,1]]");
        for(byte[] missing:new byte[][]{null,bytes("<!doctype html>"),bytes("{\"c\":[],\"v\":false}")}){
            FavoriteComparison.Cell value=FavoriteComparison.parse(missing,bytes(data),"u0nd9","2026-10-29");
            assertFalse(value.staticVerified); assertEquals("Locale approvato",value.names.get("u7"));assertFalse(value.names.containsKey("u8"));assertFalse(value.names.containsKey("n123"));
        }
    }
    @Test public void europeanStaticAndApprovedVenuesResolvePricesWithTheirExactCells() throws Exception {
        for(String[] city:EUROPE){
            FavoriteComparison.Cell cell=FavoriteComparison.parse(bytes(staticAt(city[0],city[1],city[2])),bytes(approvedAt(city[1],city[2])),city[3],"2026-10-29");
            assertTrue(city[0],cell.staticVerified);
            SavedVenueStore store=new SavedVenueStore(new SavedVenueStore.Storage(){
                byte[] value;public byte[] read(){return value;}public void write(byte[] next){value=next;}
            });
            assertEquals(SavedVenueStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n123?c="+city[3],"Saved static fixture"));
            assertEquals(SavedVenueStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/u7?c="+city[3],"Saved approved fixture"));
            List<FavoriteComparison.Row> rows=FavoriteComparison.rows(store.load(),Collections.singletonMap(city[3],cell),RecommendationDrink.BEER_DRAFT,0);
            assertEquals(2,rows.size());assertEquals(city[0],rows.get(0).name);assertEquals(800,rows.get(0).price.cents);
            assertEquals("Approved fixture",rows.get(1).name);assertEquals(900,rows.get(1).price.cents);
            assertTrue(rows.stream().allMatch(row->row.state==FavoriteComparison.State.AVAILABLE));
        }
    }
    @Test public void europeanVenuesInTheWrongRequestedCellRemainUnavailable() throws Exception {
        for(String[] city:EUROPE){
            FavoriteComparison.Cell cell=FavoriteComparison.parse(bytes(staticAt(city[0],city[1],city[2])),bytes(PRICES),"u0nd9","2026-10-29");
            assertFalse(city[0],cell.staticVerified);assertTrue(cell.names.isEmpty());assertTrue(cell.prices.isEmpty());
            try{FavoriteComparison.parse(null,bytes(approvedAt(city[1],city[2])),"u0nd9","2026-10-29");fail("Accepted approved venue from a different cell: "+city[0]);}
            catch(IOException expected){}
        }
    }
    @Test public void worldCoordinateEdgesAreValidButOutOfRangeAndNonNumericValuesAreNot() throws Exception {
        for(String[] edge:new String[][]{{"90","180","zzzzz"},{"-90","-180","00000"}}){
            FavoriteComparison.Cell cell=FavoriteComparison.parse(null,bytes(approvedAt(edge[0],edge[1])),edge[2],"2026-10-29");
            assertEquals("Approved fixture",cell.names.get("u7"));
        }
        for(String[] invalid:new String[][]{{"90.00001","0"},{"-90.00001","0"},{"0","180.00001"},{"0","-180.00001"},
                {"true","0"},{"null","0"},{"\"48.8566\"","2.3522"},{"1e999","0"}}){
            try{FavoriteComparison.parse(null,bytes(approvedAt(invalid[0],invalid[1])),"u09tv","2026-10-29");fail("Accepted invalid world coordinates");}
            catch(IOException expected){}
        }
    }
    private static String staticAt(String name,String lat,String lon){
        return "{\"c\":[[1,\""+name+"\"]],\"v\":[[\"n123\",\""+name+"\",1,"+lat+","+lon+",\"\",0]]}";
    }
    private static String approvedAt(String lat,String lon){
        return PRICES.replace("\"u\":[]","\"u\":[[\"u7\",\"Approved fixture\",1,"+lat+","+lon+"]]")
                .replace("\"p\":[","\"p\":[[\"u7\",\"beer_draft\",0,900,\"2026-10-28\",0,0],");
    }
    @Test public void rejectsMalformedNumbersCalendarDatesDuplicatePairsAndBodies() throws Exception {
        String duplicate=PRICES.replace("\"p\":[","\"p\":[[\"n123\",\"beer_draft\",0,800,\"2026-10-28\",2,0],");
        for(String bad: Arrays.asList(PRICES.replace(",800,",",800.0,"),PRICES.replace(",800,",",true,"),PRICES.replace(",800,",",1201,"),
                PRICES.replace("2026-10-28","2026-02-30"),PRICES.replace("2026-10-28","2026-10-30"),
                PRICES.replace("\"beer_draft\"","\"coffee\""),PRICES.replace(",2,0]",",-1,0]"),duplicate,
                PRICES.replace("\"p\":","\"p\":[],\"p\":"),"/*x*/"+PRICES)) {
            try { FavoriteComparison.parse(bytes(STATIC),bytes(bad),"u0nd9","2026-10-29"); fail("Accepted invalid cell"); } catch(IOException expected) { }
        }
        try { FavoriteComparison.parse(bytes(STATIC),new byte[524289],"u0nd9","2026-10-29"); fail(); } catch(IOException expected) { }
        assertEquals("20261027",FavoriteComparison.version(bytes("{\"status\":\"ok\",\"version\":\"0.0.0\",\"data_version\":\"20261027\"}")));
        for(String bad:Arrays.asList("{\"status\":\"bad\",\"data_version\":\"20261027\"}","{\"status\":\"ok\",\"data_version\":\"../../x\"}")) {
            try { FavoriteComparison.version(bytes(bad)); fail(); } catch(IOException expected) { }
        }
    }
}
