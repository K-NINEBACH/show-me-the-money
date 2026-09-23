package kr.gct.passbook

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject

/*
  가계부 데이터를 폰의 '다운로드' 폴더에 자동으로 떨어뜨린다.

  왜 앱 전용 폴더가 아닌가 — **앱을 지우면 같이 지워지기 때문이다.** 백업이
  막아야 하는 사고가 정확히 그것(앱을 지우거나 다시 깔아야 하는 상황)인데,
  앱과 운명을 같이하는 자리에 두면 아무것도 못 막는다.

  다운로드 폴더에 쓰면 앱을 지워도 파일이 남고, 파일 관리자로 열어 볼 수 있고,
  구글 드라이브 자동 백업 대상에도 들어간다. 권한도 따로 필요 없다 —
  MediaStore로 우리가 만든 파일만 다루기 때문이다.

  **하루에 한 파일.** 같은 날 여러 번 저장하면 그날 파일을 덮어쓴다. 데이터가
  바뀔 때마다 새 파일을 만들면 한 달에 수백 개가 쌓여서, 정작 복구할 때 어느
  것을 골라야 하는지 알 수 없게 된다.
*/
object BackupStore {

    private const val DIR = "Download/내돈챙겨줘"
    private const val PREFIX = "가계부-백업-"
    private const val SUFFIX = ".json"

    /** 며칠치를 남길지. 넘으면 오래된 것부터 지운다. */
    private const val KEEP = 30

    /** 오늘 자 파일에 저장한다. 성공하면 파일 이름을 돌려준다. */
    fun save(ctx: Context, json: String): String? {
        if (json.isBlank()) return null
        val name = PREFIX + today() + SUFFIX

        return try {
            // 같은 날 파일이 있으면 지우고 새로 쓴다 — 덮어쓰기가 안전하게 되는 방법
            deleteByName(ctx, name)

            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.RELATIVE_PATH, DIR)
            }
            val uri = ctx.contentResolver.insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
            ) ?: return null

            ctx.contentResolver.openOutputStream(uri)?.use { out ->
                out.write(json.toByteArray(Charsets.UTF_8))
            } ?: return null

            prune(ctx)
            name
        } catch (e: Exception) {
            /*
              백업이 실패해도 앱은 계속 돌아야 한다. 저장 공간이 없거나 제조사가
              경로를 막아 둔 경우가 있는데, 그것 때문에 가계부를 못 쓰게 되면
              본말이 뒤집힌다. 실패는 false로만 알리고 화면이 판단한다.
            */
            null
        }
    }

    /** 백업 목록 — 최신순. [{name, size}] */
    fun list(ctx: Context): String {
        val arr = JSONArray()
        try {
            ctx.contentResolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                arrayOf(
                    MediaStore.Downloads.DISPLAY_NAME,
                    MediaStore.Downloads.SIZE,
                ),
                "${MediaStore.Downloads.RELATIVE_PATH} LIKE ? AND ${MediaStore.Downloads.DISPLAY_NAME} LIKE ?",
                arrayOf("%$DIR%", "$PREFIX%"),
                "${MediaStore.Downloads.DISPLAY_NAME} DESC",
            )?.use { c ->
                val nameIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME)
                val sizeIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.SIZE)
                while (c.moveToNext()) {
                    arr.put(
                        JSONObject()
                            .put("name", c.getString(nameIdx))
                            .put("size", c.getLong(sizeIdx))
                    )
                }
            }
        } catch (e: Exception) {
            // 목록을 못 읽어도 빈 배열을 준다 — 화면이 "백업 없음"으로 그리면 된다
        }
        return arr.toString()
    }

    /** 파일 하나를 글자로 읽어 온다. 없으면 빈 문자열. */
    fun read(ctx: Context, name: String): String {
        if (!name.startsWith(PREFIX)) return ""   // 우리 파일만 읽는다
        return try {
            val uri = findByName(ctx, name) ?: return ""
            ctx.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    /* ── 안쪽 ─────────────────────────────────────────────────────────── */

    private fun today(): String {
        val c = java.util.Calendar.getInstance()
        return "%04d-%02d-%02d".format(
            c.get(java.util.Calendar.YEAR),
            c.get(java.util.Calendar.MONTH) + 1,
            c.get(java.util.Calendar.DAY_OF_MONTH),
        )
    }

    private fun findByName(ctx: Context, name: String): android.net.Uri? {
        ctx.contentResolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            arrayOf(MediaStore.Downloads._ID),
            "${MediaStore.Downloads.DISPLAY_NAME} = ?",
            arrayOf(name),
            null,
        )?.use { c ->
            if (c.moveToFirst()) {
                val id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Downloads._ID))
                return android.content.ContentUris.withAppendedId(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, id
                )
            }
        }
        return null
    }

    private fun deleteByName(ctx: Context, name: String) {
        try {
            findByName(ctx, name)?.let { ctx.contentResolver.delete(it, null, null) }
        } catch (e: Exception) {
            /* 못 지워도 아래에서 새 파일이 생긴다 */
        }
    }

    /** 오래된 백업을 지운다. 이름이 날짜라 문자열 정렬이 곧 시간 정렬이다. */
    private fun prune(ctx: Context) {
        try {
            val names = JSONArray(list(ctx)).let { arr ->
                (0 until arr.length()).map { arr.getJSONObject(it).getString("name") }
            }
            names.drop(KEEP).forEach { deleteByName(ctx, it) }
        } catch (e: Exception) {
            /* 정리는 다음 기회에 */
        }
    }
}
