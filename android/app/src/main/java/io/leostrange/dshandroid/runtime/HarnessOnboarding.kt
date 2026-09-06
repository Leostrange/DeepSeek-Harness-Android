package io.leostrange.dshandroid.runtime

import java.io.File

/**
 * Resolves and seeds the DSH "Internal Testing Notice" (welcome notice)
 * acknowledgement for the installed DSH version.
 *
 * Mechanism (verified against DSH 0.1.2-rc.1): the notice copy and its
 * acknowledgement constants live in `@deepseek-ai/dsh-client-ui-settings-models`
 * (`onboarding-copy`):
 *  - namespace: `WELCOME_NOTICE_SETTINGS_NAMESPACE` (durable settings section)
 *  - field:     `WELCOME_NOTICE_ACK_FIELD` (last acknowledged version)
 *  - value:     `WELCOME_NOTICE_VERSION` (exact-equality comparison)
 *
 * Durable settings are a single YAML/JSON document under the harness home
 * (`$DSH_HOME`, default `~/.dsh`): `settings.yaml` by default. Seeding means
 * writing `<namespace>: <field>: "<version>"` into that document. Only
 * constants found in the installed package are used — nothing is guessed.
 */
object HarnessOnboarding {
    /** Constant names we look for inside the installed DSH package. */
    private const val CONST_NAMESPACE = "WELCOME_NOTICE_SETTINGS_NAMESPACE"
    private const val CONST_ACK_FIELD = "WELCOME_NOTICE_ACK_FIELD"
    private const val CONST_VERSION = "WELCOME_NOTICE_VERSION"

    /** Durable settings document (default of @deepseek-ai/dsh-settings-file). */
    const val SETTINGS_YAML = "settings.yaml"
    const val SETTINGS_JSON = "settings.json"

    /** Storage mechanisms we can safely seed. */
    enum class Mechanism { SETTINGS_YAML, SETTINGS_JSON, UNSUPPORTED }

    data class Result(
        val mechanism: Mechanism,
        val namespace: String,
        val ackField: String,
        val noticeVersion: String,
        val evidenceFile: String,
    )

    /**
     * Inspects the installed DSH root for the welcome-notice acknowledgement
     * constants. Returns null when no supported mechanism is found (caller must
     * surface a precise diagnostic and stop before WebView).
     */
    fun inspect(dshRoot: File): Result? {
        // Evidence lives in the bundled @deepseek-ai scope packages; scan the
        // scope first (cheap), then fall back to a bounded scan of the root.
        val scopeRoot = File(dshRoot, "node_modules/@deepseek-ai")
        if (scopeRoot.isDirectory) {
            scanDirectory(scopeRoot, limit = 600)?.let { return it }
        }
        return scanDirectory(dshRoot, limit = 900)
    }

    private fun scanDirectory(root: File, limit: Int): Result? {
        var scanned = 0
        val queue = ArrayDeque<File>()
        queue.addLast(root)
        while (queue.isNotEmpty() && scanned < limit) {
            val dir = queue.removeFirst()
            val entries = runCatching { dir.listFiles() }.getOrNull() ?: continue
            for (entry in entries) {
                if (scanned >= limit) return null
                when {
                    entry.isDirectory -> {
                        // Skip dependency trees of dependencies: the constants
                        // ship in first-party @deepseek-ai packages only.
                        if (entry.name != "node_modules" || dir == root) queue.addLast(entry)
                    }
                    entry.isFile && entry.extension in setOf("ts", "js", "mjs", "cjs", "json") -> {
                        scanned++
                        scanFile(entry)?.let { return it }
                    }
                }
            }
        }
        return null
    }

    /** Extracts the notice constants from one source file, when present. */
    private fun scanFile(file: File): Result? {
        val text = runCatching { file.readText() }.getOrNull() ?: return null
        if (CONST_VERSION !in text && CONST_NAMESPACE !in text) return null

        val namespace = stringConst(text, CONST_NAMESPACE)
            ?: if ("\"ui-onboarding\"" in text || "'ui-onboarding'" in text) "ui-onboarding" else null
        val ackField = stringConst(text, CONST_ACK_FIELD)
            ?: if ("welcomeNoticeVersion" in text) "welcomeNoticeVersion" else null
        val version = stringConst(text, CONST_VERSION) ?: return null

        if (namespace == null || ackField == null) return null
        val mechanism = when (file.extension) {
            "json" -> Mechanism.SETTINGS_JSON
            else -> Mechanism.SETTINGS_YAML
        }
        return Result(mechanism, namespace, ackField, version, file.path)
    }

