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
        final Venue venue;final FavoriteComparison.Price price;final double metres;
        Row(Venue venue,FavoriteComparison.Price price,DiscoveryArea area){this.venue=venue;this.price=price;metres=area.metres(venue.lat,venue.lon);}
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
        Map<String,Row> result=new HashMap<>();Set<String> duplicate=new HashSet<>();
        for(Cell cell:cells.values())for(Venue venue:cell.venues.values()) {
            FavoriteComparison.Price price=cell.approved.prices.get(venue.key+"/"+drink.code+"/"+band);
            if(price!=null&&!duplicate.contains(venue.key)) {
                if(result.containsKey(venue.key)){result.remove(venue.key);duplicate.add(venue.key);}else result.put(venue.key,new Row(venue,price,area));
            }
        }
        List<Row> rows=new ArrayList<>(result.values());Collections.sort(rows,(a,b)->{int p=Integer.compare(a.price.cents,b.price.cents);if(p!=0)return p;int distance=Double.compare(a.metres,b.metres);return distance!=0?distance:a.venue.key.compareTo(b.venue.key);});
        return Collections.unmodifiableList(rows);
    }
}
