package dev.maxsueleinstein.recta.capture

/**
 * The only apps whose notifications are ever read. A notification from any other package is dropped on the phone, before
 * anything is stored or sent: this is the single place that decides it (the listener calls [isAllowed] first).
 *
 * The ids were confirmed on the target phone (SM-A556E, Android 16) with `adb shell pm list packages`.
 */
object AllowedPackages {
    const val NUBANK = "com.nu.production"
    const val MERCADO_PAGO = "com.mercadopago.wallet"
    /** XP (P21 L7): dividends and dividend reinvestment become investment drafts on the server, never transactions. */
    const val XP = "br.com.xp.carteira"
    /** Gmail, for the e-mails of Google Pay and the banks only (see [isAllowedGmailSender]). */
    const val GMAIL = "com.google.android.gm"

    val ALLOWED: Set<String> = setOf(NUBANK, MERCADO_PAGO, XP, GMAIL)

    /**
     * Senders (the title of a Gmail notification) whose e-mails are read: only the ones that have a reader on the server,
     * Google Pay and Mercado Pago (decided on 15/11/2026, after the review). A bank enters this list together with its
     * reader, written from sample e-mails. Every other e-mail is dropped on the phone, so its text never leaves it. The
     * same list is on the server (parsers/gmail.ts), which also stores no e-mail that no reader understands.
     */
    val GMAIL_SENDERS: Set<String> = setOf(
        "Google Pay",
        "Mercado Pago",
    ).map(::normalizeSender).toSet()

    /** Exact match on the package name; null, blank or a look-alike id is refused. */
    fun isAllowed(packageName: String?): Boolean = packageName != null && packageName in ALLOWED

    fun isAllowedGmailSender(title: CharSequence?): Boolean = title != null && normalizeSender(title.toString()) in GMAIL_SENDERS

    private fun normalizeSender(raw: String): String = raw.trim().replace(Regex("\\s+"), " ").lowercase()
}
