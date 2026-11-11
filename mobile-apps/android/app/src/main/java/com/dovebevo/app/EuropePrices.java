package com.dovebevo.app;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** App-only currency/serving contract. These rows are never decoded as legacy EUR tuples. */
final class EuropePrices {
    static final int BYTES=2097152,MAX_ROWS=5000;
    static final class Venue {
        final String key,name,cell,city,country,currency;final double lat,lon;
        Venue(String key,String name,String cell,String city,String country,String currency,double lat,double lon){this.key=key;this.name=name;this.cell=cell;this.city=city;this.country=country;this.currency=currency;this.lat=lat;this.lon=lon;}
    }
    static final class Catalog {
        final String version;final Map<String,Venue> venues;
        Catalog(String version,Map<String,Venue> venues){this.version=version;this.venues=Collections.unmodifiableMap(new LinkedHashMap<>(venues));}
        boolean containsCell(String cell){for(Venue v:venues.values())if(v.cell.equals(cell))return true;return false;}
        boolean foreignCell(String cell){for(Venue v:venues.values())if(v.cell.equals(cell)&&!v.country.equals("IT"))return true;return false;}
    }
    static final class Serving {
        final String unit;final Integer ml;
        Serving(String unit,Integer ml){this.unit=unit;this.ml=ml;}
        String key(){return unit+":"+(ml==null?"":ml);}
        String label(){return unit.equals("ml")?ml+" ml":unit.equals("glass")?"calice"+(ml==null?" (volume non indicato)":" "+ml+" ml"):"";}
    }
    static final class Price {
        final String venue,cell,drink,currency,observedOn,confirmedOn,revision,sourceKind,sourceUrl,sourceCheckedOn,sourceSha256,menuItem,catalogVersion;
        final int band,amountMinor;final long confirmations;final Serving serving;final boolean old;
        Price(String venue,String cell,String drink,String currency,int band,int amount,Serving serving,String observed,String confirmed,long confirmations,String revision,String kind,String url,String checked,String sha,String item,String version,boolean old){this.venue=venue;this.cell=cell;this.drink=drink;this.currency=currency;this.band=band;amountMinor=amount;this.serving=serving;observedOn=observed;confirmedOn=confirmed;this.confirmations=confirmations;this.revision=revision;sourceKind=kind;sourceUrl=url;sourceCheckedOn=checked;sourceSha256=sha;menuItem=item;catalogVersion=version;this.old=old;}
        String group(){return currency+"/"+serving.key();}
    }
    static final class Cell {
        final String catalogVersion;final Map<String,Venue> venues;final Set<String> scoped,hidden,legacy;final List<Price> prices;
        Cell(String version,Map<String,Venue> venues,Set<String> scoped,Set<String> hidden,Set<String> legacy,List<Price> prices){catalogVersion=version;this.venues=Collections.unmodifiableMap(new LinkedHashMap<>(venues));this.scoped=Collections.unmodifiableSet(new HashSet<>(scoped));this.hidden=Collections.unmodifiableSet(new HashSet<>(hidden));this.legacy=Collections.unmodifiableSet(new HashSet<>(legacy));this.prices=Collections.unmodifiableList(new ArrayList<>(prices));}
        List<Price> selected(String venue,RecommendationDrink drink,int band){List<Price> result=new ArrayList<>();for(Price p:prices)if(p.venue.equals(venue)&&p.drink.equals(drink.code)&&p.band==band)result.add(p);return result;}
        boolean owns(String venue){return scoped.contains(venue)&&!legacy.contains(venue);}
    }
    static Catalog catalog(byte[] raw,String today)throws IOException {
        Map<?,?> doc=object(NativeJson.read(raw,BYTES));keys(doc,"schema_version","version","venues");NativeJson.integer(doc.get("schema_version"),1,1);String version=version(doc.get("version"));Map<String,Venue> venues=new LinkedHashMap<>();
        for(Object value:array(doc.get("venues"),5000)){
            Map<?,?> v=object(value);keys(v,"key","name","kind","lat","lon","cell","city","country","currency","google");String key=key(v.get("key")),cell=cell(v.get("cell")),country=text(v.get("country"),2,false),currency=text(v.get("currency"),3,false);
            NativeJson.integer(v.get("kind"),1,4);String name=text(v.get("name"),120,false),city=text(v.get("city"),120,false);if(name.trim().length()<2||city.trim().length()<2)throw NativeJson.invalid();
            double lat=NativeJson.decimal(v.get("lat"),-90,90),lon=NativeJson.decimal(v.get("lon"),-180,180);double[] box=countryBox(country);
            if(lat<box[0]||lat>box[1]||lon<box[2]||lon>box[3]||!DiscoveryArea.geohash(lat,lon).equals(cell)||!currency.equals(country.equals("GB")?"GBP":"EUR"))throw NativeJson.invalid();
            Map<?,?> google=object(v.get("google"));
            if(!google.keySet().equals(new HashSet<>(Arrays.asList("url","checked_on"))))
                    keys(google,"url","review_count","checked_on");
            String url=https(google.get("url"));try{if(!new URI(url).getHost().matches("(?:www\\.|maps\\.)?google\\.(?:com|it|fr|de|es|co\\.uk)"))throw NativeJson.invalid();}catch(java.net.URISyntaxException invalid){throw NativeJson.invalid();}
            // Review count is provenance, not an eligibility threshold. Menus from
            // verified existing venues may have few or no published reviews.
            if(google.get("review_count")!=null)NativeJson.integer(google.get("review_count"),0,100000000);
            day(google.get("checked_on"),today,false);
            if(venues.put(key,new Venue(key,name,cell,city,country,currency,lat,lon))!=null)throw NativeJson.invalid();
        }return new Catalog(version,venues);
    }
    static Cell parse(byte[] raw,Catalog catalog,String expectedCell,String expectedVenue,String today)throws IOException {
        if(catalog==null)throw NativeJson.invalid();cell(expectedCell);if(expectedVenue!=null)key(expectedVenue);
        Map<?,?> doc=object(NativeJson.read(raw,BYTES));keys(doc,"schema_version","catalog_version","rows","hidden","legacy_venues");NativeJson.integer(doc.get("schema_version"),1,1);if(!catalog.version.equals(version(doc.get("catalog_version"))))throw NativeJson.invalid();
        Set<String> scoped=new LinkedHashSet<>();for(Venue v:catalog.venues.values())if(v.cell.equals(expectedCell))scoped.add(v.key);
        if(expectedVenue!=null&&!scoped.contains(expectedVenue))throw NativeJson.invalid();
        Set<String> hidden=keySet(doc.get("hidden"),scoped),legacy=keySet(doc.get("legacy_venues"),scoped);Set<String> queried=expectedVenue==null?scoped:Collections.singleton(expectedVenue);Map<String,Venue> venues=new LinkedHashMap<>();for(String k:queried)if(!hidden.contains(k)&&!legacy.contains(k))venues.put(k,catalog.venues.get(k));
        List<Price> prices=new ArrayList<>();Set<String> identities=new HashSet<>();
        for(Object value:array(doc.get("rows"),MAX_ROWS)){
            Map<?,?> p=object(value);keys(p,"venue","cell","drink","hh","currency","amount_minor","serving","observed_on","confirmed_on","confirmations","status","revision","provenance");String k=key(p.get("venue"));Venue venue=catalog.venues.get(k);
            if(venue==null||!scoped.contains(k)||!expectedCell.equals(cell(p.get("cell")))||(expectedVenue!=null&&!expectedVenue.equals(k)))throw NativeJson.invalid();
            RecommendationDrink drink=RecommendationDrink.from(text(p.get("drink"),32,false));if(drink==null)throw NativeJson.invalid();int band=(int)NativeJson.integer(p.get("hh"),0,1);String currency=text(p.get("currency"),3,false);if(!currency.equals(venue.currency))throw NativeJson.invalid();
            int min=currency.equals("GBP")?(drink==RecommendationDrink.WATER?1:100):drink.minCents,max=currency.equals("GBP")?(drink==RecommendationDrink.WATER?1500:drink==RecommendationDrink.BEER_DRAFT||drink==RecommendationDrink.ALCOHOL_FREE?3000:5000):drink.maxCents;
            int amount=(int)NativeJson.integer(p.get("amount_minor"),min,max);Serving serving=serving(p.get("serving"),drink);String identity=k+"/"+drink.code+"/"+band+"/"+currency+"/"+serving.key();if(!identities.add(identity))throw NativeJson.invalid();
            String observed=day(p.get("observed_on"),today,true),confirmed=day(p.get("confirmed_on"),today,true),revision=text(p.get("revision"),36,false);if(!revision.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))throw NativeJson.invalid();
            long confirmations=NativeJson.integer(p.get("confirmations"),0,FavoriteComparison.SAFE_INTEGER);String status=text(p.get("status"),16,false);if(!status.equals("active")&&!status.equals("quarantined"))throw NativeJson.invalid();
            Map<?,?> source=object(p.get("provenance"));keys(source,"kind","source_url","source_checked_on","source_sha256","menu_item");String kind=text(source.get("kind"),16,false),url=null,checked=null,sha=null,item=null;
            if(kind.equals("online_menu")){if(observed!=null)throw NativeJson.invalid();url=https(source.get("source_url"));checked=day(source.get("source_checked_on"),today,false);sha=text(source.get("source_sha256"),64,false);if(!sha.matches("[0-9a-f]{64}"))throw NativeJson.invalid();item=text(source.get("menu_item"),240,false);}
            else if(kind.equals("customer")){if(observed==null||source.get("source_url")!=null||source.get("source_checked_on")!=null||source.get("source_sha256")!=null||source.get("menu_item")!=null)throw NativeJson.invalid();}
            else throw NativeJson.invalid();
            String ageDay=kind.equals("online_menu")?checked:observed;
            boolean old=FavoriteDay.milliseconds(today)-FavoriteDay.milliseconds(ageDay)>90L*86400000L;
            if(status.equals("active")&&!hidden.contains(k)&&!legacy.contains(k))prices.add(new Price(k,expectedCell,drink.code,currency,band,amount,serving,observed,confirmed,confirmations,revision,kind,url,checked,sha,item,catalog.version,old));
        }return new Cell(catalog.version,venues,queried,hidden,legacy,prices);
    }
    private static Serving serving(Object value,RecommendationDrink drink)throws IOException {
        Map<?,?> s=object(value);if(!s.keySet().equals(new HashSet<>(Arrays.asList("unit")))&&!s.keySet().equals(new HashSet<>(Arrays.asList("unit","ml"))))throw NativeJson.invalid();String unit=text(s.get("unit"),5,false);Integer ml=s.containsKey("ml")?(int)NativeJson.integer(s.get("ml"),1,2000):null;
        if(drink==RecommendationDrink.BEER_DRAFT||drink==RecommendationDrink.WATER){if(!unit.equals("ml")||ml==null)throw NativeJson.invalid();}
        else if(drink==RecommendationDrink.WINE_GLASS){if(!unit.equals("glass"))throw NativeJson.invalid();}
        else if(!unit.equals("drink")||ml!=null)throw NativeJson.invalid();return new Serving(unit,ml);
    }
    static double[] countryBox(String country)throws IOException {switch(country){case"IT":return new double[]{35,48,6,19};case"GB":return new double[]{49.8,61,-8.8,2.1};case"FR":return new double[]{41,51.6,-5.5,10};case"ES":return new double[]{27.5,44,-18.5,4.5};case"DE":return new double[]{47.2,55.2,5.5,15.6};default:throw NativeJson.invalid();}}
    static String cell(Object value)throws IOException {String s=text(value,5,false);if(!s.matches("[0-9b-hjkmnp-z]{5}"))throw NativeJson.invalid();return s;}
    static String key(Object value)throws IOException {String s=text(value,16,false);if(!s.matches("[nwr][1-9][0-9]{0,14}"))throw NativeJson.invalid();return s;}
    private static String version(Object value)throws IOException {String s=text(value,100,false);if(!s.matches("[A-Za-z0-9._-]{1,100}"))throw NativeJson.invalid();return s;}
    private static String day(Object value,String today,boolean nullable)throws IOException {if(value==null&&nullable)return null;String s=text(value,10,false);if(FavoriteDay.milliseconds(s)>FavoriteDay.milliseconds(today))throw NativeJson.invalid();return s;}
    private static String https(Object value)throws IOException {String s=text(value,2048,false);try{URI u=new URI(s);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getRawUserInfo()!=null||u.getPort()!=-1||u.getRawFragment()!=null)throw NativeJson.invalid();for(int i=0;i<s.length();i++)if(Character.isWhitespace(s.charAt(i)))throw NativeJson.invalid();return s;}catch(java.net.URISyntaxException invalid){throw NativeJson.invalid();}}
    private static String text(Object value,int maximum,boolean empty)throws IOException {if(!(value instanceof String))throw NativeJson.invalid();String s=(String)value;if(s.length()>maximum||!empty&&s.trim().isEmpty())throw NativeJson.invalid();for(int i=0;i<s.length();i++)if(Character.isISOControl(s.charAt(i)))throw NativeJson.invalid();return s;}
    private static Map<?,?> object(Object value)throws IOException {if(!(value instanceof Map))throw NativeJson.invalid();return(Map<?,?>)value;}
    private static List<?> array(Object value,int max)throws IOException {if(!(value instanceof List)||((List<?>)value).size()>max)throw NativeJson.invalid();return(List<?>)value;}
    private static void keys(Map<?,?> value,String...keys)throws IOException {if(!value.keySet().equals(new HashSet<>(Arrays.asList(keys))))throw NativeJson.invalid();}
    private static Set<String> keySet(Object value,Set<String> scoped)throws IOException {Set<String> keys=new HashSet<>();for(Object item:array(value,5000)){String k=key(item);if(!scoped.contains(k)||!keys.add(k))throw NativeJson.invalid();}return keys;}
}
