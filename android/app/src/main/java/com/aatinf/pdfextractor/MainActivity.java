package com.aatinf.pdfextractor;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor 用 https://localhost 加载本地资源，WebView 会缓存这些响应。
        // 如果不清，升级后仍会显示旧版本的 index.html（用户看到的就是这个现象）。
        // 本地资源读取几乎零成本，所以直接禁用缓存，并在版本变化时强制清一次。
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        int versionCode = currentVersionCode();
        SharedPreferences sp = getSharedPreferences("pdfextractor", MODE_PRIVATE);
        int cachedVersion = sp.getInt("versionCode", 0);
        if (cachedVersion != versionCode) {
            webView.clearCache(true);
            sp.edit().putInt("versionCode", versionCode).apply();
        }
    }

    private int currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return (int) (info.getLongVersionCode() & 0x7fffffff);
        } catch (Exception e) {
            return 0;
        }
    }
}
