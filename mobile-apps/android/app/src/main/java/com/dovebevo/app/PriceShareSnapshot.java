package com.dovebevo.app;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.Locale;
import java.text.NumberFormat;
import java.util.Currency;
import java.math.BigDecimal;

/** Fixed, read-only price snapshot. Untrusted DOM values cannot select files, URLs or native actions. */
final class PriceShareSnapshot {
    final String url,identityUrl,venue,name,drinkName,currency,serving,provenance,tier,location;
    final RecommendationDrink drink; final int amount,hh,confirmations;
    private PriceShareSnapshot(String url,Map<?,?> d)throws IOException {
        identityUrl=url;this.url=MobileEntry.venueDocument(url);venue=text(d,"venue",16,false);name=text(d,"venueName",120,false);
        drink=RecommendationDrink.from(text(d,"drink",20,false));if(drink==null)throw NativeJson.invalid();
        drinkName=text(d,"drinkName",80,false);currency=text(d,"currency",3,false);
        if(!currency.equals("EUR")&&!currency.equals("GBP"))throw NativeJson.invalid();
        amount=digits(d,"amountMinor",100000);hh=digits(d,"hh",1);confirmations=digits(d,"confirmations",1000000);
        int min=currency.equals("GBP")?(drink==RecommendationDrink.WATER?1:100):drink.minCents;
        int max=currency.equals("GBP")?(drink==RecommendationDrink.WATER?1500:drink==RecommendationDrink.BEER_DRAFT||drink==RecommendationDrink.ALCOHOL_FREE?3000:5000):drink.maxCents;
        if(amount<min||amount>max)throw NativeJson.invalid();
        serving=text(d,"serving",160,true);provenance=text(d,"provenance",1024,false);
        tier=text(d,"tier",8,false);if(!Set.of("affare","giusto","salato","neutro").contains(tier))throw NativeJson.invalid();
        location=text(d,"location",120,true);
        if(!url.substring(url.indexOf("/bar/")+5,url.indexOf('?')).equals(venue))throw NativeJson.invalid();
    }
    String amountLabel(){NumberFormat f=NumberFormat.getCurrencyInstance(currency.equals("GBP")?Locale.UK:Locale.ITALY);f.setCurrency(Currency.getInstance(currency));return f.format(BigDecimal.valueOf(amount,2));}
    String servingLabel(){return serving.isEmpty()?"Formato non indicato (dati precedenti)":serving.trim().equalsIgnoreCase("drink")||serving.trim().equalsIgnoreCase("drink singolo")?"":serving;}
    String accessibilityDescription(){String format=servingLabel();return "Dove Bevo. "+drinkName+" · "+amountLabel()+" · "+name+". "+(format.isEmpty()?"":format+". ")+(hh==1?"Happy hour":"Prezzo normale")+". "+(location.isEmpty()?"":location+". ")+provenance+". "+confirmations+" "+(confirmations==1?"conferma":"conferme")+". "+(tier.equals("neutro")?"":"Confronto: "+tier+". ")+"Illustrazione del drink, non foto del locale.";}
    static PriceShareSnapshot decode(String raw,String captured,String current,long epoch,long now) {
        if(raw==null||raw.length()>8192||epoch!=now||!MobileEntry.isDocument(captured)||!MobileEntry.isDocument(current))return null;
        String url=SavedVenueUrl.canonicalize(captured);if(url==null||!url.equals(SavedVenueUrl.canonicalize(current)))return null;
        try{
            Object value=NativeJson.read(raw.getBytes(StandardCharsets.UTF_8),8192);if(!(value instanceof Map<?,?> d))return null;
            if(!d.keySet().equals(Set.of("href","version","venue","venueName","drink","drinkName","hh","amountMinor","currency","serving","provenance","confirmations","tier","location"))||!"1".equals(d.get("version"))||!captured.equals(d.get("href")))return null;
            PriceShareSnapshot snapshot = new PriceShareSnapshot(url,d);
            if (!MobileEntry.matchesDrink(captured,snapshot.drink,snapshot.hh) || !MobileEntry.matchesDrink(current,snapshot.drink,snapshot.hh)) return null;
            return snapshot;
        }catch(IOException|RuntimeException invalid){return null;}
    }
    private static String text(Map<?,?> d,String key,int max,boolean empty)throws IOException {
        if(!(d.get(key) instanceof String s)||s.length()>max||(!empty&&s.isBlank()))throw NativeJson.invalid();
        for(int i=0;i<s.length();){int cp=s.codePointAt(i);if(Character.isISOControl(cp)||Character.getType(cp)==Character.FORMAT||(cp>=0xd800&&cp<=0xdfff))throw NativeJson.invalid();i+=Character.charCount(cp);}return s;
    }
    private static int digits(Map<?,?> d,String key,int max)throws IOException{String s=text(d,key,7,false);if(!s.matches("0|[1-9][0-9]{0,6}"))throw NativeJson.invalid();int n=Integer.parseInt(s);if(n>max)throw NativeJson.invalid();return n;}
    static final String SCRIPT="""
        (() => {
          if (window.top !== window || document.visibilityState !== 'visible' ||
              document.documentElement.getAttribute('data-dovebevo-mobile-shell') !== '1') return null;
          const u = new URL(location.href);
          if (u.protocol !== 'https:' || !['www.dovebevo.com','dovebevo.com'].includes(u.hostname) ||
              u.username || u.password || (u.port && u.port !== '443') || u.hash ||
              !u.search.slice(1).split('&').every(part=>/^(?:path=[^&=]+|c=[0-9b-hjkmnp-z]{5}|drink=(?:beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)|hh=[01])$/.test(part)) ||
              !/^\\/mobile\\/(?:index\\.html)?$/.test(u.pathname) || ![2,4].includes([...u.searchParams].length) ||
              [...u.searchParams.keys()].some(k=>!['path','c','drink','hh'].includes(k)) ||
              (u.searchParams.has('drink') || u.searchParams.has('hh') ?
                u.searchParams.getAll('drink').length!==1 || u.searchParams.getAll('hh').length!==1 ||
                !['beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon','wine_glass','alcohol_free','water'].includes(u.searchParams.get('drink')) || !/^[01]$/.test(u.searchParams.get('hh')||'') : [...u.searchParams].length!==2) ||
              u.searchParams.getAll('path').length !== 1 || u.searchParams.getAll('c').length !== 1 ||
              !/^[0-9b-hjkmnp-z]{5}$/.test(u.searchParams.get('c') || '')) return null;
          const match = /^\\/bar\\/([nwru][1-9][0-9]{0,14})$/.exec(u.searchParams.get('path') || '');
          if (!match) return null;
          const visible = node => {
            if (!node) return false;
            for (let p=node;p;p=p.parentElement) { const s=getComputedStyle(p);
              if(p.hidden||p.inert||p.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility!=='visible'||s.contentVisibility==='hidden'||Number(s.opacity)<=0)return false;
            }
            const r=node.getBoundingClientRect(),v=visualViewport;
            const top=v?v.offsetTop:0,left=v?v.offsetLeft:0,w=v?v.width:innerWidth,h=v?v.height:innerHeight;
            return node.getClientRects().length>0 && [r.x,r.y,r.width,r.height,top,left,w,h].every(Number.isFinite) && r.width>0&&r.height>0&&r.right>left&&r.left<left+w&&r.bottom>top&&r.top<top+h;
          };
          const maps=document.querySelectorAll('section.map[data-selected]');
          if(maps.length!==1||maps[0].getAttribute('data-selected')!==match[1])return null;
          const markers=[...document.querySelectorAll('[data-dovebevo-share="1"]')].filter(visible);
          if(markers.length!==1)return null;
          const node=markers[0],sheet=node.closest('dialog.sheet.sheet--bare[open]');
          if(document.querySelectorAll('dialog[open]').length!==1||!sheet||!sheet.matches(':modal'))return null;
          const headings=sheet?[...sheet.querySelectorAll(':scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name')].filter(visible):[];
          if(!visible(sheet)||headings.length!==1||node.dataset.venue!==match[1]||headings[0].textContent.trim()!==node.dataset.venueName||sheet.getAttribute('aria-label')!==node.dataset.venueName)return null;
          const result={href:location.href};
          for(const key of ['version','venue','venueName','drink','drinkName','hh','amountMinor','currency','serving','provenance','confirmations','tier','location']){
            const value=node.dataset[key],limit=key==='provenance'?1024:key==='serving'?160:key==='venueName'||key==='location'?120:key==='drinkName'?80:32;
            if(typeof value!=='string'||value.length>limit)return null;result[key]=value;
          }
          return result;
        })()
        """;
}
