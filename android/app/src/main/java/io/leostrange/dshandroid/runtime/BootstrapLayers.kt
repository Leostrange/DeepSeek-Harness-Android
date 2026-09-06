package io.leostrange.dshandroid.runtime

import java.io.File

/**
 * Versioned bootstrap layers.
 *
 * Each layer owns a marker file in the runtime root. A marker stores the exact
 * inputs (schema, versions, targets, patch schema) that produced the installed
 * layer. A layer is reused only when its marker matches the expected fingerprint
 * AND its required files pass validation.
 */
enum class BootstrapLayer {
    RUNTIME,
    DSH,
    NATIVE,
    UI,
}

/** Immutable description of the inputs a layer build depends on. */
data class BootstrapFingerprint(
    val schema: Int,
    val nodeVersion: String,
    val dshVersion: String,
    val androidTarget: String,
    val nativePatchSchema: Int,
    val abi: String = "",
) {
    fun markerLine(layer: BootstrapLayer): String {
        return when (layer) {
            BootstrapLayer.RUNTIME ->
                "schema=$schema\nabi=$abi\nnode=$nodeVersion\nandroid-target=$androidTarget"
            BootstrapLayer.DSH ->
                "schema=$schema\nabi=$abi\nnode=$nodeVersion\ndsh=$dshVersion"
            BootstrapLayer.NATIVE ->
                "schema=$schema\nabi=$abi\nnode=$nodeVersion\ndsh=$dshVersion\nandroid-target=$androidTarget\npatch=$nativePatchSchema"
            BootstrapLayer.UI ->
                "schema=$schema\nabi=$abi\ndsh=$dshVersion"
        }
    }

    companion object {
        /** Parses a marker body back into a fingerprint-like map. */
        fun parseMarker(text: String): Map<String, String> {
            return text.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() && it.contains('=') }
                .associate {
                    val idx = it.indexOf('=')
                    it.substring(0, idx).trim() to it.substring(idx + 1).trim()
                }
        }
    }
}

/** Per-layer validation verdict. */
data class BootstrapLayerState(
    val layer: BootstrapLayer,
    val valid: Boolean,
    val reason: String? = null,
) {
    override fun toString(): String =
        if (valid) "$layer: cached" else "$layer: invalid (${reason ?: "marker mismatch"})"
}

object BootstrapLayers {
    const val DSH_PACKAGE_DIR = "lib/node_modules/@deepseek-ai/dsh"

    /** Expected fingerprint for the currently installed/installed-to-be stack. */
    fun expectedFingerprint(nodeVersion: String, dshVersion: String, abi: String): BootstrapFingerprint =
        BootstrapFingerprint(
            schema = RuntimeInstaller.RUNTIME_SCHEMA,
            nodeVersion = nodeVersion,
            dshVersion = dshVersion,
            androidTarget = NativeBuildConfig.androidTargetForAbi(abi),
            nativePatchSchema = NativeBuildConfig.NATIVE_PATCH_SCHEMA,
            abi = abi,
        )

    /** Marker file for a layer inside the runtime root. */
    fun markerFile(runtimeRoot: File, layer: BootstrapLayer): File =
        File(runtimeRoot, ".dsh-bootstrap/${layer.name.lowercase()}.marker")

    /** Writes the marker for a layer with the given fingerprint inputs. */
    fun writeMarker(
        runtimeRoot: File,
        layer: BootstrapLayer,
        fingerprint: BootstrapFingerprint,
    ) {
        val file = markerFile(runtimeRoot, layer)
        file.parentFile?.mkdirs()
        file.writeText(fingerprint.markerLine(layer) + "\n")
    }

    /** True when the marker exists and its contents match the expected layer fingerprint. */
    fun markerValid(
        runtimeRoot: File,
        layer: BootstrapLayer,
        fingerprint: BootstrapFingerprint,
    ): Boolean {
        val file = markerFile(runtimeRoot, layer)
        if (!file.isFile) return false
        val expected = BootstrapFingerprint.parseMarker(fingerprint.markerLine(layer))
        val actual = BootstrapFingerprint.parseMarker(file.readText())
        return expected.all { (key, value) -> actual[key] == value }
    }

    /** Removes the markers of the given layers (does not touch files they describe). */
    fun invalidateMarkers(runtimeRoot: File, layers: Collection<BootstrapLayer>) {
        layers.forEach { markerFile(runtimeRoot, it).delete() }
    }

