package kr.gct.passbook

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/*
  카드사·은행 알림을 읽어 큐에 넣는 자리.

  이게 이 앱이 존재하는 이유 전부다. 웹앱(PWA)만으로는 알림을 볼 수 없다 —
  권한 문제가 아니라 브라우저에 그 통로가 없다. 그래서 웹 화면을 그대로
  감싸고, 안드로이드만 할 수 있는 이 한 가지를 옆에 붙였다.

  **아무 알림이나 담지 않는다.** 카톡·게임까지 다 쌓이면 큐가 쓰레기통이 되고,
  그걸 훑는 사람이 결국 앱을 안 쓰게 된다. 보내는 앱이 금융 앱이거나 문구에
  결제/승인 같은 말이 있을 때만 담는다.

  **읽기만 한다.** 알림을 지우거나 답하지 않는다. 이 권한은 마음만 먹으면
  폰의 모든 알림을 볼 수 있는 힘이라, 필요한 것만 만지는 게 맞다.
*/
class PaymentListener : NotificationListenerService() {

    /*
      **연결되는 순간 이미 떠 있는 알림을 한 번 훑는다.**

      onNotificationPosted는 알림이 '뜨는 그 순간'에만 불린다. 그래서 그때
      이 서비스가 안 돌고 있었으면 그 알림은 화면에 계속 남아 있어도 영영
      안 잡힌다. 실제로 그 일이 있었다 — 22:54에 온 출금 알림이 다음 날까지
      알림창에 그대로 있는데 앱에는 한 건도 안 들어와 있었다.

      안 돌고 있는 경우가 드물지 않다. 권한을 막 켰을 때, 앱을 새로 깔거나
      업데이트한 뒤, 안드로이드가 메모리 때문에 서비스를 죽였다가 다시
      띄울 때 모두 여기를 지난다.

      알림창에 남아 있는 것만 보이므로 지난 것을 다 되살리진 못한다. 그래도
      **사람이 아직 안 지운 알림은 대개 아직 처리 안 한 것**이라, 놓치는
      자리를 크게 줄인다. 같은 알림을 두 번 담는 건 PaymentQueue가 같은
      문구를 걸러내므로 걱정 없다.
    */
    override fun onListenerConnected() {
        super.onListenerConnected()
        connected = true
        val current = try {
            activeNotifications
        } catch (e: Exception) {
            null
        } ?: return
        for (sbn in current) collect(sbn)
    }

