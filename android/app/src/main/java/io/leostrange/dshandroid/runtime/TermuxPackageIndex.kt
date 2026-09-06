package io.leostrange.dshandroid.runtime

data class TermuxPackage(
    val name: String,
    val version: String,
    val filename: String,
    val sha256: String?,
    val dependencies: List<List<String>>,
    val provides: Set<String>,
)

class TermuxPackageIndex private constructor(
    val packages: Map<String, TermuxPackage>,
    private val providers: Map<String, List<String>>,
) {
    fun resolve(roots: Set<String>): List<TermuxPackage> {
        val ordered = mutableListOf<TermuxPackage>()
        val visited = mutableSetOf<String>()
        val visiting = mutableSetOf<String>()

        fun packageFor(name: String): TermuxPackage? {
            packages[name]?.let { return it }
            val provider = providers[name].orEmpty().firstOrNull() ?: return null
            return packages[provider]
        }

        fun visit(requestedName: String) {
            val pkg = packageFor(requestedName)
                ?: throw IllegalArgumentException("Termux package not found: $requestedName")
            if (pkg.name in visited) return
            if (!visiting.add(pkg.name)) return

            pkg.dependencies.forEach { alternatives ->
                val candidates = alternatives.mapNotNull { alt -> packageFor(alt)?.name }.distinct()
                val selected = candidates.firstOrNull { it in roots }
                    ?: candidates.firstOrNull { it in visited || it in visiting }
                    ?: candidates.firstOrNull()
                    ?: throw IllegalArgumentException(
                        "No dependency alternative found for ${pkg.name}: ${alternatives.joinToString(" | ")}"
                    )
                visit(selected)
            }

            visiting.remove(pkg.name)
            if (visited.add(pkg.name)) ordered += pkg
        }

        roots.sorted().forEach(::visit)
        return ordered
    }

    companion object {
        fun parse(text: String): TermuxPackageIndex {
            val stanzas = mutableListOf<Map<String, String>>()
            var current = linkedMapOf<String, StringBuilder>()
            var lastKey: String? = null

            fun flush() {
                if (current.isEmpty()) return
                stanzas += current.mapValues { it.value.toString().trim() }
                current = linkedMapOf()
                lastKey = null
            }

            text.lineSequence().forEach { raw ->
                if (raw.isBlank()) {
                    flush()
                    return@forEach
                }
                if (raw.firstOrNull()?.isWhitespace() == true) {
                    val key = lastKey ?: return@forEach
                    current.getValue(key).append(' ').append(raw.trim())
                    return@forEach
                }
                val colon = raw.indexOf(':')
                if (colon <= 0) return@forEach
                val key = raw.substring(0, colon).trim()
                val value = raw.substring(colon + 1).trim()
                current.getOrPut(key) { StringBuilder() }.apply {
                    if (isNotEmpty()) append(' ')
                    append(value)
                }
                lastKey = key
            }
            flush()

            val packages = linkedMapOf<String, TermuxPackage>()
            val providerMap = linkedMapOf<String, MutableList<String>>()

            stanzas.forEach { fields ->
                val name = fields["Package"] ?: return@forEach
                val filename = fields["Filename"] ?: return@forEach
                val dependsRaw = listOfNotNull(fields["Pre-Depends"], fields["Depends"])
                    .joinToString(",")
                val dependencies = parseDependencies(dependsRaw)
                val provides = fields["Provides"]
                    .orEmpty()
                    .split(',')
                    .mapNotNull(::normalizeDependencyName)
                    .toSet()
                val pkg = TermuxPackage(
                    name = name,
                    version = fields["Version"].orEmpty(),
                    filename = filename,
                    sha256 = fields["SHA256"]?.takeIf { it.isNotBlank() },
                    dependencies = dependencies,
                    provides = provides,
                )
                packages[name] = pkg
                provides.forEach { provided -> providerMap.getOrPut(provided) { mutableListOf() } += name }
            }

            return TermuxPackageIndex(
                packages = packages,
                providers = providerMap.mapValues { (_, values) -> values.distinct().sorted() },
            )
        }

        private fun parseDependencies(raw: String): List<List<String>> {
            if (raw.isBlank()) return emptyList()
            return raw.split(',').mapNotNull { group ->
                val alternatives = group.split('|').mapNotNull(::normalizeDependencyName)
                alternatives.takeIf { it.isNotEmpty() }
            }
        }

        private fun normalizeDependencyName(raw: String): String? {
            var value = raw.trim()
            if (value.isBlank()) return null
            value = value.replace(Regex("\\([^)]*\\)"), "")
            value = value.replace(Regex("\\[[^]]*]"), "")
            value = value.replace(Regex("<[^>]*>"), "")
            value = value.trim()
            value = value.substringBefore(':').trim()
            return value.takeIf { it.isNotBlank() }
        }
    }
}
