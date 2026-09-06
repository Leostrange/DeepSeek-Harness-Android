package io.leostrange.dshandroid

import java.util.regex.Pattern

/**
 * The runtime/bootstrap layer emits its status text in Russian (technical
 * strings in Kotlin without a Context). Instead of threading resources through
 * that layer, we localize at the render boundary: known Russian templates are
 * translated to English or Chinese according to the app language; anything
 * unrecognized (e.g. exception details) passes through unchanged so no
 * information is lost. Placeholders like {v}, {abi}, {errs} are matched and
 * substituted positionally.
 */
object RuntimeStatusMessages {

    private class Rule(val pattern: Pattern, val names: List<String>, val en: String, val zh: String)

    private val rules: List<Rule> = listOf(
        rule("Ожидание запуска", "Waiting to start", "等待启动"),
        rule("Подготовка…", "Preparing…", "准备中…"),
        rule("Подготовка", "Preparing", "准备"),
        rule("Готово", "Done", "完成"),
        rule("Индекс", "Index", "索引"),
        rule("Пакеты", "Packages", "软件包"),
        rule("Harness уже работает на {url}", "Harness is already running at {url}", "Harness 已在 {url} 运行"),
        rule("Полный сброс встроенной среды…", "Resetting the embedded runtime…", "正在重置内置运行环境…"),
        rule("Переустанавливаю Harness (среда сохраняется)…", "Reinstalling Harness (runtime kept)…", "正在重装 Harness（保留运行环境）…"),
        rule("Runtime: проверяю кэш…", "Runtime: checking cache…", "运行时：正在检查缓存…"),
        rule("Runtime: проверяю Node.js…", "Runtime: verifying Node.js…", "运行时：正在验证 Node.js…"),
        rule("Устанавливаю Harness…", "Installing Harness…", "正在安装 Harness…"),
        rule("Собираю native-модули Harness…", "Building Harness native modules…", "正在编译 Harness 原生模块…"),
        rule("Проверяю состояние Harness UI…", "Verifying Harness UI state…", "正在检查 Harness 界面状态…"),
        rule(
            "Не удалось определить механизм подтверждения Internal Testing Notice для DSH {v}. Запуск отменён до WebView.",
            "Could not detect the Internal Testing Notice acknowledgement mechanism for DSH {v}. Startup aborted before the WebView.",
            "无法识别 DSH {v} 的内部测试通知确认机制。已在显示 WebView 前中止启动。",
        ),
        rule("Не удалось запустить DeepSeek Harness", "Failed to start DeepSeek Harness", "无法启动 DeepSeek Harness"),
        rule(
            "Подготавливаю Android toolchain для native-модулей…",
            "Preparing the Android toolchain for native modules…",
            "正在为原生模块准备 Android 工具链…",
        ),
        rule(
            "Устанавливаю @deepseek-ai/dsh без lifecycle-скриптов…",
            "Installing @deepseek-ai/dsh without lifecycle scripts…",
            "正在安装 @deepseek-ai/dsh（跳过生命周期脚本）…",
        ),
        rule("Компилирую native-модули Harness…", "Compiling Harness native modules…", "正在编译 Harness 原生模块…"),
        rule("Устанавливаю sharp WebAssembly fallback…", "Installing the sharp WebAssembly fallback…", "正在安装 sharp WebAssembly 备用组件…"),
        rule("Проверяю native-модули Harness…", "Verifying Harness native modules…", "正在验证 Harness 原生模块…"),
        rule("Запускаю Harness на {addr}…", "Starting Harness on {addr}…", "正在 {addr} 上启动 Harness…"),
        rule("DeepSeek Harness запущен", "DeepSeek Harness is running", "DeepSeek Harness 已启动"),
        rule("Harness остановлен", "Harness stopped", "Harness 已停止"),
        rule(
            "Waiting for dsh web on port 3080… (эмулятор может быть медленным)",
            "Waiting for dsh web on port 3080… (the device may be slow)",
            "正在等待端口 3080 上的 dsh web…（设备可能较慢）",
        ),
        rule("Среда Node.js установлена", "Node.js runtime installed", "Node.js 运行环境已安装"),
        rule("Среда Node.js уже установлена", "Node.js runtime already installed", "Node.js 运行环境已安装"),
        rule(
            "Подготавливаю встроенную среду…",
            "Preparing the embedded runtime…",
            "正在准备内置运行环境…",
        ),
        rule(
            "Скачиваю индекс пакетов Termux…",
            "Downloading the Termux package index…",
            "正在下载 Termux 软件包索引…",
        ),
        rule(
            "Неподдерживаемый ABI: {abi} (ожидается arm64-v8a или x86_64)",
            "Unsupported ABI: {abi} (expected arm64-v8a or x86_64)",
            "不支持的 ABI：{abi}（应为 arm64-v8a 或 x86_64）",
        ),
        rule(
            "Неподдерживаемый ABI устройства: {abi}",
            "Unsupported device ABI: {abi}",
            "不支持的设备 ABI：{abi}",
        ),
        rule(
            "Поддерживаются только 64-битные ABI (arm64-v8a, x86_64). Устройство: {abi}",
            "Only 64-bit ABIs are supported (arm64-v8a, x86_64). Device: {abi}",
            "仅支持 64 位 ABI（arm64-v8a、x86_64）。设备：{abi}",
        ),
        rule(
            "Harness не открыл порт 3080 за 8 минут",
            "Harness did not open port 3080 within 8 minutes",
            "Harness 未能在 8 分钟内打开端口 3080",
        ),
        rule(
            "Не удалось скачать индекс Termux. {errs}",
            "Failed to download the Termux index. {errs}",
            "无法下载 Termux 索引。{errs}",
        ),
        rule(
            "Не удалось определить версию из вывода: {raw}",
            "Could not determine the version from the output: {raw}",
            "无法从输出中确定版本：{raw}",
        ),
    )

    private fun rule(ru: String, en: String, zh: String): Rule {
        val placeholder = Regex("\\{\\w+\\}")
        val parts = placeholder.split(ru)
        val names = placeholder.findAll(ru).map { it.value }.toList()
        val sb = StringBuilder()
        parts.forEachIndexed { index, part ->
            if (index > 0) sb.append("(.*?)")
            sb.append(Pattern.quote(part))
        }
        // Whole-string match; multiline strings (stack traces) are handled by fall-through.
        return Rule(Pattern.compile("\\A" + sb + "\\z", Pattern.DOTALL), names, en, zh)
    }

    /**
     * @param lang "en", "zh" or anything else (Russian is the source language).
     */
    fun localize(lang: String, text: String): String {
        if (lang == "ru" || text.isBlank()) return text
        for (r in rules) {
            val m = r.pattern.matcher(text)
            if (!m.matches()) continue
            val template = if (lang == "zh") r.zh else r.en
            var out = template
            // Substitute the original named placeholders ({v}, {abi}, …) with
            // the captured groups, positionally.
            r.names.forEachIndexed { index, name ->
                out = out.replace(name, m.group(index + 1) ?: "")
            }
            return out
        }
        return text
    }
}
