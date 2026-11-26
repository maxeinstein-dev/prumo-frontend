package dev.maxsueleinstein.prumo.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Gmail is read only for the senders that have a reader, Google Pay and Mercado Pago (15/11/2026); invented texts only. */
class GmailSenderFilterTest {
    private val at = 1_700_000_000_000L

    private fun gmail(title: CharSequence?, text: CharSequence? = "Seu Pix de R$10,00 no Google Pay foi realizado com sucesso.") =
        NotificationFilter.build(AllowedPackages.GMAIL, title, text, null, null, at)

    @Test
    fun gmailIsAnAllowedPackage() {
        assertTrue(AllowedPackages.isAllowed("com.google.android.gm"))
        assertEquals("com.google.android.gm", AllowedPackages.GMAIL)
    }

    @Test
    fun keepsTheEmailsOfTheListedSenders() {
        for (sender in listOf("Google Pay", " google  pay ", "Mercado Pago", "MERCADO PAGO")) {
            assertNotNull(sender, gmail(sender))
        }
    }

    @Test
    fun dropsAnyOtherEmailBeforeItIsStored() {
        for (sender in listOf("Maria Silva", "XP Investimentos", "XP", "Nubank", "Inter", "Banco Inter", "PagBank", "PagSeguro", "Internacional FC", "2 novas mensagens", "Google", "", "   ")) {
            assertNull(sender, gmail(sender))
        }
        assertNull(gmail(null))
    }

    @Test
    fun theSenderRuleIsOnlyForGmail() {
        assertFalse(AllowedPackages.isAllowedGmailSender("Maria Silva"))
        assertNotNull(NotificationFilter.build(AllowedPackages.NUBANK, "Maria Silva", "Recebemos sua transferência de R$ 5,00.", null, null, at))
        assertNotNull(NotificationFilter.build(AllowedPackages.MERCADO_PAGO, null, "O Pix de R$ 10.00 foi feito para MARIA.", null, null, at))
    }
}
