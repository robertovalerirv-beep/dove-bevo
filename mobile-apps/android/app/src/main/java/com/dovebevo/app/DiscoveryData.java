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
        final Map<String,Venue> venues;final FavoriteComparison.Cell approved;final Map<String,List<MenuV2Prices.Price>> menu;
        final boolean menuAvailable,menuSamples;
        Cell(Map<String,Venue> venues,FavoriteComparison.Cell approved){this(venues,approved,Collections.emptyMap(),true);}
        Cell(Map<String,Venue> venues,FavoriteComparison.Cell approved,Map<String,List<MenuV2Prices.Price>> menu,boolean menuAvailable){
            this(venues,approved,menu,menuAvailable,false);
        }
        Cell(Map<String,Venue> venues,FavoriteComparison.Cell approved,Map<String,List<MenuV2Prices.Price>> menu,boolean menuAvailable,boolean menuSamples){
            this.venues=Collections.unmodifiableMap(new LinkedHashMap<>(venues));this.approved=approved;
            this.menu=Collections.unmodifiableMap(new LinkedHashMap<>(menu));this.menuAvailable=menuAvailable;this.menuSamples=menuSamples;
        }
    }
    static final class Row {
        final Venue venue;final FavoriteComparison.Price price;final EuropePrices.Price mobilePrice;
        final MenuV2Prices.Price menuPrice;final double metres;
        Row(Venue venue,FavoriteComparison.Price price,DiscoveryArea area){this(venue,price,null,null,area);}
        Row(Venue venue,FavoriteComparison.Price price,EuropePrices.Price mobilePrice,DiscoveryArea area){this(venue,price,mobilePrice,null,area);}
        Row(Venue venue,MenuV2Prices.Price menuPrice,DiscoveryArea area){this(venue,null,null,menuPrice,area);}
        private Row(Venue venue,FavoriteComparison.Price price,EuropePrices.Price mobilePrice,MenuV2Prices.Price menuPrice,DiscoveryArea area){
            this.venue=venue;this.price=price;this.mobilePrice=mobilePrice;this.menuPrice=menuPrice;metres=area.metres(venue.lat,venue.lon);
        }
        /** Match the app's original-currency and serving groups across the
         * mobile catalogue and named-menu feeds; legacy size stays unknown. */
        String group(){
            if(menuPrice!=null){
                String label=menuPrice.servingLabel==null?"":menuPrice.servingLabel.trim().toLowerCase(java.util.Locale.ROOT);
                String unit=label.equals("calice")||label.equals("bicchiere")||label.equals("glass")?"glass":
                        label.equals("ml")?"ml":"label:"+label;
                return menuPrice.currency+"|"+menuPrice.exponent+"|"+unit+"|"+(menuPrice.servingML==null?0:menuPrice.servingML);
            }
            if(mobilePrice!=null)return mobilePrice.currency+"|2|"+mobilePrice.serving.unit+"|"+(mobilePrice.serving.ml==null?0:mobilePrice.serving.ml);
            return "EUR|legacy-unknown";
        }
        String currency(){return menuPrice!=null?menuPrice.currency:mobilePrice!=null?mobilePrice.currency:"EUR";}
        int amount(){return menuPrice!=null?menuPrice.amountMinor:mobilePrice==null?price.cents:mobilePrice.amountMinor;}
        long normalizedAmount(){int exponent=menuPrice==null?2:menuPrice.exponent;
            return (long)amount()*new int[]{1000,100,10,1}[exponent];}
        String amountLabel(){return menuPrice==null?NativePricePresentation.amount(price,mobilePrice):menuPrice.amount();}
        String groupLabel(){return menuPrice==null?NativePricePresentation.groupLabel(price,mobilePrice):menuPrice.currency+(menuPrice.serving().isEmpty()?"":" · "+menuPrice.serving());}
        String day(){return menuPrice!=null?menuPrice.day:mobilePrice==null?price.day:mobilePrice.sourceKind.equals("online_menu")?mobilePrice.sourceCheckedOn:mobilePrice.observedOn;}
        boolean menuSource(){return menuPrice!=null||mobilePrice!=null&&mobilePrice.sourceKind.equals("online_menu");}
        boolean old(){
            if(menuPrice!=null)try{return FavoriteDay.milliseconds(FavoriteDay.today())-FavoriteDay.milliseconds(menuPrice.day)>90L*86400000L;}
                catch(IOException invalid){return true;}
            return mobilePrice==null?price.old:mobilePrice.old;
        }
        String context(){return menuPrice!=null?menuPrice.evidence():mobilePrice!=null?NativePricePresentation.context(mobilePrice):"";}
        String tieKey(){return menuPrice!=null?"menu|"+menuPrice.id:mobilePrice!=null?"europe|"+mobilePrice.revision:"legacy|"+price.day;}
    }
    static Cell withMenu(Cell legacy,MenuV2Prices.Cell menu)throws IOException{
        if(menu==null)throw NativeJson.invalid();
        FavoriteComparison.Cell approved=legacy==null?
                new FavoriteComparison.Cell(Collections.emptyMap(),Collections.emptyMap(),false):legacy.approved;
        Map<String,Venue> venues=new LinkedHashMap<>();if(legacy!=null)venues.putAll(legacy.venues);
        Map<String,List<MenuV2Prices.Price>> prices=new LinkedHashMap<>();
        boolean ambiguous=false;
        for(MenuV2Prices.CellVenue item:menu.venues){
            Venue known=venues.get(item.key);
            if(known==null&&!item.key.startsWith("m"))continue;
            if(known!=null&&(!known.cell.equals(item.cell)||!known.name.equals(item.name)||
                    Math.abs(known.lat-item.lat)>0.0005||Math.abs(known.lon-item.lon)>0.0005)){
                ambiguous=true;continue;
            }
            if(known==null)venues.put(item.key,new Venue(item.key,item.name,item.cell,item.address,item.city,item.lat,item.lon));
            prices.put(item.key,item.samples);
        }
        return new Cell(venues,approved,prices,!menu.partial&&!ambiguous,true);
    }
    static Cell withoutMenu(Cell legacy){return new Cell(legacy.venues,legacy.approved,legacy.menu,false);}
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
            for(MenuV2Prices.Price offer:cell.menu.getOrDefault(venue.key,Collections.emptyList())){
                if(!offer.category.equals(drink.code)||offer.band!=band)continue;
                String identity=venue.key+"/menu/"+offer.group();Row prior=result.get(identity);
                if(prior==null||offer.amountMinor<prior.amount())result.put(identity,new Row(venue,offer,area));
            }
            if(cell.approved.europe!=null&&cell.approved.europe.owns(venue.key)){
                for(EuropePrices.Price price:cell.approved.europe.selected(venue.key,drink,band))result.put(venue.key+"/"+price.group(),new Row(venue,null,price,area));
                continue;
            }
            FavoriteComparison.Price price=cell.approved.prices.get(venue.key+"/"+drink.code+"/"+band);
            if(price!=null)result.put(venue.key,new Row(venue,price,area));
        }
        return rankRows(new ArrayList<>(result.values()));
    }
    /** Ascending amounts within each original currency. Serving stays visible
     * because unlike servings are not a like-for-like price comparison. */
    static List<Row> rankRows(List<Row> rows){
        Collections.sort(rows,(a,b)->{
            int currency=a.currency().compareTo(b.currency());if(currency!=0)return currency;
            int amount=Long.compare(a.normalizedAmount(),b.normalizedAmount());if(amount!=0)return amount;
            int group=a.group().compareTo(b.group());if(group!=0)return group;
            int distance=Double.compare(a.metres,b.metres);if(distance!=0)return distance;
            int name=a.venue.name.compareToIgnoreCase(b.venue.name);if(name!=0)return name;
            name=a.venue.name.compareTo(b.venue.name);if(name!=0)return name;
            int key=a.venue.key.compareTo(b.venue.key);return key!=0?key:a.tieKey().compareTo(b.tieKey());
        });
        return Collections.unmodifiableList(rows);
    }
}
