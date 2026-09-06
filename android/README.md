# DeepSeek Harness Android — автономный runtime

Android-адаптация DeepSeek Harness на Kotlin + Jetpack Compose + WebView. Приложение больше не требует отдельно установленный Termux: оно само загружает Termux-совместимые ARM64-пакеты Node.js/npm/proot в приватное хранилище, устанавливает `@deepseek-ai/dsh` и запускает Web UI на `http://127.0.0.1:3080`.

## Как это работает

1. При первом старте foreground-service загружает `Packages.xz` из официального `termux-main` репозитория.
2. Разрешает зависимости для `proot`, `nodejs-lts`, `npm`, `bash`, `coreutils`, `openssl`, `ca-certificates`, `procps`.
3. Распаковывает `.deb` в синтетический rootfs внутри `filesDir/runtime-root`, сохраняя канонический путь `/data/data/com.termux/files/usr` внутри rootfs.
4. Запускает Node через `proot`, проверяет `node --version` и `npm --version`.
5. Выполняет `npm install -g @deepseek-ai/dsh`.
6. Запускает `dsh web --host 127.0.0.1 --port 3080 --no-open`.
7. После появления порта 3080 `MainActivity` показывает Harness в WebView.

Логи сохраняются в приватный файл приложения `files/logs/harness.log` и последние строки отображаются прямо в UI при ошибке.

## Требования

- Android 8.0+ (`minSdk 26`).
- ARM64 (`arm64-v8a`) или x86_64 (эмуляторы). Выбор ABI автоматический; Termux-пакеты и тулчейн нативных модулей подбираются под ABI устройства.
- Интернет на первом запуске.
- Свободное место под Termux runtime + npm-пакет Harness.

## Важное ограничение targetSdk

Сборка предназначена для sideload и намеренно использует `targetSdk 28`, при этом `compileSdk` остаётся 35. Причина: runtime запускает нативные бинарники из приватного writable-каталога приложения; Android 10+ запрещает такой `execve()` приложениям, таргетящим API 29+.

Это не конфигурация для публикации в Google Play.

## Сборка

```bash
cd android
./gradlew assembleDebug
```

Требуются Android SDK 35 и JDK 17. Выходной APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Основные файлы

- `app/src/main/java/io/leostrange/dshandroid/MainActivity.kt` — UI, WebView и диагностика.
- `app/src/main/java/io/leostrange/dshandroid/HarnessForegroundService.kt` — bootstrap/install/start/stop жизненный цикл Harness.
- `app/src/main/java/io/leostrange/dshandroid/HarnessRuntimeState.kt` — состояние runtime для Compose UI.
- `app/src/main/java/io/leostrange/dshandroid/runtime/TermuxPackageIndex.kt` — парсер и resolver Debian package metadata.
- `app/src/main/java/io/leostrange/dshandroid/runtime/DebExtractor.kt` — безопасная распаковка `.deb`/tar.xz.
- `app/src/main/java/io/leostrange/dshandroid/runtime/RuntimeInstaller.kt` — загрузка и установка Termux runtime.
- `app/src/main/java/io/leostrange/dshandroid/runtime/ProotRunner.kt` — запуск Node/Harness внутри synthetic rootfs.
