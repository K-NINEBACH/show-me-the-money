package kr.gct.passbook

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.util.Calendar

/*
  **위젯·아침 알림·초과 경고에 쓰는 요약**(1.3, 2026-09-17).

  사용자의 핵심은 "굳이 추가적인 제스처나 행동 없이 한눈에 보는 것"이었고, 마지막까지
  남아 있던 행동이 '앱을 여는 것'이었다. 그래서 웹이 홈 맨 위 숫자를 넘겨 주면
  (Bridge.summary) 여기에 저장해 두고
    · 홈 화면 위젯을 그리고(SummaryWidget)
    · 매일 아침 8시에 "오늘은 N원까지"를 알리고(Daily)
    · 다음 달 월급으로 다 못 내게 되는 순간 경고를 띄운다.

  **숫자는 절대 여기서 만들지 않는다.** 웹이 낸 값을 글자로 옮기기만 한다. 네이티브가
  가계부 형식을 알기 시작하면 계산이 두 벌이 되고, 두 벌은 언젠가 반드시 갈라진다
  (이 저장소에서 라벨과 계산이 어긋난 버그가 일곱 번 나왔다).

  **오래된 숫자는 오래됐다고 적는다.** 알림은 앱이 열릴 때 처리되므로, 며칠 앱을 안 열면
  이 값도 그만큼 낡았다. 아침 알림에 '(N일 전 기준)'을 붙이는 이유다 — 낡은 숫자를
  오늘 숫자인 척 보여 주는 게 제일 나쁘다.
*/
object Summary {
    private const val PREF = "passbook_summary"
    private const val KEY = "json"
    private const val AT = "at"
    private const val WARNED = "warned_at"     // 마지막으로 경고한 canSpend
    private const val DAILY = "daily_at"       // 마지막으로 아침 알림을 띄운 시각

    const val CH_DAILY = "daily"
    const val CH_WARN = "warn"
    private const val ID_DAILY = 4001
    private const val ID_WARN = 4002

    /** 경고를 다시 띄우는 문턱 — 이만큼 더 나빠져야 또 알린다(알림이 계속 뜨면 안 보게 된다) */
    private const val WARN_STEP = 30_000

    fun save(ctx: Context, json: String) {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        p.edit().putString(KEY, json).putLong(AT, System.currentTimeMillis()).apply()
        SummaryWidget.refresh(ctx)
        warnIfShort(ctx, json)
    }

    fun read(ctx: Context): JSONObject? {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val s = p.getString(KEY, null) ?: return null
        return try { JSONObject(s) } catch (e: Exception) { null }
    }

    fun savedAt(ctx: Context): Long =
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(AT, 0L)

    fun lastDaily(ctx: Context): Long =
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(DAILY, 0L)

    /** 1,234,567 → "1,234,567원". 웹의 fmtWon과 같은 모양 */
    fun won(n: Long): String = String.format("%,d원", n)

    private fun days(ms: Long): Int {
        if (ms <= 0) return 0
        return ((System.currentTimeMillis() - ms) / 86_400_000L).toInt()
    }

    /*
      **다음 카드 결제일**(1.4) — "10/12에 1,067,874원 나가요". 알림이 안 오는 결제가 있어서
      결제일 전에 카드 앱 금액과 맞춰야 하는데, 사람이 그걸 기억할 필요가 없게 여기서 알린다.
    */
    private fun dueLine(ctx: Context): String? {
        val d = read(ctx)?.optJSONObject("due") ?: return null
        val days = d.optInt("days", -1)
        if (days < 0 || days > 7) return null
        val when0 = if (days == 0) "오늘" else if (days == 1) "내일" else "${days}일 뒤"
        return "${d.optString("label")}($when0) ${d.optString("name")} ${won(d.optLong("amount", 0L))} 나가요"
    }

