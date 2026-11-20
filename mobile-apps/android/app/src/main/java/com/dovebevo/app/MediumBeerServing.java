package com.dovebevo.app;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A conservative Birra media comparison; original menu rows remain untouched. */
final class MediumBeerServing {
    private static final Pattern NON_MEDIUM=Pattern.compile("\\b(piccola|piccolo|small|mini|grande|large|pinta|pint)\\b");
    private static final Pattern MEDIUM=Pattern.compile("\\b(media|medium)\\b");
    private static final Pattern QUANTITY=Pattern.compile("\\b(\\d+(?:[.,]\\d+)?)\\s*(ml|cl|lt|l)\\b");

    static boolean matches(String rawLabel,Integer ml){
        String label=rawLabel==null?null:Normalizer.normalize(rawLabel,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        if(label!=null&&NON_MEDIUM.matcher(label).find())return false;
        Double labelledMl=null;
        if(label!=null){
            Matcher quantity=QUANTITY.matcher(label);
            if(quantity.find()){
                String amount=quantity.group(1),unit=quantity.group(2);
                if(quantity.find())return false;
                try{
                    double parsed=Double.parseDouble(amount.replace(',','.'));
                    labelledMl=parsed*(unit.equals("l")||unit.equals("lt")?1000:unit.equals("cl")?10:1);
                    if(!Double.isFinite(labelledMl))return false;
                }catch(NumberFormatException invalid){return false;}
            }
        }
        if(ml!=null){
            if(ml<1||ml>100_000||labelledMl!=null&&Math.abs(labelledMl-ml)>1)return false;
            return ml>=400&&ml<=600&&ml!=568;
        }
        if(label==null)return false;
        return labelledMl==null?MEDIUM.matcher(label).find():labelledMl>=400&&labelledMl<=600&&labelledMl!=568;
    }

    private MediumBeerServing(){}
}