    /*
      **끊긴 걸 알 수 있게 한다**(2026-09-12). 삼성 폰은 배터리 관리로 이 서비스를
      자주 끊는다. 끊기면 알림이 와도 조용히 아무 일도 없고, 설정의 권한은 여전히
      '켜짐'이라 사람이 알 길이 없었다. 연결 상태를 들고 있다가, 앱을 열 때 끊겨
      있으면 MainActivity가 다시 잇는다(requestRebind).
    */
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        connected = false
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // 어떤 알림이든 봤다는 흔적 — 리스너가 살아 있는지 사람이 확인하는 용도
        PaymentQueue.markSeen(applicationContext, sbn.packageName ?: "")
        collect(sbn)
    }

    private fun collect(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        val n = sbn.notification ?: return
        val extras = n.extras ?: return

        // 묶음 요약 알림("새 메시지 2개")은 아래 개별 알림과 같은 내용이라 건너뛴다
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val title = extras.getCharSequence("android.title")?.toString().orEmpty()

        for (body in bodiesOf(extras)) {
            val joined = listOf(title, body).filter { it.isNotBlank() }.joinToString(" ")
            if (joined.isBlank()) continue
            val ok = looksLikePayment(pkg, joined)
            // 금액이 든 알림은 담든 안 담든 기록을 남긴다 — "왜 안 들어왔지"를 볼 수 있게
            if (MONEY.containsMatchIn(joined)) PaymentQueue.log(applicationContext, pkg, joined, ok)
            if (ok) PaymentQueue.push(applicationContext, pkg, joined)
        }
    }

    /*
      **대화형 알림은 한 통씩 전부 읽는다**(2026-09-12).

      카드 결제 문자는 문자 앱(삼성 메시지)으로 오는데, 같은 발신자의 문자가 쌓이면
      알림 하나에 여러 통을 묶어(MessagingStyle) android.messages에 담는다. 예전엔
      제목·본문 한 줄만 읽어서 묶인 문자 중 최신 것 말고는 못 볼 수 있었다 —
      특히 리스너가 끊겼다가 다시 이어져 알림창을 훑을 때. 같은 문구를 두 번 담는
      건 PaymentQueue와 웹이 걸러낸다.
    */
    @Suppress("DEPRECATION")
    private fun bodiesOf(extras: Bundle): List<String> {
        val out = mutableListOf<String>()
        val msgs = try { extras.getParcelableArray("android.messages") } catch (e: Exception) { null }
        if (msgs != null) {
            for (m in msgs) {
                val t = (m as? Bundle)?.getCharSequence("text")?.toString()
                if (!t.isNullOrBlank()) out.add(t)
            }
        }
        if (out.isEmpty()) {
            val text = extras.getCharSequence("android.text")?.toString().orEmpty()
            val big = extras.getCharSequence("android.bigText")?.toString().orEmpty()
            // 긴 본문이 있으면 그쪽이 원문에 가깝다 — 짧은 text는 잘려 있곤 하다
            val body = if (big.isNotBlank()) big else text
            if (body.isNotBlank()) out.add(body)
        }
        return out
    }

    /*
      결제 알림인가.

      두 갈래로 본다. 하나라도 걸리면 담는다 — 놓치는 것보다 몇 개 더 담기는
      편이 낫다. 어차피 사람이 보고 확인하는 구조라, 잘못 담긴 건 넘기면 되고
      안 담긴 건 영영 모른다.

      1) 보내는 앱이 금융 앱인가 (패키지 이름에 은행·카드사 표시)
      2) 문구에 결제 관련 말과 금액이 함께 있는가

      문자 앱(메시지)은 1번에 안 걸리므로 2번으로 잡는다. 카드 결제 문자가
      대개 그쪽으로 오기 때문이다.
    */
    companion object {
        /*
          결제 알림으로 보이나. 문자함을 읽는 SmsInbox도 같은 기준을 쓴다.

          **광고는 거른다**(2026-09-13). 광고 문자는 법으로 '(광고)'를 앞에 달게 돼 있다.
          "(광고) 결제 시 3,000원 할인"에는 금액과 '결제'가 다 있어서, 카드가 하나뿐이면
          웹이 그대로 카드 결제로 넣을 수 있었다.
        */
        fun looksLikePayment(pkg: String, text: String): Boolean {
            if (AD.containsMatchIn(text)) return false
            val p = pkg.lowercase()
            val financial = FINANCIAL_HINTS.any { p.contains(it) }

            val hasMoney = MONEY.containsMatchIn(text)
            val hasWord = KEYWORDS.any { text.contains(it) }

            // 금융 앱이면 금액만 있어도 담고, 그 외(문자 등)는 말과 금액이 다 있어야 한다
            return if (financial) hasMoney else (hasMoney && hasWord)
        }

        fun hasMoney(text: String): Boolean = MONEY.containsMatchIn(text)

        private val AD = Regex("""[(\[]\s*광고\s*[)\]]""")

        /** 지금 알림을 받고 있나. 앱을 열 때 false면 다시 잇는다 */
        @Volatile var connected = false

        private val FINANCIAL_HINTS = listOf(
            "bank", "card", "pay", "shinhan", "kbstar", "kbcard", "wooribank",
            "hanabank", "nonghyup", "nhbank", "ibk", "kakaobank", "kakaopay",
            "tossbank", "toss", "hyundaicard", "lottecard", "samsungcard",
            "bccard", "hanacard", "citibank", "sc", "kbanknow", "mysms",
            // 삼성 메시지·구글 메시지 — 카드 결제 문자가 여기로 온다
            "com.samsung.android.messaging", "com.google.android.apps.messaging",
        )

        /** 1,000원 이상만 — "3원" 같은 잡음을 거른다 */
        private val MONEY = Regex("""[\d,]{3,}\s*원""")

        private val KEYWORDS = listOf(
            "승인", "결제", "출금", "입금", "이체", "사용", "취소", "매출", "청구",
        )
    }
}