    /** 위젯·알림에 쓸 한 줄. 낡았으면 며칠 전 기준인지 붙인다 */
    fun line(ctx: Context): Pair<String, String>? {
        val s = read(ctx) ?: return null
        if (!s.optBoolean("hasPay", false)) return "월급을 적어 주세요" to "설정에서 월급(실수령)을 넣으면 오늘 쓸 수 있는 돈이 나와요"
        val can = s.optLong("canSpend", 0L)
        val per = s.optLong("perDay", 0L)
        val left = s.optInt("daysLeft", 0)
        val old = days(savedAt(ctx))
        val stale = if (old >= 1) " · ${old}일 전 기준" else ""
        val due = dueLine(ctx)?.let { " · $it" } ?: ""
        return if (can < 0) {
            "${s.optInt("month")}월 월급으로 ${won(-can)} 모자라요" to "카드값·고정지출이 월급을 넘었어요$stale$due"
        } else {
            "오늘은 ${won(per)}까지" to "말일까지 ${left}일 · 남은 돈 ${won(can)}$stale$due"
        }
    }

    /*
      **월급을 넘어선 순간 경고**(사용자 선택, 2026-09-17). 이 앱을 만든 이유가
      "카드값이 다음 달 월급을 넘지 않게"라서, 넘은 뒤에 열어 보고 아는 건 늦다.
      결제 알림이 들어와 숫자가 바뀔 때마다 확인한다.

      한 번 넘은 뒤로는 3만 원 더 나빠질 때마다만 다시 알린다. 결제마다 알리면
      알림을 끄게 되고, 그러면 정작 필요한 순간에도 안 보인다.
      다시 플러스로 돌아오면 기억을 지운다(다음에 또 넘으면 알려야 하니까).
    */
    private fun warnIfShort(ctx: Context, json: String) {
        val s = try { JSONObject(json) } catch (e: Exception) { return }
        if (!s.optBoolean("hasPay", false)) return
        val can = s.optLong("canSpend", 0L)
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        if (can >= 0) { p.edit().remove(WARNED).apply(); return }
        val warned = p.getLong(WARNED, Long.MAX_VALUE)
        if (warned != Long.MAX_VALUE && can > warned - WARN_STEP) return
        p.edit().putLong(WARNED, can).apply()
        notify(
            ctx, CH_WARN, ID_WARN,
            "${s.optInt("month")}월 월급으로 ${won(-can)} 모자라요",
            "지금 안 낸 카드값과 고정지출을 다 내면 그만큼 부족해요",
        )
    }

    /** 아침 알림 — 오늘 쓸 수 있는 돈 한 줄. 결제일이 사흘 안이면 그것부터 알린다 */
    fun daily(ctx: Context) {
        val (title, text) = line(ctx) ?: return
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong(DAILY, System.currentTimeMillis()).apply()
        val d = read(ctx)?.optJSONObject("due")
        val days = d?.optInt("days", -1) ?: -1
        if (d != null && days in 0..3) {
            notify(
                ctx, CH_DAILY, ID_DAILY,
                dueLine(ctx) ?: title,
                "카드 앱 '결제 예정 금액'과 한 번 맞춰 보세요 — 알림 없이 지나간 결제가 있을 수 있어요 · $text",
            )
            return
        }
        notify(ctx, CH_DAILY, ID_DAILY, title, text)
    }

    fun notify(ctx: Context, channel: String, id: Int, title: String, text: String) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CH_DAILY, "오늘 쓸 수 있는 돈", NotificationManager.IMPORTANCE_DEFAULT)
            )
            nm.createNotificationChannel(
                NotificationChannel(CH_WARN, "월급 초과 경고", NotificationManager.IMPORTANCE_HIGH)
            )
        }
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(ctx, channel)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { nm.notify(id, n) } catch (e: Exception) { /* 알림 권한이 없으면 조용히 넘어간다 */ }
    }

    /*
      매일 아침 8시. **정확한 알람이 아니라 대략의 알람**을 쓴다(setInexactRepeating) —
      안드로이드 12부터 정확한 알람은 따로 권한을 받아야 하는데, 몇 분 늦어도 아무 상관이 없다.
      앱을 열 때마다와 폰을 켤 때(Daily의 BOOT_COMPLETED) 다시 건다.
    */
    fun scheduleDaily(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pi = PendingIntent.getBroadcast(
            ctx, 1, Intent(ctx, Daily::class.java).setAction(Daily.ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val at = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 8); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        try {
            am.setInexactRepeating(AlarmManager.RTC, at.timeInMillis, AlarmManager.INTERVAL_DAY, pi)
        } catch (e: Exception) { /* 못 걸어도 앱은 돈다 — 위젯은 그대로 보인다 */ }
    }
}
