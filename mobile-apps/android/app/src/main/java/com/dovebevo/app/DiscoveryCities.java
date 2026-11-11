package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.CookieHandler;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.text.Normalizer;
import javax.net.ssl.HttpsURLConnection;

/** City choices come only from the current public Italian places and European venue catalogue. */
final class DiscoveryCities {
    private static final int PLACES_BYTES=2097152;
    private static final List<String> ITALIAN_FIRST=Arrays.asList(
            "Milano","Roma","Torino","Napoli","Firenze","Bologna","Venezia","Genova","Palermo","Bari");

    static final class City {
        final String name,country;final double lat,lon;final int knownVenues;
        City(String name,String country,double lat,double lon,int knownVenues){this.name=name;this.country=country;this.lat=lat;this.lon=lon;this.knownVenues=knownVenues;}
        String label(){return name+", "+countryName(country);}
        DiscoveryArea area()throws IOException{return new DiscoveryArea(lat,lon,14);}
        String key(){return country+"|"+name;}
    }
    static final class Result {
        final List<City> cities;final boolean italianUnavailable,europeanUnavailable;
        Result(List<City> cities,boolean italianUnavailable,boolean europeanUnavailable){
            this.cities=Collections.unmodifiableList(new ArrayList<>(cities));
            this.italianUnavailable=italianUnavailable;this.europeanUnavailable=europeanUnavailable;
        }
    }
    interface Source {byte[] get(String url,int maximum)throws IOException;}

