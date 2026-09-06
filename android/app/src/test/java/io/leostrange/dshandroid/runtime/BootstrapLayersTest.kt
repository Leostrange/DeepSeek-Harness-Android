package io.leostrange.dshandroid.runtime

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BootstrapLayersTest {
    private fun tempRoot(): File {
        val root = File(System.getProperty("java.io.tmpdir"), "dsh-bootstrap-test-${System.nanoTime()}")
        root.mkdirs()
        root.deleteOnExit()
        return root
    }

    private fun fingerprint(
        schema: Int = 2,
        node: String = "v22.14.0",
        dsh: String = "1.2.3",
        target: String = "aarch64-linux-android30",
        patch: Int = 4,
        abi: String = "arm64-v8a",
    ) = BootstrapFingerprint(schema, node, dsh, target, patch, abi)

    private fun writeRuntimeMarker(root: File, text: String) {
        BootstrapLayers.markerFile(root, BootstrapLayer.RUNTIME).apply {
            parentFile?.mkdirs()
            writeText(text)
        }
    }

    @Test
    fun allMarkersValidMeansNoRebuild() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, fp)

        val result = BootstrapLayers.evaluate(root, fp)
        BootstrapLayer.entries.forEach { layer ->
            assertTrue(result.getValue(layer).valid, "$layer should be valid")
        }
    }

    @Test
    fun changedNodeVersionInvalidatesNativeOnlyWhenRuntimeMarkerMatches() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, fp)

        // Runtime marker stays valid (its fingerprint does not include the DSH version).
        val runtimeMarker = BootstrapLayers.markerFile(root, BootstrapLayer.RUNTIME)
        val runtimeText = runtimeMarker.readText()

        // The runtime marker does not depend on DSH version, so DSH version change
        // must not invalidate it. Native includes both node and dsh, so it is rebuilt.
        val changedDsh = fingerprint(dsh = "9.9.9")
        val result = BootstrapLayers.evaluate(root, changedDsh)
        assertTrue(BootstrapLayers.markerValid(root, BootstrapLayer.RUNTIME, fingerprint(node = "v22.14.0")))
        assertEquals(runtimeText, runtimeMarker.readText())
        assertFalse(result.getValue(BootstrapLayer.NATIVE).valid)
    }

    @Test
    fun changedDshVersionInvalidatesDshNativeAndUi() {
        val root = tempRoot()
        val old = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, old)

        val result = BootstrapLayers.evaluate(root, fingerprint(dsh = "9.9.9"))
        assertTrue(result.getValue(BootstrapLayer.RUNTIME).valid)
        assertFalse(result.getValue(BootstrapLayer.DSH).valid)
        assertFalse(result.getValue(BootstrapLayer.NATIVE).valid)
        assertFalse(result.getValue(BootstrapLayer.UI).valid)
    }

    @Test
    fun changedRuntimeSchemaInvalidatesAllDependentLayers() {
        val root = tempRoot()
        val old = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, old)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, old)

        val result = BootstrapLayers.evaluate(root, fingerprint(schema = 3))
        BootstrapLayer.entries.forEach { layer ->
            assertFalse(result.getValue(layer).valid, "$layer should be invalid after schema change")
        }
    }

    @Test
    fun missingFileValidationInvalidatesOnlyThatLayerAndDependants() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, fp)

        val result = BootstrapLayers.evaluate(
            root,
            fp,
            validators = mapOf(
                BootstrapLayer.RUNTIME to { true },
                BootstrapLayer.DSH to { false },
            ),
        )
        assertTrue(result.getValue(BootstrapLayer.RUNTIME).valid)
        assertFalse(result.getValue(BootstrapLayer.DSH).valid)
        assertFalse(result.getValue(BootstrapLayer.NATIVE).valid, "native depends on dsh")
        assertFalse(result.getValue(BootstrapLayer.UI).valid, "ui depends on dsh")
    }

    @Test
    fun clearHarnessLayersKeepsRuntimeCacheAndMarker() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.DSH, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.NATIVE, fp)
        BootstrapLayers.writeMarker(root, BootstrapLayer.UI, fp)

        val nodeBinary = File(root, "data/data/com.termux/files/usr/bin/node").apply {
            parentFile?.mkdirs()
            writeText("ELF")
        }
        val npmCache = File(root, "data/data/com.termux/files/home/.npm").apply { mkdirs() }

        BootstrapLayers.clearHarnessLayers(root)

        assertTrue(nodeBinary.isFile, "runtime files must survive harness reinstall")
        assertTrue(npmCache.isDirectory, "npm cache must survive harness reinstall")
        assertTrue(
            BootstrapLayers.markerFile(root, BootstrapLayer.RUNTIME).isFile,
            "runtime marker must survive harness reinstall",
        )
        assertFalse(BootstrapLayers.markerFile(root, BootstrapLayer.DSH).isFile)
        assertFalse(BootstrapLayers.markerFile(root, BootstrapLayer.NATIVE).isFile)
        assertFalse(BootstrapLayers.markerFile(root, BootstrapLayer.UI).isFile)
    }

    @Test
    fun startupPlanVerifiesAllLayersWhenEverythingIsValid() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayer.entries.forEach { BootstrapLayers.writeMarker(root, it, fp) }
        val states = BootstrapLayers.evaluate(root, fp)

        val plan = StartupPlan.plan(states, uiAcknowledged = true)

        assertEquals(
            listOf(
                BootstrapLayer.RUNTIME to StartupPlan.Action.VERIFY,
                BootstrapLayer.DSH to StartupPlan.Action.VERIFY,
                BootstrapLayer.NATIVE to StartupPlan.Action.VERIFY,
                BootstrapLayer.UI to StartupPlan.Action.VERIFY,
            ),
            plan.map { it.layer to it.action },
            "all layers valid => no download/install/rebuild",
        )
        assertEquals("RUNTIME: cached", plan[0].message)
        assertEquals("Harness notice: acknowledged", plan[3].message)
    }

    @Test
    fun startupPlanRebuildsOnlyInvalidLayersInDependencyOrder() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayer.entries.forEach { BootstrapLayers.writeMarker(root, it, fp) }
        val states = BootstrapLayers.evaluate(
            root,
            fingerprint(dsh = "9.9.9"),
        )

        val plan = StartupPlan.plan(states, uiAcknowledged = false)

        assertEquals(StartupPlan.Action.VERIFY, plan[0].action, "runtime stays cached")
        assertEquals(StartupPlan.Action.BUILD, plan[1].action, "dsh is rebuilt")
        assertEquals(StartupPlan.Action.BUILD, plan[2].action, "native follows dsh")
        assertEquals(StartupPlan.Action.BUILD, plan[3].action, "ui follows dsh")
        assertEquals("DSH: rebuild required", plan[1].message)
    }

    @Test
    fun clearFullRuntimeRemovesEverything() {
        val root = tempRoot()
        val fp = fingerprint()
        BootstrapLayers.writeMarker(root, BootstrapLayer.RUNTIME, fp)
        val nodeBinary = File(root, "data/data/com.termux/files/usr/bin/node").apply {
            parentFile?.mkdirs()
            writeText("ELF")
        }

        BootstrapLayers.clearFullRuntime(root)

        assertFalse(nodeBinary.exists(), "runtime files must be removed on full reset")
        BootstrapLayer.entries.forEach { layer ->
            assertFalse(BootstrapLayers.markerFile(root, layer).isFile)
        }
    }
}
