package io.leostrange.dshandroid.runtime

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RuntimePathsTest {
    @Test
    fun resolvesSafeArchiveEntryInsideRoot() {
        val root = File("/tmp/runtime-root")
        val resolved = RuntimePaths.safeResolve(root, "./data/data/com.termux/files/usr/bin/node")
        assertEquals(File(root, "data/data/com.termux/files/usr/bin/node").canonicalPath, resolved.canonicalPath)
    }

    @Test
    fun rejectsArchiveTraversal() {
        val root = File("/tmp/runtime-root")
        assertFailsWith<IllegalArgumentException> {
            RuntimePaths.safeResolve(root, "../../outside")
        }
    }
}
