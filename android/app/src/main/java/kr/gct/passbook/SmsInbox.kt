package kr.gct.passbook

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import java.util.Calendar

/*
  **문자함에서 결제 문자를 직접 읽는다**(1.2, 2026-09-13).

  알림으로만 받으면 알림을 놓치는 순간 끝이다 — 리스너가 끊겨 있었거나, 알림을 옆으로
  밀어 지웠거나, 문자 앱이 알림을 묶어 버렸거나. 그런데 문자는 문자함에 그대로 남는다.
  그래서 웹이 알림을 가져갈 때마다(앱을 열 때, 켜 둔 동안 15초마다) 문자함에서 지난번
  이후로 온 문자를 훑어 결제 문자를 같은 큐에 넣는다.

  문자를 받는 순간 잡는 수신기(SMS_RECEIVED)는 두지 않았다. 웹은 어차피 앱이 열려 있을
  때만 처리하므로 열 때 훑으면 충분하고, 수신기는 긴 문자(LMS — 카드 결제 문자가 대개
  이렇다)를 못 받는다. 긴 문자는 MMS 칸에 저장되므로 거기까지 같이 읽는다.

  같은 결제가 문자 앱 알림으로도 온다. 글자가 달라(알림은 '보낸 사람 + 본문') 여기선
  못 거르고, 웹이 날짜·시각·금액으로 한 번 거른다(dealKey).

  처음엔 **어제 0시부터** 읽는다. 설치 전 문자까지 한꺼번에 밀려들면 이미 손으로 적은
  것과 겹칠 수 있고, 어제 것까지면 "어제 결제한 게 안 들어왔다"는 건 건진다.
*/
object SmsInbox {
    private const val PREF = "passbook_native"
    private const val SMS_LAST = "sms_last_ms"
    private const val MMS_LAST = "mms_last_sec"
    private const val SCANNED_AT = "sms_scanned_at"

    @Volatile private var lastRun = 0L

    fun granted(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

    fun lastScan(ctx: Context): Long = prefs(ctx).getLong(SCANNED_AT, 0L)

    @Synchronized
    fun scan(ctx: Context, force: Boolean = false) {
        if (!granted(ctx)) return
        val now = System.currentTimeMillis()
        if (!force && now - lastRun < 10_000) return
        lastRun = now

        val p = prefs(ctx)
        val from = yesterdayStart()
        var smsLast = p.getLong(SMS_LAST, from)
        var mmsLast = p.getLong(MMS_LAST, from / 1000)

        try {
            ctx.contentResolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("date", "body"),
                "date > ?", arrayOf(smsLast.toString()), "date ASC",
            )?.use { c ->
                while (c.moveToNext()) {
                    val date = c.getLong(0)
                    offer(ctx, c.getString(1).orEmpty())
                    if (date > smsLast) smsLast = date
                }
            }
        } catch (e: Exception) { /* 못 읽어도 알림 쪽은 돈다 */ }

        // MMS의 date는 초 단위다
        try {
            ctx.contentResolver.query(
                Uri.parse("content://mms/inbox"),
                arrayOf("_id", "date"),
                "date > ?", arrayOf(mmsLast.toString()), "date ASC",
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val date = c.getLong(1)
                    offer(ctx, mmsText(ctx, id))
                    if (date > mmsLast) mmsLast = date
                }
            }
        } catch (e: Exception) { /* 못 읽어도 알림 쪽은 돈다 */ }

        p.edit().putLong(SMS_LAST, smsLast).putLong(MMS_LAST, mmsLast).putLong(SCANNED_AT, now).apply()
    }

    private fun mmsText(ctx: Context, id: Long): String {
        val out = StringBuilder()
        try {
            ctx.contentResolver.query(
                Uri.parse("content://mms/part"),
                arrayOf("ct", "text"),
                "mid = ?", arrayOf(id.toString()), null,
            )?.use { c ->
                while (c.moveToNext()) {
                    if (c.getString(0) == "text/plain") {
                        val t = c.getString(1)
                        if (!t.isNullOrBlank()) out.append(t).append('\n')
                    }
                }
            }
        } catch (e: Exception) { /* 본문을 못 읽으면 건너뛴다 */ }
        return out.toString().trim()
    }

    /** 알림에서 건진 것과 똑같이 — 금액이 든 문자는 기록을 남기고, 결제면 큐에 넣는다 */
    private fun offer(ctx: Context, body: String) {
        val text = body.trim()
        if (text.isEmpty()) return
        val ok = PaymentListener.looksLikePayment(PKG, text)
        if (PaymentListener.hasMoney(text)) PaymentQueue.log(ctx, PKG, text, ok)
        if (ok) PaymentQueue.push(ctx, PKG, text)
    }

    private fun yesterdayStart(): Long = Calendar.getInstance().apply {
        add(Calendar.DAY_OF_MONTH, -1)
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    /** 웹의 진단 목록에 '문자함'으로 보인다 */
    const val PKG = "sms"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
}
