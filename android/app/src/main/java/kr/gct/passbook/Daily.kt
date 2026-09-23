package kr.gct.passbook

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/*
  아침 알림을 띄우는 자리와, 폰을 켰을 때 알람을 다시 거는 자리.

  알람은 폰을 끄면 사라진다. 그래서 BOOT_COMPLETED에서 다시 건다 — 앱을 열어야만
  다시 걸리게 두면, 알림을 보고 앱을 여는 흐름이 통째로 끊긴다.
*/
class Daily : BroadcastReceiver() {
    companion object {
        const val ACTION = "kr.gct.passbook.DAILY"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Summary.scheduleDaily(ctx)
                SummaryWidget.refresh(ctx)
            }
            else -> {
                Summary.daily(ctx)
                SummaryWidget.refresh(ctx)
            }
        }
    }
}
