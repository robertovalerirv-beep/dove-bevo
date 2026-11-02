package com.dovebevo.app;

import java.io.IOException;
import java.util.function.Supplier;

/** Separate GET reader; shares cancellation/HTTP safeguards, never legacy price parsing. */
final class EuropePricesClient {
    private final FavoritePricesClient.Transport transport;private final Supplier<String> today;
    EuropePricesClient(FavoritePricesClient.Transport transport,Supplier<String> today){this.transport=transport;this.today=today;}
    EuropePrices.Catalog catalog(FavoritePricesClient.Call call)throws IOException {return EuropePrices.catalog(get(FavoritePricesClient.ORIGIN+"/mobile-data/catalog.json",call),today.get());}
    EuropePrices.Cell cell(String cell,EuropePrices.Catalog catalog,FavoritePricesClient.Call call)throws IOException {EuropePrices.cell(cell);return EuropePrices.parse(get(FavoritePricesClient.ORIGIN+"/api/mobile/prices/cells/"+cell,call),catalog,cell,null,today.get());}
    EuropePrices.Cell venue(String venue,String cell,EuropePrices.Catalog catalog,FavoritePricesClient.Call call)throws IOException {EuropePrices.key(venue);EuropePrices.cell(cell);return EuropePrices.parse(get(FavoritePricesClient.ORIGIN+"/api/mobile/prices/venues/"+venue+"?cell="+cell,call),catalog,cell,venue,today.get());}
    private byte[] get(String url,FavoritePricesClient.Call call)throws IOException {call.check();if(!allowed(url))throw NativeJson.invalid();byte[] raw=transport.get(url,EuropePrices.BYTES,call);call.check();if(raw==null||raw.length>EuropePrices.BYTES)throw NativeJson.invalid();return raw;}
    static boolean allowed(String url){return url!=null&&(url.equals(FavoritePricesClient.ORIGIN+"/mobile-data/catalog.json")||url.matches("https://www\\.dovebevo\\.com/api/mobile/prices/cells/[0-9b-hjkmnp-z]{5}")||url.matches("https://www\\.dovebevo\\.com/api/mobile/prices/venues/[nwr][1-9][0-9]{0,14}\\?cell=[0-9b-hjkmnp-z]{5}"));}
}
