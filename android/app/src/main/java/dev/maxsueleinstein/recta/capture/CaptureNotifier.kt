package dev.maxsueleinstein.recta.capture

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dev.maxsueleinstein.recta.R
import org.json.JSONObject

/** Reads the notices out of the answer of POST /captures (`data.results[].notice`, see the backend's ingestCaptures). */
object CaptureNoticeJson {
    fun parse(body: String?): List<CaptureNotice> {
        if (body.isNullOrBlank()) return emptyList()
        val results = try {
            JSONObject(body).optJSONObject("data")?.optJSONArray("results")
        } catch (e: Exception) {
            null
        } ?: return emptyList()
        val notices = ArrayList<CaptureNotice>()
        for (i in 0 until results.length()) {
            val result = results.optJSONObject(i) ?: continue
            if (result.optString("status") != "created") continue
            val notice = result.optJSONObject("notice") ?: continue
            val cents = if (notice.has("amountCents")) notice.optLong("amountCents", -1) else null
            CaptureNoticeText.of(
                key = result.optString("dedupKey").ifEmpty { null },
                kind = notice.optString("kind"),
                amountCents = cents,
                merchant = if (notice.isNull("merchant")) null else notice.optString("merchant"),
            )?.let { notices.add(it) }
        }
        return notices
    }
}

/**
 * Shows "Compra de R$ X capturada: confirmar?" for each new spending. Tapping it opens the app on the capture box
 * ([EXTRA_OPEN] = [OPEN_CAPTURES], read by MainActivity and handed to the page by [CaptureReaderPlugin]). On the lock
 * screen only "Compra capturada" shows: the value and the merchant stay behind the unlock.
 */
object CaptureNotifier {
    const val CHANNEL_ID = "capture-notices"
    const val EXTRA_OPEN = "dev.maxsueleinstein.recta.OPEN"
    const val OPEN_CAPTURES = "captures"

    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun show(context: Context, notices: List<CaptureNotice>) {
        if (notices.isEmpty() || !canNotify(context)) return
        ensureChannel(context)
        val manager = NotificationManagerCompat.from(context)
        for (notice in notices) {
            val publicVersion = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_capture)
                .setContentTitle("Compra capturada")
                .setContentText("Desbloqueie para ver.")
                .build()
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_capture)
                .setContentTitle(CaptureNoticeText.title(notice))
                .setContentText(CaptureNoticeText.body(notice))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setAutoCancel(true)
                .setContentIntent(openCapturesIntent(context))
                .build()
            try {
                manager.notify(CaptureNoticeText.notificationId(notice.key), notification)
            } catch (e: SecurityException) {
                return // permission taken away in between
            }
        }
    }

    private fun openCapturesIntent(context: Context): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        launch.putExtra(EXTRA_OPEN, OPEN_CAPTURES)
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Compras capturadas", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Avisa quando uma compra lida da notificação do banco espera confirmação."
        manager.createNotificationChannel(channel)
    }
}
