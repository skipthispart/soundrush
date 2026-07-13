package com.soundrush;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.JavascriptInterface;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.widget.EditText;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setDomStorageEnabled(true);

        webView.setWebViewClient(new WebViewClient());

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void download(String url) {
                runOnUiThread(() -> {
                    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                    builder.setTitle("SoundRush Download");
                    builder.setMessage("Download: " + url);

                    final EditText input = new EditText(MainActivity.this);
                    input.setHint("Format (mp3, flac, mp4)");
                    builder.setView(input);

                    builder.setPositiveButton("Download", (dialog, which) -> {
                        String format = input.getText().toString().trim();
                        if (format.isEmpty()) format = "mp3";
                        String apiUrl = "https://soundrush.vercel.app/api/info?url="
                            + java.net.URLEncoder.encode(url)
                            + "&format=" + format;
                        webView.loadUrl(apiUrl);
                        Toast.makeText(MainActivity.this, "Processing...", Toast.LENGTH_LONG).show();
                    });
                    builder.setNegativeButton("Cancel", null);
                    builder.show();
                });
            }
        }, "SoundRush");

        webView.loadUrl("https://soundcloud.com");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
