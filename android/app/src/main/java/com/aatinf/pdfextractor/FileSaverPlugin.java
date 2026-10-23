package com.aatinf.pdfextractor;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves a base64 payload into the public Downloads folder.
 *
 * Android WebView does not honour <a download> with blob: URLs, so the web layer
 * has to hand the bytes to native code. Android 10+ uses MediaStore (no runtime
 * permission needed); Android 7-9 falls back to the legacy external storage path
 * with WRITE_EXTERNAL_STORAGE.
 */
@CapacitorPlugin(
    name = "FileSaver",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String fileName = sanitize(call.getString("fileName"));
        String mime = call.getString("mime", "application/octet-stream");

        if (data == null || data.isEmpty()) {
            call.reject("empty payload");
            return;
        }
        if (fileName == null) {
            call.reject("missing fileName");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                String relPath = saveWithMediaStore(data, fileName, mime);
                JSObject ret = new JSObject();
                ret.put("path", relPath);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("save failed: " + e.getMessage(), e);
            }
            return;
        }

        if (getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermCallback");
        } else {
            legacySave(call, data, fileName, mime);
        }
    }

    @PermissionCallback
    private void storagePermCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            legacySave(call, call.getString("data"), sanitize(call.getString("fileName")),
                    call.getString("mime", "application/octet-stream"));
        } else {
            call.reject("storage permission denied");
        }
    }

    private String saveWithMediaStore(String base64, String fileName, String mime) throws Exception {
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        ContentResolver resolver = getContext().getContentResolver();

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("cannot create entry");

        try (OutputStream os = resolver.openOutputStream(uri)) {
            if (os == null) throw new Exception("cannot open stream");
            os.write(bytes);
            os.flush();
        }

        ContentValues done = new ContentValues();
        done.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, done, null, null);

        return "Download/" + fileName;
    }

    private void legacySave(PluginCall call, String base64, String fileName, String mime) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create Download dir");

            File out = new File(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
                fos.flush();
            }
            MediaScannerConnection.scanFile(getContext(), new String[]{ out.getAbsolutePath() }, null, null);

            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage(), e);
        }
    }

    /** Strip path separators so a crafted file name cannot escape the Downloads folder. */
    private String sanitize(String name) {
        if (name == null) return null;
        String s = name.replace("\\", "_").replace("/", "_").trim();
        return s.isEmpty() ? null : s;
    }
}
