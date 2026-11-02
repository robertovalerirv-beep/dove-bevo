package com.dovebevo.app;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** java.time is not available on the app's API24 minimum; ISO days remain exact across DST. */
final class FavoriteDay {
    static String today(){SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("Europe/Rome"));return f.format(new Date());}
    static long milliseconds(String day)throws IOException{
        if(day==null||!day.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||day.startsWith("0000"))throw NativeJson.invalid();
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);f.setLenient(false);f.setTimeZone(TimeZone.getTimeZone("UTC"));
        try{Date date=f.parse(day);if(date==null||!day.equals(f.format(date)))throw NativeJson.invalid();return date.getTime();}catch(ParseException error){throw NativeJson.invalid();}
    }
}
