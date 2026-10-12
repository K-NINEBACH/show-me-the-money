package kr.gct.passbook

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/*
  **크기별 홈 화면 위젯**(1.8, 2026-10-12) — 차선생 위젯처럼 한 가지 그리기 코드를 크기 칸마다 이름만 달리해 쓴다.
    2×2 · 5칸 한 줄(5×1) · 5×2 기본 · 5×3 식 보기 · 5×4 전부
  기존 3×1(SummaryWidget)은 그대로 둔다 — 이미 놓인 위젯이 끊기지 않게.

  **숫자는 여기서 만들지 않는다.** 웹이 넘긴 요약(Summary)을 글자로 옮기기만 한다. 상태 문구(여유·빠듯·모자람)도
  웹이 정해 넘긴 것을 그대로 쓴다 — 위젯이 따로 판단하면 홈은 '빠듯'인데 위젯은 '여유'가 된다.
  옛 요약(1.7 이하가 넘긴 것)엔 식 값이 없어서, 없는 줄은 숨긴다.
*/
open class SizedWidget(private val kind: String) : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id, kind)
    }

    companion object {
        private val CLASSES = listOf(
            WidgetS22::class.java, WidgetW51::class.java, WidgetW52::class.java, WidgetW53::class.java, WidgetW54::class.java,
        )

        fun refresh(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx) ?: return
            for (cls in CLASSES) {
                val ids = try { manager.getAppWidgetIds(ComponentName(ctx, cls)) } catch (e: Exception) { continue }
                val kind = when (cls) {
                    WidgetS22::class.java -> "22"; WidgetW51::class.java -> "51"; WidgetW52::class.java -> "52"
                    WidgetW53::class.java -> "53"; else -> "54"
                }
                for (id in ids) draw(ctx, manager, id, kind)
            }
        }

        fun count(ctx: Context): Int = try {
            val manager = AppWidgetManager.getInstance(ctx)
            CLASSES.sumOf { manager.getAppWidgetIds(ComponentName(ctx, it)).size }
        } catch (e: Exception) { 0 }

        private const val GOOD = 0xFF2F6B10.toInt()
        private const val WARN = 0xFFB45F06.toInt()
        private const val DANGER = 0xFFC62828.toInt()
        private const val MUTED = 0xFF6B7A62.toInt()

        private fun layoutOf(kind: String) = when (kind) {
            "22" -> R.layout.widget_w22
            "51" -> R.layout.widget_w51
            "52" -> R.layout.widget_w52
            "53" -> R.layout.widget_w53
            else -> R.layout.widget_w54
        }

        private fun signedWon(n: Long, plus: Boolean): String =
            (if (plus) "+" else "−") + Summary.won(Math.abs(n))

        private fun draw(ctx: Context, manager: AppWidgetManager, id: Int, kind: String) {
            val v = RemoteViews(ctx.packageName, layoutOf(kind))
            val s: JSONObject? = Summary.read(ctx)
            val hasBar = kind == "22" || kind == "52" || kind == "54"
            val hasToday = kind == "52" || kind == "54"
            val hasPill = kind == "52" || kind == "54"
            val hasSub = kind != "22"
            val rowCount = when (kind) { "53" -> 4; "54" -> 5; else -> 0 }

            if (s == null || !s.optBoolean("hasPay", false)) {
                v.setTextViewText(R.id.w_title, "내 돈 챙겨줘")
                v.setTextViewText(R.id.w_amount, "—")
                val msg = if (s == null) "앱을 한 번 열어 주세요" else "설정에서 월급을 적어 주세요"
                if (kind == "22") v.setTextViewText(R.id.w_status, msg)
                else if (hasSub) v.setTextViewText(R.id.w_sub, msg)
                if (hasPill) v.setTextViewText(R.id.w_status, "")
                if (hasToday) v.setViewVisibility(R.id.w_today, View.GONE)
                if (hasBar) { v.setViewVisibility(R.id.w_bar_ok, View.GONE); v.setViewVisibility(R.id.w_bar_over, View.GONE) }
                for (i in 1..rowCount) v.setViewVisibility(rowId(i), View.GONE)
                click(ctx, v)
                try { manager.updateAppWidget(id, v) } catch (e: Exception) { }
                return
            }

            val can = s.optLong("canSpend", 0L)
            val per = s.optLong("perDay", 0L)
            val left = s.optInt("daysLeft", 0)
            val hasEq = s.has("today")
            val today = s.optLong("today", 0L)
            val short = can < 0
            val over = per > 0 && today > per
            val state = s.optString("state", if (short) "danger" else "good")
            val color = when (state) { "danger" -> DANGER; "warn" -> WARN; else -> GOOD }
            val head = s.optString("head", "")

            v.setTextViewText(R.id.w_title, if (short) "월급 들어와도 모자라는 돈" else "카드로 더 써도 되는 돈")
            v.setTextViewText(R.id.w_amount, (if (short) "-" else "") + Summary.won(Math.abs(can)))
            v.setTextColor(R.id.w_amount, color)
            v.setTextViewText(R.id.w_per, if (short) "" else "하루 ${Summary.won(per)}")

            // 아래 작은 줄 — 말일까지 N일 · (낡았으면 N일 전 기준) · 결제일이 일주일 안이면 "10/12(내일) … 나가요"
            if (hasSub) {
                val due = Summary.dueLineOrNull(ctx)?.let { " · $it" } ?: ""
                v.setTextViewText(R.id.w_sub, "말일까지 ${left}일${Summary.staleTag(ctx)}$due")
            }

            if (hasToday) {
                v.setTextViewText(
                    R.id.w_today,
                    if (!hasEq) "" else if (per <= 0) "오늘 ${Summary.won(today)} · 오늘 쓸 몫이 없어요"
                    else "오늘 ${Summary.won(today)} / 하루 몫 ${Summary.won(per)} · " +
                        (if (over) "${Summary.won(today - per)} 더 썼어요" else "${Summary.won(per - today)} 남았어요"),
                )
                v.setTextColor(R.id.w_today, MUTED)
            }
            if (hasBar) {
                val show = hasEq && per > 0
                val pct = if (per > 0) Math.min(100L, today * 100 / per).toInt() else 0
                v.setViewVisibility(R.id.w_bar_ok, if (show && !over) View.VISIBLE else View.GONE)
                v.setViewVisibility(R.id.w_bar_over, if (show && over) View.VISIBLE else View.GONE)
                v.setProgressBar(R.id.w_bar_ok, 100, pct, false)
            }
            if (kind == "22") {
                v.setTextViewText(R.id.w_status, if (head.isNotEmpty()) head.removeSuffix("!") else "")
                v.setTextColor(R.id.w_status, color)
            }
            if (hasPill) {
                v.setTextViewText(R.id.w_status, head)
                v.setTextColor(R.id.w_status, color)
                v.setViewVisibility(R.id.w_pill, if (head.isEmpty()) View.GONE else View.VISIBLE)
                v.setInt(R.id.w_pill, "setBackgroundResource",
                    when (state) { "danger" -> R.drawable.w_pill_danger; "warn" -> R.drawable.w_pill_warn; else -> R.drawable.w_pill_good })
            }

            // 식: 통장 + 월급 − 안 낸 카드값 − 고정지출 = 카드로 더 써도 되는 돈(위 큰 숫자)
            if (rowCount > 0) {
                val rows = ArrayList<Triple<String, Long, Boolean>>()
                if (hasEq) {
                    rows.add(Triple("통장", s.optLong("bank", 0L), true))
                    rows.add(Triple("월급", s.optLong("pay", 0L), true))
                    rows.add(Triple("안 낸 카드값", s.optLong("card", 0L), false))
                    if (rowCount == 4) {
                        rows.add(Triple("고정지출", s.optLong("fixedLeft", 0L) + s.optLong("fixedNext", 0L), false))
                    } else {
                        rows.add(Triple("남은 고정지출", s.optLong("fixedLeft", 0L), false))
                        rows.add(Triple("다음 달 고정지출", s.optLong("fixedNext", 0L), false))
                    }
                }
                for (i in 1..rowCount) {
                    val r = rows.getOrNull(i - 1)
                    if (r == null) { v.setViewVisibility(rowId(i), View.GONE); continue }
                    v.setViewVisibility(rowId(i), View.VISIBLE)
                    v.setTextViewText(labelId(i), r.first)
                    v.setTextViewText(valueId(i), signedWon(r.second, r.third))
                    v.setTextColor(valueId(i), if (r.third) GOOD else DANGER)
                }
            }

            click(ctx, v)
            try { manager.updateAppWidget(id, v) } catch (e: Exception) { /* 못 그려도 앱은 돈다 */ }
        }

        private fun rowId(i: Int) = when (i) { 1 -> R.id.r1; 2 -> R.id.r2; 3 -> R.id.r3; 4 -> R.id.r4; else -> R.id.r5 }
        private fun labelId(i: Int) = when (i) { 1 -> R.id.r1_l; 2 -> R.id.r2_l; 3 -> R.id.r3_l; 4 -> R.id.r4_l; else -> R.id.r5_l }
        private fun valueId(i: Int) = when (i) { 1 -> R.id.r1_v; 2 -> R.id.r2_v; 3 -> R.id.r3_v; 4 -> R.id.r4_v; else -> R.id.r5_v }

        private fun click(ctx: Context, v: RemoteViews) {
            v.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(
                    ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }
    }
}

class WidgetS22 : SizedWidget("22")
class WidgetW51 : SizedWidget("51")
class WidgetW52 : SizedWidget("52")
class WidgetW53 : SizedWidget("53")
class WidgetW54 : SizedWidget("54")