    /** No login, cookies, redirects, writes, or arbitrary URL from catalogue data. */
    static final class PublicSource implements Source {
        private volatile HttpsURLConnection active;
        @Override public byte[] get(String url,int maximum)throws IOException {
            if(!allowed(url)||CookieHandler.getDefault()!=null||Thread.currentThread().isInterrupted())throw NativeJson.invalid();
            HttpsURLConnection connection=(HttpsURLConnection)new URL(url).openConnection();active=connection;
            try{
                connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setRequestMethod("GET");
                connection.setDoOutput(false);connection.setRequestProperty("Accept","application/json");
                connection.setConnectTimeout(8000);connection.setReadTimeout(8000);connection.connect();
                if(connection.getResponseCode()!=200||connection.getContentType()==null||
                        !connection.getContentType().toLowerCase(Locale.ROOT).split(";",2)[0].trim().equals("application/json")||
                        connection.getContentLengthLong()>maximum)throw NativeJson.invalid();
                try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[4096];int count;
                    while((count=input.read(buffer))!=-1){
                        if(Thread.currentThread().isInterrupted()||output.size()+count>maximum)throw NativeJson.invalid();
                        output.write(buffer,0,count);
                    }
                    return output.toByteArray();
                }
            }finally{active=null;connection.disconnect();}
        }
        void cancel(){HttpsURLConnection connection=active;if(connection!=null)connection.disconnect();}
    }
    static boolean allowed(String url){return url!=null&&(url.equals(FavoritePricesClient.ORIGIN+"/api/health")||
            url.equals(FavoritePricesClient.ORIGIN+"/mobile-data/catalog.json")||
            url.matches("https://www\\.dovebevo\\.com/data/[0-9]{8}/places\\.json"));}

    static Result load(Source source,String today){
        List<City> italian=Collections.emptyList(),european=Collections.emptyList();boolean italyFailed=false,europeFailed=false;
        try{
            String version=FavoriteComparison.version(source.get(FavoritePricesClient.ORIGIN+"/api/health",FavoriteComparison.HEALTH_BYTES));
            if(version==null||!version.matches("[0-9]{8}"))throw NativeJson.invalid();
            italian=italian(source.get(FavoritePricesClient.ORIGIN+"/data/"+version+"/places.json",PLACES_BYTES));
        }catch(IOException|RuntimeException unavailable){italyFailed=true;}
        try{
            EuropePrices.Catalog catalog=EuropePrices.catalog(source.get(FavoritePricesClient.ORIGIN+"/mobile-data/catalog.json",EuropePrices.BYTES),today);
            european=fromCatalog(catalog);
        }catch(IOException|RuntimeException unavailable){europeFailed=true;}
        List<City> choices=new ArrayList<>(italian);Set<String> seen=new HashSet<>();for(City city:choices)seen.add(city.key());
        for(City city:european)if(seen.add(city.key()))choices.add(city);
        return new Result(choices,italyFailed,europeFailed);
    }

    static List<City> italian(byte[] raw)throws IOException {
        Object parsed=NativeJson.read(raw,PLACES_BYTES);if(!(parsed instanceof List))throw NativeJson.invalid();
        Map<String,City> byName=new LinkedHashMap<>();
        for(Object value:(List<?>)parsed){
            if(!(value instanceof List)||((List<?>)value).size()!=5)throw NativeJson.invalid();
            List<?> row=(List<?>)value;NativeJson.integer(row.get(0),1,999999999999L);
            if(!(row.get(1) instanceof String))throw NativeJson.invalid();String name=(String)row.get(1);
            if(name.length()<2||name.length()>120||name.trim().isEmpty())throw NativeJson.invalid();
            for(int i=0;i<name.length();i++)if(Character.isISOControl(name.charAt(i)))throw NativeJson.invalid();
            double lat=NativeJson.decimal(row.get(2),35.2,47.2),lon=NativeJson.decimal(row.get(3),6.5,18.6);
            int count=(int)NativeJson.integer(row.get(4),0,1000000);
            byName.putIfAbsent(name.toLowerCase(Locale.ROOT),new City(name,"IT",lat,lon,count));
        }
        List<City> result=new ArrayList<>();Set<String> selected=new HashSet<>();
        for(String name:ITALIAN_FIRST){City city=byName.get(name.toLowerCase(Locale.ROOT));if(city!=null){result.add(city);selected.add(city.key());}}
        List<City> rest=new ArrayList<>(byName.values());rest.sort(Comparator.comparingInt((City city)->city.knownVenues).reversed().thenComparing(city->city.name,java.text.Collator.getInstance(Locale.ITALY)));
        for(City city:rest)if(city.knownVenues>0&&selected.add(city.key())){result.add(city);if(result.size()>=40)break;}
        return Collections.unmodifiableList(result);
    }

    static List<City> fromCatalog(EuropePrices.Catalog catalog){
        if(catalog==null)return Collections.emptyList();
        Map<String,List<EuropePrices.Venue>> grouped=new LinkedHashMap<>();
        for(EuropePrices.Venue venue:catalog.venues.values())grouped.computeIfAbsent(venue.country+"|"+venue.city,key->new ArrayList<>()).add(venue);
        List<City> italy=new ArrayList<>(),europe=new ArrayList<>();
        for(Map.Entry<String,List<EuropePrices.Venue>> group:grouped.entrySet()){
            List<EuropePrices.Venue> venues=group.getValue();EuropePrices.Venue first=venues.get(0);double lat=0,lon=0;
            for(EuropePrices.Venue venue:venues){lat+=venue.lat;lon+=venue.lon;}
            City city=new City(first.city,first.country,lat/venues.size(),lon/venues.size(),venues.size());
            if(first.country.equals("IT"))italy.add(city);else europe.add(city);
        }
        Comparator<City> alphabetical=Comparator.comparing((City city)->city.name,java.text.Collator.getInstance(Locale.ITALY));
        italy.sort(alphabetical);europe.sort(alphabetical);italy.addAll(europe);return italy;
    }
    /** A short Italian-first preview; typing searches every loaded city without inventing locations. */
    static List<City> visible(List<City> cities,String query){
        String search=fold(query).trim();List<City> shown=new ArrayList<>();
        if(search.isEmpty()){
            int italian=0,european=0;
            for(City city:cities){
                if(city.country.equals("IT")){if(italian++<10)shown.add(city);}
                else if(european++<8)shown.add(city);
            }
        }else{
            for(City city:cities)if(fold(city.name).startsWith(search)&&shown.size()<40)shown.add(city);
            for(City city:cities)if(!fold(city.name).startsWith(search)&&fold(city.name).contains(search)&&shown.size()<40)shown.add(city);
        }
        return Collections.unmodifiableList(shown);
    }
    private static String fold(String text){return Normalizer.normalize(text==null?"":text,Normalizer.Form.NFD)
            .replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT);}
    private static String countryName(String code){switch(code){case"IT":return"Italia";case"GB":return"Regno Unito";case"FR":return"Francia";case"ES":return"Spagna";case"DE":return"Germania";default:return code;}}
}
