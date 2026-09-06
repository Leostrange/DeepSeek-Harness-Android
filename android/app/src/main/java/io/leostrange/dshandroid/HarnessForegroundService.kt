package io.leostrange.dshandroid

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import io.leostrange.dshandroid.runtime.BootstrapLayer
import io.leostrange.dshandroid.runtime.BootstrapLayers
import io.leostrange.dshandroid.runtime.HarnessOnboarding
import io.leostrange.dshandroid.runtime.NativeArtifacts
import io.leostrange.dshandroid.runtime.NativeBuildConfig
import io.leostrange.dshandroid.runtime.ProotRunner
import io.leostrange.dshandroid.runtime.RuntimeInstallProgress
import io.leostrange.dshandroid.runtime.RuntimeInstaller
import io.leostrange.dshandroid.runtime.RuntimePaths
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayDeque
import java.util.concurrent.TimeUnit

class HarnessForegroundService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var launchJob: Job? = null
    private var sdkJob: Job? = null
    private var updateJob: Job? = null
    @Volatile private var harnessProcess: Process? = null
    private val logLines = ArrayDeque<String>()
    private lateinit var logFile: File

    override fun onCreate() {
        super.onCreate()
        logFile = File(filesDir, "logs/harness.log").apply { parentFile?.mkdirs() }
        startForeground(NOTIF_ID, buildNotification("Подготовка…"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: ACTION_START) {
            ACTION_STOP -> stopHarnessAndSelf()
            ACTION_REINSTALL -> startHarness(forceReinstall = true, fullRuntimeReset = false)
            ACTION_RESET_RUNTIME -> startHarness(forceReinstall = true, fullRuntimeReset = true)
            ACTION_INSTALL_SDK -> installAndroidSdk(forceUpdate = false)
            ACTION_UPDATE_HARNESS -> updateHarness()
            else -> startHarness(forceReinstall = false, fullRuntimeReset = false)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startHarness(forceReinstall: Boolean, fullRuntimeReset: Boolean) {
        if (launchJob?.isActive == true) return
        launchJob = scope.launch {
            try {
                if (!forceReinstall && !fullRuntimeReset && isReachable(HARNESS_URL)) {
                    // The server outlived the app process (orphan or adopted).
                    // Restore the persisted token URL so the fresh WebView can
                    // authenticate even without a session cookie.
                    restoreSavedAuthUrl()
                    setState(HarnessStage.RUNNING, "Harness уже работает на $HARNESS_URL")
                    return@launch
                }

                stopOwnedProcess()
                clearLog()
                // Chat persistence: if the sandbox was reset/reinstalled but
                // an archive exists, bring the conversations back before the
                // server starts (it reads the store on boot).
                val restored = ChatArchive.restoreIfEmpty(this@HarnessForegroundService)
                if (restored > 0) {
                    appendLog("Чаты восстановлены из резервной копии (файлов: $restored)")
                }
                val installer = RuntimeInstaller(this@HarnessForegroundService)
                // A rebuild/reinstall must not race a still-running server:
                // the fresh `dsh web` would die with EADDRINUSE after minutes
                // of compiling. Free the port first.
                if (forceReinstall || fullRuntimeReset) {
                    killStaleHarness(ProotRunner(installer.runtimeRoot))
                }

                when {
                    fullRuntimeReset -> {
                        setState(HarnessStage.BOOTSTRAPPING, "Полный сброс встроенной среды…")
                        appendLog("Full runtime reset requested")
                        installer.clearFullRuntime()
                        installer.clear()
                    }
                    forceReinstall -> {
                        setState(HarnessStage.BOOTSTRAPPING, "Переустанавливаю Harness (среда сохраняется)…")
                        appendLog("Harness reinstall: runtime and caches are preserved")
                        installer.clearHarnessLayers()
                    }
                }

                // ── Layer 1: runtime (Termux + Node.js) ──────────────────────────
                setState(HarnessStage.BOOTSTRAPPING, "Runtime: проверяю кэш…")
                val runtimeCached = installer.isInstalled()
                if (runtimeCached) {
                    appendLog("Runtime: cached")
                } else {
                    appendLog("Runtime: rebuild required (${installer.installationProblem()})")
                    installer.ensureInstalled(force = false) { updateInstallProgress(it) }
                }

                val runner = ProotRunner(installer.runtimeRoot)
                setState(HarnessStage.VERIFYING, "Runtime: проверяю Node.js…")
                val nodeVersion = sanitizeVersionOutput(
                    runner.runCapture(
                        listOf("${RuntimePaths.PREFIX}/bin/node", "--version"),
                        30,
                    ).requireSuccess("node --version").output,
                ) { it.matches(versionTokenRegex) }
                appendLog("Node: $nodeVersion (abi: ${installer.abi})")
                runner.runCapture(listOf("${RuntimePaths.PREFIX}/bin/npm", "--version"), 30)
                    .requireSuccess("npm --version")
                    .also { appendLog("npm: ${it.output}") }

                if (installer.installedNodeVersion() != nodeVersion) {
                    installer.writeRuntimeNodeVersion(nodeVersion)
                }
                BootstrapLayers.writeMarker(
                    installer.runtimeRoot,
                    BootstrapLayer.RUNTIME,
                    BootstrapLayers.expectedFingerprint(nodeVersion, dshVersion = "", abi = installer.abi),
                )

                // ── Layer 2: DSH package tree ────────────────────────────────────
                val markerDshVersion = readMarkerDshVersion(installer.runtimeRoot)
                val dshFilesValid = dshPackagePresent(installer.runtimeRoot)
                val dshCached = markerDshVersion != null && dshFilesValid &&
                    BootstrapLayers.markerValid(
                        installer.runtimeRoot,
                        BootstrapLayer.DSH,
                        BootstrapLayers.expectedFingerprint(nodeVersion, markerDshVersion, abi = installer.abi),
                    )

                val dshVersion: String
                if (dshCached) {
                    dshVersion = markerDshVersion!!
                    appendLog("DSH: cached ($dshVersion)")
                } else {
                    setState(HarnessStage.INSTALLING_HARNESS, "Устанавливаю Harness…")
                    appendLog("DSH: install required")
                    prepareNativeBuild(runner, installer.runtimeRoot, nodeVersion)
                    installDshPackage(runner)
                    rebuildNativeModules(runner, installer.runtimeRoot, nodeVersion)
                    installSharpWasmFallback(runner, installer.runtimeRoot)
                    installDshLauncher(installer.runtimeRoot)
                    dshVersion = sanitizeVersionOutput(
                        runner.runCapture(
                            listOf("${RuntimePaths.PREFIX}/bin/dsh", "--version"),
                            30,
                        ).requireSuccess("dsh --version").output,
                    ) { it.matches(versionTokenRegex) }
                }

                val fingerprint = BootstrapLayers.expectedFingerprint(nodeVersion, dshVersion, abi = installer.abi)
                BootstrapLayers.writeMarker(installer.runtimeRoot, BootstrapLayer.DSH, fingerprint)

                // ── Layer 3: native modules ──────────────────────────────────────
                val nativeValid = NativeArtifacts.validate(installer.runtimeRoot) &&
                    BootstrapLayers.markerValid(installer.runtimeRoot, BootstrapLayer.NATIVE, fingerprint)
                if (nativeValid) {
                    appendLog("Native modules: cached")
                } else {
                    setState(HarnessStage.INSTALLING_HARNESS, "Собираю native-модули Harness…")
                    appendLog("Native modules: rebuild required")
                    rebuildNativeModules(runner, installer.runtimeRoot, nodeVersion)
                    BootstrapLayers.writeMarker(installer.runtimeRoot, BootstrapLayer.NATIVE, fingerprint)
                }

                verifyHarnessNativeModules(runner, installer.runtimeRoot, quick = nativeValid)

                // ── Layer 4: UI onboarding (internal testing notice) ─────────────
                val uiValid = BootstrapLayers.markerValid(installer.runtimeRoot, BootstrapLayer.UI, fingerprint)
                if (uiValid) {
                    appendLog("Harness notice: acknowledged")
                } else {
                    setState(HarnessStage.VERIFYING, "Проверяю состояние Harness UI…")
                    appendLog("Harness notice: resolving acknowledgement mechanism…")
                    val dshRoot = File(
                        RuntimePaths.hostPrefix(installer.runtimeRoot),
                        BootstrapLayers.DSH_PACKAGE_DIR,
                    )
                    val onboarding = HarnessOnboarding.inspect(dshRoot)
                        ?: throw IllegalStateException(
                            "Не удалось определить механизм подтверждения Internal Testing Notice " +
                                "для DSH $dshVersion. Запуск отменён до WebView.",
                        )
                    HarnessOnboarding.applyAcknowledgement(
                        dshRoot,
                        RuntimePaths.hostHome(installer.runtimeRoot),
                        dshVersion,
                        installer.runtimeRoot,
                        installer.abi,
                        onboarding,
                    )
                    appendLog("Harness notice: acknowledged via ${onboarding.mechanism}")
                }

                // ── Android SDK (first boot, together with the other packages)
                val sdkMarker = File(
                    RuntimePaths.hostHome(installer.runtimeRoot),
                    ".dsh/android-sdk/.installed",
                )
                if (!sdkMarker.isFile) {
                    installAndroidSdkInline(runner, installer.runtimeRoot)
                } else {
                    appendLog("Android SDK: already installed")
                }

                launchHarness(runner)
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (t: Throwable) {
                appendLog("ERROR: ${t.stackTraceToString()}")
                setState(
                    HarnessStage.ERROR,
                    "Не удалось запустить DeepSeek Harness",
                    error = t.message ?: t.javaClass.simpleName,
                )
                stopOwnedProcess()
            }
        }
    }

    private fun updateInstallProgress(progress: RuntimeInstallProgress) {
        HarnessRuntimeState.update {
            it.copy(
                stage = HarnessStage.BOOTSTRAPPING,
                message = progress.message,
                progressCurrent = progress.current,
                progressTotal = progress.total,
                error = null,
            )
        }
        updateNotification(progress.message)
    }

    /** Matches `v24.18.0`, `0.1.1-rc.2` and similar version tokens. */
    private val versionTokenRegex = Regex("v?\\d+(\\.\\d+)+.*")

    /**
     * PRoot may print linker warnings on stderr, which runCapture merges into
     * the output. Extracts the actual version token so markers, fingerprints
     * and the node-gyp header cache never see polluted strings.
     */
    private fun sanitizeVersionOutput(raw: String, isValid: (String) -> Boolean): String {
        val candidate = raw.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() && !it.startsWith("WARNING") && isValid(it) }
        requireNotNull(candidate) { "Не удалось определить версию из вывода: $raw" }
        return candidate
    }

    private fun prepareNativeBuild(runner: ProotRunner, runtimeRoot: File, nodeVersion: String) {
        setState(HarnessStage.INSTALLING_HARNESS, "Подготавливаю Android toolchain для native-модулей…")
        appendLog("Preparing Koffi/node-pty native build toolchain…")

        val allowScripts = runner.runCapture(
            listOf(
                "${RuntimePaths.PREFIX}/bin/npm", "config", "set",
                "allow-scripts=${NativeBuildConfig.ALLOW_SCRIPTS}", "--location=user",
            ),
            30,
        )
        if (allowScripts.exitCode != 0) {
            appendLog("npm allow-scripts warning: ${allowScripts.output}")
        }

        if (nodeGypHeadersValid(runtimeRoot, nodeVersion)) {
            appendLog("node-gyp headers: cached for $nodeVersion")
        } else {
            appendLog("node-gyp headers: downloading for $nodeVersion…")
            val nodeGyp = "${RuntimePaths.PREFIX}/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js"
            val headers = withRetry(attempts = 3, tag = "node-gyp headers") {
                runner.runCapture(
                    listOf("${RuntimePaths.PREFIX}/bin/node", nodeGyp, "install", nodeVersion),
                    240,
                    NativeBuildConfig.npmBuildEnvironment(RuntimePaths.PREFIX),
                )
            }
            if (headers.exitCode != 0) {
                appendLog("node-gyp headers warning: ${headers.output}")
            } else if (headers.output.isNotBlank()) {
                appendLog("node-gyp headers: ${headers.output}")
            }
        }
        patchCommonGypi(runtimeRoot)
    }

    private fun nodeGypHeadersValid(runtimeRoot: File, nodeVersion: String): Boolean {
        val headersDir = File(
            RuntimePaths.hostHome(runtimeRoot),
            ".cache/node-gyp/${nodeVersion.removePrefix("v")}",
        )
        val altDir = File(RuntimePaths.hostHome(runtimeRoot), ".cache/node-gyp/$nodeVersion")
        return listOf(headersDir, altDir).any { dir ->
            dir.isDirectory && File(dir, "include/node/common.gypi").isFile
        }
    }

    private fun patchCommonGypi(runtimeRoot: File) {
        val roots = listOf(
            File(RuntimePaths.hostHome(runtimeRoot), ".cache/node-gyp"),
            File(RuntimePaths.hostPrefix(runtimeRoot), "include/node"),
        )
        var found = 0
        var patched = 0
        roots.filter { it.exists() }.forEach { root ->
            root.walkTopDown()
                .filter { it.isFile && it.name == "common.gypi" }
                .forEach fileLoop@{ file ->
                    found++
                    val text = file.readText()
                    if ("android_ndk_path%'" in text) return@fileLoop
                    val marker = "'variables': {"
                    val index = text.indexOf(marker)
                    if (index >= 0) {
                        val insertAt = index + marker.length
                        file.writeText(
                            text.substring(0, insertAt) +
                                "\n    'android_ndk_path%': ''," +
                                text.substring(insertAt)
                        )
                        patched++
                    }
                }
        }
        appendLog("common.gypi: found=$found patched=$patched")
    }

    /** Downloads and extracts the DSH package tree without running lifecycle scripts. */
    private fun installDshPackage(runner: ProotRunner) {
        setState(HarnessStage.INSTALLING_HARNESS, "Устанавливаю @deepseek-ai/dsh без lifecycle-скриптов…")
        appendLog("Installing @deepseek-ai/dsh package tree with --ignore-scripts…")
        val env = NativeBuildConfig.npmBuildEnvironment(RuntimePaths.PREFIX) + mapOf(
            "DSH_NO_LANDLOCK" to "1",
            "CI" to "1",
        )

        withRetry(attempts = 3, tag = "npm install") {
            val install = runner.start(
                NativeBuildConfig.initialNpmInstallArgs(RuntimePaths.PREFIX),
                env,
            )
            streamProcess(install)
            if (!install.waitFor(12, TimeUnit.MINUTES)) {
                install.destroy()
                if (!install.waitFor(2, TimeUnit.SECONDS)) install.destroyForcibly()
                throw IllegalStateException("npm package download timed out")
            }
            if (install.exitValue() != 0) {
                throw IllegalStateException("npm package download failed (exit ${install.exitValue()})")
            }
        }
    }

    /**
     * Retries a network-bound bootstrap step up to [attempts] times with a short
     * backoff. npm/node-gyp resume from their caches, so repeats are cheap.
     */
    private fun <T> withRetry(attempts: Int, tag: String, block: () -> T): T {
        var lastError: Throwable? = null
        repeat(attempts) { index ->
            if (index > 0) {
                appendLog("$tag: retry ${index + 1}/$attempts after: ${lastError?.message ?: "unknown error"}")
                Thread.sleep(4_000L * index)
            }
            try {
                return block()
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (t: Throwable) {
                lastError = t
            }
        }
        throw lastError ?: IllegalStateException("$tag failed after $attempts attempts")
    }

    private fun rebuildNativeModules(runner: ProotRunner, runtimeRoot: File, nodeVersion: String) {
        if (!nodeGypHeadersValid(runtimeRoot, nodeVersion)) {
            appendLog("node-gyp headers: downloading for $nodeVersion…")
            val nodeGyp = "${RuntimePaths.PREFIX}/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js"
            val headers = withRetry(attempts = 3, tag = "node-gyp headers") {
                runner.runCapture(
                    listOf("${RuntimePaths.PREFIX}/bin/node", nodeGyp, "install", nodeVersion),
                    240,
                    NativeBuildConfig.npmBuildEnvironment(RuntimePaths.PREFIX),
                )
            }
            if (headers.exitCode != 0) {
                appendLog("node-gyp headers warning: ${headers.output}")
            }
        }
        patchNodePtyPostInstall(runtimeRoot)
        setState(HarnessStage.INSTALLING_HARNESS, "Компилирую native-модули Harness…")
        appendLog("Rebuilding DSH lifecycle scripts after Android node-pty patch…")
        val env = NativeBuildConfig.npmBuildEnvironment(RuntimePaths.PREFIX) + mapOf(
            "DSH_NO_LANDLOCK" to "1",
            "CI" to "1",
        )
        val rebuild = runner.start(
            listOf(
                "${RuntimePaths.PREFIX}/bin/sh",
                "-lc",
                NativeBuildConfig.rebuildShellCommand(RuntimePaths.PREFIX),
            ),
            env,
        )
        streamProcess(rebuild)
        if (!rebuild.waitFor(20, TimeUnit.MINUTES)) {
            rebuild.destroy()
            if (!rebuild.waitFor(2, TimeUnit.SECONDS)) rebuild.destroyForcibly()
            throw IllegalStateException("npm rebuild @deepseek-ai/dsh timed out")
        }
        if (rebuild.exitValue() != 0) {
            throw IllegalStateException("npm rebuild @deepseek-ai/dsh failed (exit ${rebuild.exitValue()})")
        }
    }

    private fun patchNodePtyPostInstall(runtimeRoot: File) {
        val script = File(
            RuntimePaths.hostPrefix(runtimeRoot),
            "lib/node_modules/@deepseek-ai/dsh/node_modules/node-pty/scripts/post-install.js",
        )
        require(script.isFile) { "node-pty post-install.js not found" }
        var text = script.readText()
        if ("DSH Android: skip release cleanup under PRoot" in text) return

        val anchor = "console.log('\\x1b[32m> Cleaning release folder...\\x1b[0m');"
        require(anchor in text) { "Unsupported node-pty post-install.js layout" }
        val androidGuard = """

// DSH Android: PRoot may return EPERM for lstat() on the freshly linked
// native addon inside obj.target. Release/pty.node is complete already.
if (os.platform() === 'android') {
  console.log('> DSH Android: skip release cleanup under PRoot');
  process.exit(0);
}
""".trimIndent()
        text = text.replace(anchor, anchor + "\n" + androidGuard)
        script.writeText(text)
        appendLog("node-pty postinstall patched: Android cleanup disabled")
    }

    private fun installSharpWasmFallback(runner: ProotRunner, runtimeRoot: File) {
        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        val dsh = File(prefix, BootstrapLayers.DSH_PACKAGE_DIR)
        val sharpPackage = File(dsh, "node_modules/sharp/package.json")
        if (!sharpPackage.isFile) {
            appendLog("sharp package not present; WASM fallback not needed")
            return
        }

        val version = JSONObject(sharpPackage.readText()).getString("version")
        val target = File(dsh, "node_modules/@img/sharp-wasm32")
        if (target.resolve("lib").listFiles()?.any { it.extension == "wasm" } == true) {
            appendLog("sharp WASM fallback already installed")
            return
        }

        setState(HarnessStage.INSTALLING_HARNESS, "Устанавливаю sharp WebAssembly fallback…")
        appendLog("Installing @img/sharp-wasm32@$version…")
        val workGuest = "${RuntimePaths.HOME}/.dsh-sharp-wasm"
        val result = runner.runCapture(
            listOf(
                "${RuntimePaths.PREFIX}/bin/npm", "install",
                "--prefix", workGuest,
                "--no-save", "--no-audit", "--no-fund",
                "@img/sharp-wasm32@$version",
            ),
            420,
        ).requireSuccess("sharp wasm fallback")
        if (result.output.isNotBlank()) appendLog(result.output)

        val workHost = File(RuntimePaths.hostHome(runtimeRoot), ".dsh-sharp-wasm/node_modules")
        val source = File(workHost, "@img/sharp-wasm32")
        require(source.isDirectory) { "sharp-wasm32 package was not installed" }
        target.deleteRecursively()
        target.parentFile?.mkdirs()
        source.copyRecursively(target, overwrite = true)

        val emnapiSource = File(workHost, "@emnapi")
        if (emnapiSource.isDirectory) {
            val emnapiTarget = File(dsh, "node_modules/@emnapi")
            emnapiTarget.deleteRecursively()
            emnapiSource.copyRecursively(emnapiTarget, overwrite = true)
        }
        File(RuntimePaths.hostHome(runtimeRoot), ".dsh-sharp-wasm").deleteRecursively()
        appendLog("sharp WASM fallback installed")
    }

    private fun installDshLauncher(runtimeRoot: File) {
        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        val dshDir = "${RuntimePaths.PREFIX}/${BootstrapLayers.DSH_PACKAGE_DIR}"
        val launcher = File(prefix, "bin/dsh")
        launcher.delete()
        launcher.writeText(
            "#!${RuntimePaths.PREFIX}/bin/sh\n" +
                "exec ${RuntimePaths.PREFIX}/bin/node --expose-internals $dshDir/lib/bin.js \"\$@\"\n"
        )
        launcher.setExecutable(true, true)
        appendLog("dsh launcher installed with --expose-internals")
    }

    private fun verifyHarnessNativeModules(runner: ProotRunner, runtimeRoot: File, quick: Boolean) {
        setState(HarnessStage.VERIFYING, "Проверяю native-модули Harness…")
        // Artifacts are compiled from source on every ABI; the host-side check
        // is path-based, so it works everywhere. Only on the slow (non-quick)
        // path do we also load-test koffi.
        val abi = NativeBuildConfig.preferredAbi(android.os.Build.SUPPORTED_ABIS.toList())
        if (quick && NativeArtifacts.validate(runtimeRoot)) {
            appendLog("koffi/node-pty: cached artifacts validated")
            return
        }
        val dshGuest = "${RuntimePaths.PREFIX}/${BootstrapLayers.DSH_PACKAGE_DIR}"
        runner.runCapture(
            listOf(
                "${RuntimePaths.PREFIX}/bin/node", "-e",
                "require('$dshGuest/node_modules/koffi')",
            ),
            30,
        ).requireSuccess("koffi verification")
        appendLog("koffi: OK")

        val nodePty = File(
            RuntimePaths.hostPrefix(runtimeRoot),
            "${BootstrapLayers.DSH_PACKAGE_DIR}/node_modules/node-pty/build/Release/pty.node",
        )
        require(nodePty.isFile) { "node-pty native module was not built" }
        appendLog("node-pty: OK")
    }

    private fun dshPackagePresent(runtimeRoot: File): Boolean {
        val prefix = RuntimePaths.hostPrefix(runtimeRoot)
        val packageJson = File(prefix, "${BootstrapLayers.DSH_PACKAGE_DIR}/package.json")
        if (!packageJson.isFile) return false
        val version = runCatching {
            JSONObject(packageJson.readText()).optString("version")
        }.getOrNull().orEmpty()
        return version.isNotBlank()
    }

    private fun readMarkerDshVersion(runtimeRoot: File): String? {
        val marker = BootstrapLayers.markerFile(runtimeRoot, BootstrapLayer.DSH)
        if (!marker.isFile) return null
        val text = runCatching { marker.readText() }.getOrNull() ?: return null
        return text.lineSequence()
            .firstOrNull { it.startsWith("dsh=") }
            ?.substringAfter('=')
            ?.trim()
            ?.takeIf { it.isNotBlank() }
    }

    /**
     * Kills stale `dsh web` node processes left by a previous service
     * instance. pkill may be missing or fail silently, so the fallback walks
     * /proc and kills every process whose cmdline matches the web server.
     * Then waits until port 3080 is actually free — EADDRINUSE killed more
     * than one cold start.
     */
    private fun killStaleHarness(runner: ProotRunner) {
        // Host-side sweep first: the orphan node runs under our own UID, so
        // /proc/<pid>/cmdline is readable and SIGKILL is permitted even when
        // proot itself is broken or the guest pkill is missing.
        killHostStaleDshProcesses()
        runCatching {
            val pkill = runner.runCapture(
                listOf("/usr/bin/pkill", "-9", "-f", "lib/bin.js web"),
                timeoutSeconds = 15,
            )
            appendLog("pkill stale: exit=${pkill.exitCode}")
        }.onFailure { appendLog("pkill unavailable: ${it.message}") }
        runCatching {
            runner.runCapture(
                listOf(
                    "${RuntimePaths.PREFIX}/bin/sh", "-lc",
                    "for d in /proc/[0-9]*; do " +
                        "p=\${d#/proc/}; " +
                        "c=\$(tr '\\0' ' ' < \$d/cmdline 2>/dev/null); " +
                        "case \"\$c\" in *lib/bin.js*web*) kill -9 \"\$p\" 2>/dev/null;; esac; done; " +
                        "exit 0",
                ),
                timeoutSeconds = 15,
            )
        }.onFailure { appendLog("proc sweep failed: ${it.message}") }
        var waited = 0
        while (isReachable(HARNESS_URL) && waited < 10_000) {
            Thread.sleep(500)
            waited += 500
        }
        if (isReachable(HARNESS_URL)) {
            appendLog("WARNING: port 3080 still in use after cleanup — start may fail with EADDRINUSE")
        }
    }

    /**
     * Walks the host /proc and SIGKILLs every leftover dsh node process.
     * Only our own UID's processes are visible/killable, so this cannot touch
     * anything belonging to another app.
     */
    private fun killHostStaleDshProcesses() {
        var killed = 0
        runCatching {
            val procDir = File("/proc")
            val dirs = procDir.listFiles { d -> d.name.toIntOrNull() != null } ?: return
            for (d in dirs) {
                val pid = d.name.toIntOrNull() ?: continue
                if (pid == android.os.Process.myPid()) continue
                val cmd = runCatching {
                    d.resolve("cmdline").readBytes().decodeToString().replace('\u0000', ' ')
                }.getOrNull() ?: continue
                if (cmd.contains("bin.js") && cmd.contains("web")) {
                    runCatching {
                        android.system.Os.kill(pid, android.system.OsConstants.SIGKILL)
                        killed++
                    }
                }
            }
        }.onFailure { appendLog("host proc sweep failed: ${it.message}") }
        if (killed > 0) appendLog("Host sweep: killed $killed stale dsh process(es)")
    }

    private val authUrlFile: File get() = File(filesDir, "last-auth-url.txt")

    /** Persists the tokenized URL so an adopted server can be reattached. */
    private fun saveAuthUrl(url: String) {
        runCatching { authUrlFile.writeText(url) }
    }

    private fun restoreSavedAuthUrl() {
        val saved = runCatching { authUrlFile.readText().trim() }.getOrNull()
        if (!saved.isNullOrBlank()) {
            HarnessRuntimeState.update { if (it.harnessUrl == saved) it else it.copy(harnessUrl = saved) }
            appendLog("Restored saved auth URL for WebView")
        }
    }

    private fun launchHarness(runner: ProotRunner) {
        setState(HarnessStage.STARTING, "Запускаю Harness на 127.0.0.1:3080…")
        appendLog("Starting dsh web --host 127.0.0.1 --port 3080 --no-open")
        // Clear orphans BEFORE the first bind attempt too: a leftover node
        // from a previous service instance otherwise kills this start with
        // EADDRINUSE and the retry cycle only runs after that failure.
        killStaleHarness(runner)
        if (isReachable(HARNESS_URL)) {
            // Something is still serving on 3080 (cleanup raced or the orphan
            // is a healthy server). Adopt it instead of crashing: the WebView
            // cookie persists, and the saved token URL restores access.
            appendLog("Port 3080 already serving — adopting running server")
            restoreSavedAuthUrl()
            setState(HarnessStage.RUNNING, "DeepSeek Harness запущен")
            return
        }
        var process = startDshWeb(runner)
        harnessProcess = process
        streamProcess(process)

        // Cold start inside PRoot on an emulator can take several minutes:
        // Node init, DSH server bootstrap, first-request warmup. On loaded
        // emulators the first bind can arrive late, so keep waiting while the
        // process is alive (up to 8 minutes) and log progress.
        val deadline = System.currentTimeMillis() + 480_000
        var lastProgressLog = System.currentTimeMillis()
        var retriedAfterEaddrinuse = false
        while (System.currentTimeMillis() < deadline) {
            if (!process.isAlive) {
                // A stale server can still hold the port (pkill races, orphaned
                // children from a previous service instance). Clean up and
                // retry exactly once before giving up.
                if (!retriedAfterEaddrinuse) {
                    retriedAfterEaddrinuse = true
                    appendLog("dsh web exited (code ${process.exitValue()}) — cleaning stale port holder and retrying once")
                    stopOwnedProcess()
                    killStaleHarness(runner)
                    process = startDshWeb(runner)
                    harnessProcess = process
                    streamProcess(process)
                    continue
                }
                throw IllegalStateException("Harness process exited with code ${process.exitValue()}")
            }
            if (System.currentTimeMillis() - lastProgressLog >= 30_000) {
                lastProgressLog = System.currentTimeMillis()
                appendLog("Waiting for dsh web on port 3080… (эмулятор может быть медленным)")
            }
            if (isReachable(HARNESS_URL)) {
                setState(HarnessStage.RUNNING, "DeepSeek Harness запущен")
                process.waitFor()
                if (harnessProcess === process) harnessProcess = null
                if (HarnessRuntimeState.state.value.stage != HarnessStage.STOPPED) {
                    throw IllegalStateException("Harness stopped with code ${process.exitValue()}")
                }
                return
            }
            Thread.sleep(500)
        }
        // The PRoot child (node) survives destroy(); kill it so port 3080 is
        // released and the next start attempt is not blocked by an orphan.
        killStaleHarness(runner)
        throw IllegalStateException("Harness не открыл порт 3080 за 8 минут")
    }

    private fun startDshWeb(runner: ProotRunner): Process {
        val env = linkedMapOf(
            "DSH_NO_LANDLOCK" to "1",
            "DSH_HOME" to "${RuntimePaths.HOME}/.dsh",
        )
        // The LLM step resolves provider keys from the launching environment
        // (MISSING_CREDENTIAL: "export DEEPSEEK_API_KEY in the launching
        // environment"). The key is the one saved in the native settings
        // sheet into .credentials.yaml.
        readDshApiKey()?.let { if (it.isNotBlank()) env["DEEPSEEK_API_KEY"] = it }
        return runner.start(
            listOf(
                "${RuntimePaths.PREFIX}/bin/dsh",
                "web",
                "--host", "127.0.0.1",
                "--port", "3080",
                "--no-open",
            ),
            env,
        )
    }

    /** Reads the DEEPSEEK_API_KEY ref line the settings sheet wrote. */
    private fun readDshApiKey(): String? = try {
        File(filesDir, "runtime-root/data/data/com.termux/files/home/.dsh/.credentials.yaml")
            .takeIf { it.isFile }
            ?.readLines()
            ?.firstOrNull { it.trimStart().startsWith("DEEPSEEK_API_KEY:") }
            ?.substringAfter(':')
            ?.trim()
            ?.trim('"')
    } catch (_: Exception) {
        null
    }

    /**
     * Updates the DeepSeek Harness package to the latest official release
     * (npm registry, the same channel the desktop shell uses). Runtime and
     * user data are untouched; on failure the previous version stays intact.
     * The harness is restarted afterwards so the new version takes effect.
     */
    private fun updateHarness() {
        if (updateJob?.isActive == true) {
            appendLog("Harness: обновление уже выполняется")
            return
        }
        updateJob = scope.launch {
            try {
                val installer = RuntimeInstaller(this@HarnessForegroundService)
                if (!installer.isInstalled()) {
                    appendLog("Harness: рантайм не установлен — нечего обновлять")
                    return@launch
                }
                stopOwnedProcess()
                runCatching { killHostStaleDshProcesses() }
                val runner = ProotRunner(installer.runtimeRoot)
                val env = NativeBuildConfig.npmBuildEnvironment(RuntimePaths.PREFIX) + mapOf(
                    "DSH_NO_LANDLOCK" to "1",
                    "CI" to "1",
                )
                appendLog("Harness: обновляю @deepseek-ai/dsh до последней версии…")
                updateNotification("Обновляю DeepSeek Harness…")
                val verBefore = runCatching {
                    runner.runCapture(
                        listOf(
                            "${RuntimePaths.PREFIX}/bin/sh", "-c",
                            "cat ${RuntimePaths.PREFIX}/lib/node_modules/@deepseek-ai/dsh/package.json 2>/dev/null | grep version | head -1",
                        ),
                        30,
                    ).output
                }.getOrNull()
                appendLog("Harness: текущая версия $verBefore")
                val install = runner.start(
                    listOf(
                        "${RuntimePaths.PREFIX}/bin/npm",
                        "install", "--global", "--ignore-scripts", "--no-audit", "--no-fund",
                        "@deepseek-ai/dsh@latest",
                    ),
                    env,
                )
                streamProcess(install)
                if (!install.waitFor(20, TimeUnit.MINUTES)) {
                    install.destroy()
                    appendLog("Harness: таймаут обновления")
                    return@launch
                }
                if (install.exitValue() != 0) {
                    appendLog("Harness: npm вернул ошибку (${install.exitValue()}) — прежняя версия сохранена")
                    startHarness(forceReinstall = false, fullRuntimeReset = false)
                    return@launch
                }
                appendLog("Harness: пересборка нативных скриптов пакета…")
                val rebuild = runner.start(
                    listOf(
                        "${RuntimePaths.PREFIX}/bin/sh",
                        "-c",
                        NativeBuildConfig.rebuildShellCommand(RuntimePaths.PREFIX),
                    ),
                    env,
                )
                streamProcess(rebuild)
                if (!rebuild.waitFor(20, TimeUnit.MINUTES)) rebuild.destroyForcibly()
                appendLog("Harness: обновление завершено, перезапускаю сервер…")
                startHarness(forceReinstall = false, fullRuntimeReset = false)
            } catch (e: Exception) {
                appendLog("Harness: ошибка обновления — ${e.message}")
                startHarness(forceReinstall = false, fullRuntimeReset = false)
            }
        }
    }

    /**
     * Installs JDK 17 + Gradle + Android cmdline-tools into the sandbox by
     * running assets/setup-android-sdk.sh (see ~/DSH_ANDROID_SETUP_PLAN.md
     * from the harness workspace). Two entry points: the first-boot chain
     * in [startHarness] (inline, with the other packages) and the manual
     * button in the settings sheet. Progress is streamed into the log.
     */
    private fun installAndroidSdk(forceUpdate: Boolean) {
        if (sdkJob?.isActive == true) {
            appendLog("SDK: установка уже выполняется")
            return
        }
        sdkJob = scope.launch {
            try {
                val installer = RuntimeInstaller(this@HarnessForegroundService)
                if (!installer.isInstalled()) {
                    appendLog("SDK: рантайм не установлен — сначала запустите Harness")
                    return@launch
                }
                if (!forceUpdate && sdkMarkerFile(installer.runtimeRoot).isFile) {
                    appendLog("SDK: уже установлен (обновите через «Обновить SDK»)")
                    return@launch
                }
                installAndroidSdkInline(ProotRunner(installer.runtimeRoot), installer.runtimeRoot)
            } catch (e: Exception) {
                appendLog("SDK: ошибка установки — ${e.message}")
            }
        }
    }

    private fun sdkMarkerFile(runtimeRoot: File): File =
        File(RuntimePaths.hostHome(runtimeRoot), ".dsh/android-sdk/.installed")

    /** Blocking SDK install; called from the first-boot chain and the button. */
    private fun installAndroidSdkInline(runner: ProotRunner, runtimeRoot: File) {
        try {
            val homeHost = RuntimePaths.hostHome(runtimeRoot)
            val scriptHost = File(homeHost, "setup-android-sdk.sh")
            assets.open("setup-android-sdk.sh").use { input ->
                scriptHost.outputStream().use { input.copyTo(it) }
            }
            appendLog("SDK: установка начата (JDK 17 + Gradle + cmdline-tools, ~1 ГБ)")
            updateNotification("Устанавливаю Android SDK в песочницу…")
            val process = runner.start(
                listOf("bash", "${RuntimePaths.HOME}/setup-android-sdk.sh"),
                linkedMapOf(
                    "DSH_NO_LANDLOCK" to "1",
                    "HOME" to RuntimePaths.HOME,
                ),
            )
            streamProcess(process)
            if (!process.waitFor(45, TimeUnit.MINUTES)) {
                process.destroy()
                if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
                appendLog("SDK: таймаут установки (можно повторить из настроек)")
                return
            }
            if (process.exitValue() == 0) {
                appendLog("SDK: установка завершена успешно")
                updateNotification("Android SDK установлен")
            } else {
                appendLog("SDK: установка завершилась с кодом ${process.exitValue()} (повтор — из настроек)")
            }
        } catch (e: Exception) {
            appendLog("SDK: ошибка установки — ${e.message}")
        }
    }

    private fun streamProcess(process: Process) {
        Thread {
            try {
                process.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { line ->
                        // Android linker noise on every guest process — purely
                        // cosmetic (BUG-003), never carries DSH state.
                        if (line.contains("WARNING: linker") || line.contains("CANNOT LINK")) return@forEach
                        appendLog(line)
                        maybeCaptureAuthUrl(line)
                    }
                }
            } catch (_: Throwable) {
            }
        }.apply {
            name = "dsh-runtime-log"
            isDaemon = true
            start()
        }
    }

    /** Matches the tokenized URL `dsh web` prints once the server is up. */
    private val authUrlRegex = Regex("http://127\\.0\\.0\\.1:3080/\\?token=[A-Za-z0-9_-]+")

    /**
     * Runs on the log reader thread so the token is captured no matter when
     * `dsh web` prints it — even after the readiness poll flips to RUNNING.
     * The WebView reloads when [HarnessSnapshot.harnessUrl] changes.
     */
    private fun maybeCaptureAuthUrl(line: String) {
        if (!line.contains("token=")) return
        val url = authUrlRegex.find(line)?.value ?: return
        var changed = false
        HarnessRuntimeState.update {
            if (it.harnessUrl == url) it else {
                changed = true
                it.copy(harnessUrl = url)
            }
        }
        if (changed) {
            appendLog("Captured auth URL for WebView")
            saveAuthUrl(url)
        }
    }

    @Synchronized
    private fun appendLog(line: String) {
        val clean = line.trimEnd()
        if (clean.isBlank()) return
        logFile.appendText(clean + "\n")
        logLines.addLast(clean)
        while (logLines.size > MAX_LOG_LINES) logLines.removeFirst()
        val tail = logLines.joinToString("\n")
        HarnessRuntimeState.update { it.copy(logTail = tail) }
    }

    @Synchronized
    private fun clearLog() {
        logLines.clear()
        logFile.parentFile?.mkdirs()
        logFile.writeText("")
        HarnessRuntimeState.update { it.copy(logTail = "", harnessUrl = null) }
    }

    private fun setState(stage: HarnessStage, message: String, error: String? = null) {
        HarnessRuntimeState.update {
            it.copy(
                stage = stage,
                message = message,
                progressCurrent = 0,
                progressTotal = 0,
                error = error,
            )
        }
        updateNotification(message)
    }

    private fun isReachable(url: String): Boolean {
        return try {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 1_000
                readTimeout = 1_000
                requestMethod = "GET"
            }
            try {
                connection.connect()
                connection.responseCode in 100..599
            } finally {
                connection.disconnect()
            }
        } catch (_: Throwable) {
            false
        }
    }

    private fun stopHarnessAndSelf() {
        HarnessRuntimeState.update { it.copy(stage = HarnessStage.STOPPED, message = "Harness остановлен", error = null) }
        launchJob?.cancel()
        launchJob = null
        stopOwnedProcess()
        // Chat persistence: snapshot conversations while the server is down
        // and no session files are being written.
        runCatching { ChatArchive.backupNow(this) }
        // Sweep orphaned proot/node children too — stopOwnedProcess only
        // kills the process we spawned ourselves.
        runCatching { killHostStaleDshProcesses() }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    @Synchronized
    private fun stopOwnedProcess() {
        val process = harnessProcess ?: return
        harnessProcess = null
        runCatching { process.destroy() }
        runCatching {
            if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
        }
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        // The runtime layer composes status text in Russian; localize it for the
        // notification according to the chosen app language.
        val localized = RuntimeStatusMessages.localize(AppPrefs.language(this) ?: "ru", text)
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = Intent(this, HarnessForegroundService::class.java).apply { action = ACTION_STOP }
        val stopPending = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, DshApplication.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(localized)
            .setStyle(NotificationCompat.BigTextStyle().bigText(localized))
            .setOngoing(true)
            .setContentIntent(pending)
            .addAction(android.R.drawable.ic_delete, getString(R.string.btn_stop), stopPending)
            .build()
    }

    override fun onDestroy() {
        launchJob?.cancel()
        stopOwnedProcess()
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "io.leostrange.dshandroid.START"
        const val ACTION_STOP = "io.leostrange.dshandroid.STOP"
        const val ACTION_REINSTALL = "io.leostrange.dshandroid.REINSTALL"
        const val ACTION_RESET_RUNTIME = "io.leostrange.dshandroid.RESET_RUNTIME"
        const val ACTION_INSTALL_SDK = "io.leostrange.dshandroid.INSTALL_SDK"
        const val ACTION_UPDATE_HARNESS = "io.leostrange.dshandroid.UPDATE_HARNESS"
        const val NOTIF_ID = 1001
        private const val HARNESS_URL = "http://127.0.0.1:3080"
        private const val MAX_LOG_LINES = 80
    }
}
