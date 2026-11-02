package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.HttpsURLConnection;
import org.junit.Test;

public final class FavoritePricesClientTest {
    private FavoritePricesClient.Call call(){return new FavoritePricesClient.Call(System.nanoTime()+60000000000L);}
    @Test public void exactReadEndpointsBoundsAndApprovedUserOnlyStaticSkip() throws Exception {
        List<String> urls=new ArrayList<>();List<Integer> bounds=new ArrayList<>();
        FavoritePricesClient client=new FavoritePricesClient((url,max,request)->{urls.add(url);bounds.add(max);if(url.endsWith("health"))return FavoriteComparisonTest.bytes("{\"status\":\"ok\",\"data_version\":\"20261027\"}");return FavoriteComparisonTest.bytes(url.endsWith(".json")?FavoriteComparisonTest.STATIC:FavoriteComparisonTest.PRICES);},()->"2026-10-29");
        assertEquals("20261027",client.version(call()));assertTrue(client.cell("u0nd9","20261027",true,call()).staticVerified);
        assertEquals(java.util.Arrays.asList("https://www.dovebevo.com/api/health","https://www.dovebevo.com/api/prices/u0nd9","https://www.dovebevo.com/data/20261027/v/u0nd9.json"),urls);
        assertEquals(java.util.Arrays.asList(8192,524288,2097152),bounds);
        urls.clear();client.cell("u0nd9","20261027",false,call());assertEquals(1,urls.size());assertTrue(urls.get(0).contains("/api/prices/"));
        assertFalse(FavoritePricesClient.allowed("https://evil.example/api/health"));assertFalse(FavoritePricesClient.allowed("https://www.dovebevo.com/api/prices/u0nd9?x=1"));
    }
    @Test public void htmlOrMissingStaticNeverVerifiesOsmButValidUserApiSurvives() throws Exception {
        String approved=FavoriteComparisonTest.PRICES.replace("\"u\":[]","\"u\":[[\"u7\",\"Locale approvato\",1,45.4642,9.19]]");
        FavoritePricesClient client=new FavoritePricesClient((url,max,request)->{if(url.endsWith(".json"))throw new IOException("Owned static HTML rejection");return FavoriteComparisonTest.bytes(approved);},()->"2026-10-29");
        FavoriteComparison.Cell result=client.cell("u0nd9","20261027",true,call());assertFalse(result.staticVerified);assertEquals("Locale approvato",result.names.get("u7"));assertFalse(result.names.containsKey("n123"));
    }
    @Test public void actualHttpsConfigurationIsGetOnlyNoCookiesOrIdentifierAndRefusesRedirectHtmlOversize() throws Exception {
        FakeHttps connection=new FakeHttps();List<String> opened=new ArrayList<>();
        FavoritePricesClient.Transport transport=new FavoritePricesClient.HttpsTransport(url->{opened.add(url);return connection;});
        assertEquals(2,transport.get("https://www.dovebevo.com/api/health",8192,call()).length);
        assertEquals("GET",connection.getRequestMethod());assertFalse(connection.getInstanceFollowRedirects());assertFalse(connection.getDoOutput());assertFalse(connection.getUseCaches());
        assertNull(connection.getRequestProperty("Cookie"));assertNull(connection.getRequestProperty("X-DoveBevo-Voter"));assertNull(connection.getRequestProperty("Authorization"));
        assertTrue(connection.getConnectTimeout()>0&&connection.getConnectTimeout()<=15000);assertTrue(connection.disconnected);
        for(int status:new int[]{301,302,307,308,404,429,500}){connection.status=status;try{transport.get("https://www.dovebevo.com/api/health",8192,call());fail();}catch(IOException expected){}}
        connection.status=200;connection.type="text/html";try{transport.get("https://www.dovebevo.com/api/health",8192,call());fail();}catch(IOException expected){}
        connection.type="application/json";connection.bytes=new byte[8193];try{transport.get("https://www.dovebevo.com/api/health",8192,call());fail();}catch(IOException expected){}
        int before=opened.size();FavoritePricesClient.Call cancelled=call();cancelled.cancel();
        try{transport.get("https://www.dovebevo.com/api/health",8192,cancelled);fail();}catch(IOException expected){}
        try{transport.get("https://evil.example/api/health",8192,call());fail();}catch(IOException expected){}
        assertEquals(before,opened.size());
    }
    private static final class FakeHttps extends HttpsURLConnection {
        int status=200;String type="application/json";byte[] bytes="{}".getBytes(java.nio.charset.StandardCharsets.UTF_8);boolean disconnected;
        FakeHttps()throws Exception{super(new URL("https://www.dovebevo.com/api/health"));}
        public void connect(){}public void disconnect(){disconnected=true;}public boolean usingProxy(){return false;}
        public int getResponseCode(){return status;}public String getContentType(){return type;}public long getContentLengthLong(){return -1;}
        public InputStream getInputStream(){return new ByteArrayInputStream(bytes);}public String getCipherSuite(){return "Owned fixture";}
        public Certificate[] getLocalCertificates(){return null;}public Certificate[] getServerCertificates(){return null;}
    }
}
