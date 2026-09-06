package io.leostrange.dshandroid.runtime

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NativeBuildConfigTest {
    @Test
    fun includesNativeToolchainNeededByDsh() {
        val required = NativeBuildConfig.requiredPackages
        listOf("cmake", "clang", "make", "python", "binutils", "pkg-config", "libandroid-spawn")
            .forEach { assertTrue(it in required, "missing $it") }
    }

    @Test
    fun targetsAndroidApi30ForNativeModules() {
        val env = NativeBuildConfig.npmBuildEnvironment(
            androidTarget = NativeBuildConfig.androidTargetForAbi("arm64-v8a"),
        )
        assertEquals("-target aarch64-linux-android30", env["CFLAGS"])
        assertEquals("-target aarch64-linux-android30", env["CXXFLAGS"])
        assertEquals("2", env["CMAKE_BUILD_PARALLEL_LEVEL"])
    }

    @Test
    fun toolchainTargetsMatchAbiTriples() {
        assertEquals(
            "aarch64-linux-android30",
            NativeBuildConfig.androidTargetForAbi("arm64-v8a"),
        )
        assertEquals(
            "x86_64-linux-android30",
            NativeBuildConfig.androidTargetForAbi("x86_64"),
        )
    }

    @Test
    fun termuxIndexArchMatchesAbi() {
        assertEquals("aarch64", NativeBuildConfig.termuxArchForAbi("arm64-v8a"))
        assertEquals("x86_64", NativeBuildConfig.termuxArchForAbi("x86_64"))
    }

    @Test
    fun preferredAbiPicksArm64ThenX8664() {
        assertEquals("arm64-v8a", NativeBuildConfig.preferredAbi(listOf("x86_64", "arm64-v8a")))
        assertEquals("x86_64", NativeBuildConfig.preferredAbi(listOf("x86_64")))
        assertEquals("arm64-v8a", NativeBuildConfig.preferredAbi(listOf("armeabi-v7a", "arm64-v8a")))
    }

    @Test
    fun preferredAbiRejectsUnsupportedDevices() {
        val error = runCatching {
            NativeBuildConfig.preferredAbi(listOf("armeabi-v7a", "armeabi"))
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException, "must fail with clear message")
        assertTrue(error.message!!.contains("armeabi-v7a"))
    }

    @Test
    fun installsPackageTreeBeforeRunningNativeScripts() {
        val args = NativeBuildConfig.initialNpmInstallArgs("/prefix")
        assertTrue("--ignore-scripts" in args)
        assertEquals("@deepseek-ai/dsh", args.last())
        val rebuild = NativeBuildConfig.rebuildShellCommand("/prefix")
        assertTrue("rebuild --foreground-scripts" in rebuild)
    }
}