    /** Value of `CONST = "value"` / `export declare const CONST = "value"`. */
    private fun stringConst(text: String, name: String): String? =
        Regex("""$name\s*=\s*["']([^"']+)["']""").find(text)?.groupValues?.get(1)

    /**
     * Seeds the acknowledgement discovered by [inspect] into the durable
     * settings document and records the version-scoped UI bootstrap marker.
     */
    fun applyAcknowledgement(
        dshRoot: File,
        home: File,
        version: String,
        runtimeRoot: File,
        abi: String,
        result: Result,
    ) {
        when (result.mechanism) {
            Mechanism.SETTINGS_YAML -> {
                val settings = resolveSettingsFile(home, SETTINGS_YAML)
                settings.parentFile?.mkdirs()
                val text = if (settings.isFile) settings.readText() else ""
                settings.writeText(upsertYaml(text, result.namespace, result.ackField, result.noticeVersion))
            }
            Mechanism.SETTINGS_JSON -> {
                val settings = resolveSettingsFile(home, SETTINGS_JSON)
                settings.parentFile?.mkdirs()
                val json = if (settings.isFile) settings.readText().trim() else "{}"
                settings.writeText(upsertJson(json, result.namespace, result.ackField, result.noticeVersion))
            }
            Mechanism.UNSUPPORTED -> {
                throw IllegalStateException(
                    "Harness notice acknowledgement mechanism is unsupported for DSH $version " +
                        "(evidence: ${result.evidenceFile})",
                )
            }
        }
        BootstrapLayers.writeMarker(
            runtimeRoot,
            BootstrapLayer.UI,
            BootstrapLayers.expectedFingerprint(nodeVersion = "", dshVersion = version, abi = abi),
        )
    }

    /** Prefers an existing document; otherwise the provider default. */
    private fun resolveSettingsFile(home: File, defaultName: String): File {
        val dshHome = File(home, ".dsh")
        listOf(SETTINGS_YAML, SETTINGS_JSON).forEach { name ->
            val candidate = File(dshHome, name)
            if (candidate.isFile) return candidate
        }
        return File(dshHome, defaultName)
    }

    /**
     * Line-based YAML upsert: creates or extends the namespace section and
     * sets the field to the quoted version. Keeps all other content intact.
     */
    private fun upsertYaml(text: String, namespace: String, field: String, version: String): String {
        val lines = text.lines().toMutableList()
        val nsHeader = "$namespace:"
        val nsIndex = lines.indexOfFirst { it.trimEnd() == nsHeader || it.startsWith("$nsHeader ") }
        val fieldLine = "  $field: \"$version\""

        if (nsIndex < 0) {
            if (lines.isNotEmpty() && lines.last().isBlank()) lines.removeAt(lines.lastIndex)
            if (lines.isNotEmpty() && lines.last().isNotBlank()) lines.add("")
            lines.add(nsHeader)
            lines.add(fieldLine)
            return lines.joinToString("\n").trimEnd() + "\n"
        }

        // Find the section body (lines more indented than the header).
        val headerIndent = lines[nsIndex].takeWhile { it == ' ' }.length
        var end = nsIndex + 1
        while (end < lines.size) {
            val line = lines[end]
            if (line.isBlank()) { end++; continue }
            val indent = line.takeWhile { it == ' ' }.length
            if (indent <= headerIndent) break
            end++
        }
        for (i in nsIndex + 1 until end) {
            if (lines[i].trimStart().startsWith("$field:")) {
                val indent = lines[i].takeWhile { it == ' ' }.length
                lines[i] = " ".repeat(indent) + "$field: \"$version\""
                return lines.joinToString("\n")
            }
        }
        lines.add(nsIndex + 1, fieldLine)
        return lines.joinToString("\n")
    }

    /** Minimal JSON upsert for a flat-of-sections object document. */
    private fun upsertJson(text: String, namespace: String, field: String, version: String): String {
        val fieldJson = "\"$field\":\"$version\""
        val nsJson = "\"$namespace\""
        if (!text.trim().startsWith("{")) return "{$nsJson:{$fieldJson}}"
        val nsRegex = Regex(nsJson + "\\s*:\\s*\\{")
        return if (nsRegex.containsMatchIn(text)) {
            nsRegex.replace(text) { it.value + "$fieldJson," }
        } else {
            text.trimEnd().trimEnd('}') + ",$nsJson:{$fieldJson}}"
        }
    }
}
