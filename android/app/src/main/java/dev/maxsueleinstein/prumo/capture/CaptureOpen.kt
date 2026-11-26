package dev.maxsueleinstein.prumo.capture

import android.content.Intent
import dev.maxsueleinstein.prumo.MainActivity

/**
 * How a tap on the capture notice reaches the capture box (review of 15/11/2026). The launch intent of the package
 * (getLaunchIntentForPackage) could bring the task to front without delivering the extra to onNewIntent when the app was
 * in the background, so the tap opened the Início. An explicit intent to MainActivity with these flags reuses the running
 * Activity (onNewIntent) or starts one, and a recreated Activity (rotation, process restored) does not open the box again.
 */
object CaptureOpen {
    val TARGET: Class<MainActivity> = MainActivity::class.java

    const val FLAGS: Int = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP

    /** The intent a fresh Activity starts with carries the request; a restored one already handled it. */
    @JvmStatic
    fun readsLaunchRequest(restored: Boolean): Boolean = !restored
}
