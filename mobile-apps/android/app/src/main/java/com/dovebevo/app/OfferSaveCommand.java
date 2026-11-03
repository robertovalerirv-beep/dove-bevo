package com.dovebevo.app;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A website button can request a save; the app must still verify the active venue and live offer. */
final class OfferSaveCommand {
    private static final Pattern QUERY=Pattern.compile("path=%2Fbar%2F((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))&c=([0-9b-hjkmnp-z]{5})&save_offer=([A-Za-z0-9._:-]{1,128})");
    private OfferSaveCommand() {}
    static String offerId(String raw,String currentVenue) {
        if(raw==null||raw.length()>512||currentVenue==null)return null;
        try {
            URI uri=new URI(raw);
            if(!"https".equals(uri.getScheme())||!"www.dovebevo.com".equals(uri.getRawAuthority())
                    ||!"/mobile/".equals(uri.getRawPath())||uri.getRawFragment()!=null||uri.getRawQuery()==null)return null;
            Matcher match=QUERY.matcher(uri.getRawQuery());if(!match.matches())return null;
            String target="https://www.dovebevo.com/bar/"+match.group(1)+"?c="+match.group(2);
            return target.equals(SavedVenueUrl.canonicalize(currentVenue))?match.group(3):null;
        } catch(Exception invalid){return null;}
    }
}
