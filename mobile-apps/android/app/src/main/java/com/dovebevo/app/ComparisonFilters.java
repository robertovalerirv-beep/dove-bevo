package com.dovebevo.app;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;

/** Two compact selectors when space permits; the same controls stack on narrow/enlarged layouts. */
final class ComparisonFilters extends LinearLayout {
    private int columns;
    ComparisonFilters(Context context) { super(context); setBaselineAligned(false); }
    @Override protected void onMeasure(int widthSpec,int heightSpec) {
        float density=getResources().getDisplayMetrics().density;
        int available=View.MeasureSpec.getSize(widthSpec)-getPaddingLeft()-getPaddingRight();
        int desired=View.MeasureSpec.getMode(widthSpec)!=View.MeasureSpec.UNSPECIFIED
                && available/density>=300*Math.max(1f,getResources().getConfiguration().fontScale)?2:1;
        if(columns!=desired) {
            columns=desired;setOrientation(columns==2?HORIZONTAL:VERTICAL);
            for(int i=0;i<getChildCount();i++) {
                LayoutParams size=columns==2?new LayoutParams(0,-2,1):new LayoutParams(-1,-2);
                if(columns==2&&i==0)size.rightMargin=NativeAppearance.dp(getContext(),12);
                getChildAt(i).setLayoutParams(size);
            }
        }
        super.onMeasure(widthSpec,heightSpec);
    }
}
