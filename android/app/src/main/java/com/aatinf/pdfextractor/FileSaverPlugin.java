package com.aatinf.pdfextractor;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
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
 * Writes a base64 payload into the public Downloads folder, then lets the web
 * layer open or share the saved file.
 *
 * Android WebView ignores <a download> for blob: URLs, so the bytes have to
 * cross the bridge. Android 10+ uses MediaStore (no runtime permission);
 * Android 7-9 falls back to the legacy path plus WRITE_EXTERNAL_STORAGE.
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
                JSObject ret = saveWithMediaStore(data, fileName, mime);
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

    /** Hand the saved file to another app (WeChat, mail, cloud drive...). */
    @PluginMethod
    public void share(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "application/pdf");
        if (uriStr == null) {
            call.reject("missing uri");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_STREAM, Uri.parse(uriStr));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(intent, "分享"));
            call.resolve();
        } catch (Exception e) {
            call.reject("share failed: " + e.getMessage(), e);
        }
    }

    /** Open the saved file with whatever app handles that MIME type. */
    @PluginMethod
    public void openFile(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "application/pdf");
        if (uriStr == null) {
            call.reject("missing uri");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(uriStr), mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("no app can open this file");
        } catch (Exception e) {
            call.reject("open failed: " + e.getMessage(), e);
        }
    }

    private JSObject saveWithMediaStore(String base64, String fileName, String mime) throws Exception {
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

        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("displayPath", "Download/" + fileName);
        return ret;
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
            ret.put("uri", Uri.fromFile(out).toString());
            ret.put("displayPath", "Download/" + fileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage(), e);
        }
    }

    /** Strip path separators so a crafted file name cannot escape Downloads. */
    private String sanitize(String name) {
        if (name == null) return null;
        String s = name.replace("\\", "_").replace("/", "_").trim();
        return s.isEmpty() ? null : s;
    }
}
