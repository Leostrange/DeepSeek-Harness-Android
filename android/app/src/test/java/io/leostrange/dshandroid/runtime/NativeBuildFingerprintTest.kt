package io.leostrange.dshandroid.runtime

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeBuildFingerprintTest {
    private fun tempRoot(): File {
        val root = File(System.getProperty("java.io.tmpdir"), "dsh-native-fp-test-${System.nanoTime()}")
        root.mkdirs()
        root.deleteOnExit()
        return root
    }

    private fun fingerprint(dsh: String = "1.2.3", node: String = "v22.14.0", patch: Int = NativeBuildConfig.NATIVE_PATCH_SCHEMA) =
        BootstrapFingerprint(
            schema = RuntimeInstaller.RUNTIME_SCHEMA,
            nodeVersion = node,
            dshVersion = dsh,
            androidTarget = NativeBuildConfig.androidTargetForAbi("arm64-v8a"),
            nativePatchSchema = patch,
            abi = "arm64-v8a",
        )

    @Test
    fun fingerprintChangesWhenAnyNativeInputChanges() {
        val base = fingerprint()
        assertTrue(
            base.markerLine(BootstrapLayer.NATIVE) !=
                fingerprint(dsh = "9.9.9").markerLine(BootstrapLayer.NATIVE),
            "dsh version change must change native fingerprint",
        )
        assertTrue(
            base.markerLine(BootstrapLayer.NATIVE) !=
                fingerprint(node = "v24.0.0").markerLine(BootstrapLayer.NATIVE),
            "node version change must change native fingerprint",
        )
        assertTrue(
            base.markerLine(BootstrapLayer.NATIVE) !=
                fingerprint(patch = base.nativePatchSchema + 1).markerLine(BootstrapLayer.NATIVE),
            "patch schema change must change native fingerprint",
        )
        assertTrue(
            base.markerLine(BootstrapLayer.NATIVE).contains(NativeBuildConfig.androidTargetForAbi("arm64-v8a")),
            "native fingerprint must pin the Android target",
        )
        assertTrue(
            base.markerLine(BootstrapLayer.NATIVE) !=
                fingerprint().copy(abi = "x86_64").markerLine(BootstrapLayer.NATIVE),
            "abi change must invalidate the native fingerprint",
        )
    }

    @Test
    fun nodeHeadersDirIsDeterministicAndSharedAcrossVersions() {
        val dir1 = NativeBuildConfig.nodeGypHeadersDir("/prefix/usr", "v22.14.0")
        val dir2 = NativeBuildConfig.nodeGypHeadersDir("/prefix/usr", "v22.14.0")
        assertEquals(dir1, dir2)
        assertTrue(dir1.endsWith(".cache/node-gyp/v22.14.0"), dir1)
        assertTrue(
            NativeBuildConfig.nodeGypHeadersDir("/prefix/usr", "v24.0.0") != dir1,
            "different node versions must use different header dirs",
        )
    }

    @Test
    fun npmBuildEnvironmentPinsHomeWhenPrefixGiven() {
        val env = NativeBuildConfig.npmBuildEnvironment(
            "/prefix/usr",
            androidTarget = NativeBuildConfig.androidTargetForAbi("arm64-v8a"),
        )
        assertEquals("-target aarch64-linux-android30", env["CFLAGS"])
        assertEquals("/prefix/home", env["HOME"])
    }

    @Test
    fun npmBuildEnvironmentTargetsX8664WhenAbiIsX8664() {
        val env = NativeBuildConfig.npmBuildEnvironment(
            "/prefix/usr",
            androidTarget = NativeBuildConfig.androidTargetForAbi("x86_64"),
        )
        assertEquals("-target x86_64-linux-android30", env["CFLAGS"])
        assertEquals("-target x86_64-linux-android30", env["CXXFLAGS"])
    }

    @Test
    fun unchangedMarkersAndArtifactsSkipNativeRebuild() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, fp)

        val prefix = "data/data/com.termux/files/usr"
        val ptyNode = File(
            root,
            "$prefix/${BootstrapLayers.DSH_PACKAGE_DIR}/node_modules/node-pty/build/Release/pty.node",
        ).apply { parentFile?.mkdirs(); writeText("ELF") }
        val koffiMarker = File(
            root,
            "$prefix/${BootstrapLayers.DSH_PACKAGE_DIR}/node_modules/koffi/package.json",
        ).apply { parentFile?.mkdirs(); writeText("{}") }

        val artifactsValid = NativeArtifacts.validate(root)
        assertTrue(artifactsValid, "native artifacts must validate")
        assertTrue(
            BootstrapLayers.markerValid(root, BootstrapLayer.NATIVE, fp),
            "unchanged markers must reuse native artifacts without npm rebuild",
        )
        assertTrue(ptyNode.isFile && koffiMarker.isFile)
    }

    @Test
    fun missingPtyNodeInvalidatesNativeArtifacts() {
        val root = tempRoot()
        File(root, "data/data/com.termux/files/usr/${BootstrapLayers.DSH_PACKAGE_DIR}/node_modules/koffi/package.json").apply {
            parentFile?.mkdirs(); writeText("{}")
        }
        assertFalse(NativeArtifacts.validate(root), "missing pty.node must fail validation")
    }
}
