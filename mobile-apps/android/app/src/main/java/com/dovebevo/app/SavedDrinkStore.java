package com.dovebevo.app;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Explicit private choices only. Never persists prices, revisions, serving or paid dates. */
final class SavedDrinkStore {
    static final int MAX_ITEMS = 50, MAX_BYTES = 65536;
    private static final int MAGIC = 0x44424431;
    private final SavedVenueStore.Storage storage;
    enum Result { SAVED, REMOVED, NOT_FOUND, INVALID, FULL, STORAGE_ERROR }

    static final class Entry {
        final SavedVenueStore.Venue venue;
        final RecommendationDrink drink;
        final int band;
        Entry(SavedVenueStore.Venue venue, RecommendationDrink drink, int band) { this.venue=venue;this.drink=drink;this.band=band; }
        String key() { return URI.create(venue.url).getPath().substring(5)+"/"+drink.code+"/"+band; }
        String focusedUrl() { return MobileEntry.drinkDocument(venue.url,drink,band); }
    }

    SavedDrinkStore(SavedVenueStore.Storage storage) { this.storage=storage; }

    List<Entry> load() throws IOException {
        byte[] bytes=storage.read();
        if(bytes==null)return Collections.emptyList();
        if(bytes.length==0||bytes.length>MAX_BYTES)throw new IOException("Unreadable saved drinks");
        try(DataInputStream input=new DataInputStream(new ByteArrayInputStream(bytes))) {
            if(input.readInt()!=MAGIC)throw new IOException("Unknown saved drinks version");
            int count=input.readInt();if(count<0||count>MAX_ITEMS)throw new IOException("Invalid saved drinks count");
            List<Entry> items=new ArrayList<>();Set<String> keys=new HashSet<>();
            for(int i=0;i<count;i++) {
                SavedVenueStore.Venue venue=SavedVenueStore.reference(input.readUTF(),input.readUTF());
                RecommendationDrink drink=RecommendationDrink.from(input.readUTF());int band=input.readUnsignedByte();
                if(venue==null||drink==null||band>1)throw new IOException("Invalid saved drink");
                Entry entry=new Entry(venue,drink,band);if(!keys.add(entry.key()))throw new IOException("Duplicate saved drink");items.add(entry);
            }
            if(input.available()!=0)throw new IOException("Unexpected saved drinks data");
            return Collections.unmodifiableList(items);
        }catch(RuntimeException invalid){throw new IOException("Unreadable saved drinks",invalid);}
    }

    Result save(String url,String verifiedName,RecommendationDrink drink,int band) {
        SavedVenueStore.Venue venue=SavedVenueStore.reference(url,verifiedName);
        if(venue==null||drink==null||(band!=0&&band!=1))return Result.INVALID;
        Entry item=new Entry(venue,drink,band);
        try {
            List<Entry> before=load(),after=new ArrayList<>();after.add(item);boolean duplicate=false;
            for(Entry old:before)if(old.key().equals(item.key()))duplicate=true;else after.add(old);
            if(!duplicate&&before.size()>=MAX_ITEMS)return Result.FULL;
            storage.write(encode(after));return Result.SAVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }

    Result remove(Entry item) {
        if(item==null)return Result.INVALID;
        try {
            List<Entry> before=load(),after=new ArrayList<>();
            for(Entry old:before)if(!old.key().equals(item.key()))after.add(old);
            if(before.size()==after.size())return Result.NOT_FOUND;
            storage.write(encode(after));return Result.REMOVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }

    private static byte[] encode(List<Entry> items)throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(DataOutputStream output=new DataOutputStream(bytes)) {
            output.writeInt(MAGIC);output.writeInt(items.size());
            for(Entry entry:items){output.writeUTF(entry.venue.url);output.writeUTF(entry.venue.label);output.writeUTF(entry.drink.code);output.writeByte(entry.band);}
        }
        if(bytes.size()>MAX_BYTES)throw new IOException("Saved drinks too large");return bytes.toByteArray();
    }
}
