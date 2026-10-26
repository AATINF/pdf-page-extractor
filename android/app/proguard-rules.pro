# Capacitor 大量依赖反射与注解，以下规则必须保留，否则运行时会白屏
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# 本项目自定义插件
-keep class com.aatinf.pdfextractor.** { *; }

# WebView 与 JS 桥
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class android.webkit.** { *; }

# 保留注解信息
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses

# 去掉日志（release）
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
