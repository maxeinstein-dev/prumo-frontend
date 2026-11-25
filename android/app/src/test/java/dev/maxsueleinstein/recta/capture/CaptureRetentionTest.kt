package dev.maxsueleinstein.recta.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureRetentionTest {
    private val now = 1_700_000_000_000L
    private val cutoff = CaptureRetention.cutoff(now)

    @Test
    fun theCutoffIsFourteenDaysBeforeNow() {
        assertEquals(14L * 24 * 60 * 60 * 1000, now - cutoff)
    }

    @Test
    fun oldSentRowsArePurgeable() {
        assertTrue(CaptureRetention.isPurgeable(QueueStatus.SENT, cutoff - 1, now, cutoff))
        assertFalse(CaptureRetention.isPurgeable(QueueStatus.SENT, cutoff, now, cutoff))
        assertFalse(CaptureRetention.isPurgeable(QueueStatus.SENT, null, cutoff - 1, cutoff))
    }

    @Test
    fun oldRejectedRowsArePurgeableByCaptureTime() {
        // Captured long ago and refused: its raw text must not stay forever.
        assertTrue(CaptureRetention.isPurgeable(QueueStatus.REJECTED, null, cutoff - 1, cutoff))
        // Captured recently: kept, so the diagnostics can show it.
        assertFalse(CaptureRetention.isPurgeable(QueueStatus.REJECTED, null, now, cutoff))
        assertFalse(CaptureRetention.isPurgeable(QueueStatus.REJECTED, null, cutoff, cutoff))
    }

    @Test
    fun pendingRowsAreNeverPurged() {
        assertFalse(CaptureRetention.isPurgeable(QueueStatus.PENDING, null, cutoff - 1_000_000, cutoff))
    }
}
