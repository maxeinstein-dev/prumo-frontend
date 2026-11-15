package dev.maxsueleinstein.recta.capture

/**
 * P01 D3: a new spending the server understood (the `notice` of an item in the answer of POST /captures). What counts
 * as a spending, and its value, come from the server's reader; this side only words and shows it.
 */
data class CaptureNotice(
    /** The capture's dedupKey: one notification per capture. */
    val key: String,
    val kind: String,
    val amountCents: Long,
    val merchant: String?,
)

/** The words of the local notice. Pure, so the JVM unit tests cover it. */
object CaptureNoticeText {
    private const val MERCHANT_MAX = 80

    /** A notice is shown only with a key and a positive value; anything else from the server is dropped. */
    fun of(key: String?, kind: String?, amountCents: Long?, merchant: String?): CaptureNotice? {
        if (key.isNullOrBlank()) return null
        if (amountCents == null || amountCents <= 0) return null
        val cleanMerchant = merchant?.trim()?.takeIf { it.isNotEmpty() }?.take(MERCHANT_MAX)
        return CaptureNotice(key = key, kind = kind.orEmpty(), amountCents = amountCents, merchant = cleanMerchant)
    }

    /** "R$ 1.234,56", from integer cents (no floating point). */
    fun brl(cents: Long): String {
        val reais = cents / 100
        val rest = (cents % 100).toString().padStart(2, '0')
        val grouped = reais.toString().reversed().chunked(3).joinToString(".").reversed()
        return "R$ $grouped,$rest"
    }

    fun title(notice: CaptureNotice): String {
        val value = brl(notice.amountCents)
        return when (notice.kind) {
            "CARD_PURCHASE" -> "Compra de $value capturada: confirmar?"
            "PIX_OUT", "WALLET_PIX_OUT" -> "Pix de $value capturado: confirmar?"
            else -> "Saída de $value capturada: confirmar?"
        }
    }

    fun body(notice: CaptureNotice): String = notice.merchant ?: "Toque para abrir a caixa de capturas."

    /** Stable per capture, so the system replaces rather than stacks a notice sent twice. */
    fun notificationId(key: String): Int = key.hashCode()
}
