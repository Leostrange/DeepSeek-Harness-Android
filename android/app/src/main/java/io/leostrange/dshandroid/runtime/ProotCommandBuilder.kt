package io.leostrange.dshandroid.runtime

import java.io.File

data class ProotCommandSpec(
    val command: List<String>,
    val environment: Map<String, String>,
)

class ProotCommandBuilder(private val root: File) {
    fun build(guestCommand: List<String>, extraEnvironment: Map<String, String> = emptyMap()): ProotCommandSpec {
        require(guestCommand.isNotEmpty()) { "Guest command must not be empty" }
        val prefixHost = RuntimePaths.hostPrefix(root)
        val proot = File(prefixHost, "bin/proot")
        val libHost = File(prefixHost, "lib")
        val tmpHost = RuntimePaths.hostTmp(root)

        val guestEnvironment = linkedMapOf(
            "HOME" to RuntimePaths.HOME,
            "PREFIX" to RuntimePaths.PREFIX,
            "TMPDIR" to RuntimePaths.TMP,
            "PATH" to "${RuntimePaths.PREFIX}/bin:/system/bin:/system/xbin",
            "LD_LIBRARY_PATH" to "${RuntimePaths.PREFIX}/lib",
            "LD_PRELOAD" to "${RuntimePaths.PREFIX}/lib/libtermux-exec-direct-ld-preload.so",
            "SHELL" to "${RuntimePaths.PREFIX}/bin/bash",
            "DSH_NO_LANDLOCK" to "1",
            "NODE_OPTIONS" to "--max-old-space-size=2048",
            "npm_config_prefix" to RuntimePaths.PREFIX,
            "npm_config_cache" to "${RuntimePaths.HOME}/.npm",
        ).apply { putAll(extraEnvironment) }

        val command = mutableListOf(
            proot.path,
            "--link2symlink",
            "-0",
            "-r", root.path,
        )
        listOf("/system", "/apex", "/dev", "/proc", "/sys", "/sdcard", "/storage")
            .filter { File(it).exists() }
            .forEach { bind -> command += listOf("-b", bind) }
        // The launcher itself needs host-visible Termux shared libraries before guest env is applied.
        command += listOf("-b", "${root.path}:${root.path}")
        command += listOf("-w", RuntimePaths.HOME)
        command += "${RuntimePaths.PREFIX}/bin/env"
        command += guestEnvironment.map { (key, value) -> "$key=$value" }
        command += guestCommand

        val hostEnvironment = linkedMapOf(
            "LD_LIBRARY_PATH" to libHost.path,
            "TMPDIR" to tmpHost.path,
            "PROOT_TMP_DIR" to tmpHost.path,
            "PROOT_LOADER" to File(prefixHost, "libexec/proot/loader").path,
        )
        return ProotCommandSpec(command, hostEnvironment)
    }
}
