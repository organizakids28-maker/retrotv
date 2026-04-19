package com.retrotv.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;

/**
 * RetroTV — MainActivity
 *
 * Carrega o frontend (index.html) em um WebView fullscreen.
 * Suporta:
 *   - Seleção de arquivos locais (ROMs) via input[type=file]
 *   - Navegação por teclado físico
 *   - JavaScript bridge para comunicação nativa (opcional)
 */
public class MainActivity extends Activity {

    private static final int PICK_FILE_REQUEST = 1001;

    private WebView mWebView;
    private ValueCallback<Uri[]> mFilePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Tela cheia e sempre ligada
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
        setContentView(mWebView);

        configurarWebView();

        // Carregar app local
        // Os arquivos do frontend ficam na raiz de assets (sem subpasta)
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    private void configurarWebView() {
        WebSettings s = mWebView.getSettings();

        // JavaScript obrigatório para EmulatorJS
        s.setJavaScriptEnabled(true);

        // Acesso a arquivos locais (ROMs)
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        // Performance
        s.setDomStorageEnabled(true);       // localStorage
        s.setDatabaseEnabled(true);         // IndexedDB
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);

        // Renderização
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);

        // WebViewClient — intercepta navegação
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Links externos abrem no navegador do sistema
                if (!url.startsWith("file://")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                }
                return false;
            }
        });

        // WebChromeClient — necessário para input[type=file]
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, PICK_FILE_REQUEST);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Bridge JavaScript → Java (opcional, para funcionalidades nativas)
        mWebView.addJavascriptInterface(new NativeBridge(), "RetroTVNative");

        WebView.setWebContentsDebuggingEnabled(true); // remover em produção
    }

    // ─── FILE PICKER RESULT ────────────────────────────────────────────────
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE_REQUEST) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataStr = data.getDataString();
                if (dataStr != null) {
                    results = new Uri[]{ Uri.parse(dataStr) };
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
        }
    }

    // ─── NAVEGAÇÃO (teclas físicas) ────────────────────────────────────────
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Botão Voltar do controle: navega no histórico do WebView
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mWebView.canGoBack()) {
                mWebView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    // ─── CICLO DE VIDA ────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        mWebView.onResume();
        // Restaurar imersão
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    protected void onPause() {
        super.onPause();
        mWebView.onPause();
    }

    @Override
    protected void onDestroy() {
        mWebView.destroy();
        super.onDestroy();
    }

    // ─── JAVASCRIPT BRIDGE ────────────────────────────────────────────────
    /**
     * Métodos acessíveis via JavaScript: RetroTVNative.metodo()
     */
    private class NativeBridge {

        /** Mostrar toast nativo (feedback rápido) */
        @JavascriptInterface
        public void showToast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    android.widget.Toast.makeText(
                        MainActivity.this, msg,
                        android.widget.Toast.LENGTH_SHORT
                    ).show();
                }
            });
        }

        /** Verificar se tem conexão com internet */
        @JavascriptInterface
        public boolean hasNetwork() {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager)
                getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        }

        /** Pegar versão do app */
        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager()
                    .getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }
    }
}
