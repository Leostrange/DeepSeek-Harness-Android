package io.leostrange.dshandroid.runtime

import java.io.File

object RuntimePaths {
    const val PREFIX = "/data/data/com.termux/files/usr"
    const val HOME = "/data/data/com.termux/files/home"
    const val TMP = "$PREFIX/tmp"

    fun hostPrefix(root: File): File = File(root, "data/data/com.termux/files/usr")
    fun hostHome(root: File): File = File(root, "data/data/com.termux/files/home")
    fun hostTmp(root: File): File = File(root, "data/data/com.termux/files/usr/tmp")

    fun safeResolve(root: File, archiveEntryName: String): File {
        val normalized = archiveEntryName.replace('\\', '/').removePrefix("./")
        require(normalized.isNotBlank()) { "Empty archive path" }
        require(!normalized.startsWith('/')) { "Absolute archive path is not allowed: $archiveEntryName" }
        val rootCanonical = root.canonicalFile
        val candidate = File(rootCanonical, normalized).canonicalFile
        val rootPath = rootCanonical.path.trimEnd(File.separatorChar) + File.separator
        require(candidate.path == rootCanonical.path || candidate.path.startsWith(rootPath)) {
            "Archive path escapes runtime root: $archiveEntryName"
        }
        return candidate
    }
}
