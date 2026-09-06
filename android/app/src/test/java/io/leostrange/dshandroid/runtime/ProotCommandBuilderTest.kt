package io.leostrange.dshandroid.runtime

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProotCommandBuilderTest {
    @Test
    fun buildsGuestCommandWithCanonicalTermuxPrefix() {
        val root = File("/data/user/0/io.leostrange.dshandroid.debug/files/runtime-root")
        val spec = ProotCommandBuilder(root).build(listOf("/data/data/com.termux/files/usr/bin/node", "--version"))

        assertEquals(File(root, "data/data/com.termux/files/usr/bin/proot").path, spec.command.first())
        assertTrue(spec.command.containsAll(listOf("-r", root.path, "-w", RuntimePaths.HOME)))
        assertTrue(spec.command.contains("HOME=${RuntimePaths.HOME}"))
        assertTrue(spec.command.contains("PATH=${RuntimePaths.PREFIX}/bin:/system/bin:/system/xbin"))
        assertEquals(listOf("/data/data/com.termux/files/usr/bin/node", "--version"), spec.command.takeLast(2))
        assertEquals(File(root, "data/data/com.termux/files/usr/lib").path, spec.environment["LD_LIBRARY_PATH"])
    }
}
