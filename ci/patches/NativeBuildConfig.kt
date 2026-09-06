package io.leostrange.dshandroid.runtime

object NativeBuildConfig {
    val requiredPackages: Set<String> = setOf(
        "cmake",
        "clang",
        "make",
        "python",
        "binutils",
        "pkg-config",
        "libandroid-spawn",
        "termux-tools",
    )

    const val ALLOW_SCRIPTS = "@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs,pnpm"
    const val ANDROID_API = 30
    const val NATIVE_PATCH_SCHEMA = 1

    /** Toolchain triple (LLVM target) for the given Android ABI. */
    fun androidTargetForAbi(abi: String): String = when (abi) {
        "arm64-v8a" -> "aarch64-linux-android$ANDROID_API"
        "x86_64" -> "x86_64-linux-android$ANDROID_API"
        else -> throw IllegalArgumentException(
            "Неподдерживаемый ABI: $abi (ожидается arm64-v8a или x86_64)",
        )
    }

    /** Termux Debian architecture name for the given Android ABI. */
    fun termuxArchForAbi(abi: String): String = when (abi) {
        "arm64-v8a" -> "aarch64"
        "x86_64" -> "x86_64"
        else -> throw IllegalArgumentException("Неподдерживаемый ABI для Termux: $abi")
    }

    /**
     * Picks the runtime ABI for this device: ARM64 first, then x86_64
     * (emulators). Throws with a clear message when only unsupported ABIs exist.
     */
    fun preferredAbi(supportedAbis: List<String>): String =
        listOf("arm64-v8a", "x86_64").firstOrNull { it in supportedAbis }
            ?: throw IllegalArgumentException(
                "Поддерживаются только 64-битные ABI (arm64-v8a, x86_64). Устройство: " +
                    supportedAbis.joinToString(),
            )

    /** Toolchain triple for the device this process runs on. */
    fun deviceAndroidTarget(): String =
        androidTargetForAbi(preferredAbi(android.os.Build.SUPPORTED_ABIS.toList()))

    /** Convenience accessor for device-scoped fingerprints and log messages. */
    val ANDROID_TARGET: String get() = deviceAndroidTarget()

    fun npmBuildEnvironment(prefix: String? = null, androidTarget: String? = null): Map<String, String> {
        val target = androidTarget ?: deviceAndroidTarget()
        val base = mapOf(
            "CFLAGS" to "-target $target",
            "CXXFLAGS" to "-target $target",
            "CMAKE_BUILD_PARALLEL_LEVEL" to "2",
        )
        // Pin HOME for native builds so node-gyp always writes/reads the shared
        // header cache at <prefix>/../home/.cache/node-gyp regardless of caller HOME.
        return if (prefix != null) base + ("HOME" to hostHomeForPrefix(prefix)) else base
    }

    /** Host-side path of the runtime home for a given guest prefix. */
    fun hostHomeForPrefix(prefix: String): String =
        prefix.removeSuffix("/usr") + "/home"

    /** Shared node-gyp header cache directory (host-side) for the given Node version. */
    fun nodeGypHeadersDir(prefix: String, nodeVersion: String): String =
        hostHomeForPrefix(prefix) + "/.cache/node-gyp/" + nodeVersion

    fun initialNpmInstallArgs(prefix: String): List<String> = listOf(
        "$prefix/bin/npm",
        "install",
        "--global",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "@deepseek-ai/dsh",
    )

    fun rebuildShellCommand(prefix: String): String =
        "cd '$prefix/lib/node_modules/@deepseek-ai/dsh' && '$prefix/bin/npm' rebuild --foreground-scripts --no-audit --no-fund"
}
