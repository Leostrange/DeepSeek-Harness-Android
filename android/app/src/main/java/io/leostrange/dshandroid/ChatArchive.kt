package io.leostrange.dshandroid

import android.content.Context
import android.os.Environment
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Chat persistence: archives the DSH data directory (sessions, storages,
 * settings, agent profiles) to shared storage so conversations survive
 * app reinstalls and runtime resets.
 *
 * `.credentials.yaml` is deliberately NOT archived — it holds the browser
 * session grant secret and provider keys must not leave the private app
 * directory.
 */
internal object ChatArchive {

    private const val LATEST = "chats-latest.zip"
    private const val PREFIX = "chats-"

    /** DSH home inside the proot rootfs (host-side path). */
    fun dshHome(context: Context): File =
        File(context.filesDir, "runtime-root/data/data/com.termux/files/home/.dsh")

    /** Backup destination: shared storage when all-files access is granted,
     *  otherwise the app's private dir (survives updates, not uninstall). */
    fun backupDir(context: Context): File {
        return if (Environment.isExternalStorageManager()) {
            File(Environment.getExternalStorageDirectory(), "DSHA-backup")
        } else {
            File(context.filesDir, "backup")
        }
    }

    /** Entries worth persisting (relative to the .dsh directory). */
    private val INCLUDE = listOf("sessions", "storages", "profiles", "settings.yaml")

    fun hasChats(context: Context): Boolean =
        File(dshHome(context), "sessions").listFiles()?.isNotEmpty() == true

    /** Zips the chat data. Returns the archive file or null on failure/no data. */
    fun backupNow(context: Context): File? {
        return try {
            android.util.Log.d("ChatArchive", "backupNow called")
            val home = dshHome(context)
            android.util.Log.d("ChatArchive", "home=${home.path} isDir=${home.isDirectory}")
            if (!home.isDirectory) return null
            val dir = backupDir(context)
            if (!dir.isDirectory) dir.mkdirs()
            val out = File(dir, LATEST)
            val count = zipEntries(home, INCLUDE, out)
            if (count > 0) {
                // Keep a dated copy as well, so a broken newer backup can be skipped.
                runCatching {
                    out.copyTo(File(dir, "$PREFIX${System.currentTimeMillis()}.zip"), overwrite = true)
                }
                // Retain at most 5 dated copies.
                dir.listFiles { f -> f.name.startsWith(PREFIX) && f.name != LATEST }
                    ?.sortedByDescending { it.name }?.drop(5)?.forEach { it.delete() }
                out
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Restores the latest archive when the local chat store is empty.
     *  Returns the number of extracted entries. */
    fun restoreIfEmpty(context: Context): Int {
        return try {
            android.util.Log.d("ChatArchive", "restoreIfEmpty: hasChats=${hasChats(context)}")
            if (hasChats(context)) return 0
            val latest = File(backupDir(context), LATEST)
            android.util.Log.d("ChatArchive", "restoreIfEmpty: latest=${latest.path} isFile=${latest.isFile}")
            if (!latest.isFile) return 0
            val n = unzipInto(latest, dshHome(context))
            android.util.Log.d("ChatArchive", "restoreIfEmpty: extracted=$n")
            n
        } catch (e: Exception) {
            android.util.Log.d("ChatArchive", "restoreIfEmpty error: $e")
            0
        }
    }

    private fun zipEntries(home: File, include: List<String>, out: File): Int {
        var count = 0
        ZipOutputStream(out.outputStream().buffered()).use { zip ->
            for (name in include) {
                val root = File(home, name)
                android.util.Log.d("ChatArchive", "zip: $name exists=${root.exists()} isDir=${root.isDirectory}")
                if (!root.exists()) continue
                val files = if (root.isDirectory) root.walkTopDown().filter { it.isFile } else sequenceOf(root)
                for (f in files) {
                    android.util.Log.d("ChatArchive", "zip: + ${f.path}")
                    val rel = if (root.isDirectory) name + "/" + f.relativeTo(root).invariantSeparatorsPath else name
                    zip.putNextEntry(ZipEntry(rel))
                    f.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                    count++
                }
            }
        }
        android.util.Log.d("ChatArchive", "zip: total=$count out=${out.path}")
        if (count == 0) out.delete()
        return count
    }

    private fun unzipInto(archive: File, target: File): Int {
        var count = 0
        val canonicalTarget = target.canonicalFile
        ZipInputStream(archive.inputStream().buffered()).use { zip ->
            var entry: ZipEntry? = zip.nextEntry
            while (entry != null) {
                val out = File(target, entry.name)
                // Zip-slip guard: every entry must resolve inside the DSH home.
                if (!out.canonicalFile.path.startsWith(canonicalTarget.path)) {
                    entry = zip.nextEntry
                    continue
                }
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zip.copyTo(it) }
                    count++
                }
                entry = zip.nextEntry
            }
        }
        return count
    }
}
