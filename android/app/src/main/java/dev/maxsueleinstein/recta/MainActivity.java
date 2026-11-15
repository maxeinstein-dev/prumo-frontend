package dev.maxsueleinstein.recta;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import dev.maxsueleinstein.recta.capture.CaptureOpen;
import dev.maxsueleinstein.recta.capture.CaptureNotifier;
import dev.maxsueleinstein.recta.capture.CaptureReaderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate() builds the bridge.
        registerPlugin(CaptureReaderPlugin.class);
        super.onCreate(savedInstanceState);
        // A recreated Activity (rotation, process restored) already handled the request it was started with.
        if (CaptureOpen.readsLaunchRequest(savedInstanceState != null)) handleOpenRequest(getIntent());
        // Capacitor 8 core registers no back handling, so the Activity finished on every back press. The back button
        // asks the page (window.__rectaNativeBack, see src/native/nativeBack.ts): the page closes its layer or goes back
        // in its own history, and only answers "exit" when there is nothing left, then the Activity leaves as usual.
        // If the page does not answer (not loaded, or an error), the app leaves, as it did before.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().eval("(window.__rectaNativeBack ? window.__rectaNativeBack() : 'exit')", result -> {
                    // Exact match: "confirmExit" (the first back on Início) must not leave.
                    if (result == null || result.replace("\"", "").trim().equals("exit")) {
                        setEnabled(false);
                        MainActivity.this.getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleOpenRequest(intent);
    }

    /**
     * A tap on the capture notice (P01 D3) carries the screen to open. The plugin keeps it until the page takes it, so a
     * cold start (page still loading) and a warm one (page open, told by an event) both land on the capture box.
     */
    private void handleOpenRequest(Intent intent) {
        if (intent == null) return;
        String target = intent.getStringExtra(CaptureNotifier.EXTRA_OPEN);
        if (target == null) return;
        intent.removeExtra(CaptureNotifier.EXTRA_OPEN);
        PluginHandle handle = getBridge() != null ? getBridge().getPlugin("CaptureReader") : null;
        if (handle != null && handle.getInstance() instanceof CaptureReaderPlugin) {
            ((CaptureReaderPlugin) handle.getInstance()).requestOpen(target);
        } else {
            CaptureReaderPlugin.Companion.setPendingOpen(target);
        }
    }
}
