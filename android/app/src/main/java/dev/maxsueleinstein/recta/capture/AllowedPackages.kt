package dev.maxsueleinstein.recta.capture

/**
 * The only apps whose notifications are ever read. A notification from any other package is dropped on the phone, before
 * anything is stored or sent: this is the single place that decides it (the listener calls [isAllowed] first).
 *
 * Both ids were confirmed on the target phone (SM-A556E, Android 16) with `adb shell pm list packages`.
 */
object AllowedPackages {
    const val NUBANK = "com.nu.production"
    const val MERCADO_PAGO = "com.mercadopago.wallet"
    /** Gmail, for the e-mails of Google Pay and the banks only (see [isAllowedGmailSender]). */
    const val GMAIL = "com.google.android.gm"

    val ALLOWED: Set<String> = setOf(NUBANK, MERCADO_PAGO, GMAIL)

    /**
     * Senders (the title of a Gmail notification) whose e-mails are read: Google Pay, Mercado Pago and banks, decided by
     * the user on 15/11/2026, XP left out until there are sample e-mails. Every other e-mail is dropped on the phone, so
     * the preview of a personal e-mail never leaves it. The same list is on the server (parsers/gmail.ts), which refuses
     * the others too. Whole name, without case or extra spaces: "Inter" is a sender, "Internacional FC" is not.
     */
    val GMAIL_SENDERS: Set<String> = setOf(
        "Google Pay",
        "Mercado Pago",
        "Nubank",
        "Inter",
        "Banco Inter",
        "PagBank",
        "PagSeguro",
    ).map(::normalizeSender).toSet()

    /** Exact match on the package name; null, blank or a look-alike id is refused. */
    fun isAllowed(packageName: String?): Boolean = packageName != null && packageName in ALLOWED

    fun isAllowedGmailSender(title: CharSequence?): Boolean = title != null && normalizeSender(title.toString()) in GMAIL_SENDERS

    private fun normalizeSender(raw: String): String = raw.trim().replace(Regex("\\s+"), " ").lowercase()
}
