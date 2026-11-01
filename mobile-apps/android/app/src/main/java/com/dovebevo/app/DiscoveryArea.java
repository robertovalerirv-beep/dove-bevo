package com.dovebevo.app;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** A bounded read of the existing public map, made only after a Home tap. No location permission. */
final class DiscoveryArea {
    final double lat,lon,zoom;
    DiscoveryArea(double lat,double lon,double zoom)throws IOException {
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||!Double.isFinite(zoom)||lat<35.2||lat>47.2||lon<6.5||lon>18.6||zoom<12||zoom>24)throw NativeJson.invalid();
        this.lat=lat;this.lon=lon;this.zoom=zoom;
    }
    static final String SCRIPT="""
            (() => {
              if (window.top !== window || document.visibilityState !== 'visible') return null;
              const url = new URL(location.href);
              if (url.protocol !== 'https:' || url.hostname !== 'www.dovebevo.com' || url.username || url.password ||
                  (url.port && url.port !== '443') || !/^(?:\\/|\\/bar\\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname)) return null;
              const maps = document.querySelectorAll('#app > .app section.map');
              if (maps.length !== 1 || maps[0].getAttribute('data-ready') !== 'true') return null;
              const center = maps[0].getAttribute('data-center');
              const zoom = maps[0].getAttribute('data-zoom');
              if (!center || center.length > 64 || !zoom || zoom.length > 16) return null;
              return [location.href, center, zoom];
            })()
            """;
    static boolean visitor(String url) {
        if(BrowserPolicy.target(url)!=BrowserPolicy.Target.INTERNAL)return false;
        try {String p=new URI(url).getRawPath();return p!=null&&(p.equals("/")||p.matches("/bar/[nwru][1-9][0-9]{0,14}"));}
        catch(Exception invalid){return false;}
    }
    static DiscoveryArea decode(String result,String capturedUrl,String currentUrl,long capturedEpoch,long currentEpoch) {
        if(result==null||result.length()>2048||capturedEpoch!=currentEpoch||!visitor(capturedUrl)||!capturedUrl.equals(currentUrl))return null;
        try {
            Object parsed=NativeJson.read(result.getBytes(StandardCharsets.UTF_8),2048);
            if(!(parsed instanceof List)||((List<?>)parsed).size()!=3)return null;
            List<?> values=(List<?>)parsed;
            if(!capturedUrl.equals(values.get(0))||!(values.get(1) instanceof String)||!(values.get(2) instanceof String))return null;
            String center=(String)values.get(1),zoom=(String)values.get(2);
            if(!center.matches("-?[0-9]{1,2}(?:\\.[0-9]{1,8})?,-?[0-9]{1,2}(?:\\.[0-9]{1,8})?")||!zoom.matches("[0-9]{1,2}(?:\\.[0-9]{1,3})?"))return null;
            String[] parts=center.split(",");return new DiscoveryArea(Double.parseDouble(parts[0]),Double.parseDouble(parts[1]),Double.parseDouble(zoom));
        }catch(IOException|IllegalArgumentException invalid){return null;}
    }
    List<String> cells() {
        String own=geohash(lat,lon);double[] box=bounds(own);double dy=box[1]-box[0],dx=box[3]-box[2];
        double cy=(box[0]+box[1])/2,cx=(box[2]+box[3])/2;Set<String> cells=new LinkedHashSet<>();cells.add(own);
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
            double la=cy+y*dy,lo=cx+x*dx;if(la>=35.2&&la<=47.2&&lo>=6.5&&lo<=18.6)cells.add(geohash(la,lo));
        }
        return Collections.unmodifiableList(new ArrayList<>(cells));
    }
    static String geohash(double lat,double lon) {
        double south=-90,north=90,west=-180,east=180;StringBuilder result=new StringBuilder();int value=0;
        for(int bit=0;bit<25;bit++) {
            boolean longitude=bit%2==0;double middle=longitude?(west+east)/2:(south+north)/2;boolean high=(longitude?lon:lat)>=middle;
            value=(value<<1)|(high?1:0);if(longitude){if(high)west=middle;else east=middle;}else{if(high)south=middle;else north=middle;}
            if(bit%5==4){result.append("0123456789bcdefghjkmnpqrstuvwxyz".charAt(value));value=0;}
        }return result.toString();
    }
    private static double[] bounds(String cell) {
        double[] box={-90,90,-180,180};int bit=0;
        for(char c:cell.toCharArray()){int n="0123456789bcdefghjkmnpqrstuvwxyz".indexOf(c);for(int shift=4;shift>=0;shift--){boolean lon=bit++%2==0;int low=lon?2:0;double middle=(box[low]+box[low+1])/2;box[((n>>shift)&1)==1?low:low+1]=middle;}}
        return box;
    }
    double metres(double latitude,double longitude) {
        double a=Math.toRadians(latitude-lat),b=Math.toRadians(longitude-lon);
        double h=Math.sin(a/2)*Math.sin(a/2)+Math.cos(Math.toRadians(lat))*Math.cos(Math.toRadians(latitude))*Math.sin(b/2)*Math.sin(b/2);
        return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
    }
}
