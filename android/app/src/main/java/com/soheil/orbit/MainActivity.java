package com.soheil.orbit;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(8, 11, 22));
        window.setNavigationBarColor(Color.rgb(8, 11, 22));

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.rgb(8, 11, 22));
        layout.setPadding(32, 32, 32, 32);

        TextView title = new TextView(this);
        title.setText("ORBIT");
        title.setTextColor(Color.rgb(53, 215, 255));
        title.setTextSize(36);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.18f);

        TextView subtitle = new TextView(this);
        subtitle.setText("PERSONAL AI ASSISTANT");
        subtitle.setTextColor(Color.WHITE);
        subtitle.setTextSize(13);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 0);

        TextView status = new TextView(this);
        status.setText("ANDROID FOUNDATION READY");
        status.setTextColor(Color.rgb(150, 170, 190));
        status.setTextSize(11);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 28, 0, 0);

        layout.addView(title);
        layout.addView(subtitle);
        layout.addView(status);

        setContentView(layout);
    }
}
