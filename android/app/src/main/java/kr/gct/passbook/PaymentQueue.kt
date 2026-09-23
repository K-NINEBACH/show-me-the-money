package kr.gct.passbook

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/*
  알림에서 건져 낸 결제 문구를 담아 두는 자리.

  왜 큐가 필요한가 — 알림은 앱이 꺼져 있을 때도 온다. 웹 화면이 떠 있을 때만
  받을 수 있게 만들면 밤사이 온 결제는 통째로 사라진다. 그래서 알림을 받는
  즉시 여기에 쌓아 두고, 웹이 켜질 때 가져가게 한다.

  SharedPreferences에 JSON 문자열로 넣는다. 건수가 하루 몇 개라 DB를 쓸 일이
  아니고, 앱이 죽어도 남아야 하므로 메모리에 둘 수도 없다.

  **가져가면 지운다.** 두 번 등록되는 것이 안 등록되는 것보다 나쁘다 —
  가계부에서 같은 지출이 두 줄이면 합계가 조용히 부풀고, 나중에 어느 줄이
  가짜인지 알 방법이 없다.
*/
object PaymentQueue {
    private const val PREF = "passbook_native"
    private const val KEY = "pending"

    /** 무한히 쌓이는 걸 막는다. 폰을 오래 안 열어도 최근 것부터 남게. */
    private const val MAX = 200
    private const val LOG = "log"
    private const val LAST = "last_any"

    @Synchronized
    fun push(ctx: Context, pkg: String, text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        val arr = read(ctx)

        /*
          같은 알림이 여러 번 오는 일이 흔하다(내용 갱신, 그룹 요약 등).
          최근 것과 글자가 같으면 흘려보낸다 — 중복 등록이 제일 나쁘다.
        */
        for (i in maxOf(0, arr.length() - 5) until arr.length()) {
            if (arr.getJSONObject(i).optString("text") == trimmed) return
        }

        arr.put(
            JSONObject()
                .put("text", trimmed)
                .put("pkg", pkg)
                .put("at", System.currentTimeMillis())
        )

        val out = JSONArray()
        val from = maxOf(0, arr.length() - MAX)
        for (i in from until arr.length()) out.put(arr.get(i))

        prefs(ctx).edit().putString(KEY, out.toString()).apply()
    }

    /** 쌓인 것을 전부 돌려주고 비운다. */
    @Synchronized
    fun drain(ctx: Context): String {
        val s = prefs(ctx).getString(KEY, "[]") ?: "[]"
        prefs(ctx).edit().remove(KEY).apply()
        return s
    }

    @Synchronized
    fun count(ctx: Context): Int = read(ctx).length()

    /*
      **진단용 흔적**(2026-09-12). 결제가 안 들어왔을 때 어디서 끊겼는지 볼 수 있게.
        · markSeen — 어떤 앱 알림이든 마지막으로 본 시각. 이게 오래됐으면 리스너가 죽은 것
        · log      — 금액이 든 알림을 결제로 봤는지(담았는지) 최근 30건
      큐와 달리 웹이 가져가도 지우지 않는다.
    */
    fun markSeen(ctx: Context, pkg: String) {
        prefs(ctx).edit().putString(LAST, JSONObject().put("at", System.currentTimeMillis()).put("pkg", pkg).toString()).apply()
    }

    @Synchronized
    fun log(ctx: Context, pkg: String, text: String, accepted: Boolean) {
        val arr = try { JSONArray(prefs(ctx).getString(LOG, "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
        val t = text.trim()
        if (arr.length() > 0 && arr.getJSONObject(arr.length() - 1).optString("text") == t) return
        arr.put(JSONObject().put("pkg", pkg).put("text", t.take(200)).put("at", System.currentTimeMillis()).put("accepted", accepted))
        val out = JSONArray()
        for (i in maxOf(0, arr.length() - 30) until arr.length()) out.put(arr.get(i))
        prefs(ctx).edit().putString(LOG, out.toString()).apply()
    }

    fun diagnostics(ctx: Context): JSONObject {
        val last = try { JSONObject(prefs(ctx).getString(LAST, "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
        val log = try { JSONArray(prefs(ctx).getString(LOG, "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
        return JSONObject().put("last", last).put("log", log)
    }

    private fun read(ctx: Context): JSONArray =
        try {
            JSONArray(prefs(ctx).getString(KEY, "[]") ?: "[]")
        } catch (e: Exception) {
            JSONArray()
        }

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
}
