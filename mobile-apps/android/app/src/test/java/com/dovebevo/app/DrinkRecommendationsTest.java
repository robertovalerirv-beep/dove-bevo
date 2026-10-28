package com.dovebevo.app;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class DrinkRecommendationsTest {
    static byte[] snapshot(String venue, String special, long count, boolean selected) {
        String[] codes = {"beer_draft", "spritz", "negroni", "sbagliato", "gin_tonic", "gin_lemon", "wine_glass", "alcohol_free", "water"};
        StringBuilder json = new StringBuilder("{\"venue_key\":\"").append(venue).append("\",\"drinks\":[");
        for (String code : codes) {
            if (json.charAt(json.length() - 1) != '[') json.append(',');
            json.append("{\"drink\":\"").append(code).append("\",\"count\":").append(code.equals(special) ? count : 0)
                    .append(",\"recommended\":").append(code.equals(special) && selected).append('}');
        }
        return json.append("]}").toString().getBytes(StandardCharsets.UTF_8);
    }

    @Test public void authoritativeNineRowsSortByCountThenCatalogWithoutInventingInventory() throws Exception {
        DrinkRecommendations value = DrinkRecommendations.parse(snapshot("n123", "gin_tonic", 8, true), "n123");
        assertEquals(9, value.rows.size());
        assertEquals(RecommendationDrink.GIN_TONIC, value.sortedRows().get(0).drink);
        assertTrue(value.row(RecommendationDrink.GIN_TONIC).recommended);
        assertEquals(8, value.row(RecommendationDrink.GIN_TONIC).count);
        assertEquals(RecommendationDrink.BEER_DRAFT, value.sortedRows().get(1).drink);
        assertEquals("Birra media", RecommendationDrink.BEER_DRAFT.label);
    }

    @Test public void rejectsWrongVenueMissingDuplicateUnknownAndPermissiveJson() throws Exception {
        String valid = new String(snapshot("n123", "water", 0, false), StandardCharsets.UTF_8);
        String row = "{\"drink\":\"water\",\"count\":0,\"recommended\":false}";
        for (String bad : new String[]{valid.replace("n123", "w9"), valid.replace("," + row, ""),
                valid.replace("\"water\"", "\"spritz\""), valid.replace("\"water\"", "\"coffee\""),
                valid + " true", "/*comment*/" + valid, valid.replace("\"venue_key\"", "venue_key"),
                valid.replace("\"count\":0", "\"count\":\"0\""), valid.replace("\"recommended\":false", "\"recommended\":0"),
                valid.replace("\"venue_key\":\"n123\"", "\"venue_key\":\"n123\",\"venue_key\":\"n123\""),
                valid.replace("n123", "n\\u１２３４"),
                valid.replace("\"drinks\":", "\"extra\":true,\"drinks\":")}) {
            try { DrinkRecommendations.parse(bad.getBytes(StandardCharsets.UTF_8), "n123"); fail("Accepted invalid snapshot"); }
            catch (java.io.IOException expected) { }
        }
    }

    @Test public void safeIntegerAndBodyAndUtf8BoundsFailClosed() throws Exception {
        assertEquals(9007199254740991L, DrinkRecommendations.parse(snapshot("n123", "water", 9007199254740991L, false), "n123").row(RecommendationDrink.WATER).count);
        for (byte[] bad : new byte[][]{snapshot("n123", "water", -1, false), snapshot("n123", "water", 9007199254740992L, false),
                new byte[32769], new byte[]{(byte)0xc3, (byte)0x28}}) {
            try { DrinkRecommendations.parse(bad, "n123"); fail("Accepted invalid bounds"); }
            catch (java.io.IOException expected) { }
        }
    }
}
