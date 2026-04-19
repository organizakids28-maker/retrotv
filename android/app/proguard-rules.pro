# RetroTV ProGuard Rules

# Manter bridge JavaScript (anotações @JavascriptInterface)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Manter nomes de classes do pacote
-keep class com.retrotv.app.** { *; }
