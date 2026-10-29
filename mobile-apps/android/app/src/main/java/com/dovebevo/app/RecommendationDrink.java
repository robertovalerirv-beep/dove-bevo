package com.dovebevo.app;

/** Existing website catalog order; these categories do not assert a venue's inventory. */
enum RecommendationDrink {
    BEER_DRAFT("beer_draft", "Birra media",250,1200),
    SPRITZ("spritz", "Spritz",250,1500),
    NEGRONI("negroni", "Negroni",400,2000),
    SBAGLIATO("sbagliato", "Sbagliato",400,2000),
    GIN_TONIC("gin_tonic", "Gin tonic",400,2000),
    GIN_LEMON("gin_lemon", "Gin lemon",400,2000),
    WINE_GLASS("wine_glass", "Calice di vino",200,1500),
    ALCOHOL_FREE("alcohol_free", "Analcolico",200,1200),
    WATER("water", "Acqua",50,600);

    final String code;
    final String label;
    final int minCents,maxCents;
    RecommendationDrink(String code, String label,int minCents,int maxCents) { this.code = code; this.label = label;this.minCents=minCents;this.maxCents=maxCents; }
    static RecommendationDrink from(String code) {
        for (RecommendationDrink drink : values()) if (drink.code.equals(code)) return drink;
        return null;
    }
}