    /**
     * Evaluates which layers must be rebuilt given the expected fingerprint and
     * per-layer file validators. Dependants of an invalid layer are invalid too.
     */
    fun evaluate(
        runtimeRoot: File,
        expected: BootstrapFingerprint,
        validators: Map<BootstrapLayer, () -> Boolean> = emptyMap(),
    ): Map<BootstrapLayer, BootstrapLayerState> {
        val results = LinkedHashMap<BootstrapLayer, BootstrapLayerState>()
        var dshValid = true
        var nativeValid = true

        for (layer in BootstrapLayer.entries) {
            val state = when (layer) {
                BootstrapLayer.RUNTIME -> {
                    val markerOk = markerValid(runtimeRoot, layer, expected)
                    val filesOk = validators[layer]?.invoke() ?: true
                    if (markerOk && filesOk) {
                        BootstrapLayerState(layer, valid = true)
                    } else {
                        BootstrapLayerState(
                            layer,
                            valid = false,
                            reason = if (!markerOk) "marker mismatch" else "files missing",
                        )
                    }
                }
                BootstrapLayer.DSH -> {
                    dshValid = markerValid(runtimeRoot, layer, expected) &&
                        (validators[layer]?.invoke() ?: true)
                    if (dshValid) {
                        BootstrapLayerState(layer, valid = true)
                    } else {
                        BootstrapLayerState(layer, valid = false, reason = "marker or files invalid")
                    }
                }
                BootstrapLayer.NATIVE -> {
                    nativeValid = dshValid && markerValid(runtimeRoot, layer, expected) &&
                        (validators[layer]?.invoke() ?: true)
                    if (nativeValid) {
                        BootstrapLayerState(layer, valid = true)
                    } else {
                        BootstrapLayerState(
                            layer,
                            valid = false,
                            reason = if (!dshValid) "depends on DSH layer" else "marker or files invalid",
                        )
                    }
                }
                BootstrapLayer.UI -> {
                    val valid = dshValid && markerValid(runtimeRoot, layer, expected) &&
                        (validators[layer]?.invoke() ?: true)
                    if (valid) {
                        BootstrapLayerState(layer, valid = true)
                    } else {
                        BootstrapLayerState(
                            layer,
                            valid = false,
                            reason = if (!dshValid) "depends on DSH layer" else "marker or files invalid",
                        )
                    }
                }
            }
            results[layer] = state
        }
        return results
    }

    /**
     * Layer clearing semantics from the design spec:
     * - "Reinstall Harness" invalidates only DSH/NATIVE/UI and MUST keep the
     *   runtime plus its Termux package cache and npm cache.
     * - "Reset embedded runtime" is the only destructive operation: it removes
     *   the whole runtime root and every marker.
     */
    fun clearHarnessLayers(runtimeRoot: File) {
        invalidateMarkers(runtimeRoot, listOf(BootstrapLayer.DSH, BootstrapLayer.NATIVE, BootstrapLayer.UI))
    }

    fun clearFullRuntime(runtimeRoot: File) {
        runtimeRoot.deleteRecursively()
        File(runtimeRoot, ".dsh-bootstrap").deleteRecursively()
    }
}

/** Host-side validation of built native artifacts (no process execution needed). */
object NativeArtifacts {
    fun validate(runtimeRoot: File): Boolean {
        // DSH is installed under the Termux prefix (…/files/usr/lib/node_modules).
        val dshRoot = File(RuntimePaths.hostPrefix(runtimeRoot), BootstrapLayers.DSH_PACKAGE_DIR)
        val ptyNode = File(dshRoot, "node_modules/node-pty/build/Release/pty.node")
        val koffiPackage = File(dshRoot, "node_modules/koffi/package.json")
        return ptyNode.isFile && koffiPackage.isFile
    }
}

/**
 * Deterministic startup plan for the fast path: every layer is either verified
 * (reused) or installed/rebuilt, in dependency order. UI-visible wording comes
 * from here so tests pin what the user sees.
 */
object StartupPlan {
    enum class Action { VERIFY, BUILD }

    data class Step(
        val layer: BootstrapLayer,
        val action: Action,
        val message: String,
    )

    fun plan(
        states: Map<BootstrapLayer, BootstrapLayerState>,
        uiAcknowledged: Boolean,
    ): List<Step> = listOf(
        stepFor(BootstrapLayer.RUNTIME, states),
        stepFor(BootstrapLayer.DSH, states),
        stepFor(BootstrapLayer.NATIVE, states),
        if (uiAcknowledged) {
            Step(BootstrapLayer.UI, Action.VERIFY, "Harness notice: acknowledged")
        } else {
            Step(BootstrapLayer.UI, Action.BUILD, "Harness notice: resolving acknowledgement…")
        },
    )

    private fun stepFor(layer: BootstrapLayer, states: Map<BootstrapLayer, BootstrapLayerState>): Step {
        val valid = states[layer]?.valid == true
        return if (valid) {
            Step(layer, Action.VERIFY, "$layer: cached")
        } else {
            Step(layer, Action.BUILD, "$layer: rebuild required")
        }
    }
}
