package io.leostrange.dshandroid.runtime

import java.io.File
import java.util.concurrent.TimeUnit

class ProotRunner(private val runtimeRoot: File) {
    private val builder = ProotCommandBuilder(runtimeRoot)

    fun start(
        guestCommand: List<String>,
        extraEnvironment: Map<String, String> = emptyMap(),
    ): Process {
        val spec = builder.build(guestCommand, extraEnvironment)
        val proot = File(spec.command.first())
        require(proot.isFile) { "proot not found: ${proot.path}" }
        proot.setExecutable(true, true)
        RuntimePaths.hostPrefix(runtimeRoot).resolve("bin/node").setExecutable(true, true)

        return ProcessBuilder(spec.command)
            .redirectErrorStream(true)
            .apply {
                directory(RuntimePaths.hostHome(runtimeRoot))
                environment().putAll(spec.environment)
                environment()["PROOT_TMP_DIR"] = RuntimePaths.hostTmp(runtimeRoot).path
            }
            .start()
    }

    fun runCapture(
        guestCommand: List<String>,
        timeoutSeconds: Long = 60,
        extraEnvironment: Map<String, String> = emptyMap(),
    ): CommandResult {
        val process = start(guestCommand, extraEnvironment)
        val output = StringBuilder()
        val readerThread = Thread {
            process.inputStream.bufferedReader().useLines { lines ->
                lines.forEach { output.appendLine(it) }
            }
        }.apply { name = "dsh-proot-output"; isDaemon = true; start() }

        if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            process.destroy()
            if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
            readerThread.join(1_000)
            throw IllegalStateException("Command timed out after ${timeoutSeconds}s: ${guestCommand.joinToString(" ")}")
        }
        readerThread.join(2_000)
        return CommandResult(process.exitValue(), output.toString().trim())
    }
}

data class CommandResult(val exitCode: Int, val output: String) {
    fun requireSuccess(label: String): CommandResult {
        if (exitCode != 0) throw IllegalStateException("$label failed (exit $exitCode)\n$output")
        return this
    }
}
