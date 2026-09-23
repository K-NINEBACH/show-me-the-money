package kr.gct.passbook

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import org.json.JSONObject
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/*
  웹앱을 그대로 감싸는 껍데기.

  화면은 하나도 새로 만들지 않는다. 이미 쓰고 있는 가계부를 WebView로 띄우고,
  안드로이드만 할 수 있는 것(알림 읽기) 하나만 옆에 붙인다. 화면을 다시
  만들면 두 벌을 계속 맞춰야 하고, 그건 언젠가 반드시 갈라진다.

  **원격 주소를 띄운다.** 앱 안에 파일을 넣고 띄우면 앱을 다시 깔아야 갱신되지만,
  주소를 띄우면 Vercel에 올리는 순간 반영된다. 서비스워커가 캐시하므로
  비행기 모드에서도 뜬다.

  **저장소가 크롬과 다르다.** WebView는 자기 저장소를 쓴다. 크롬에 있던 기록은
  설정 > 내보내기 → 이 앱에서 가져오기로 한 번 옮겨야 한다. 그 뒤로는 이
  앱에서만 쓴다 — 두 곳을 오가면 어느 쪽이 최신인지 알 수 없게 된다.
*/
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView

    companion object {
        private const val REQ_SMS = 71
        private const val REQ_NOTIFY = 72
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage — 이 앱의 데이터가 전부 여기 있다
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
        }
        web.webChromeClient = WebChromeClient()
        web.webViewClient = WebViewClient()

        // 웹에서 window.PassbookNative 로 부를 수 있게 한다
        web.addJavascriptInterface(Bridge(), "PassbookNative")

        /*
          뒤로 가기는 웹의 히스토리를 먼저 쓴다. 안 그러면 탭을 하나 옮겼을 뿐인데
          앱이 통째로 꺼진다.
        */
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        /*
          아침 알림(1.3)을 걸어 둔다. 알람은 재부팅되면 사라지므로 앱을 열 때마다 다시 건다
          (폰을 켤 때는 Daily가 BOOT_COMPLETED로 건다).

          안드로이드 13부터 알림은 사람이 한 번 허용해야 뜬다. 창을 한 번만 띄우고,
          거절해도 위젯은 그대로 보이므로 더 조르지 않는다.
        */
        Summary.scheduleDaily(this)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
        ) {
            try { requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), REQ_NOTIFY) } catch (e: Exception) { /* 못 물어도 앱은 돈다 */ }
        }

        web.loadUrl(getString(R.string.app_url))
    }

    /*
      화면을 벗어날 때 백업을 받아 둔다.

      기록을 남기고 앱을 닫는 게 가장 흔한 흐름이라, 그 순간이 데이터가
      가장 최신인 지점이다. 데이터가 바뀔 때마다 저장하면 글자 하나 칠
      때마다 파일을 쓰게 된다.
    */
    override fun onPause() {
        super.onPause()
        web.evaluateJavascript(
            "window.dispatchEvent(new Event('passbook-native-pause'))",
            null,
        )
    }

    override fun onResume() {
        super.onResume()
        /*
          **리스너가 끊겨 있으면 다시 잇는다**(2026-09-12).

          삼성 폰은 배터리 관리로 알림 리스너를 자주 끊는다. 끊기면 권한은 '켜짐'
          그대로인데 알림이 하나도 안 잡힌다 — 카드 결제가 등록도 안 되고 알림함에도
          없던 이유로 가장 유력하다. 앱을 열 때마다 확인해서 끊겨 있으면 다시 붙인다.
          다시 붙는 순간 onListenerConnected가 알림창에 남은 것을 훑는다.
        */
        if (hasAccess() && !PaymentListener.connected && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                NotificationListenerService.requestRebind(ComponentName(this, PaymentListener::class.java))
            } catch (e: Exception) {
                /* 못 붙여도 앱은 돈다 — 설정의 진단에 '끊김'으로 보인다 */
            }
        }
        /*
          화면으로 돌아올 때마다 웹에 알린다. 웹은 이 신호를 받으면 쌓인 알림을
          가져간다 — 앱을 열어 두는 동안 결제가 생겨도 바로 뜨게.
        */
        web.evaluateJavascript(
            "window.dispatchEvent(new Event('passbook-native-resume'))",
            null,
        )
    }

    @Deprecated("ComponentActivity의 권한 결과 콜백 — 이 앱은 권한이 하나뿐이라 이걸로 충분하다")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIFY) return   // 허용이든 거절이든 그대로 간다 — 위젯은 권한 없이도 보인다
        if (requestCode != REQ_SMS) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            // 허용하자마자 한 번 훑어서 웹이 바로 가져가게
            SmsInbox.scan(applicationContext, force = true)
            web.evaluateJavascript("window.dispatchEvent(new Event('passbook-native-resume'))", null)
        } else {
            /*
              다시 묻지 않음 상태거나, 폰이 '제한된 설정'으로 막았으면 창이 아예 안 뜬다.
              그땐 앱 정보를 열어 둔다 — 권한 > SMS에서 직접 켜면 된다.
            */
            try {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) { /* 못 열어도 앱은 돈다 */ }
        }
    }

    private fun hasAccess(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.contains(packageName)
    }

    private fun batteryOptimized(): Boolean {
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return false
        return !pm.isIgnoringBatteryOptimizations(packageName)
    }

    inner class Bridge {
        /** 쌓인 결제 알림을 JSON 배열로 넘기고 큐를 비운다 */
        /* 문자함에서 지난번 이후 온 결제 문자를 먼저 큐에 넣고(SmsInbox), 그다음 통째로 넘긴다 */
        @JavascriptInterface
        fun pullPending(): String {
            SmsInbox.scan(applicationContext)
            return PaymentQueue.drain(applicationContext)
        }

        /* 문자 읽기 권한을 묻는다. 거절하면 앱 정보 화면을 열어 직접 켤 수 있게 한다 */
        @JavascriptInterface
        fun requestSmsAccess() {
            runOnUiThread {
                if (SmsInbox.granted(this@MainActivity)) return@runOnUiThread
                requestPermissions(arrayOf(Manifest.permission.READ_SMS), REQ_SMS)
            }
        }

        @JavascriptInterface
        fun pendingCount(): Int = PaymentQueue.count(applicationContext)

        /*
          홈 맨 위 숫자를 받아 둔다(1.3). 위젯을 다시 그리고, 다음 달 월급으로 다 못 내게
          되면 그 자리에서 경고한다. **계산은 웹이 한다** — 여기선 글자로 옮기기만 한다.
        */
        @JavascriptInterface
        fun summary(json: String) {
            Summary.save(applicationContext, json)
        }

        /** 위젯·알림이 지금 어떤 상태인지(설정 화면 진단용) */
        @JavascriptInterface
        fun widgetState(): String = JSONObject()
            .put("notify", if (Build.VERSION.SDK_INT >= 33) checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED else true)
            .put("widgets", SummaryWidget.count(applicationContext))
            .put("lastDaily", Summary.lastDaily(applicationContext))
            .toString()

        /** 알림 접근 권한이 켜져 있나 */
        @JavascriptInterface
        fun hasNotificationAccess(): Boolean {
            val flat = Settings.Secure.getString(
                contentResolver,
                "enabled_notification_listeners",
            ) ?: return false
            return flat.contains(packageName)
        }

        /*
          권한 화면을 연다.

          이 권한은 앱이 코드로 켤 수 없다 — 사람이 설정에서 직접 켜야 한다.
          폰의 모든 알림을 볼 수 있는 힘이라 안드로이드가 그렇게 막아 뒀고,
          그건 맞는 설계다.
        */
        /*
          가계부 전체를 파일로 떨어뜨린다. 웹이 넘겨주는 JSON을 그대로 쓴다 —
          형식을 네이티브가 알 필요가 없고, 알면 웹이 바뀔 때마다 같이 고쳐야 한다.
        */
        @JavascriptInterface
        fun saveBackup(json: String): String = BackupStore.save(applicationContext, json) ?: ""

        @JavascriptInterface
        fun listBackups(): String = BackupStore.list(applicationContext)

        @JavascriptInterface
        fun readBackup(name: String): String = BackupStore.read(applicationContext, name)

        /*
          진단 — 설정 화면이 "알림이 어디서 끊겼나"를 보여 주는 데 쓴다.
            connected        지금 알림을 받고 있나
            batteryOptimized 배터리 최적화 대상인가(그러면 삼성이 리스너를 끊곤 한다)
            last             어떤 알림이든 마지막으로 본 시각
            log              금액이 든 알림을 결제로 봤는지 최근 30건
        */
        @JavascriptInterface
        fun diagnostics(): String {
            val d = PaymentQueue.diagnostics(applicationContext)
            d.put("connected", PaymentListener.connected)
            d.put("batteryOptimized", batteryOptimized())
            d.put("sms", JSONObject().put("granted", SmsInbox.granted(applicationContext)).put("lastScan", SmsInbox.lastScan(applicationContext)))
            d.put("version", try { packageManager.getPackageInfo(packageName, 0).versionName } catch (e: Exception) { "" })
            return d.toString()
        }

        /* 배터리 최적화에서 빼 달라고 묻는 창을 연다. 안 되면 최적화 목록 화면 */
        @JavascriptInterface
        fun openBatterySettings() {
            try {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e: Exception) {
                try {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e2: Exception) { /* 못 열어도 앱은 돈다 */ }
            }
        }

        @JavascriptInterface
        fun openNotificationAccessSettings() {
            startActivity(
                Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

}
