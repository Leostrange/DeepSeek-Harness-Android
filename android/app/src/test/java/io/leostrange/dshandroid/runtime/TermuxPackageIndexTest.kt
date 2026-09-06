package io.leostrange.dshandroid.runtime

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TermuxPackageIndexTest {
    private val control = """
        Package: libc++
        Version: 1.0
        Filename: pool/main/libcxx.deb

        Package: ca-certificates
        Version: 1.0
        Filename: pool/main/ca-certificates.deb
        Provides: ssl-certs

        Package: nodejs-lts
        Version: 24.0
        Filename: pool/main/node.deb
        Depends: libc++ (>= 1.0), ssl-certs | missing-package,
         ca-certificates

        Package: npm
        Version: 11.0
        Filename: pool/main/npm.deb
        Depends: nodejs-lts
    """.trimIndent()

    @Test
    fun parsesContinuationLinesAndDependencies() {
        val index = TermuxPackageIndex.parse(control)
        val node = index.packages.getValue("nodejs-lts")
        assertEquals("24.0", node.version)
        assertEquals("pool/main/node.deb", node.filename)
        assertEquals(
            listOf(listOf("libc++"), listOf("ssl-certs", "missing-package"), listOf("ca-certificates")),
            node.dependencies
        )
    }

    @Test
    fun resolvesDependenciesAndVirtualProvidesBeforeRoots() {
        val index = TermuxPackageIndex.parse(control)
        val result = index.resolve(setOf("npm"))
        assertEquals(listOf("libc++", "ca-certificates", "nodejs-lts", "npm"), result.map { it.name })
        assertTrue(result.all { it.filename.isNotBlank() })
    }
    @Test
    fun prefersExplicitRootWhenDependencyHasAlternatives() {
        val text = """
            Package: nodejs
            Version: 25
            Filename: pool/nodejs.deb

            Package: nodejs-lts
            Version: 24
            Filename: pool/nodejs-lts.deb

            Package: npm
            Version: 11
            Filename: pool/npm.deb
            Depends: nodejs | nodejs-lts
        """.trimIndent()
        val result = TermuxPackageIndex.parse(text).resolve(setOf("npm", "nodejs-lts"))
        assertEquals(listOf("nodejs-lts", "npm"), result.map { it.name })
    }

}
