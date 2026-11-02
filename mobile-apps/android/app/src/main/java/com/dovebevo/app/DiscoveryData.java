package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Discovery keeps actual catalogue metadata. It neither creates nor reads private bookmarks. */
final class DiscoveryData {
    static final int MAX_ROWS=100;
    static final class Venue {
        final String key,name,cell,address,city;final double lat,lon;
        Venue(String key,String name,String cell,String address,String city,double lat,double lon){this.key=key;this.name=name;this.cell=cell;this.address=address;this.city=city;this.lat=lat;this.lon=lon;}
        String url(){return FavoritePricesClient.ORIGIN+"/bar/"+key+"?c="+cell;}
    }
    static final class Cell {
        final Map<String,Venue> venues;final FavoriteComparison.Cell approved;
        Cell(Map<String,Venue> venues,FavoriteComparison.Cell approved){this.venues=Collections.unmodifiableMap(venues);this.approved=approved;}
    }
    static final class Row {
        final Venue venue;final FavoriteComparison.Price price;final EuropePrices.Price mobilePrice;final double metres;
        Row(Venue venue,FavoriteComparison.Price price,DiscoveryArea area){this(venue,price,null,area);}
        Row(Venue venue,FavoriteComparison.Price price,EuropePrices.Price mobilePrice,DiscoveryArea area){this.venue=venue;this.price=price;this.mobilePrice=mobilePrice;metres=area.metres(venue.lat,venue.lon);}
        String group(){return NativePricePresentation.group(price,mobilePrice);}
        int amount(){return mobilePrice==null?price.cents:mobilePrice.amountMinor;}
    }
    static Cell withEurope(Cell legacy,EuropePrices.Cell mobile){
        FavoriteComparison.Cell approved=FavoriteComparison.withEurope(legacy==null?null:legacy.approved,mobile);Map<String,Venue> venues=new LinkedHashMap<>();
        if(legacy!=null)for(Venue v:legacy.venues.values())if(approved.names.containsKey(v.key))venues.put(v.key,v);
        for(EuropePrices.Venue v:mobile.venues.values())venues.put(v.key,new Venue(v.key,v.name,v.cell,"",v.city,v.lat,v.lon));
        return new Cell(venues,approved);
    }
    static Cell parse(byte[] file,byte[] prices,String cell,String today)throws IOException {
        // First use the existing complete validators: hidden/quarantined/pending and malformed data stay excluded.
        FavoriteComparison.Cell approved=FavoriteComparison.parse(file,prices,cell,today);Map<String,Venue> venues=new LinkedHashMap<>();
        if(approved.staticVerified) {
            Map<?,?> data=(Map<?,?>)NativeJson.read(file,FavoriteComparison.STATIC_BYTES);List<?> cities=(List<?>)data.get("c");
            for(Object value:(List<?>)data.get("v")) {
                List<?> row=(List<?>)value;String key=(String)row.get(0);if(!approved.names.containsKey(key))continue;
                int city=(int)NativeJson.integer(row.get(6),-1,cities.size()-1);
                venues.put(key,new Venue(key,approved.names.get(key),cell,(String)row.get(5),city<0?"":(String)((List<?>)cities.get(city)).get(1),NativeJson.decimal(row.get(3),35.2,47.2),NativeJson.decimal(row.get(4),6.5,18.6)));
            }
        }
        Map<?,?> live=(Map<?,?>)NativeJson.read(prices,FavoriteComparison.PRICE_BYTES);
        for(Object value:(List<?>)live.get("u")) {
            List<?> row=(List<?>)value;String key=(String)row.get(0);if(!approved.names.containsKey(key))continue;
            venues.put(key,new Venue(key,approved.names.get(key),cell,"","",NativeJson.decimal(row.get(3),35.2,47.2),NativeJson.decimal(row.get(4),6.5,18.6)));
        }
        return new Cell(venues,approved);
    }
    static List<Row> rows(Map<String,Cell> cells,DiscoveryArea area,RecommendationDrink drink,int band)throws IOException {
        if(cells.size()>9||area==null||drink==null||(band!=0&&band!=1))throw NativeJson.invalid();
        Map<String,Row> result=new HashMap<>();Set<String> duplicate=new HashSet<>(),seen=new HashSet<>();
        for(Cell cell:cells.values())for(Venue venue:cell.venues.values()) {
            if(duplicate.contains(venue.key))continue;
            if(!seen.add(venue.key)){result.entrySet().removeIf(entry->entry.getValue().venue.key.equals(venue.key));duplicate.add(venue.key);continue;}
            if(cell.approved.europe!=null&&cell.approved.europe.owns(venue.key)){
                for(EuropePrices.Price price:cell.approved.europe.selected(venue.key,drink,band))result.put(venue.key+"/"+price.group(),new Row(venue,null,price,area));
                continue;
            }
            FavoriteComparison.Price price=cell.approved.prices.get(venue.key+"/"+drink.code+"/"+band);
            if(price!=null)result.put(venue.key,new Row(venue,price,area));
        }
        List<Row> rows=new ArrayList<>(result.values());Collections.sort(rows,(a,b)->{int group=a.group().compareTo(b.group());if(group!=0)return group;int p=Integer.compare(a.amount(),b.amount());if(p!=0)return p;int distance=Double.compare(a.metres,b.metres);return distance!=0?distance:a.venue.key.compareTo(b.venue.key);});
        return Collections.unmodifiableList(rows);
    }
}
