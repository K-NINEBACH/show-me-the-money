package kr.gct.passbook

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/*
  홈 화면 위젯 — 앱을 열지 않고도 오늘 쓸 수 있는 돈이 보이게.

  숫자는 웹이 넘겨 준 요약(Summary)만 쓴다. 위젯은 자기 힘으로 가계부를 못 읽는다
  (데이터가 WebView의 localStorage 안에 있다). 그래서 **앱을 열어야 새 숫자가 된다**는
  한계가 있고, 그 대신 며칠 낡았으면 '(N일 전 기준)'을 같이 적는다.

  누르면 앱이 열린다.
*/
class SummaryWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id)
    }

    companion object {
        /** 요약이 바뀌었을 때 불러서 다시 그린다 */
        fun refresh(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx) ?: return
            val ids = try {
                manager.getAppWidgetIds(ComponentName(ctx, SummaryWidget::class.java))
            } catch (e: Exception) { return }
            for (id in ids) draw(ctx, manager, id)
        }

        fun count(ctx: Context): Int = try {
            AppWidgetManager.getInstance(ctx)
                .getAppWidgetIds(ComponentName(ctx, SummaryWidget::class.java)).size
        } catch (e: Exception) { 0 }

        private fun draw(ctx: Context, manager: AppWidgetManager, id: Int) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_summary)
            val s = Summary.read(ctx)
            if (s == null || !s.optBoolean("hasPay", false)) {
                v.setTextViewText(R.id.widget_title, "내 돈 챙겨줘")
                v.setTextViewText(R.id.widget_amount, "—")
                v.setTextViewText(R.id.widget_sub, if (s == null) "앱을 한 번 열어 주세요" else "설정에서 월급을 적어 주세요")
            } else {
                val can = s.optLong("canSpend", 0L)
                val short = can < 0
                v.setTextViewText(R.id.widget_title, if (short) "월급 들어와도 모자라는 돈" else "카드로 더 써도 되는 돈")
                v.setTextViewText(R.id.widget_amount, (if (short) "-" else "") + Summary.won(if (short) -can else can))
                v.setTextColor(R.id.widget_amount, if (short) 0xFFE25C5C.toInt() else 0xFFF2E8D5.toInt())
                // 아래 한 줄엔 하루 몫·남은 날, 결제일이 일주일 안이면 "10/12(3일 뒤) … 나가요"까지 붙는다(1.4)
                val (_, sub) = Summary.line(ctx) ?: ("" to "")
                v.setTextViewText(R.id.widget_sub, sub)
            }
            v.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(
                    ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            try { manager.updateAppWidget(id, v) } catch (e: Exception) { /* 못 그려도 앱은 돈다 */ }
        }
    }
}
