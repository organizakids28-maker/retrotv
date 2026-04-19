package com.retrotv.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {

    private static final int PICK_FILE_REQUEST = 1001;

    private WebView mWebView;
    private ValueCallback<Uri[]> mFilePathCallback;  // para input[type=file] se funcionar
    private boolean mNativePick = false;             // true = seleção nativa pelo bridge

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        mWebView = new WebView(this);
        mWebView.setFocusable(true);
        mWebView.setFocusableInTouchMode(true);

        setContentView(mWebView);
        configurarWebView();
        mWebView.loadUrl("file:///android_asset/index.html");
        mWebView.requestFocus();
    }

    private void configurarWebView() {
        WebSettings s = mWebView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file://")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception ignored) {}
                return true;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                mWebView.requestFocus();
            }
        });

        // WebChromeClient padrão — funciona em alguns dispositivos
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) mFilePathCallback.onReceiveValue(null);
                mFilePathCallback = filePathCallback;
                mNativePick = false;
                abrirFilePicker();
                return true;
            }
        });

        mWebView.addJavascriptInterface(new NativeBridge(), "RetroTVNative");
        WebView.setWebContentsDebuggingEnabled(true);
    }

    // Abre o gerenciador de arquivos nativo
    private void abrirFilePicker() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(Intent.createChooser(intent, "Escolher ROM"), PICK_FILE_REQUEST);
        } catch (Exception e) {
            android.widget.Toast.makeText(this,
                "Instale um gerenciador de arquivos e tente novamente.",
                android.widget.Toast.LENGTH_LONG).show();
            if (mFilePathCallback != null) {
                mFilePathCallback.onReceiveValue(null);
                mFilePathCallback = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_FILE_REQUEST) return;

        Uri uri = null;
        if (resultCode == Activity.RESULT_OK && data != null) {
            uri = data.getData();
        }

        if (mNativePick) {
            // Seleção via bridge nativa — copiar arquivo e passar caminho para JS
            mNativePick = false;
            if (uri == null) {
                mWebView.post(new Runnable() { public void run() {
                    mWebView.evaluateJavascript("window.onNativeFileCancelled && window.onNativeFileCancelled()", null);
                }});
                return;
            }
            processarArquivoNativo(uri);
        } else {
            // Seleção via input[type=file] padrão
            if (mFilePathCallback == null) return;
            Uri[] results = uri != null ? new Uri[]{ uri } : null;
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
        }
    }

    private void processarArquivoNativo(final Uri uri) {
        new Thread(new Runnable() {
            public void run() {
                try {
                    // Pegar nome do arquivo
                    String nome = "rom";
                    Cursor cursor = getContentResolver().query(uri, null, null, null, null);
                    if (cursor != null && cursor.moveToFirst()) {
                        int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) nome = cursor.getString(idx);
                        cursor.close();
                    }

                    // Copiar para cache do app
                    File cacheDir = getCacheDir();
                    File destino = new File(cacheDir, "rom_temp");
                    InputStream is = getContentResolver().openInputStream(uri);
                    FileOutputStream fos = new FileOutputStream(destino);
                    byte[] buf = new byte[65536];
                    int n;
                    long total = 0;
                    while ((n = is.read(buf)) != -1) { fos.write(buf, 0, n); total += n; }
                    is.close(); fos.close();

                    final String nomeF = nome;
                    final long totalF = total;
                    final String path = "file://" + destino.getAbsolutePath();

                    mWebView.post(new Runnable() { public void run() {
                        String js = "window.onNativeFile && window.onNativeFile('" +
                            path + "','" + escJs(nomeF) + "'," + totalF + ")";
                        mWebView.evaluateJavascript(js, null);
                    }});

                } catch (Exception e) {
                    final String err = e.getMessage() != null ? e.getMessage() : "erro desconhecido";
                    mWebView.post(new Runnable() { public void run() {
                        mWebView.evaluateJavascript(
                            "window.onNativeFileError && window.onNativeFileError('" + escJs(err) + "')", null);
                    }});
                }
            }
        }).start();
    }

    private static String escJs(String s) {
        return s.replace("\\","\\\\").replace("'","\\'").replace("\n","\\n").replace("\r","");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mWebView.canGoBack()) { mWebView.goBack(); return true; }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        mWebView.onResume();
        mWebView.requestFocus();
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override protected void onPause()   { super.onPause();   mWebView.onPause(); }
    @Override protected void onDestroy() { mWebView.destroy(); super.onDestroy(); }

    // ─── JAVASCRIPT BRIDGE ────────────────────────────────────────────────
    private class NativeBridge {

        /** Abre o gerenciador de arquivos nativo — funciona em qualquer Android TV */
        @JavascriptInterface
        public void pickFile() {
            runOnUiThread(new Runnable() { public void run() {
                mNativePick = true;
                mFilePathCallback = null;
                abrirFilePicker();
            }});
        }

        @JavascriptInterface
        public void showToast(final String msg) {
            runOnUiThread(new Runnable() { public void run() {
                android.widget.Toast.makeText(MainActivity.this, msg,
                    android.widget.Toast.LENGTH_SHORT).show();
            }});
        }

        @JavascriptInterface
        public boolean hasNetwork() {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager)
                getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        }

        @JavascriptInterface
        public String getAppVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "1.0"; }
        }
    }
}
