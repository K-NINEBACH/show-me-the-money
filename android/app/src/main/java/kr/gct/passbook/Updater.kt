package kr.gct.passbook

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/*
  껍데기 스스로 업데이트(1.9, 2026-10-30).

  사용자: "업데이트 자동으로 앱 들어갈 때마다 자동으로 되게 할 수는 없나?"
  웹은 원래 들어갈 때마다 새 버전으로 바뀐다(main.jsx). 껍데기(알림 읽기·위젯)만 APK를 손으로
  다시 깔아야 했다.

    1. 앱을 열 때(3시간에 한 번) 배포 주소의 `apk/latest.json`을 본다 — 버전 번호·APK 주소·sha256.
    2. 지금보다 새것이면 받아 두고 sha256을 맞춰 본다(다르면 버린다).
    3. 설치는 PackageInstaller로. 이 앱이 '설치한 앱'으로 적혀 있으면(한 번 스스로 업데이트한 뒤)
       안드로이드 12+는 묻지 않고 깐다 → **앱을 벗어날 때** 건다(쓰는 중에 꺼지지 않게).
       아니면(처음 한 번) 시스템 '업데이트할까요?' 창이 떠야 하므로 **앱을 보고 있을 때** 건다.

  서명이 다르면 안드로이드가 거부한다 — 같은 키(passbook.jks)로 만든 것만 깔린다.
  데이터(WebView localStorage)는 덮어 설치라 그대로 남는다.
*/
object Updater {
    private const val PREFS = "updater"
    private const val CHECK_EVERY_MS = 3 * 60 * 60 * 1000L
    private const val ACTION_STATUS = "kr.gct.passbook.UPDATE_STATUS"

    @Volatile private var busy = false

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun currentCode(ctx: Context): Long = try {
        val p = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()
    } catch (e: Exception) { Long.MAX_VALUE }

    /* 이 앱을 깐 게 이 앱 자신인가 — 그래야 묻지 않고 업데이트할 수 있다 */
    private fun selfInstalled(ctx: Context): Boolean = try {
        val who = if (Build.VERSION.SDK_INT >= 30) ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName
        else @Suppress("DEPRECATION") ctx.packageManager.getInstallerPackageName(ctx.packageName)
        who == ctx.packageName
    } catch (e: Exception) { false }

    private fun apkFile(ctx: Context) = File(File(ctx.cacheDir, "update").apply { mkdirs() }, "passbook.apk")

    /* 받아 둔 새 APK가 있으면 그 버전 번호, 없으면 0 */
    private fun readyCode(ctx: Context): Long {
        val code = prefs(ctx).getLong("readyCode", 0)
        return if (code > currentCode(ctx) && apkFile(ctx).exists()) code else 0
    }

    /** 앱을 열 때 — 새 버전을 찾아 받아 두고, 물어야 하는 설치면 지금 건다 */
    fun onForeground(ctx: Context) {
        val app = ctx.applicationContext
        if (readyCode(app) > 0) {
            if (!selfInstalled(app) || Build.VERSION.SDK_INT < 31) install(app)
            return
        }
        val p = prefs(app)
        if (System.currentTimeMillis() - p.getLong("checkedAt", 0) < CHECK_EVERY_MS) return
        if (busy) return
        busy = true
        Thread {
            try {
                p.edit().putLong("checkedAt", System.currentTimeMillis()).apply()
                if (fetch(app) && (!selfInstalled(app) || Build.VERSION.SDK_INT < 31)) {
                    // 받는 동안 앱을 벗어났으면 다음에 열 때 묻는다
                    if (MainActivity.visible) install(app)
                }
            } catch (e: Exception) {
                /* 인터넷이 없거나 파일이 이상하면 다음에 다시 본다 */
            } finally { busy = false }
        }.start()
    }

    /** 앱을 벗어날 때 — 묻지 않고 깔 수 있으면 이때 깐다 */
    fun onBackground(ctx: Context) {
        val app = ctx.applicationContext
        if (Build.VERSION.SDK_INT >= 31 && selfInstalled(app) && readyCode(app) > 0) install(app)
    }

    private fun fetch(ctx: Context): Boolean {
        val base = ctx.getString(R.string.app_url).trimEnd('/')
        val info = JSONObject(get("$base/apk/latest.json").toString(Charsets.UTF_8))
        val code = info.getLong("versionCode")
        if (code <= currentCode(ctx)) return false
        val bytes = get(info.getString("url"))
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        if (!sha.equals(info.getString("sha256"), ignoreCase = true)) return false
        apkFile(ctx).writeBytes(bytes)
        prefs(ctx).edit().putLong("readyCode", code).apply()
        return true
    }

    private fun get(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000
        c.readTimeout = 60000
        c.useCaches = false
        c.instanceFollowRedirects = true   // GitHub 릴리스 파일은 다른 주소로 한 번 넘긴다
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }

    private fun install(ctx: Context) {
        try {
            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                val f = apkFile(ctx)
                s.openWrite("passbook.apk", 0, f.length()).use { out -> f.inputStream().use { it.copyTo(out) }; s.fsync(out) }
                val intent = Intent(ctx, UpdateReceiver::class.java).setAction(ACTION_STATUS)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                s.commit(PendingIntent.getBroadcast(ctx, 0, intent, flags).intentSender)
            }
        } catch (e: Exception) { /* 못 깔면 다음에 다시 — 받아 둔 파일은 그대로 */ }
    }

    /* 설치 결과. 처음 한 번은 '업데이트할까요?' 창을 띄워야 한다 */
    class UpdateReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                    if (confirm != null && MainActivity.visible) {
                        try { context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) { }
                    }
                }
                PackageInstaller.STATUS_SUCCESS -> apkFile(context).delete()
                else -> { /* 거절·실패 — 다음에 열 때 다시 묻는다 */ }
            }
        }
    }
}
