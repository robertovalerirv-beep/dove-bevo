package com.dovebevo.app;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict command from one app-only European price row; never a price submission. */
final class EuropeDrinkSaveCommand {
    private static final Pattern QUERY=Pattern.compile(
            "path=%2Fbar%2F([nwr][1-9][0-9]{0,14})&c=([0-9b-hjkmnp-z]{5})"
            +"&save_europe=([a-z_]{1,32})&band=(normal|happy_hour)&currency=(EUR|GBP)"
            +"&serving=(drink|glass|ml)%3A([0-9]{0,4})");
    final String venueUrl;
    final RecommendationDrink drink;
    final int band;
    final String currency;
    final EuropePrices.Serving serving;

    private EuropeDrinkSaveCommand(String venueUrl,RecommendationDrink drink,int band,String currency,EuropePrices.Serving serving){
        this.venueUrl=venueUrl;this.drink=drink;this.band=band;this.currency=currency;this.serving=serving;
    }
    static boolean requested(String raw){return raw!=null&&raw.contains("save_europe=");}

    static EuropeDrinkSaveCommand parse(String raw,String currentVenue){
        if(raw==null||raw.length()>512||currentVenue==null)return null;
        try{
            URI uri=new URI(raw);
            if(!"https".equals(uri.getScheme())||!"www.dovebevo.com".equals(uri.getRawAuthority())
                    ||!"/mobile/".equals(uri.getRawPath())||uri.getRawFragment()!=null||uri.getRawQuery()==null)return null;
            Matcher match=QUERY.matcher(uri.getRawQuery());if(!match.matches())return null;
            String venueUrl=FavoritePricesClient.ORIGIN+"/bar/"+match.group(1)+"?c="+match.group(2);
            if(!venueUrl.equals(SavedVenueUrl.canonicalize(currentVenue)))return null;
            RecommendationDrink drink=RecommendationDrink.from(match.group(3));if(drink==null)return null;
            String unit=match.group(6),digits=match.group(7);Integer ml=null;
            if(!digits.isEmpty()){
                ml=Integer.valueOf(digits);
                if(ml<1||ml>2000||!Integer.toString(ml).equals(digits))return null;
            }
            int band="happy_hour".equals(match.group(4))?1:0;String currency=match.group(5);
            EuropePrices.Serving serving=new EuropePrices.Serving(unit,ml);
            if(SavedEuropeDrinkStore.validated(SavedVenueStore.reference(venueUrl,"Verified venue"),drink,band,currency,serving)==null)return null;
            return new EuropeDrinkSaveCommand(venueUrl,drink,band,currency,serving);
        }catch(Exception invalid){return null;}
    }
    boolean matches(EuropePrices.Price price){
        return price!=null&&venueUrl.equals(FavoritePricesClient.ORIGIN+"/bar/"+price.venue+"?c="+price.cell)
                &&drink.code.equals(price.drink)&&band==price.band&&currency.equals(price.currency)
                &&serving.key().equals(price.serving.key());
    }
}
