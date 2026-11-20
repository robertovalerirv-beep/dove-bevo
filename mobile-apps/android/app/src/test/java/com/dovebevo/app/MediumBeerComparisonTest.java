package com.dovebevo.app;

import static org.junit.Assert.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.Test;

public final class MediumBeerComparisonTest {
    private static final String VENUE="https://www.dovebevo.com/bar/n91?c=gcpvj";

    private static MenuV2Prices.Price offer(String id,String label,Integer ml,String currency,int amount){
        return new MenuV2Prices.Price(id,"London bar","Birra alla spina","beer_draft",0,amount,currency,2,
                label,ml,false,"2026-11-03","Spese separate indicate dal menu",null,null,
                "https://bar.example/menu","Consumazione minima 15,00 € solo con musica dal vivo");
    }

    @Test public void mediumServingRejectsSmallPintUnknownAndContradictoryLabels(){
        Object[][] cases={{null,250,false},{null,400,true},{"Media",500,true},{null,568,false},
                {"Pint",500,false},{"Piccola media",500,false},{"0,5 l",null,true},
                {"50 cl",500,true},{"25 cl",null,false},{"500 ml",400,false},
                {"media",null,true},{"drink",null,false},{null,null,false}};
        for(Object[] row:cases)assertEquals("label="+row[0]+" ml="+row[1],row[2],
                MediumBeerServing.matches((String)row[0],(Integer)row[1]));
    }

    @Test public void discoveryAndSavedDrinkCompareOnlyMediumMenuOffersButKeepPriceNotices()throws Exception {
        List<MenuV2Prices.Price> offers=List.of(offer("small","Piccola",250,"EUR",300),
                offer("medium-eur","Media",400,"EUR",500),offer("medium-gbp","50 cl",500,"GBP",550),
                offer("pint","Pint",568,"GBP",450),offer("unknown","drink",null,"EUR",200));
        DiscoveryData.Venue venue=new DiscoveryData.Venue("n91","London bar","gcpvj","Via A","London",51.5074,-0.1278);
        DiscoveryData.Cell cell=new DiscoveryData.Cell(Map.of("n91",venue),
                new FavoriteComparison.Cell(Collections.emptyMap(),Collections.emptyMap(),false),
                Map.of("n91",offers),Map.of("n91","Consumazione minima 15,00 € solo con musica dal vivo"),true,true);
        List<DiscoveryData.Row> rows=DiscoveryData.rows(Map.of("gcpvj",cell),
                new DiscoveryArea(51.5074,-0.1278,14),RecommendationDrink.BEER_DRAFT,0);
        assertEquals(Set.of("medium-eur","medium-gbp"),rows.stream().map(row->row.menuPrice.id).collect(Collectors.toSet()));
        assertEquals(List.of("5,00 €","5,50 £"),rows.stream().map(DiscoveryData.Row::amountLabel).collect(Collectors.toList()));
        for(DiscoveryData.Row row:rows){
            assertTrue(row.context().contains("Spese separate"));
            assertTrue(row.context().contains("Consumazione minima 15,00 €"));
        }
        assertEquals(5,cell.menu.get("n91").size());

        SavedDrinkStore.Entry saved=new SavedDrinkStore.Entry(SavedVenueStore.reference(VENUE,"London bar"),
                RecommendationDrink.BEER_DRAFT,0);
        MenuV2Prices.Venue fullMenu=new MenuV2Prices.Venue("n91","gcpvj","London bar",
                "Spese separate indicate dal menu",offers,Collections.emptyList(),Collections.emptyList());
        List<SavedDrinkComparison.Row> savedRows=SavedDrinkComparison.rows(List.of(saved),Collections.emptyMap(),Map.of(VENUE,fullMenu));
        assertEquals(Set.of("medium-eur","medium-gbp"),savedRows.stream().map(row->row.menuPrice.id).collect(Collectors.toSet()));
        assertEquals(5,fullMenu.prices.size());
    }

    @Test public void catalogue250AndPintRemainStoredWhileSavedBeerCompares500()throws Exception {
        EuropePrices.Cell catalogue=EuropePricesTest.cell(EuropePricesTest.beer(250,350,0)+","+
                EuropePricesTest.beer(500,650,0)+","+EuropePricesTest.beer(568,700,0));
        FavoriteComparison.Cell approved=FavoriteComparison.withEurope(null,catalogue);
        List<FavoriteComparison.Row> saved=FavoriteComparison.rows(EuropePricesTest.saved(),
                Map.of("gcpvj",approved),RecommendationDrink.BEER_DRAFT,0);
        assertEquals(1,saved.size());
        assertEquals(500,saved.get(0).mobilePrice.serving.ml.intValue());
        assertEquals("GBP",saved.get(0).mobilePrice.currency);
        assertEquals(3,catalogue.prices.size());
        SavedDrinkStore.Entry privateChoice=new SavedDrinkStore.Entry(SavedVenueStore.reference(VENUE,"London bar"),
                RecommendationDrink.BEER_DRAFT,0);
        List<SavedDrinkComparison.Row> savedDrinks=SavedDrinkComparison.rows(List.of(privateChoice),Map.of("gcpvj",approved));
        assertEquals(1,savedDrinks.size());
        assertEquals(500,savedDrinks.get(0).price.mobilePrice.serving.ml.intValue());
        List<DiscoveryData.Row> discovery=DiscoveryData.rows(Map.of("gcpvj",DiscoveryData.withEurope(null,catalogue)),
                new DiscoveryArea(51.5074,-0.1278,14),RecommendationDrink.BEER_DRAFT,0);
        assertEquals(1,discovery.size());
        assertEquals(500,discovery.get(0).mobilePrice.serving.ml.intValue());
    }
}
