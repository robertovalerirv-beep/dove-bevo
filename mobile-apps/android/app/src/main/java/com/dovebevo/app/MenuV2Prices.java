package com.dovebevo.app;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Read-only, bounded named-menu facts. Never combines an individual drink price with venue fees. */
final class MenuV2Prices {
    static final int BYTES=1_048_576;
    private static final String KEY="(?:[nwr][1-9][0-9]{0,14}|m[0-9a-f]{24})";
    private static final String CELL="[0-9b-hjkmnp-z]{5}";
    private static final String CURSOR="[A-Za-z0-9._:-]{1,128}";
    private static final String ITEM_KEY="[oc][0-9a-f]{64}";
    static boolean allowed(String url) {
        if(url==null)return false;
        String root="https://www\\.dovebevo\\.com/api/mobile/v2/";
        return url.matches(root+"menu/venues/"+KEY+"\\?cell="+CELL+"&limit=100(?:&after="+CURSOR+")?")
                ||url.matches(root+"customer-prices/venues/"+KEY+"\\?cell="+CELL+"&limit=50(?:&after="+ITEM_KEY+")?");
    }
    private final FavoritePricesClient.Transport transport;
    MenuV2Prices(FavoritePricesClient.Transport transport){this.transport=transport;}
    MenuV2Prices(){this(new FavoritePricesClient.HttpsTransport());}
    static final class Price {
        final String id,venueName,name,category,currency,servingLabel,day,feeNotice;
        final int band,amountMinor,exponent;final Integer servingML;final boolean customer;
        Price(String id,String venueName,String name,String category,int band,int amountMinor,String currency,int exponent,
              String servingLabel,Integer servingML,boolean customer,String day,String feeNotice){
            this.id=id;this.venueName=venueName;this.name=name;this.category=category;this.band=band;
            this.amountMinor=amountMinor;this.currency=currency;this.exponent=exponent;
            this.servingLabel=servingLabel;this.servingML=servingML;this.customer=customer;this.day=day;this.feeNotice=feeNotice;
        }
        String group(){return currency+"|"+exponent+"|"+(servingLabel==null?"":servingLabel.toLowerCase(Locale.ROOT))+"|"+(servingML==null?0:servingML);}
        String amount(){int factor=new int[]{1,10,100,1000}[exponent];String minor=Integer.toString(amountMinor%factor);
            while(minor.length()<exponent)minor="0"+minor;
            return (amountMinor/factor)+(exponent==0?"":","+minor)+" "+(currency.equals("EUR")?"\u20ac":currency.equals("GBP")?"\u00a3":currency);}
        String serving(){return (servingLabel==null?"Formato non dichiarato":servingLabel)+(servingML==null?"":" · "+servingML+" ml");}
        String evidence(){return (customer?"Segnalato da un cliente il ":"Da menu online · Fonte verificata il ")+day+" · Prezzo del drink. "+feeNotice;}
    }
    static final class Venue {
        final String key,cell,name,feeNotice;final List<Price> prices;
        Venue(String key,String cell,String name,String feeNotice,List<Price> prices){this.key=key;this.cell=cell;this.name=name;this.feeNotice=feeNotice;this.prices=Collections.unmodifiableList(new ArrayList<>(prices));}
        List<Price> selected(RecommendationDrink drink,int band){List<Price> result=new ArrayList<>();for(Price price:prices)
            if(price.category.equals(drink.code)&&price.band==band)result.add(price);return result;}
    }
    private static final class MenuPage {
        final String name,next,fees;final int count;final List<Price> prices;
        MenuPage(String name,String next,String fees,int count,List<Price> prices){this.name=name;this.next=next;this.fees=fees;this.count=count;this.prices=prices;}
    }
    private static final class Customer {
        final String id,offerId,name,category,currency,servingLabel,day;final int amount,exponent;final Integer ml;
        Customer(String id,String offerId,String name,String category,String currency,String servingLabel,String day,int amount,int exponent,Integer ml){
            this.id=id;this.offerId=offerId;this.name=name;this.category=category;this.currency=currency;this.servingLabel=servingLabel;this.day=day;
            this.amount=amount;this.exponent=exponent;this.ml=ml;
        }
    }
    private static final class CustomerPage {final String name,next;final List<Customer> rows;
        CustomerPage(String name,String next,List<Customer> rows){this.name=name;this.next=next;this.rows=rows;}}
    Venue load(SavedVenueStore.Venue saved,FavoritePricesClient.Call call)throws IOException{
        String key=FavoriteComparison.key(saved.url),cell=FavoriteComparison.cell(saved.url);
        if(!key.matches(KEY)||!cell.matches(CELL))throw NativeJson.invalid();
        String after=null,name=null,feeNotice=null;Integer expected=null;List<Price> offers=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(int page=0;page<10;page++){
            MenuPage value=menuPage(get(endpoint(true,key,cell,after),call),key,cell);
            if(name!=null&&(!name.equals(value.name)||!feeNotice.equals(value.fees)||!expected.equals(value.count)))throw NativeJson.invalid();
            if(name==null){name=value.name;feeNotice=value.fees;expected=value.count;}
            for(Price price:value.prices)if(!ids.add(price.id))throw NativeJson.invalid();else offers.add(price);
            if(offers.size()>1000)throw NativeJson.invalid();
            if(value.next==null){if(offers.size()!=expected)throw NativeJson.invalid();break;}
            if(value.prices.isEmpty()||value.next.equals(after)||page==9)throw NativeJson.invalid();after=value.next;
        }
        if(name==null)throw NativeJson.invalid();
        Map<String,Price> byId=new HashMap<>();for(Price price:offers)byId.put(price.id,price);
        List<Price> all=new ArrayList<>(offers);after=null;Set<String> reportIds=new HashSet<>();List<Customer> reports=new ArrayList<>();
        try{
            for(int page=0;page<10;page++){
                CustomerPage value=customerPage(get(endpoint(false,key,cell,after),call),key,cell);
                if(!value.name.equals(name))throw NativeJson.invalid();
                for(Customer customer:value.rows){
                    if(!reportIds.add(customer.id)||reportIds.size()>500)throw NativeJson.invalid();
                    reports.add(customer);
                }
                if(value.next==null)break;
                if(value.rows.isEmpty()||value.next.equals(after)||page==9)throw NativeJson.invalid();after=value.next;
            }
            for(Customer customer:reports){
                Price source=byId.get(customer.offerId);
                if(source!=null&&source.band>=0&&source.category.equals(customer.category)&&source.currency.equals(customer.currency)
                        &&source.exponent==customer.exponent&&same(source.servingLabel,customer.servingLabel)&&same(source.servingML,customer.ml))
                    all.add(new Price(customer.id,name,customer.name,source.category,source.band,customer.amount,customer.currency,
                            customer.exponent,customer.servingLabel,customer.ml,true,customer.day,feeNotice));
            }
        }catch(IOException unavailable){/* Owner-menu evidence remains independently valid when customer read fails. */}
        return new Venue(key,cell,name,feeNotice,all);
    }
    private byte[] get(String url,FavoritePricesClient.Call call)throws IOException{call.check();if(!allowed(url))throw NativeJson.invalid();
        byte[] bytes=transport.get(url,BYTES,call);call.check();if(bytes==null||bytes.length>BYTES)throw NativeJson.invalid();return bytes;}
    static String endpoint(boolean menu,String key,String cell,String after)throws IOException{
        if(key==null||!key.matches(KEY)||cell==null||!cell.matches(CELL)||after!=null&&!after.matches(menu?CURSOR:ITEM_KEY))throw NativeJson.invalid();
        String family=menu?"menu":"customer-prices";return FavoritePricesClient.ORIGIN+"/api/mobile/v2/"+family+"/venues/"+key+"?cell="+cell+"&limit="+(menu?100:50)+(after==null?"":"&after="+after);
    }
    private static MenuPage menuPage(byte[] bytes,String key,String cell)throws IOException{
        Map<?,?> root=obj(NativeJson.read(bytes,BYTES));int schema=(int)NativeJson.integer(root.get("schema_version"),2,2);
        if(schema!=2||!"menu_item_only".equals(root.get("price_scope")))throw NativeJson.invalid();
        Map<?,?> coverage=obj(root.get("coverage"));if(!Boolean.FALSE.equals(coverage.get("complete"))||!"verified_source_items_only".equals(coverage.get("basis")))throw NativeJson.invalid();
        String name=venueName(root.get("venue"),key,cell);int count=(int)NativeJson.integer(root.get("stored_offer_count"),0,100000);
        String fees=feeNotice(root);List<?> raw=array(root.get("offers"),100);String next=optional(root.get("next_after"),CURSOR);
        List<Price> prices=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(Object value:raw){Map<?,?> offer=obj(value);String id=text(offer.get("id"),128,CURSOR);if(!ids.add(id))throw NativeJson.invalid();
            String item=text(offer.get("name"),512,null),category=offer.get("category")==null?"":text(offer.get("category"),32,null);
            if(!category.isEmpty()&&RecommendationDrink.from(category)==null)throw NativeJson.invalid();
            Money money=money(offer);Serving serving=serving(offer.get("serving"));Map<?,?> context=obj(offer.get("context"));
            String kind=text(context.get("kind"),32,null);int band=kind.equals("regular")?0:kind.equals("happy_hour")?1:kind.equals("conditional")?-1:-2;if(band==-2)throw NativeJson.invalid();
            String day=sourceDay(offer.get("source"));
            prices.add(new Price(id,name,item,category,band,money.amount,money.currency,money.exponent,serving.label,serving.ml,false,day,fees));
        }
        if(next!=null&&(prices.isEmpty()||!next.equals(prices.get(prices.size()-1).id)))throw NativeJson.invalid();
        return new MenuPage(name,next,fees,count,prices);
    }
    private static CustomerPage customerPage(byte[] bytes,String key,String cell)throws IOException{
        Map<?,?> root=obj(NativeJson.read(bytes,BYTES));NativeJson.integer(root.get("schema_version"),1,1);
        if(!"customer_reported_drink_item".equals(root.get("price_scope")))throw NativeJson.invalid();
        String name=venueName(root.get("venue"),key,cell),next=optional(root.get("next_after"),ITEM_KEY);
        List<?> raw=array(root.get("rows"),50);List<Customer> rows=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(Object value:raw){Map<?,?> item=obj(value);String id=text(item.get("item_key"),65,ITEM_KEY);if(!ids.add(id))throw NativeJson.invalid();
            String kind=text(item.get("kind"),32,null);if(!kind.equals("menu_offer")&&!kind.equals("new_drink"))throw NativeJson.invalid();
            if(!"customer".equals(item.get("source_kind"))||!"customer_reported_price".equals(item.get("observation_kind"))||!"drink_item".equals(item.get("price_scope")))throw NativeJson.invalid();
            String offerId=kind.equals("menu_offer")?text(item.get("offer_id"),128,CURSOR):null;
            if(kind.equals("new_drink")&&item.get("offer_id")!=null)throw NativeJson.invalid();
            String category=item.get("category")==null?"":text(item.get("category"),32,null);if(!category.isEmpty()&&RecommendationDrink.from(category)==null)throw NativeJson.invalid();
            String nameItem=text(item.get("name"),512,null),day=day(item.get("observed_on"));Money money=money(item);Serving serving=serving(item.get("serving"));
            rows.add(new Customer(id,offerId,nameItem,category,money.currency,serving.label,day,money.amount,money.exponent,serving.ml));
        }
        if(next!=null&&(rows.isEmpty()||!next.equals(rows.get(rows.size()-1).id)))throw NativeJson.invalid();
        return new CustomerPage(name,next,rows);
    }
    private static String feeNotice(Map<?,?> root)throws IOException{
        List<?> fees=array(root.get("fees"),100);Map<?,?> coverage=obj(root.get("fee_coverage"));String status=text(coverage.get("status"),32,null);
        if(!status.equals("unknown")&&!status.equals("documented_partial")&&!status.equals("explicit_no_fee"))throw NativeJson.invalid();
        if(status.equals("explicit_no_fee")&&!fees.isEmpty())throw NativeJson.invalid();List<String> lines=new ArrayList<>();
        for(Object raw:fees){Map<?,?> fee=obj(raw);String label=text(fee.get("label"),512,null),kind=text(fee.get("kind"),16,null),basis=text(fee.get("basis"),32,null);
            if(!basis.equals("person")&&!basis.equals("table")&&!basis.equals("bill")&&!basis.equals("unspecified"))throw NativeJson.invalid();
            String applicability=text(fee.get("applicability"),32,null);
            if(!applicability.equals("all_orders")&&!applicability.equals("conditional")&&!applicability.equals("unknown"))throw NativeJson.invalid();
            String condition=fee.get("condition")==null?null:text(fee.get("condition"),500,null);
            if(applicability.equals("conditional")!=(condition!=null))throw NativeJson.invalid();
            String scope=applicability.equals("all_orders")?"tutti gli ordini":applicability.equals("unknown")?"applicabilita non verificata":"solo se "+condition;
            sourceDay(fee.get("source"));String amount;
            if(kind.equals("fixed")){Money value=money(fee);Price sample=new Price("","","","",0,value.amount,value.currency,value.exponent,null,null,false,"","");amount=sample.amount();}
            else if(kind.equals("percent")){long bps=NativeJson.integer(fee.get("rate_bps"),1,10000);amount=String.format(Locale.ROOT,"%.2f%%",bps/100.0);}
            else throw NativeJson.invalid();
            if(lines.size()<3)lines.add(label+" "+amount+" / "+basis+" ("+scope+")");
        }
        if(status.equals("explicit_no_fee"))return "Nessuna spesa obbligatoria dichiarata dalla fonte.";
        return (lines.isEmpty()?"":"Spese separate: "+String.join("; ",lines)+(fees.size()>3?"; altre spese nel dettaglio":"")+". ")
                +(status.equals("unknown")?"Altre spese non verificate.":"Copertura delle spese parziale.");
    }
    private static final class Money{final int amount,exponent;final String currency;Money(int amount,String currency,int exponent){this.amount=amount;this.currency=currency;this.exponent=exponent;}}
    private static Money money(Map<?,?> value)throws IOException{return new Money((int)NativeJson.integer(value.get("amount_minor"),1,100000000),
            text(value.get("currency"),3,"[A-Z]{3}"),(int)NativeJson.integer(value.get("currency_exponent"),0,3));}
    private static final class Serving{final String label;final Integer ml;Serving(String label,Integer ml){this.label=label;this.ml=ml;}}
    private static Serving serving(Object value)throws IOException{Map<?,?> object=obj(value);
        String label=object.get("label")==null?null:text(object.get("label"),256,null);
        Integer ml=object.get("ml")==null?null:(int)NativeJson.integer(object.get("ml"),1,100000);return new Serving(label,ml);}
    private static String venueName(Object value,String key,String cell)throws IOException{Map<?,?> venue=obj(value);
        if(!key.equals(venue.get("key"))||!cell.equals(venue.get("cell")))throw NativeJson.invalid();return text(venue.get("name"),512,null);}
    private static String sourceDay(Object value)throws IOException{Map<?,?> source=obj(value);String url=text(source.get("url"),2048,null);
        try{URI parsed=new URI(url);if(!"https".equals(parsed.getScheme())||parsed.getHost()==null||parsed.getRawUserInfo()!=null||parsed.getPort()!=-1||parsed.getRawFragment()!=null)throw NativeJson.invalid();}
        catch(URISyntaxException invalid){throw NativeJson.invalid();}
        text(source.get("text_sha256"),64,"[0-9a-f]{64}");return day(source.get("checked_on"));}
    private static String day(Object value)throws IOException{String text=text(value,10,"[0-9]{4}-[0-9]{2}-[0-9]{2}");FavoriteDay.milliseconds(text);return text;}
    private static String optional(Object value,String pattern)throws IOException{return value==null?null:text(value,128,pattern);}
    private static String text(Object value,int max,String pattern)throws IOException{if(!(value instanceof String))throw NativeJson.invalid();String text=(String)value;
        if(text.length()==0||text.length()>max||!text.equals(text.trim())||pattern!=null&&!text.matches(pattern))throw NativeJson.invalid();
        for(int i=0;i<text.length();i++)if(Character.isISOControl(text.charAt(i))||text.charAt(i)=='\ufffd')throw NativeJson.invalid();return text;}
    private static Map<?,?> obj(Object value)throws IOException{if(!(value instanceof Map))throw NativeJson.invalid();return(Map<?,?>)value;}
    private static List<?> array(Object value,int max)throws IOException{if(!(value instanceof List)||((List<?>)value).size()>max)throw NativeJson.invalid();return(List<?>)value;}
    private static boolean same(Object left,Object right){return left==null?right==null:left.equals(right);}
}
