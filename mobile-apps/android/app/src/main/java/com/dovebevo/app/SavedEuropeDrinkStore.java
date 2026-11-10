package com.dovebevo.app;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Private exact European choices. Prices and menu provenance always come from a fresh public GET. */
final class SavedEuropeDrinkStore {
    static final int MAX_ITEMS = 50, MAX_BYTES = 65536;
    private static final int MAGIC = 0x44424531;
    enum Result { SAVED, REMOVED, NOT_FOUND, INVALID, FULL, STORAGE_ERROR }

    static final class Entry {
        final SavedVenueStore.Venue venue;
        final RecommendationDrink drink;
        final int band;
        final String currency;
        final EuropePrices.Serving serving;

        Entry(SavedVenueStore.Venue venue, RecommendationDrink drink, int band, String currency, EuropePrices.Serving serving) {
            this.venue=venue;this.drink=drink;this.band=band;this.currency=currency;this.serving=serving;
        }
        String key(){return venue.url+"|"+drink.code+"|"+band+"|"+currency+"|"+serving.key();}
        String focusedUrl(){return MobileEntry.venueDocument(venue.url);}
        boolean matches(EuropePrices.Price price){
            return price!=null&&venue.url.equals(FavoritePricesClient.ORIGIN+"/bar/"+price.venue+"?c="+price.cell)
                    &&drink.code.equals(price.drink)&&band==price.band&&currency.equals(price.currency)
                    &&serving.key().equals(price.serving.key());
        }
    }

    private final SavedVenueStore.Storage storage;
    SavedEuropeDrinkStore(SavedVenueStore.Storage storage){this.storage=storage;}

    static Entry verified(SavedVenueStore.Venue venue, EuropePrices.Price price){
        if(price==null||venue==null)return null;
        RecommendationDrink drink=RecommendationDrink.from(price.drink);
        Entry entry=validated(venue,drink,price.band,price.currency,price.serving);
        return entry!=null&&entry.matches(price)?entry:null;
    }

    static EuropePrices.Price current(Entry entry,FavoriteComparison.Cell cell){
        if(entry==null||cell==null||cell.europe==null)return null;
        for(EuropePrices.Price price:cell.europe.prices)if(entry.matches(price))return price;
        return null;
    }

    static Entry validated(SavedVenueStore.Venue venue, RecommendationDrink drink, int band, String currency, EuropePrices.Serving serving){
        if(venue==null||drink==null||(band!=0&&band!=1)||!("EUR".equals(currency)||"GBP".equals(currency))||serving==null)return null;
        Integer ml=serving.ml;String unit=serving.unit;
        if(ml!=null&&(ml<1||ml>2000))return null;
        if(drink==RecommendationDrink.BEER_DRAFT||drink==RecommendationDrink.WATER){if(!"ml".equals(unit)||ml==null)return null;}
        else if(drink==RecommendationDrink.WINE_GLASS){if(!"glass".equals(unit))return null;}
        else if(!"drink".equals(unit)||ml!=null)return null;
        return new Entry(venue,drink,band,currency,serving);
    }

    List<Entry> load()throws IOException{
        byte[] bytes=storage.read();if(bytes==null)return Collections.emptyList();
        if(bytes.length==0||bytes.length>MAX_BYTES)throw new IOException("Unreadable saved European drinks");
        try(DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes))){
            if(in.readInt()!=MAGIC)throw new IOException("Unknown saved European drink format");
            int count=in.readInt();if(count<0||count>MAX_ITEMS)throw new IOException("Invalid saved European drink count");
            List<Entry> values=new ArrayList<>();Set<String> seen=new HashSet<>();
            for(int i=0;i<count;i++){
                SavedVenueStore.Venue venue=SavedVenueStore.reference(in.readUTF(),in.readUTF());
                RecommendationDrink drink=RecommendationDrink.from(in.readUTF());int band=in.readUnsignedByte();String currency=in.readUTF();
                String unit=in.readUTF();int volume=in.readInt();EuropePrices.Serving serving=new EuropePrices.Serving(unit,volume==0?null:volume);
                Entry entry=validated(venue,drink,band,currency,serving);
                if(entry==null||!seen.add(entry.key()))throw new IOException("Invalid saved European drink");
                values.add(entry);
            }
            if(in.available()!=0)throw new IOException("Unexpected saved European drink data");
            return Collections.unmodifiableList(values);
        }catch(RuntimeException invalid){throw new IOException("Unreadable saved European drinks",invalid);}
    }

    Result save(Entry item){
        if(item==null||validated(item.venue,item.drink,item.band,item.currency,item.serving)==null)return Result.INVALID;
        try{
            List<Entry> before=load(),after=new ArrayList<>();after.add(item);boolean duplicate=false;
            for(Entry old:before)if(old.key().equals(item.key()))duplicate=true;else after.add(old);
            if(!duplicate&&before.size()>=MAX_ITEMS)return Result.FULL;
            storage.write(encode(after));return Result.SAVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }

    Result remove(Entry item){
        if(item==null)return Result.INVALID;
        try{
            List<Entry> before=load(),after=new ArrayList<>();for(Entry old:before)if(!old.key().equals(item.key()))after.add(old);
            if(before.size()==after.size())return Result.NOT_FOUND;
            storage.write(encode(after));return Result.REMOVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }

    private static byte[] encode(List<Entry> items)throws IOException{
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(DataOutputStream out=new DataOutputStream(bytes)){
            out.writeInt(MAGIC);out.writeInt(items.size());
            for(Entry item:items){out.writeUTF(item.venue.url);out.writeUTF(item.venue.label);out.writeUTF(item.drink.code);
                out.writeByte(item.band);out.writeUTF(item.currency);out.writeUTF(item.serving.unit);out.writeInt(item.serving.ml==null?0:item.serving.ml);}
        }
        if(bytes.size()>MAX_BYTES)throw new IOException("Saved European drinks too large");return bytes.toByteArray();
    }
}
