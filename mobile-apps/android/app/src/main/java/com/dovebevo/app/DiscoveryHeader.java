package com.dovebevo.app;

import android.content.Context;
import android.graphics.Paint;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

/** Measures real label widths; narrow/large-type windows stack without clipping a band label. */
final class DiscoveryHeader extends LinearLayout {
    private final TextView title;
    private final Spinner band;
    private final Button refresh,map;
    private final LinearLayout controls;
    private int arrangement=-1,lastBandWidth;
    DiscoveryHeader(Context context,TextView title,Spinner band,Button refresh,Button map) {
        super(context);this.title=title;this.band=band;this.refresh=refresh;this.map=map;
        setTag("discovery.header");setGravity(android.view.Gravity.CENTER_VERTICAL);setOrientation(VERTICAL);
        // The native overflow occupies the first row's trailing 56dp. Keep
        // controls on their own row so Zona remains tappable at every width.
        title.setMinHeight(dp(48));title.setPadding(0,0,dp(56),0);
        controls=new LinearLayout(context);controls.setGravity(android.view.Gravity.CENTER_VERTICAL);
        addView(title);addView(controls);controls.addView(band);controls.addView(refresh);controls.addView(map);
    }
    @Override protected void onMeasure(int widthSpec,int heightSpec) {
        int width=MeasureSpec.getSize(widthSpec)-getPaddingLeft()-getPaddingRight();
        if(MeasureSpec.getMode(widthSpec)!=MeasureSpec.UNSPECIFIED&&width>0) {
            Paint text=new Paint();text.setTextSize(14*getResources().getDisplayMetrics().scaledDensity);
            int bandWidth=Math.max(dp(148),(int)Math.ceil(Math.max(text.measureText(getContext().getString(R.string.favorites_normal)),text.measureText(getContext().getString(R.string.favorites_happy_hour))))+dp(72));
            int desired=width<bandWidth+dp(112)?2:1;
            if(desired!=arrangement||lastBandWidth!=bandWidth){
                arrangement=desired;lastBandWidth=bandWidth;
                title.setLayoutParams(new LayoutParams(-1,-2));
                controls.setLayoutParams(new LayoutParams(-1,-2));controls.setOrientation(desired==2?VERTICAL:HORIZONTAL);
                band.setLayoutParams(desired==2?new LayoutParams(-1,-2):new LayoutParams(bandWidth,-2));
                refresh.setLayoutParams(new LayoutParams(desired==2?-1:dp(48),-2));map.setLayoutParams(new LayoutParams(desired==2?-1:dp(64),-2));
            }
        }
        super.onMeasure(widthSpec,heightSpec);
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
