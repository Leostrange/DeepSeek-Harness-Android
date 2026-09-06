package io.leostrange.dshandroid.runtime

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HarnessOnboardingTest {
    private fun tempRoot(name: String): File {
        val root = File(System.getProperty("java.io.tmpdir"), "$name-${System.nanoTime()}")
        root.mkdirs()
        root.deleteOnExit()
        return root
    }

    /** Real onboarding-copy declarations shipped in @deepseek-ai packages. */
    private fun onboardingCopyFixture(): String {
        return """
            |/** Durable settings namespace for product-wide GUI onboarding facts. */
            |export declare const WELCOME_NOTICE_SETTINGS_NAMESPACE = "ui-onboarding";
            |/** Field storing the last welcome notice version the user acknowledged. */
            |export declare const WELCOME_NOTICE_ACK_FIELD = "welcomeNoticeVersion";
            |/**
            | * Bump only when the notice changes materially and every user should see it
            | * again. The acknowledgement is compared for exact equality.
            | */
            |export declare const WELCOME_NOTICE_VERSION = "2026-08-13.1";
            |//# sourceMappingURL=onboarding-copy.d.ts.map
        """.trimMargin()
    }

    @Test
    fun resolvesConstantsFromBundledScopePackage() {
        val dshRoot = tempRoot("dsh-onboard-scope")
        val evidence = File(
            dshRoot,
            "node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/types/onboarding-copy.d.ts",
        )
        evidence.parentFile.mkdirs()
        evidence.writeText(onboardingCopyFixture())

        val result = HarnessOnboarding.inspect(dshRoot)
        assertNotNull(result, "resolver must find the constants inside the bundled scope")
        assertEquals(HarnessOnboarding.Mechanism.SETTINGS_YAML, result.mechanism)
        assertEquals("ui-onboarding", result.namespace)
        assertEquals("welcomeNoticeVersion", result.ackField)
        assertEquals("2026-08-13.1", result.noticeVersion)
        assertTrue(result.evidenceFile.endsWith("onboarding-copy.d.ts"))
    }

    @Test
    fun ignoresForeignNestedNodeModules() {
        val dshRoot = tempRoot("dsh-onboard-foreign")
        val foreign = File(dshRoot, "node_modules/@deepseek-ai/foo/node_modules/bar/lib/const.js")
        foreign.parentFile.mkdirs()
        foreign.writeText("export const WELCOME_NOTICE_VERSION = \"0.0.0-fake\";")
        assertNull(HarnessOnboarding.inspect(dshRoot), "nested dependency trees must not be scanned")
    }

    @Test
    fun returnsNullWhenNoConstants() {
        val dshRoot = tempRoot("dsh-onboard-none")
        File(dshRoot, "web").mkdirs()
        File(dshRoot, "web/app.js").writeText("console.log('no notice here');")
        assertNull(HarnessOnboarding.inspect(dshRoot))
    }

    @Test
    fun applyAcknowledgementSeedsSettingsYamlAndUiMarker() {
        val dshRoot = tempRoot("dsh-onboard-apply")
        val home = File(dshRoot, "home").apply { mkdirs() }
        val runtimeRoot = File(dshRoot, "runtime-root").apply { mkdirs() }

        val result = HarnessOnboarding.Result(
            mechanism = HarnessOnboarding.Mechanism.SETTINGS_YAML,
            namespace = "ui-onboarding",
            ackField = "welcomeNoticeVersion",
            noticeVersion = "2026-08-13.1",
            evidenceFile = "lib/types/onboarding-copy.d.ts",
        )
        HarnessOnboarding.applyAcknowledgement(dshRoot, home, "0.1.2-rc.1", runtimeRoot, "arm64-v8a", result)

        val settings = File(home, ".dsh/settings.yaml")
        assertTrue(settings.isFile, "settings.yaml must be created under the harness home")
        val text = settings.readText()
        assertTrue(text.contains("ui-onboarding:"), "namespace section must exist")
        assertTrue(text.contains("welcomeNoticeVersion: \"2026-08-13.1\""), "ack field must be seeded")

        val marker = BootstrapLayers.markerFile(runtimeRoot, BootstrapLayer.UI)
        assertTrue(marker.isFile, "UI marker must be recorded")
        assertTrue(marker.readText().contains("dsh=0.1.2-rc.1"))
    }

    @Test
    fun applyAcknowledgementUpdatesExistingYamlWithoutClobbering() {
        val dshRoot = tempRoot("dsh-onboard-yaml-update")
        val home = File(dshRoot, "home").apply { mkdirs() }
        val runtimeRoot = File(dshRoot, "runtime-root").apply { mkdirs() }
        val dshHome = File(home, ".dsh").apply { mkdirs() }
        File(dshHome, "settings.yaml").writeText(
            """
            |general:
            |  theme: dark
            |ui-onboarding:
            |  lastNotice: "old"
            """.trimMargin(),
        )

        val result = HarnessOnboarding.Result(
            mechanism = HarnessOnboarding.Mechanism.SETTINGS_YAML,
            namespace = "ui-onboarding",
            ackField = "welcomeNoticeVersion",
            noticeVersion = "2026-08-13.1",
            evidenceFile = "onboarding-copy.d.ts",
        )
        HarnessOnboarding.applyAcknowledgement(dshRoot, home, "0.1.2-rc.1", runtimeRoot, "arm64-v8a", result)

        val text = File(dshHome, "settings.yaml").readText()
        assertTrue(text.contains("theme: dark"), "other sections must be preserved")
        assertTrue(text.contains("lastNotice: \"old\""), "existing namespace fields must be preserved")
        assertTrue(text.contains("welcomeNoticeVersion: \"2026-08-13.1\""), "ack field must be added")
    }

    @Test
    fun applyAcknowledgementHandlesSettingsJson() {
        val dshRoot = tempRoot("dsh-onboard-json")
        val home = File(dshRoot, "home").apply { mkdirs() }
        val runtimeRoot = File(dshRoot, "runtime-root").apply { mkdirs() }
        val dshHome = File(home, ".dsh").apply { mkdirs() }
        File(dshHome, "settings.json").writeText("{\"theme\":\"dark\"}")

        val result = HarnessOnboarding.Result(
            mechanism = HarnessOnboarding.Mechanism.SETTINGS_JSON,
            namespace = "ui-onboarding",
            ackField = "welcomeNoticeVersion",
            noticeVersion = "2026-08-13.1",
            evidenceFile = "onboarding-copy.json",
        )
        HarnessOnboarding.applyAcknowledgement(dshRoot, home, "0.1.2-rc.1", runtimeRoot, "arm64-v8a", result)

        val text = File(dshHome, "settings.json").readText()
        assertTrue(text.contains("\"theme\":\"dark\""), "existing keys must be preserved")
        assertTrue(text.contains("\"welcomeNoticeVersion\":\"2026-08-13.1\""))
    }
}
