package com.dovebevo.app;

/** Existing website catalog order; these categories do not assert a venue's inventory. */
enum RecommendationDrink {
    BEER_DRAFT("beer_draft", "Birra media"),
    SPRITZ("spritz", "Spritz"),
    NEGRONI("negroni", "Negroni"),
    SBAGLIATO("sbagliato", "Sbagliato"),
    GIN_TONIC("gin_tonic", "Gin tonic"),
    GIN_LEMON("gin_lemon", "Gin lemon"),
    WINE_GLASS("wine_glass", "Calice di vino"),
    ALCOHOL_FREE("alcohol_free", "Analcolico"),
    WATER("water", "Acqua");

    final String code;
    final String label;
    RecommendationDrink(String code, String label) { this.code = code; this.label = label; }
    static RecommendationDrink from(String code) {
        for (RecommendationDrink drink : values()) if (drink.code.equals(code)) return drink;
        return null;
    }
}
