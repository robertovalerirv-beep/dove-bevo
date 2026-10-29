package com.dovebevo.app;

import java.io.IOException;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Only current public metadata and active same-category/same-band observations may be compared. */
final class FavoriteComparison {
    static final int HEALTH_BYTES=8192,STATIC_BYTES=2097152,PRICE_BYTES=524288;
    static final long SAFE_INTEGER=9007199254740991L;
    enum State{AVAILABLE,MISSING,UNAVAILABLE}
    static final class Price{
        final int cents;final String day;final long confirmations;final boolean old;
        Price(int cents,String day,long confirmations,boolean old){this.cents=cents;this.day=day;this.confirmations=confirmations;this.old=old;}
    }
    static final class Cell{
        final Map<String,String> names;final Map<String,Price> prices;
        final boolean staticVerified;
        Cell(Map<String,String> names,Map<String,Price> prices,boolean staticVerified){this.names=Collections.unmodifiableMap(names);this.prices=Collections.unmodifiableMap(prices);this.staticVerified=staticVerified;}
    }
    static final class Row{
        final SavedVenueStore.Venue saved;final String name;final Price price;final State state;
        Row(SavedVenueStore.Venue saved,String name,Price price,State state){this.saved=saved;this.name=name;this.price=price;this.state=state;}
    }
    static String key(String url)throws IOException{String canonical=SavedVenueUrl.canonicalize(url);if(canonical==null||!canonical.equals(url))throw NativeJson.invalid();return canonical.substring(canonical.indexOf("/bar/")+5,canonical.indexOf('?'));}
    static String cell(String url)throws IOException{key(url);return url.substring(url.indexOf("?c=")+3);}
    static String version(byte[] bytes)throws IOException{
        Map<?,?> value=object(NativeJson.read(bytes,HEALTH_BYTES));
        if(!"ok".equals(value.get("status"))||!(value.get("data_version") instanceof String)||!((String)value.get("data_version")).matches("[0-9]{8}"))throw NativeJson.invalid();
        return (String)value.get("data_version");
    }
    static Cell parse(byte[] staticBytes,byte[] priceBytes,String expectedCell,String today)throws IOException{
        if(expectedCell==null||!expectedCell.matches("[0-9b-hjkmnp-z]{5}"))throw NativeJson.invalid();
        long now=FavoriteDay.milliseconds(today);
        Map<?,?> data=object(NativeJson.read(priceBytes,PRICE_BYTES));
        if(!data.keySet().equals(new HashSet<>(Arrays.asList("p","u","pend","h")))&&!data.keySet().equals(new HashSet<>(Arrays.asList("p","u","pend","h","g"))))throw NativeJson.invalid();
        Map<String,String> names;boolean staticVerified;
        try { names=staticNames(staticBytes,expectedCell);staticVerified=true; }
        catch(IOException unavailable){names=new LinkedHashMap<>();staticVerified=false;}
        Set<String> hidden=keySet(data.get("h"));
        Set<String> users=new HashSet<>();
        for(Object item:array(data.get("u"))){List<?> row=row(item,5);String key=venueKey(row.get(0),"u");String name=text(row.get(1),200,false);location(row,2,expectedCell);if(!users.add(key))throw NativeJson.invalid();names.put(key,name);}
        Set<String> pending=new HashSet<>();
        for(Object item:array(data.get("pend"))){List<?> row=row(item,6);String key=venueKey(row.get(0),"u");text(row.get(1),200,false);location(row,2,expectedCell);NativeJson.integer(row.get(5),0,SAFE_INTEGER);if(!pending.add(key)||users.contains(key))throw NativeJson.invalid();}
        if(data.containsKey("g"))keySet(data.get("g"));
        for(String key:hidden)names.remove(key);
        Map<String,Price> prices=new HashMap<>();Set<String> pairs=new HashSet<>();
        for(Object item:array(data.get("p"))){
            List<?> row=row(item,7);String key=venueKey(row.get(0),"nwru");RecommendationDrink drink=RecommendationDrink.from(text(row.get(1),32,false));if(drink==null)throw NativeJson.invalid();
            int band=(int)NativeJson.integer(row.get(2),0,1),cents=(int)NativeJson.integer(row.get(3),drink.minCents,drink.maxCents);
            String day=text(row.get(4),10,false);long at=FavoriteDay.milliseconds(day);if(at>now)throw NativeJson.invalid();
            long confirmations=NativeJson.integer(row.get(5),0,SAFE_INTEGER);long quarantined=NativeJson.integer(row.get(6),0,1);
            String pair=pair(key,drink,band);if(!pairs.add(pair))throw NativeJson.invalid();
            if(quarantined==0&&names.containsKey(key))prices.put(pair,new Price(cents,day,confirmations,now-at>90L*86400000L));
        }
        return new Cell(names,prices,staticVerified);
    }
    private static Map<String,String> staticNames(byte[] bytes,String expectedCell)throws IOException{
        Map<?,?> file=object(NativeJson.read(bytes,STATIC_BYTES));keys(file,"c","v");
        List<?> cities=array(file.get("c"));Set<Long> cityIds=new HashSet<>();
        for(Object item:cities){List<?> row=row(item,2);if(!cityIds.add(NativeJson.integer(row.get(0),1,SAFE_INTEGER)))throw NativeJson.invalid();text(row.get(1),200,false);}
        Map<String,String> names=new LinkedHashMap<>();
        for(Object item:array(file.get("v"))){List<?> row=row(item,7);String key=venueKey(row.get(0),"nwr");String name=text(row.get(1),200,false);
            location(row,2,expectedCell);text(row.get(5),1000,true);NativeJson.integer(row.get(6),-1,cities.size()-1);if(names.put(key,name)!=null)throw NativeJson.invalid();}
        return names;
    }
    static List<Row> rows(List<SavedVenueStore.Venue> saved,Map<String,Cell> cells,RecommendationDrink drink,int band)throws IOException{
        if(saved.size()>SavedVenueStore.MAX_VENUES||drink==null||(band!=0&&band!=1))throw NativeJson.invalid();
        List<Row> rows=new ArrayList<>();
        for(SavedVenueStore.Venue venue:saved){Cell data=cells.get(cell(venue.url));String name=data==null?null:data.names.get(key(venue.url));Price price=name==null?null:data.prices.get(pair(key(venue.url),drink,band));rows.add(new Row(venue,name==null?venue.label:name,price,name==null?State.UNAVAILABLE:price==null?State.MISSING:State.AVAILABLE));}
        Collator names=Collator.getInstance(Locale.ITALIAN);
        Collections.sort(rows,(a,b)->{if((a.price!=null)!=(b.price!=null))return a.price!=null?-1:1;if(a.price!=null){int price=Integer.compare(a.price.cents,b.price.cents);if(price!=0)return price;}int name=names.compare(a.name,b.name);return name!=0?name:a.saved.url.compareTo(b.saved.url);});return rows;
    }
    private static String pair(String key,RecommendationDrink drink,int band){return key+"/"+drink.code+"/"+band;}
    private static void location(List<?> row,int start,String cell)throws IOException{
        // Public venues can be outside Italy; their coordinates must still match the requested cell.
        NativeJson.integer(row.get(start),0,4);double lat=NativeJson.decimal(row.get(start+1),-90,90),lon=NativeJson.decimal(row.get(start+2),-180,180);
        if(!geohash(lat,lon).equals(cell))throw NativeJson.invalid();
    }
    private static String geohash(double lat,double lon){
        double south=-90,north=90,west=-180,east=180;StringBuilder result=new StringBuilder();int value=0;
        for(int bit=0;bit<25;bit++){
            boolean longitude=bit%2==0;double middle=longitude?(west+east)/2:(south+north)/2;boolean high=(longitude?lon:lat)>=middle;
            value=(value<<1)|(high?1:0);if(longitude){if(high)west=middle;else east=middle;}else{if(high)south=middle;else north=middle;}
            if(bit%5==4){result.append("0123456789bcdefghjkmnpqrstuvwxyz".charAt(value));value=0;}
        }return result.toString();
    }
    private static Set<String> keySet(Object value)throws IOException{Set<String> result=new HashSet<>();for(Object item:array(value))if(!result.add(venueKey(item,"nwru")))throw NativeJson.invalid();return result;}
    private static String venueKey(Object value,String kinds)throws IOException{String key=text(value,16,false);if(!key.matches("["+kinds+"][1-9][0-9]{0,14}"))throw NativeJson.invalid();return key;}
    private static String text(Object value,int maximum,boolean empty)throws IOException{
        if(!(value instanceof String))throw NativeJson.invalid();String text=(String)value;if(text.length()>maximum||(!empty&&text.trim().isEmpty()))throw NativeJson.invalid();
        for(int i=0;i<text.length();i++)if(Character.isISOControl(text.charAt(i)))throw NativeJson.invalid();return text;
    }
    private static Map<?,?> object(Object value)throws IOException{if(!(value instanceof Map))throw NativeJson.invalid();return(Map<?,?>)value;}
    private static List<?> array(Object value)throws IOException{if(!(value instanceof List))throw NativeJson.invalid();return(List<?>)value;}
    private static List<?> row(Object value,int size)throws IOException{List<?> result=array(value);if(result.size()!=size)throw NativeJson.invalid();return result;}
    private static void keys(Map<?,?> value,String...keys)throws IOException{if(!value.keySet().equals(new HashSet<>(Arrays.asList(keys))))throw NativeJson.invalid();}
}
