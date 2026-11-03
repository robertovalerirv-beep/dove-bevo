package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Each explicit tuple selects its own band/category; every actual serving stays a separate row. */
final class SavedDrinkComparison {
    static final class Row {
        final SavedDrinkStore.Entry saved;
        final FavoriteComparison.Row price;
        Row(SavedDrinkStore.Entry saved,FavoriteComparison.Row price){this.saved=saved;this.price=price;}
    }
    static List<Row> rows(List<SavedDrinkStore.Entry> saved,Map<String,FavoriteComparison.Cell> cells)throws IOException {
        if(saved.size()>SavedDrinkStore.MAX_ITEMS)throw NativeJson.invalid();
        List<Row> rows=new ArrayList<>();
        for(SavedDrinkStore.Entry item:saved)
            for(FavoriteComparison.Row price:FavoriteComparison.rows(List.of(item.venue),cells,item.drink,item.band))rows.add(new Row(item,price));
        return rows;
    }
}
