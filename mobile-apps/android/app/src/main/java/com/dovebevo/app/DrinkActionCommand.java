package com.dovebevo.app;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict app-only requests from a visible mobile venue; never a public vote by itself. */
final class DrinkActionCommand {
    enum Kind { SAVE_LEGACY, SAVE_CUSTOMER, RECOMMEND }
    private static final String BASE="path=%2Fbar%2F((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))&c=([0-9b-hjkmnp-z]{5})&";
    private static final Pattern LEGACY=Pattern.compile(BASE+"save_drink=([a-z_]{1,32})&band=(normal|happy_hour)");
    private static final Pattern CUSTOMER=Pattern.compile(BASE+"save_customer=([oc][0-9a-f]{64})");
    private static final Pattern RECOMMEND=Pattern.compile(BASE+"recommend_drink=([a-z_]{1,32})");
    final Kind kind;final RecommendationDrink drink;final int band;final String itemKey;
    private DrinkActionCommand(Kind kind,RecommendationDrink drink,int band,String itemKey){
        this.kind=kind;this.drink=drink;this.band=band;this.itemKey=itemKey;
    }
    static boolean requested(String raw){
        return raw!=null&&(raw.contains("save_drink=")||raw.contains("save_customer=")||raw.contains("recommend_drink="));
    }
    static DrinkActionCommand parse(String raw,String currentVenue){
        if(raw==null||raw.length()>512||currentVenue==null)return null;
        try{
            URI uri=new URI(raw);
            if(!"https".equals(uri.getScheme())||!"www.dovebevo.com".equals(uri.getRawAuthority())
                    ||!"/mobile/".equals(uri.getRawPath())||uri.getRawFragment()!=null||uri.getRawQuery()==null)return null;
            Matcher legacy=LEGACY.matcher(uri.getRawQuery()),customer=CUSTOMER.matcher(uri.getRawQuery()),recommend=RECOMMEND.matcher(uri.getRawQuery());
            Matcher match;Kind kind;
            if(legacy.matches()){match=legacy;kind=Kind.SAVE_LEGACY;}
            else if(customer.matches()){match=customer;kind=Kind.SAVE_CUSTOMER;}
            else if(recommend.matches()){match=recommend;kind=Kind.RECOMMEND;}
            else return null;
            String venue="https://www.dovebevo.com/bar/"+match.group(1)+"?c="+match.group(2);
            if(!venue.equals(SavedVenueUrl.canonicalize(currentVenue)))return null;
            if(kind==Kind.SAVE_CUSTOMER)return new DrinkActionCommand(kind,null,-1,match.group(3));
            RecommendationDrink drink=RecommendationDrink.from(match.group(3));
            if(drink==null)return null;
            return new DrinkActionCommand(kind,drink,kind==Kind.SAVE_LEGACY&&"happy_hour".equals(match.group(4))?1:0,null);
        }catch(Exception invalid){return null;}
    }
}
