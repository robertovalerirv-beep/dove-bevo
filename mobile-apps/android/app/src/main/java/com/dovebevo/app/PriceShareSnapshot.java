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
    final boolean menuPrice; final String menuAmount;
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
        menuPrice=false;menuAmount=null;
    }
    private PriceShareSnapshot(String document,MenuShareOffer offer,MenuV2Prices.Price verified){
        url=document;identityUrl=SavedVenueUrl.canonicalize(document);venue=offer.venueKey;name=offer.venueName;
        drink=RecommendationDrink.from(verified.category);drinkName=verified.name;currency=verified.currency;
        amount=verified.amountMinor;hh=verified.band==1?1:0;confirmations=0;tier="neutro";
        serving=offer.serving;location=offer.location;menuPrice=true;menuAmount=verified.amount();
        provenance=("Prezzo del drink da menu, non totale pagato. Supplementi separati. Menu verificato il "+verified.day+
            ". "+verified.minimumSpendNotice+" "+verified.feeNotice).trim();
    }
    String amountLabel(){if(menuPrice)return menuAmount;NumberFormat f=NumberFormat.getCurrencyInstance(currency.equals("GBP")?Locale.UK:Locale.ITALY);f.setCurrency(Currency.getInstance(currency));return f.format(BigDecimal.valueOf(amount,2));}
    String servingLabel(){if(menuPrice)return serving;return serving.isEmpty()?"Formato non indicato (dati precedenti)":serving.trim().equalsIgnoreCase("drink")||serving.trim().equalsIgnoreCase("drink singolo")?"":serving;}
    String accessibilityDescription(){String format=servingLabel();return "Dove Bevo. "+drinkName+" · "+amountLabel()+" · "+name+". "+(format.isEmpty()?"":format+". ")+(menuPrice?"Prezzo da menu":hh==1?"Happy hour":"Prezzo normale")+". "+(location.isEmpty()?"":location+". ")+provenance+". "+(menuPrice?"":confirmations+" "+(confirmations==1?"conferma":"conferme")+". "+(tier.equals("neutro")?"":"Confronto: "+tier+". "))+"Illustrazione del drink, non foto del locale.";}
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
    static PriceShareSnapshot fromMenu(MenuShareOffer offer,String document,MenuV2Prices.Venue venue){
        if(offer==null||document==null||venue==null||!venue.key.equals(offer.venueKey)||!venue.name.equals(offer.venueName)
                ||!document.equals(offer.document))return null;
        MenuV2Prices.Price found=null;
        for(MenuV2Prices.Price price:venue.prices)if(!price.customer&&price.id.equals(offer.offerID)){
            if(found!=null)return null;found=price;
        }
        if(found==null||!found.name.equals(offer.drinkName)||!found.day.equals(offer.sourceDay)
                ||!found.currency.equals("EUR")&&!found.currency.equals("GBP")||found.amountMinor<=0
                ||!MenuShareOffer.normalized(found.amount()).equals(MenuShareOffer.normalized(offer.amount))
                ||!MenuShareOffer.displayServing(found).equals(offer.serving))return null;
        return new PriceShareSnapshot(document,offer,found);
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

/** A selected public menu row must match a fresh read before it can become an image. */
final class MenuShareOffer {
    final String document,venueKey,venueName,offerID,drinkName,amount,serving,sourceDay,location;
    private MenuShareOffer(String document,String venueKey,String venueName,String offerID,String drinkName,String amount,String serving,String sourceDay,String location){
        this.document=document;this.venueKey=venueKey;this.venueName=venueName;this.offerID=offerID;this.drinkName=drinkName;
        this.amount=amount;this.serving=serving;this.sourceDay=sourceDay;this.location=location;
    }
    static MenuShareOffer decode(String raw,String captured,String current,long epoch,long now){
        if(raw==null||raw.length()>8192||captured==null||!captured.equals(current)||epoch!=now||
                !MobileEntry.isDocument(captured)||MobileEntry.publicVenue(captured)==null)return null;
        try{
            java.net.URI url=new java.net.URI(captured);
            if(url.getRawQuery()==null||!url.getRawQuery().matches("path=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&offer=[A-Za-z0-9._:-]{1,128}"))return null;
            Object value=NativeJson.read(raw.getBytes(StandardCharsets.UTF_8),8192);if(!(value instanceof Map<?,?> data)||
                    !data.keySet().equals(Set.of("kind","href","venue","venueName","offer","drinkName","amountLabel","serving","provenance","location")))return null;
            String venue=clean(data.get("venue"),32,false),name=clean(data.get("venueName"),512,false),
                    offer=clean(data.get("offer"),128,false),drink=clean(data.get("drinkName"),512,false),
                    amount=clean(data.get("amountLabel"),32,false),serving=clean(data.get("serving"),600,true),
                    provenance=clean(data.get("provenance"),240,false),location=clean(data.get("location"),200,true);
            String key=java.net.URI.create(MobileEntry.publicVenue(captured)).getPath().substring(5);
            if(!"offer".equals(data.get("kind"))||!captured.equals(data.get("href"))||!key.equals(venue)||
                    !url.getRawQuery().endsWith("&offer="+offer)||
                    !provenance.matches("Prezzo del drink da menu, non totale pagato\\. Supplementi separati\\. Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}")||
                    !normalized(amount).matches("(?:0|[1-9][0-9]{0,6})(?:,[0-9]{1,3})? [€£]"))return null;
            return new MenuShareOffer(captured,venue,name,offer,drink,amount,serving,provenance.substring(provenance.length()-10),location);
        }catch(Exception invalid){return null;}
    }
    static String normalized(String value){return value.replace('\u00a0',' ').replace('\u202f',' ');}
    static String displayServing(MenuV2Prices.Price price){
        String base=price.servingLabel!=null?price.servingLabel:price.servingML==null?"":price.servingML+" ml";
        String context=price.band==1?"Happy hour":price.band<0?price.condition==null?"Prezzo condizionato":"Solo con: "+price.condition:"";
        return base.isEmpty()?context:context.isEmpty()?base:base+" · "+context;
    }
    private static String clean(Object value,int max,boolean empty)throws IOException{
        if(!(value instanceof String text)||text.length()>max||!text.equals(text.trim())||!empty&&text.isEmpty())throw NativeJson.invalid();
        for(int i=0;i<text.length();i++)if(Character.isISOControl(text.charAt(i))||Character.getType(text.charAt(i))==Character.FORMAT||text.charAt(i)=='\ufffd')throw NativeJson.invalid();
        return text;
    }
    static final String SCRIPT="""
        (() => {
          "use strict";
          if (window.top !== window || document.visibilityState !== "visible" ||
              document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return null;
          const url = new URL(location.href);
          if (url.protocol !== "https:" || !["www.dovebevo.com","dovebevo.com"].includes(url.hostname) ||
              url.username || url.password || url.port || url.hash ||
              !["/mobile/","/mobile/index.html"].includes(url.pathname) ||
              !/^\\?path=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&offer=[A-Za-z0-9._:-]{1,128}$/.test(url.search)) return null;
          const key = url.searchParams.get("path").slice(5);
          const maps = document.querySelectorAll("section.map[data-selected]");
          if (maps.length !== 1 || maps[0].getAttribute("data-selected") !== key ||
              document.querySelectorAll("dialog[open]").length !== 1 ||
              document.querySelectorAll("[data-dovebevo-share='1']").length !== 0) return null;
          const sheet = document.querySelector("dialog.sheet.sheet--bare[open]");
          if (!sheet || !sheet.matches(":modal")) return null;
          const visible = node => {
            if (!node || !node.isConnected || !node.getClientRects().length) return false;
            for (let p = node; p; p = p.parentElement) {
              const style = getComputedStyle(p);
              if (p.hidden || p.inert || p.getAttribute("aria-hidden") === "true" ||
                  style.display === "none" || style.visibility !== "visible" || Number(style.opacity) <= 0) return false;
            }
            return true;
          };
          const headings = [...sheet.querySelectorAll(":scope > .sheet__body > .scontrino > .scontrino__paper h2.scontrino__name")].filter(visible);
          const rows = [...sheet.querySelectorAll('li.mobile-menu-v2__offer--focused[data-testid="featured-menu-price"]')].filter(visible);
          if (!visible(sheet) || headings.length !== 1 || rows.length !== 1 ||
              headings[0].textContent.trim() !== sheet.getAttribute("aria-label")) return null;
          const row = rows[0];
          const one = selector => { const found = [...row.querySelectorAll(selector)].filter(visible); return found.length === 1 ? found[0] : null; };
          const name = one(":scope > .mobile-menu-v2__name"), amount = one(":scope > .mobile-menu-v2__amount"),
                source = one(":scope > .mobile-menu-v2__source");
          const notes = [...row.querySelectorAll(":scope > .mobile-menu-v2__meta")].filter(visible);
          if (!name || !amount || !source || notes.length !== 2 ||
              notes[1].textContent.trim() !== "Prezzo del drink da menu, non totale pagato. Supplementi separati." ||
              !/^Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source.textContent.trim())) return null;
          const drinkName = [...name.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ").trim();
          const place = sheet.querySelector(".scontrino__paper .bar__kind");
          return {kind:"offer",href:url.href,venue:key,venueName:headings[0].textContent.trim(),
            offer:url.searchParams.get("offer"),drinkName,amountLabel:amount.textContent.trim(),
            serving:notes[0].textContent.trim(),provenance:notes[1].textContent.trim()+" "+source.textContent.trim(),
            location:visible(place)?place.textContent.trim():""};
        })()
        """;
}
