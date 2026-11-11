package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public final class DiscoveryTest {
    static final String STATIC="{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Uno\",1,45.4642,9.19,\"Via A\",0],[\"w9\",\"Due\",1,45.4643,9.1901,\"Via B\",0],[\"n777\",\"Nascosto\",1,45.4643,9.1901,\"\",0]]}";
    static final String PRICES="{\"p\":[[\"n123\",\"spritz\",0,800,\"2026-10-28\",2,0],[\"n123\",\"spritz\",1,500,\"2026-10-27\",1,0],[\"w9\",\"spritz\",0,600,\"2026-06-01\",0,0],[\"n777\",\"spritz\",0,400,\"2026-10-28\",0,0],[\"n123\",\"negroni\",0,900,\"2026-10-28\",0,1],[\"u1\",\"spritz\",0,750,\"2026-10-28\",0,0],[\"u2\",\"spritz\",0,350,\"2026-10-28\",0,0]],\"u\":[[\"u1\",\"Approvato\",1,45.4642,9.19]],\"pend\":[[\"u2\",\"In attesa\",1,45.4642,9.19,0]],\"h\":[\"n777\"],\"g\":[]}";
    static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    @Test public void actualAreaCaptureRequiresOwnedVisitorSameUrlEpochAndReadyZoom()throws Exception {
        String url=BrowserPolicy.HOME,result="[\""+url+"\",\"45.46420,9.19000\",\"14.0\"]";
        DiscoveryArea a=DiscoveryArea.decode(result,url,url,7,7);assertNotNull(a);assertEquals(45.4642,a.lat,0);assertEquals(9.19,a.lon,0);
        assertNull(DiscoveryArea.decode(result,url,url,7,8));assertNull(DiscoveryArea.decode(result,url,url+"?at=45,9",7,7));
        assertNull(DiscoveryArea.decode(result.replace("14.0","12.0"),url,url,7,7));assertNotNull(DiscoveryArea.decode(result.replace("14.0","13.0"),url,url,7,7));assertNull(DiscoveryArea.decode(result.replace("45.46420","90.0"),url,url,7,7));
        assertNull(DiscoveryArea.decode(result.replace("14.0","NaN"),url,url,7,7));assertNull(DiscoveryArea.decode(result+"x",url,url,7,7));
        assertFalse(DiscoveryArea.visitor("https://www.dovebevo.com/admin"));assertFalse(DiscoveryArea.visitor("https://evil.example/"));
        assertFalse(DiscoveryArea.visitor("https://me@www.dovebevo.com/"));assertNull(DiscoveryArea.decode("null",url,url,7,7));
    }
    @Test public void areaUsesOnlyNineUniqueNeighbourCellsAndHonestMapCentreDistance()throws Exception {
        DiscoveryArea area=new DiscoveryArea(45.4642,9.19,14);assertEquals("u0nd9",DiscoveryArea.geohash(area.lat,area.lon));
        assertEquals(9,area.cells().size());assertEquals(9,new HashSet<>(area.cells()).size());assertEquals("u0nd9",area.cells().get(0));
        assertEquals(0,area.metres(area.lat,area.lon),0.01);assertTrue(area.metres(45.4643,9.1901)>10&&area.metres(45.4643,9.1901)<20);
        assertEquals(9,new DiscoveryArea(52,13,14).cells().size());assertThrows(IOException.class,()->new DiscoveryArea(45,9,12));
        assertEquals(area.cells(),new DiscoveryArea(area.lat,area.lon,13).cells());
        assertEquals("Zooming alone does not shrink the fixed request area",area.cells(),new DiscoveryArea(area.lat,area.lon,20).cells());
    }
    @Test public void actualMetadataSameDrinkBandSortAndModerationRemainIntact()throws Exception {
        DiscoveryData.Cell cell=DiscoveryData.parse(bytes(STATIC),bytes(PRICES),"u0nd9","2026-11-01");
        Map<String,DiscoveryData.Cell> cells=Collections.singletonMap("u0nd9",cell);DiscoveryArea area=new DiscoveryArea(45.4642,9.19,14);
        List<DiscoveryData.Row> normal=DiscoveryData.rows(cells,area,RecommendationDrink.SPRITZ,0);
        assertEquals(3,normal.size());assertEquals("Due",normal.get(0).venue.name);assertEquals(600,normal.get(0).price.cents);assertTrue(normal.get(0).price.old);
        assertEquals("Via B",normal.get(0).venue.address);assertEquals("Milano",normal.get(0).venue.city);assertEquals(0,normal.get(0).price.confirmations);
        assertEquals("https://www.dovebevo.com/bar/w9?c=u0nd9",normal.get(0).venue.url());
        assertEquals("Approvato",normal.get(1).venue.name);assertEquals("",normal.get(1).venue.address);assertEquals(800,normal.get(2).price.cents);assertEquals(2,normal.get(2).price.confirmations);
        assertFalse(cell.venues.containsKey("n777"));assertFalse(cell.venues.containsKey("u2"));
        List<DiscoveryData.Row> hh=DiscoveryData.rows(cells,area,RecommendationDrink.SPRITZ,1);assertEquals(1,hh.size());assertEquals(500,hh.get(0).price.cents);
        assertTrue(DiscoveryData.rows(cells,area,RecommendationDrink.NEGRONI,0).isEmpty());assertTrue(DiscoveryData.rows(cells,area,RecommendationDrink.WATER,0).isEmpty());
    }
    @Test public void missingStaticCannotInventOsmMetadataButApprovedUserVenueStillWorks()throws Exception {
        DiscoveryData.Cell cell=DiscoveryData.parse(null,bytes(PRICES),"u0nd9","2026-11-01");assertEquals(1,cell.venues.size());assertEquals("Approvato",cell.venues.get("u1").name);
        assertThrows(IOException.class,()->DiscoveryData.parse(bytes(STATIC),bytes(PRICES.replace("9.19,","19.19,")),"u0nd9","2026-11-01"));
        assertThrows(IOException.class,()->DiscoveryData.parse(bytes(STATIC),bytes(PRICES.replace("800,","0,")),"u0nd9","2026-11-01"));
        assertThrows(IOException.class,()->DiscoveryData.parse(bytes(STATIC),bytes(PRICES.replace("2026-10-28","2099-10-28")),"u0nd9","2026-11-01"));
    }
    @Test public void invalidAreaAndOverBroadDiscoveryResultsFailClosed()throws Exception {
        Map<String,DiscoveryData.Cell> cells=new HashMap<>();for(int i=0;i<10;i++)cells.put("cell"+i,null);
        assertThrows(IOException.class,()->DiscoveryData.rows(cells,new DiscoveryArea(45,9,14),RecommendationDrink.SPRITZ,0));
        assertThrows(IOException.class,()->DiscoveryData.rows(Collections.emptyMap(),null,RecommendationDrink.SPRITZ,0));
    }
    @Test public void previewUsesFirstRealRowPerVenueWithoutRemovingAnyFullListRow()throws Exception {
        DiscoveryArea area=new DiscoveryArea(45.4642,9.19,14);
        DiscoveryData.Venue first=new DiscoveryData.Venue("n1","Primo","u0nd9","","Milano",45.4642,9.19);
        DiscoveryData.Venue second=new DiscoveryData.Venue("n2","Secondo","u0nd9","","Milano",45.4642,9.19);
        DiscoveryData.Venue third=new DiscoveryData.Venue("n3","Terzo","u0nd9","","Milano",45.4642,9.19);
        DiscoveryData.Venue fourth=new DiscoveryData.Venue("n4","Quarto","u0nd9","","Milano",45.4642,9.19);
        List<DiscoveryData.Row> full=Arrays.asList(
                new DiscoveryData.Row(first,new FavoriteComparison.Price(500,"2026-11-01",0,false),area),
                new DiscoveryData.Row(first,new FavoriteComparison.Price(600,"2026-11-01",0,false),area),
                new DiscoveryData.Row(second,new FavoriteComparison.Price(700,"2026-11-01",0,false),area),
                new DiscoveryData.Row(third,new FavoriteComparison.Price(800,"2026-11-01",0,false),area),
                new DiscoveryData.Row(fourth,new FavoriteComparison.Price(900,"2026-11-01",0,false),area));
        List<DiscoveryData.Row> preview=DiscoveryScreen.featuredRows(full);
        assertEquals(3,preview.size());assertSame(full.get(0),preview.get(0));assertSame(full.get(2),preview.get(1));assertSame(full.get(3),preview.get(2));
        assertEquals("Full result list is unchanged",5,full.size());
        assertEquals(1,DiscoveryScreen.featuredRows(full.subList(0,2)).size());
    }
    @Test public void previewUsesExactEuropeMenuItemRatherThanItsBroadDrinkCategory()throws Exception {
        DiscoveryArea area=new DiscoveryArea(45.4642,9.19,14);
        DiscoveryData.Venue venue=new DiscoveryData.Venue("n1","Primo","u0nd9","","Milano",45.4642,9.19);
        EuropePrices.Price menu=new EuropePrices.Price("n1","u0nd9","spritz","EUR",0,550,new EuropePrices.Serving("drink",null),
                null,null,0,"revision","online_menu","https://example.com/menu","2026-11-01","hash","Spritz della casa","catalog",false);
        DiscoveryData.Row row=new DiscoveryData.Row(venue,null,menu,area);
        assertEquals("Spritz della casa",DiscoveryScreen.featuredDrinkName(row,RecommendationDrink.SPRITZ));
        assertTrue(row.amountLabel().contains("5,50"));assertTrue(row.amountLabel().contains("€"));
        EuropePrices.Price customer=new EuropePrices.Price("n1","u0nd9","spritz","EUR",0,550,new EuropePrices.Serving("drink",null),
                "2026-11-01",null,0,"revision","customer",null,null,null,null,"catalog",false);
        assertEquals("Spritz",DiscoveryScreen.featuredDrinkName(new DiscoveryData.Row(venue,null,customer,area),RecommendationDrink.SPRITZ));
    }
    @Test public void nativeCityChoicesUseExistingItalianPlacesFirstThenVerifiedEuropeanCatalogue()throws Exception {
        byte[] places=bytes("[[3,\"Bologna\",44.4939,11.3426,80],[1,\"Roma\",41.9028,12.4964,500],[2,\"Milano\",45.4642,9.19,600],[4,\"Torino\",45.0703,7.6869,300],[5,\"Lecce\",40.3515,18.175,20]]");
        List<DiscoveryCities.City> italian=DiscoveryCities.italian(places);
        assertEquals(Arrays.asList("Milano","Roma","Torino","Bologna","Lecce"),Arrays.asList(italian.get(0).name,italian.get(1).name,italian.get(2).name,italian.get(3).name,italian.get(4).name));
        assertEquals("u0nd9",DiscoveryArea.geohash(italian.get(0).area().lat,italian.get(0).area().lon));
        Map<String,EuropePrices.Venue> venues=new HashMap<>();
        venues.put("n1",new EuropePrices.Venue("n1","Uno","gcpvj","London","GB","GBP",51.5074,-0.1278));
        venues.put("n2",new EuropePrices.Venue("n2","Due","u09tv","Paris","FR","EUR",48.8566,2.3522));
        venues.put("n3",new EuropePrices.Venue("n3","Tre","u09tv","Paris","FR","EUR",48.8567,2.3523));
        List<DiscoveryCities.City> european=DiscoveryCities.fromCatalog(new EuropePrices.Catalog("v1",venues));
        assertEquals(2,european.size());assertEquals("London, Regno Unito",european.get(0).label());assertEquals("Paris",european.get(1).name);
        assertEquals(2,european.get(1).knownVenues);assertEquals((48.8566+48.8567)/2,european.get(1).lat,0.000001);
        List<DiscoveryCities.City> searchable=new ArrayList<>(italian);
        for(int i=0;i<12;i++)searchable.add(new DiscoveryCities.City("Comune "+i,"IT",45.4642,9.19,1));
        searchable.add(new DiscoveryCities.City("Città Nuova","IT",45.4642,9.19,1));searchable.addAll(european);
        List<DiscoveryCities.City> preview=DiscoveryCities.visible(searchable,"");
        assertEquals(12,preview.size());assertEquals("Milano",preview.get(0).name);
        assertEquals("London",preview.get(10).name);assertEquals("Paris",preview.get(11).name);
        assertEquals("Comune 11",DiscoveryCities.visible(searchable,"comune 11").get(0).name);
        assertEquals("Città Nuova",DiscoveryCities.visible(searchable,"citta nuova").get(0).name);
        assertTrue(DiscoveryCities.visible(searchable,"not-a-city").isEmpty());
        assertTrue(DiscoveryCities.allowed(FavoritePricesClient.ORIGIN+"/data/20261101/places.json"));
        assertFalse(DiscoveryCities.allowed("https://evil.example/data/20261101/places.json"));
        assertThrows(IOException.class,()->DiscoveryCities.italian(bytes("[[1,\"Milano\",90,9,1]]")));
        DiscoveryCities.Source publicFixture=(url,maximum)->{
            if(url.endsWith("/api/health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261101\"}");
            if(url.endsWith("/data/20261101/places.json"))return places;
            if(url.endsWith("/mobile-data/catalog.json"))return bytes("{\"schema_version\":1,\"version\":\"v1\",\"venues\":[]}");
            throw new IOException("Unexpected source");
        };
        DiscoveryCities.Result loaded=DiscoveryCities.load(publicFixture,"2026-11-11");
        assertEquals(5,loaded.cities.size());assertFalse(loaded.italianUnavailable);assertFalse(loaded.europeanUnavailable);
        DiscoveryCities.Result fallback=DiscoveryCities.load((url,maximum)->{
            if(url.endsWith("/mobile-data/catalog.json"))throw new IOException("Offline catalogue");
            return publicFixture.get(url,maximum);
        },"2026-11-11");
        assertEquals(5,fallback.cities.size());assertFalse(fallback.italianUnavailable);assertTrue(fallback.europeanUnavailable);
    }
}
