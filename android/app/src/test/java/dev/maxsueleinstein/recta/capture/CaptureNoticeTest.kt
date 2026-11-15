package dev.maxsueleinstein.recta.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** P01 D3: the local notice for a spending the server understood. Invented values only. */
class CaptureNoticeTest {
    @Test
    fun formatsCentsAsBrazilianReais() {
        assertEquals("R$ 0,05", CaptureNoticeText.brl(5))
        assertEquals("R$ 37,50", CaptureNoticeText.brl(3750))
        assertEquals("R$ 1.234,56", CaptureNoticeText.brl(123456))
        assertEquals("R$ 1.000.000,00", CaptureNoticeText.brl(100000000))
    }

    @Test
    fun aCardPurchaseAsksToConfirm() {
        val notice = CaptureNoticeText.of("k1", "CARD_PURCHASE", 3750, "PADARIA ZETA")!!
        assertEquals("Compra de R$ 37,50 capturada: confirmar?", CaptureNoticeText.title(notice))
        assertEquals("PADARIA ZETA", CaptureNoticeText.body(notice))
    }

    @Test
    fun aPixOrAnotherSpendingIsNotCalledAPurchase() {
        assertEquals("Pix de R$ 12,00 capturado: confirmar?", CaptureNoticeText.title(CaptureNoticeText.of("k", "PIX_OUT", 1200, null)!!))
        assertEquals("Pix de R$ 12,00 capturado: confirmar?", CaptureNoticeText.title(CaptureNoticeText.of("k", "WALLET_PIX_OUT", 1200, null)!!))
        assertEquals("Saída de R$ 12,00 capturada: confirmar?", CaptureNoticeText.title(CaptureNoticeText.of("k", "DEBIT_PURCHASE_X", 1200, null)!!))
    }

    @Test
    fun withoutAMerchantTheBodySaysWhereTheTapGoes() {
        assertEquals("Toque para abrir a caixa de capturas.", CaptureNoticeText.body(CaptureNoticeText.of("k", "CARD_PURCHASE", 100, "  ")!!))
    }

    @Test
    fun nothingIsShownWithoutAKeyOrAPositiveValue() {
        assertNull(CaptureNoticeText.of(null, "CARD_PURCHASE", 100, null))
        assertNull(CaptureNoticeText.of("", "CARD_PURCHASE", 100, null))
        assertNull(CaptureNoticeText.of("k", "CARD_PURCHASE", null, null))
        assertNull(CaptureNoticeText.of("k", "CARD_PURCHASE", 0, null))
        assertNull(CaptureNoticeText.of("k", "CARD_PURCHASE", -100, null))
    }

    @Test
    fun theMerchantIsCutSoALongTextNeverFillsTheShade() {
        val long = "LOJA ".repeat(40)
        assertEquals(80, CaptureNoticeText.body(CaptureNoticeText.of("k", "CARD_PURCHASE", 100, long)!!).length)
    }

    @Test
    fun eachCaptureHasItsOwnNotificationAndTheSameCaptureTheSame() {
        val a = CaptureNoticeText.notificationId("a".repeat(40))
        assertEquals(a, CaptureNoticeText.notificationId("a".repeat(40)))
        assertNotEquals(a, CaptureNoticeText.notificationId("b".repeat(40)))
    }
}
