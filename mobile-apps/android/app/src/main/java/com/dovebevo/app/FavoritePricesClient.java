package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.CookieHandler;
import java.net.URL;
import java.util.function.Supplier;
import javax.net.ssl.HttpsURLConnection;

/** Dedicated public GETs. No browser credentials, installation voter ID, redirects or write method. */
final class FavoritePricesClient {
    static final String ORIGIN="https://www.dovebevo.com";
    interface Transport{byte[] get(String url,int maximum,Call call)throws IOException;}
    static final class Call{
        final long deadline;private boolean cancelled;private HttpsURLConnection connection;
        Call(long deadline){this.deadline=deadline;}
        synchronized void check()throws IOException{if(cancelled||System.nanoTime()-deadline>=0)throw NativeJson.invalid();}
        synchronized void attach(HttpsURLConnection value)throws IOException{check();connection=value;}
        synchronized void detach(){connection=null;}
        synchronized void cancel(){cancelled=true;if(connection!=null)connection.disconnect();}
    }
    private final Transport transport;private final Supplier<String> today;
    FavoritePricesClient(){this(new HttpsTransport(),FavoriteDay::today);}
    FavoritePricesClient(Transport transport,Supplier<String> today){this.transport=transport;this.today=today;}
    String version(Call call)throws IOException{return FavoriteComparison.version(get(ORIGIN+"/api/health",FavoriteComparison.HEALTH_BYTES,call));}
    FavoriteComparison.Cell cell(String cell,String version,boolean needsStatic,Call call)throws IOException{
        if(cell==null||!cell.matches("[0-9b-hjkmnp-z]{5}"))throw NativeJson.invalid();
        byte[] prices=get(ORIGIN+"/api/prices/"+cell,FavoriteComparison.PRICE_BYTES,call),file=null;
        if(needsStatic&&version!=null){
            if(!version.matches("[0-9]{8}"))throw NativeJson.invalid();
            try{file=get(ORIGIN+"/data/"+version+"/v/"+cell+".json",FavoriteComparison.STATIC_BYTES,call);}
            catch(IOException unavailable){/* Only independently approved u rows can remain verifiable. */}
        }
        call.check();return FavoriteComparison.parse(file,prices,cell,today.get());
    }
    private byte[] get(String url,int maximum,Call call)throws IOException{call.check();if(!allowed(url))throw NativeJson.invalid();byte[] bytes=transport.get(url,maximum,call);call.check();if(bytes==null||bytes.length>maximum)throw NativeJson.invalid();return bytes;}
    static boolean allowed(String url){return url!=null&&(url.equals(ORIGIN+"/api/health")||url.matches("https://www\\.dovebevo\\.com/api/prices/[0-9b-hjkmnp-z]{5}")||url.matches("https://www\\.dovebevo\\.com/data/[0-9]{8}/v/[0-9b-hjkmnp-z]{5}\\.json"));}
    interface Connections{HttpsURLConnection open(String url)throws IOException;}
    static final class HttpsTransport implements Transport{
        private final Connections connections;
        HttpsTransport(){this(url->(HttpsURLConnection)new URL(url).openConnection());}
        HttpsTransport(Connections connections){this.connections=connections;}
        @Override public byte[] get(String url,int maximum,Call call)throws IOException{
            if(!allowed(url)||CookieHandler.getDefault()!=null)throw NativeJson.invalid();
            call.check();
            HttpsURLConnection connection=connections.open(url);
            long deadline=Math.min(call.deadline,System.nanoTime()+15000000000L);
            try{
                call.attach(connection);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setRequestMethod("GET");
                connection.setDoOutput(false);connection.setRequestProperty("Accept","application/json");
                connection.setConnectTimeout(remaining(deadline));connection.setReadTimeout(remaining(deadline));connection.connect();
                call.check();connection.setReadTimeout(remaining(deadline));
                if(connection.getResponseCode()!=200||connection.getContentType()==null||!connection.getContentType().toLowerCase(java.util.Locale.ROOT).split(";",2)[0].trim().equals("application/json")||connection.getContentLengthLong()>maximum)throw NativeJson.invalid();
                try(InputStream input=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[4096];
                    while(true){call.check();connection.setReadTimeout(remaining(deadline));int count=input.read(buffer);if(count==-1)return bytes.toByteArray();if(bytes.size()+count>maximum)throw NativeJson.invalid();bytes.write(buffer,0,count);}
                }
            }finally{call.detach();connection.disconnect();}
        }
        private static int remaining(long deadline)throws IOException{long millis=(deadline-System.nanoTime())/1000000L;if(millis<=0)throw NativeJson.invalid();return(int)Math.min(15000,millis);}
    }
}
