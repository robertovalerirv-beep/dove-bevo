package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Strict, read-only area feed. Its scope is the selected map cells, never all Europe. */
final class ExactVoteArea {
    static final int MAX_BYTES=262144,MAX_ROWS=50;
    static final String ROOT=FavoritePricesClient.ORIGIN+"/api/mobile/v2/drink-votes/area";
    private static final String CELL="[0-9b-hjkmnp-z]{5}";
    private static final String VENUE="(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})";
    private static final String CURSOR="[A-Za-z0-9_-]{1,512}";
    private static final String OFFER="[A-Za-z0-9._:-]{1,128}";
    private static final String CUSTOMER="[oc][0-9a-f]{64}";
    private static final long SAFE_INTEGER=9007199254740991L;
    private ExactVoteArea(){}

    static final class Row {
        final String venueUrl,venueName,city,drinkName,category,serving,targetKey;
        final long count;
        Row(String venueUrl,String venueName,String city,String drinkName,String category,String serving,String targetKey,long count){
            this.venueUrl=venueUrl;this.venueName=venueName;this.city=city;this.drinkName=drinkName;
            this.category=category;this.serving=serving;this.targetKey=targetKey;this.count=count;
        }
    }
    static final class Page {
        final List<String> cells;final List<Row> rows;final String next;
        Page(List<String> cells,List<Row> rows,String next){this.cells=cells;this.rows=rows;this.next=next;}
    }
    static List<String> cells(List<String> raw)throws IOException{
        if(raw==null||raw.isEmpty()||raw.size()>12)throw NativeJson.invalid();
        Set<String> unique=new HashSet<>();for(String cell:raw)if(cell==null||!cell.matches(CELL)||!unique.add(cell))throw NativeJson.invalid();
        List<String> sorted=new ArrayList<>(unique);Collections.sort(sorted);return Collections.unmodifiableList(sorted);
    }
    static String endpoint(List<String> cells,String after)throws IOException{
        List<String> sorted=cells(cells);
        if(after!=null&&!after.matches(CURSOR))throw NativeJson.invalid();
        return ROOT+"?cells="+String.join(",",sorted)+"&limit=50&include_europe=1"+(after==null?"":"&after="+after);
    }
    static boolean allowed(String url){
        if(url==null||!url.startsWith(ROOT+"?cells="))return false;
        try{
            String query=url.substring((ROOT+"?cells=").length());
            int limit=query.indexOf("&limit=50");if(limit<0)return false;
            String raw=query.substring(0,limit);String[] pieces=raw.split(",",-1);
            List<String> values=new ArrayList<>();Collections.addAll(values,pieces);
            if(!String.join(",",cells(values)).equals(raw))return false;
            String tail=query.substring(limit+"&limit=50".length());
            if(!tail.startsWith("&include_europe=1"))return false;
            tail=tail.substring("&include_europe=1".length());
            return tail.isEmpty()||tail.matches("&after="+CURSOR);
        }catch(IOException invalid){return false;}
    }
    static Page parse(byte[] data,List<String> requested)throws IOException{
        List<String> scope=cells(requested);
        Map<?,?> root=object(NativeJson.read(data,MAX_BYTES));NativeJson.integer(root.get("schema_version"),1,1);
        Map<?,?> scopeObject=object(root.get("scope"));List<?> returned=array(scopeObject.get("cells"),12);
        if(returned.size()!=scope.size())throw NativeJson.invalid();
        for(int i=0;i<scope.size();i++)if(!scope.get(i).equals(returned.get(i)))throw NativeJson.invalid();
        List<Row> rows=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(Object value:array(root.get("items"),MAX_ROWS)){
            Map<?,?> item=object(value),venue=object(item.get("venue")),target=object(item.get("target")),drink=object(item.get("drink"));
            String key=text(venue.get("key"),32,VENUE),cell=text(venue.get("cell"),5,CELL);
            if(!scope.contains(cell))throw NativeJson.invalid();
            String url=FavoritePricesClient.ORIGIN+"/bar/"+key+"?c="+cell;
            if(!url.equals(SavedVenueUrl.canonicalize(url)))throw NativeJson.invalid();
            String name=text(venue.get("name"),512,null),city=display(venue.get("city"),200);
            String kind=text(target.get("kind"),16,null),identity;
            boolean genericEuropeDrink=false;
            if("offer".equals(kind))identity=text(target.get("id"),128,OFFER);
            else if("customer".equals(kind))identity=text(target.get("id"),65,CUSTOMER);
            else if("legacy".equals(kind)){
                String code=text(target.get("drink"),32,null),band=text(target.get("band"),16,null);
                if(RecommendationDrink.from(code)==null||!("normal".equals(band)||"happy_hour".equals(band)))throw NativeJson.invalid();
                identity=code+"/"+band;
            }else if("europe".equals(kind)){
                String code=text(target.get("drink"),32,null),band=text(target.get("band"),16,null),currency=text(target.get("currency"),3,"(?:EUR|GBP)");
                RecommendationDrink category=RecommendationDrink.from(code);
                if(category==null||!("normal".equals(band)||"happy_hour".equals(band)))throw NativeJson.invalid();
                Map<?,?> rawServing=object(target.get("serving"));
                if(!rawServing.keySet().equals(Set.of("unit"))&&!rawServing.keySet().equals(Set.of("unit","ml")))throw NativeJson.invalid();
                String unit=text(rawServing.get("unit"),5,"(?:drink|glass|ml)");
                genericEuropeDrink="drink".equals(unit);
                Integer ml=rawServing.containsKey("ml")?(int)NativeJson.integer(rawServing.get("ml"),1,2000):null;
                EuropePrices.Serving serving=new EuropePrices.Serving(unit,ml);
                if(SavedEuropeDrinkStore.validated(SavedVenueStore.reference(url,name),category,"happy_hour".equals(band)?1:0,currency,serving)==null)throw NativeJson.invalid();
                if(!code.equals(drink.get("category")))throw NativeJson.invalid();
                identity=code+"/"+band+"/"+currency+"/"+serving.key();
            }else throw NativeJson.invalid();
            String targetKey=kind+"/"+identity;
            if(!seen.add(url+"/"+targetKey))throw NativeJson.invalid();
            String drinkName=text(drink.get("name"),512,null),category=optional(drink.get("category"),32,null);
            if(category!=null&&RecommendationDrink.from(category)==null)throw NativeJson.invalid();
            String serving=display(drink.get("serving_label"),256);
            if(genericEuropeDrink&&serving!=null&&(serving.equalsIgnoreCase("drink")||serving.equalsIgnoreCase("Drink singolo")))serving=null;
            long count=NativeJson.integer(item.get("count"),1,SAFE_INTEGER);
            rows.add(new Row(url,name,city,drinkName,category,serving,targetKey,count));
        }
        String next=optional(root.get("next_after"),512,CURSOR);
        return new Page(scope,Collections.unmodifiableList(rows),next);
    }
    private static Map<?,?> object(Object value)throws IOException{if(!(value instanceof Map))throw NativeJson.invalid();return(Map<?,?>)value;}
    private static List<?> array(Object value,int max)throws IOException{if(!(value instanceof List)||((List<?>)value).size()>max)throw NativeJson.invalid();return(List<?>)value;}
    private static String optional(Object value,int max,String pattern)throws IOException{return value==null?null:text(value,max,pattern);}
    private static String display(Object value,int max)throws IOException{
        if(value==null)return null;if("".equals(value))return "";return text(value,max,null);
    }
    private static String text(Object value,int max,String pattern)throws IOException{
        if(!(value instanceof String))throw NativeJson.invalid();String text=(String)value;
        if(text.isEmpty()||text.length()>max||!text.equals(text.trim())||pattern!=null&&!text.matches(pattern))throw NativeJson.invalid();
        for(int i=0;i<text.length();i++)if(Character.isISOControl(text.charAt(i))||text.charAt(i)=='\ufffd')throw NativeJson.invalid();
        return text;
    }
}
