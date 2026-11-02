package com.dovebevo.app;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

/** Group first, then compare amounts only within identical currency/serving identities. No FX. */
final class NativePricePresentation {
    static String category(RecommendationDrink drink){return drink==RecommendationDrink.BEER_DRAFT?"Birra alla spina":drink.label;}
    static String group(FavoriteComparison.Price legacy,EuropePrices.Price mobile){return mobile!=null?mobile.group():legacy!=null?"EUR/legacy_unknown":"unavailable";}
    static String groupLabel(FavoriteComparison.Price legacy,EuropePrices.Price mobile){return mobile!=null?mobile.currency+" · "+mobile.serving.label():legacy!=null?"EUR · formato non indicato (dati precedenti)":"";}
    static String amount(FavoriteComparison.Price legacy,EuropePrices.Price mobile){String currency=mobile==null?"EUR":mobile.currency;NumberFormat format=NumberFormat.getCurrencyInstance(currency.equals("GBP")?Locale.UK:Locale.ITALY);format.setCurrency(Currency.getInstance(currency));return format.format(BigDecimal.valueOf(mobile==null?legacy.cents:mobile.amountMinor,2));}
    static String context(EuropePrices.Price price){
        String confirmations=price.confirmations+" "+(price.confirmations==1?"conferma":"conferme");
        if(price.sourceKind.equals("online_menu"))return "Dal menu online · verificato il "+date(price.sourceCheckedOn)+"\n"+price.menuItem+" · "+confirmations+(price.confirmedOn==null?"":" · confermato il "+date(price.confirmedOn));
        return "Segnalato il "+date(price.observedOn)+" · "+confirmations+(price.confirmedOn==null?"":" · confermato il "+date(price.confirmedOn));
    }
    static String menuWarning(){return "Menu da ricontrollare (oltre 90 giorni)";}
    private static String date(String day){return day.substring(8)+"/"+day.substring(5,7)+"/"+day.substring(0,4);}
}
