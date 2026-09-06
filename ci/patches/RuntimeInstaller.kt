package io.leostrange.dshandroid.runtime

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class RuntimeInstaller(private val context: Context) {

    /** Device ABI this runtime is installed for (arm64-v8a or x86_64). */
    val abi: String = NativeBuildConfig.preferredAbi(Build.SUPPORTED_ABIS.toList())

    val runtimeRoot: File = File(context.filesDir, "runtime-root")
    private val packageCache = File(context.cacheDir, "termux-packages")
    private val marker = File(runtimeRoot, ".dsh-runtime-installed")
    private val extractor = DebExtractor(File(context.cacheDir, "deb-extract"))

    fun isInstalled(): Boolean {
        if (!marker.isFile || !marker.readText().lineSequence().any { it == "schema=$RUNTIME_SCHEMA" }) return false
        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        return pathPresent(File(prefix, "bin/proot")) &&
            pathPresent(File(prefix, "bin/node")) &&
            pathPresent(File(prefix, "bin/npm")) &&
            NativeBuildConfig.requiredPackages.all { packageName ->
                when (packageName) {
                    "libandroid-spawn" -> pathPresent(File(prefix, "lib/libandroid-spawn.so"))
                    // binutils ships no binary named "binutils" — probe its tools instead.
                    "binutils" -> listOf("ld", "as", "ar").any { pathPresent(File(prefix, "bin/$it")) }
                    "pkg-config" -> pathPresent(File(prefix, "bin/pkg-config"))
                    "python" -> pathPresent(File(prefix, "bin/python"))
                    "termux-tools" -> pathPresent(File(prefix, "bin/termux-info"))
                    else -> pathPresent(File(prefix, "bin/$packageName"))
                }
            }
    }

    /**
     * Human-readable reason why [isInstalled] is false (marker state, first
     * missing path). Used for precise "rebuild required" diagnostics.
     */
    fun installationProblem(): String {
        if (!marker.isFile) return "marker file missing (${marker.name})"
        val lines = runCatching { marker.readLines() }.getOrDefault(emptyList())
        if (lines.none { it == "schema=$RUNTIME_SCHEMA" }) {
            return "marker schema mismatch (found: ${lines.firstOrNull { it.startsWith("schema=") } ?: "none"}, expected: schema=$RUNTIME_SCHEMA)"
        }
        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        val checks = buildList {
            add("bin/proot" to File(prefix, "bin/proot"))
            add("bin/node" to File(prefix, "bin/node"))
            add("bin/npm" to File(prefix, "bin/npm"))
            NativeBuildConfig.requiredPackages.forEach { packageName ->
                val path = when (packageName) {
                    "libandroid-spawn" -> File(prefix, "lib/libandroid-spawn.so")
                    "binutils" -> File(prefix, "bin/ld")
                    "pkg-config" -> File(prefix, "bin/pkg-config")
                    "python" -> File(prefix, "bin/python")
                    "termux-tools" -> File(prefix, "bin/termux-info")
                    else -> File(prefix, "bin/$packageName")
                }
                add("$packageName (${path.relativeToOrNull(runtimeRoot)?.path ?: path.path})" to path)
            }
        }
        val missing = checks.filter { !pathPresent(it.second) }.map { it.first }
        return if (missing.isEmpty()) "unknown (all checks pass)" else "missing: ${missing.joinToString(", ")}"
    }

    fun ensureInstalled(force: Boolean = false, progress: (RuntimeInstallProgress) -> Unit = {}) {
        requireSupportedAbi()
        if (!force && isInstalled()) {
            progress(RuntimeInstallProgress("Готово", 1, 1, "Среда Node.js уже установлена"))
            return
        }

        progress(RuntimeInstallProgress("Подготовка", 0, 1, "Подготавливаю встроенную среду…"))
        runtimeRoot.deleteRecursively()
        packageCache.mkdirs()
        RuntimePaths.hostPrefix(runtimeRoot).mkdirs()
        RuntimePaths.hostHome(runtimeRoot).mkdirs()
        RuntimePaths.hostTmp(runtimeRoot).mkdirs()
        File(runtimeRoot, "tmp").mkdirs()

        progress(RuntimeInstallProgress("Индекс", 0, 1, "Скачиваю индекс пакетов Termux…"))
        val (repoBase, indexText) = downloadPackageIndex()
        val index = TermuxPackageIndex.parse(indexText)
        val selected = index.resolve(ROOT_PACKAGES)
        require(selected.isNotEmpty()) { "Termux package resolver returned an empty set" }

        selected.forEachIndexed { i, pkg ->
            progress(
                RuntimeInstallProgress(
                    "Пакеты",
                    i,
                    selected.size,
                    "${i + 1}/${selected.size}: ${pkg.name} ${pkg.version}",
                )
            )
            val deb = File(packageCache, "${sanitize(pkg.name)}-${sanitize(pkg.version)}.deb")
            if (!deb.isFile || !verifySha256(deb, pkg.sha256)) {
                deb.delete()
                download(repoBase + pkg.filename.removePrefix("/"), deb)
            }
            if (!verifySha256(deb, pkg.sha256)) {
                deb.delete()
                throw IllegalStateException("SHA-256 mismatch for ${pkg.name}")
            }
            extractor.extract(deb, runtimeRoot)
        }

        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        listOf("proot", "node", "npm", "npx", "bash", "sh", "env", "dsh").forEach { name ->
            File(prefix, "bin/$name").takeIf { it.exists() || runCatching { android.system.Os.lstat(it.path) }.isSuccess }
                ?.setExecutable(true, true)
        }
        File(prefix, "bin/proot").setExecutable(true, true)
        File(prefix, "bin/node").setExecutable(true, true)
        createCompatibilityLinks()

        marker.parentFile?.mkdirs()
        val nodePkgVersion = selected.firstOrNull { it.name == "nodejs-lts" }?.version
        marker.writeText(
            buildString {
                appendLine("schema=$RUNTIME_SCHEMA")
                appendLine("abi=$abi")
                if (nodePkgVersion != null) appendLine("node=${normalizeNodeVersion(nodePkgVersion)}")
                appendLine("repo=$repoBase")
                selected.forEach { appendLine("${it.name}=${it.version}") }
            }
        )
        progress(RuntimeInstallProgress("Готово", selected.size, selected.size, "Среда Node.js установлена"))
    }

    /**
     * "Reinstall Harness" semantics: invalidate only DSH/native/UI bootstrap
     * layers. Runtime files, the Termux package cache and the npm cache stay.
     */
    fun clearHarnessLayers() {
        BootstrapLayers.clearHarnessLayers(runtimeRoot)
    }

    /**
     * "Reset embedded runtime" semantics: destructive full reset of the runtime
     * root and every bootstrap marker. Cache directories outside the runtime
     * root (Termux package cache, npm cache under cacheDir) are preserved.
     */
    fun clearFullRuntime() {
        BootstrapLayers.clearFullRuntime(runtimeRoot)
        marker.delete()
    }

    /** Legacy full reset kept for compatibility. */
    fun clear() {
        runtimeRoot.deleteRecursively()
        marker.delete()
    }

    /**
     * Installed Node version in `node --version` format (e.g. "v22.14.0"),
     * read from the runtime marker; null when unknown.
     */
    fun installedNodeVersion(): String? {
        if (!marker.isFile) return null
        val text = runCatching { marker.readText() }.getOrNull() ?: return null
        val nodeLine = text.lineSequence().firstOrNull { it.startsWith("node=") }
        if (nodeLine != null) {
            val value = nodeLine.substringAfter('=').trim()
            return value.ifBlank { null }
        }
        val pkgLine = text.lineSequence().firstOrNull { it.startsWith("nodejs-lts=") } ?: return null
        val version = pkgLine.substringAfter('=').trim()
        return normalizeNodeVersion(version).ifBlank { null }
    }

    /**
     * Updates the `node=` line of the runtime marker to the exact version
     * reported by `node --version`, keeping the rest of the marker intact.
     */
    fun writeRuntimeNodeVersion(nodeVersion: String) {
        if (!marker.isFile) return
        val lines = runCatching { marker.readLines() }.getOrNull() ?: return
        val updated = lines.toMutableList()
        val index = updated.indexOfFirst { it.startsWith("node=") }
        if (index >= 0) {
            updated[index] = "node=$nodeVersion"
        } else {
            updated.add(1, "node=$nodeVersion")
        }
        marker.writeText(updated.joinToString("\n") + "\n")
    }

    private fun normalizeNodeVersion(version: String): String =
        if (version.startsWith("v")) version else "v$version"

    private fun requireSupportedAbi() {
        // Validates the device ABI; throws with a clear message for unsupported
        // devices (e.g. 32-bit). The selected ABI is exposed via [abi].
        require(
            abi == "arm64-v8a" || abi == "x86_64",
        ) { "Неподдерживаемый ABI устройства: $abi" }
    }

    private fun download(url: String, destination: File) {
        destination.parentFile?.mkdirs()
        val temp = File(destination.parentFile, destination.name + ".part")
        temp.delete()
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 120_000
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("User-Agent", "DeepSeekHarness-Android/1.1")
        }
        try {
            connection.connect()
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("HTTP ${connection.responseCode} while downloading $url")
            }
            connection.inputStream.use { input ->
                FileOutputStream(temp).use { output -> input.copyTo(output, 128 * 1024) }
            }
            if (!temp.renameTo(destination)) {
                temp.copyTo(destination, overwrite = true)
                temp.delete()
            }
        } finally {
            connection.disconnect()
            temp.delete()
        }
    }

    private fun downloadPackageIndex(): Pair<String, String> {
        val errors = mutableListOf<String>()
        for (repoBase in REPO_BASES) {
            val url = "${repoBase}dists/stable/main/binary-${NativeBuildConfig.termuxArchForAbi(abi)}/Packages"
            val indexFile = File(packageCache, "Packages")
            try {
                download(url, indexFile)
                val text = indexFile.bufferedReader().use { it.readText() }
                if (text.contains("Package:")) return repoBase to text
                errors += "$url: downloaded index is invalid"
            } catch (t: Throwable) {
                errors += "$url: ${t.message ?: t.javaClass.simpleName}"
            } finally {
                indexFile.delete()
            }
        }
        throw IllegalStateException("Не удалось скачать индекс Termux. " + errors.joinToString(" | "))
    }

    private fun verifySha256(file: File, expected: String?): Boolean {
        if (!file.isFile) return false
        if (expected.isNullOrBlank()) return true
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return actual.equals(expected, ignoreCase = true)
    }

    private fun createCompatibilityLinks() {
        val links = mapOf(
            "usr/bin/env" to "${RuntimePaths.PREFIX}/bin/env",
            "usr/bin/node" to "${RuntimePaths.PREFIX}/bin/node",
            "bin/sh" to "${RuntimePaths.PREFIX}/bin/sh",
            "bin/bash" to "${RuntimePaths.PREFIX}/bin/bash",
        )
        links.forEach { (guestPath, target) ->
            val hostPath = File(runtimeRoot, guestPath)
            hostPath.parentFile?.mkdirs()
            runCatching { android.system.Os.lstat(hostPath.path) }.onSuccess {
                hostPath.delete()
            }
            android.system.Os.symlink(target, hostPath.path)
        }
    }

    private fun pathPresent(file: File): Boolean =
        file.isFile || runCatching { android.system.Os.lstat(file.path) }.isSuccess

    private fun sanitize(value: String): String = value.replace(Regex("[^A-Za-z0-9._+-]"), "_")

    companion object {
        private val REPO_BASES = listOf(
            "https://packages-cf.termux.dev/apt/termux-main/",
            "https://packages.termux.dev/apt/termux-main/",
            "https://ftp.fau.de/termux/termux-main/",
        )
        /** Bump when installed-file layout or fingerprint semantics change. */
    const val RUNTIME_SCHEMA = 3
        private val ROOT_PACKAGES = setOf(
            "proot",
            "nodejs-lts",
            "npm",
            "bash",
            "coreutils",
            "ca-certificates",
            "openssl",
            "procps",
            "termux-exec",
        ) + NativeBuildConfig.requiredPackages
    }
}

data class RuntimeInstallProgress(
    val phase: String,
    val current: Int,
    val total: Int,
    val message: String,
)
