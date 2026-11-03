package com.dovebevo.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen native presentation with system-bar insets; no WebView viewport changes. */
final class NativePanel extends Dialog {
    final LinearLayout body;
    NativePanel(Activity activity,String title,boolean dark) {
        super(activity,android.R.style.Theme_Material_Light_NoActionBar);
        int background=dark?0xff1B1611:activity.getColor(R.color.shell_background),ink=dark?Color.WHITE:activity.getColor(R.color.shell_text);
        body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setBackgroundColor(background);
        body.setOnApplyWindowInsetsListener((view,insets)->{
            if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}
            else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout header=new LinearLayout(activity);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(activity,8),0,dp(activity,16),0);header.setMinimumHeight(dp(activity,56));
        Button close=new Button(activity);close.setText(dark?"×":"‹");close.setTextSize(26);close.setAllCaps(false);close.setTextColor(ink);close.setBackgroundColor(Color.TRANSPARENT);close.setContentDescription("Chiudi");close.setMinimumHeight(dp(activity,48));close.setMinimumWidth(dp(activity,48));close.setOnClickListener(v->dismiss());header.addView(close,new LinearLayout.LayoutParams(dp(activity,48),-2));
        TextView heading=new TextView(activity);heading.setText(title);heading.setTextSize(22);heading.setTextColor(ink);heading.setTypeface(null,android.graphics.Typeface.BOLD);if(android.os.Build.VERSION.SDK_INT>=28)heading.setAccessibilityHeading(true);header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));body.addView(header);
        setContentView(body);if(android.os.Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);setOnShowListener(ignored->{getWindow().setLayout(-1,-1);getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);int flags=getWindow().getDecorView().getSystemUiVisibility();if(dark)flags&=~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|getNavigationLightFlag());else flags|=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|getNavigationLightFlag();getWindow().getDecorView().setSystemUiVisibility(flags);body.requestApplyInsets();});
    }
    private int getNavigationLightFlag(){return android.os.Build.VERSION.SDK_INT>=26?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0;}
    private static int dp(Activity activity,int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
}
