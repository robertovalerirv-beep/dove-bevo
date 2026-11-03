package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Each explicit saved drink selects its own category and band; serving and currency remain distinct. */
final class SavedDrinkComparison {
    static final class Row {
        final SavedDrinkStore.Entry saved;
        final FavoriteComparison.Row price;
        final MenuV2Prices.Price menuPrice;
        Row(SavedDrinkStore.Entry saved,FavoriteComparison.Row price){this(saved,price,null);}
        Row(SavedDrinkStore.Entry saved,FavoriteComparison.Row price,MenuV2Prices.Price menuPrice){this.saved=saved;this.price=price;this.menuPrice=menuPrice;}
        String group(){return menuPrice==null?NativePricePresentation.groupLabel(price.price,price.mobilePrice):menuPrice.group();}
        int amount(){return menuPrice==null?(price.available()?price.amount():Integer.MAX_VALUE):menuPrice.amountMinor;}
        String venueName(){return menuPrice==null?price.name:menuPrice.venueName;}
    }
    static List<Row> rows(List<SavedDrinkStore.Entry> saved,Map<String,FavoriteComparison.Cell> cells)throws IOException {
        return rows(saved,cells,Collections.emptyMap());
    }
    static List<Row> rows(List<SavedDrinkStore.Entry> saved,Map<String,FavoriteComparison.Cell> cells,Map<String,MenuV2Prices.Venue> menus)throws IOException {
        if(saved.size()>SavedDrinkStore.MAX_ITEMS)throw NativeJson.invalid();
        List<Row> rows=new ArrayList<>();
        for(SavedDrinkStore.Entry item:saved){
            List<FavoriteComparison.Row> base=FavoriteComparison.rows(List.of(item.venue),cells,item.drink,item.band);
            MenuV2Prices.Venue menu=menus.get(item.venue.url);
            List<MenuV2Prices.Price> named=menu==null?Collections.emptyList():menu.selected(item.drink,item.band);
            if(named.isEmpty())for(FavoriteComparison.Row price:base)rows.add(new Row(item,price));
            else{
                FavoriteComparison.Row fallback=base.get(0);
                for(MenuV2Prices.Price price:named)rows.add(new Row(item,fallback,price));
                for(FavoriteComparison.Row price:base)if(price.available())rows.add(new Row(item,price));
            }
        }
        return rows;
    }
}
