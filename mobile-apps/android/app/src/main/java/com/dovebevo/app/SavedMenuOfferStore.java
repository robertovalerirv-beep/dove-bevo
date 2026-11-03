package com.dovebevo.app;

import java.io.*;
import java.util.*;

/** Private exact owner-offer choices; live prices are never serialized. */
final class SavedMenuOfferStore {
    static final int MAX_ITEMS=50,MAX_BYTES=65536,MAGIC=0x44424f31;
    enum Result { SAVED, REMOVED, NOT_FOUND, INVALID, FULL, STORAGE_ERROR }
    static final class Entry {
        final SavedVenueStore.Venue venue;final String id,name,category,serving;final Integer ml;
        Entry(SavedVenueStore.Venue venue,String id,String name,String category,String serving,Integer ml){
            this.venue=venue;this.id=id;this.name=name;this.category=category;this.serving=serving;this.ml=ml;
        }
        String key(){return venue.url+"|"+id;}
        String focusedUrl(){return MobileEntry.offerDocument(venue.url,id);}
    }
    private final SavedVenueStore.Storage storage;
    SavedMenuOfferStore(SavedVenueStore.Storage storage){this.storage=storage;}
    static Entry verified(SavedVenueStore.Venue venue,MenuV2Prices.Price offer){
        if(offer==null||offer.customer)return null;
        return validated(venue,offer.id,offer.name,offer.category.isEmpty()?null:offer.category,offer.servingLabel,offer.servingML);
    }
    static Entry validated(SavedVenueStore.Venue venue,String id,String name,String category,String serving,Integer ml){
        if(venue==null||id==null||!id.matches("[A-Za-z0-9._:-]{1,128}")||!text(name,512)||category!=null&&RecommendationDrink.from(category)==null
                ||serving!=null&&!text(serving,256)||ml!=null&&(ml<1||ml>100000))return null;
        return new Entry(venue,id,name,category,serving,ml);
    }
    private static boolean text(String value,int max){
        if(value==null||value.isEmpty()||value.length()>max||!value.trim().equals(value))return false;
        for(int i=0;i<value.length();i++)if(Character.isISOControl(value.charAt(i))||value.charAt(i)=='\ufffd')return false;
        return true;
    }
    List<Entry> load()throws IOException{
        byte[] bytes=storage.read();if(bytes==null)return Collections.emptyList();
        if(bytes.length==0||bytes.length>MAX_BYTES)throw new IOException("Unreadable saved offers");
        try(DataInputStream input=new DataInputStream(new ByteArrayInputStream(bytes))){
            if(input.readInt()!=MAGIC)throw new IOException("Unknown saved offer version");
            int count=input.readInt();if(count<0||count>MAX_ITEMS)throw new IOException("Invalid saved offer count");
            List<Entry> result=new ArrayList<>();Set<String> seen=new HashSet<>();
            for(int i=0;i<count;i++){
                SavedVenueStore.Venue venue=SavedVenueStore.reference(input.readUTF(),input.readUTF());
                String id=input.readUTF(),name=input.readUTF();
                String category=input.readBoolean()?input.readUTF():null,serving=input.readBoolean()?input.readUTF():null;
                Integer ml=input.readBoolean()?input.readInt():null;
                Entry item=validated(venue,id,name,category,serving,ml);
                if(item==null||!seen.add(item.key()))throw new IOException("Invalid saved offer");result.add(item);
            }
            if(input.available()!=0)throw new IOException("Trailing saved offer data");return Collections.unmodifiableList(result);
        }catch(RuntimeException invalid){throw new IOException("Unreadable saved offers",invalid);}
    }
    Result save(Entry item){
        if(item==null||validated(item.venue,item.id,item.name,item.category,item.serving,item.ml)==null)return Result.INVALID;
        try{
            List<Entry> before=load(),after=new ArrayList<>();after.add(item);boolean duplicate=false;
            for(Entry old:before)if(old.key().equals(item.key()))duplicate=true;else after.add(old);
            if(!duplicate&&before.size()>=MAX_ITEMS)return Result.FULL;
            storage.write(encode(after));return Result.SAVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }
    Result remove(Entry item){if(item==null)return Result.INVALID;
        try{List<Entry> before=load(),after=new ArrayList<>();for(Entry old:before)if(!old.key().equals(item.key()))after.add(old);
            if(before.size()==after.size())return Result.NOT_FOUND;storage.write(encode(after));return Result.REMOVED;
        }catch(IOException|RuntimeException unavailable){return Result.STORAGE_ERROR;}
    }
    private static byte[] encode(List<Entry> items)throws IOException{
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(DataOutputStream out=new DataOutputStream(bytes)){
            out.writeInt(MAGIC);out.writeInt(items.size());for(Entry item:items){out.writeUTF(item.venue.url);out.writeUTF(item.venue.label);
                out.writeUTF(item.id);out.writeUTF(item.name);out.writeBoolean(item.category!=null);if(item.category!=null)out.writeUTF(item.category);
                out.writeBoolean(item.serving!=null);if(item.serving!=null)out.writeUTF(item.serving);
                out.writeBoolean(item.ml!=null);if(item.ml!=null)out.writeInt(item.ml);}
        }if(bytes.size()>MAX_BYTES)throw new IOException("Saved offers too large");return bytes.toByteArray();
    }
}
