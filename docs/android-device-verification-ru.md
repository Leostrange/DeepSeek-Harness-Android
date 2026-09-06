# Проверка на устройстве — Android WebUI Fast Bootstrap

> Для кого: ручная верификация реализации плана `docs/superpowers/plans/2026-09-01-android-webui-fast-bootstrap.md`.
> GitHub Actions не может воспроизвести поведение WebView/PRoot на реальном Android — поэтому нужен ARM64-девайс или эмулятор.

## Требования

- Устройство/эмулятор: **arm64-v8a** или **x86_64** (эмуляторы). Выбор ABI автоматический; 32-битные устройства получат понятную ошибку в логе.
- Android 9+ (targetSdk 28, service type `dataSync`).
- APK: `android/app/build/outputs/apk/debug/app-debug.apk` (debug-суффикс пакета: `io.leostrange.dshandroid.debug`).

## Установка и запуск

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.leostrange.dshandroid.debug/io.leostrange.dshandroid.MainActivity
```

Лог рантайма пишется в `files/logs/harness.log` и виден в UI («Последние строки лога» → «Копировать лог»).
Достать файл с ПК (debug-сборка):

```bash
adb exec-out run-as io.leostrange.dshandroid.debug cat files/logs/harness.log
```

## Сценарий 1 — первый запуск (холодный старт)

Ожидаемая последовательность в логе:

```
Runtime: install required        # установка Node в приватное хранилище
DSH: install required            # распаковка/загрузка DSH
Native modules: rebuild required # node-gyp сборка koffi/node-pty
Harness notice: seeding required # поиск и предзаполнение ack "Internal Testing Notice"
```

Что проверить:

- [ ] Foreground-уведомление с прогрессом появляется сразу после старта.
- [ ] Установка проходит без запроса сети внутри PRoot, отличного от заявленного в плане.
- [ ] В конце UI переходит в рабочее состояние (WebView с DSH), ошибки в логе отсутствуют.

Зафиксируйте время от старта сервиса до готовности UI: `____ мин ____ сек`.

## Сценарий 2 — второй запуск (быстрый путь)

Полностью остановите приложение и запустите снова:

```bash
adb shell am force-stop io.leostrange.dshandroid.debug
adb shell am start -n io.leostrange.dshandroid.debug/io.leostrange.dshandroid.MainActivity
```

Ожидаемый лог (все слои валидны — ни сети, ни npm, ни node-gyp):

```
Runtime: cached
DSH: cached (v…)
Native modules: cached
Harness notice: acknowledged
```

Что проверить:

- [ ] Все четыре строки `cached`/`acknowledged` присутствуют.
- [ ] Нет строк `npm install`, `node-gyp`, `rebuild`.
- [ ] UI готов заметно быстрее, чем при первом запуске.

Зафиксируйте время от старта сервиса до готовности UI: `____ мин ____ сек`.

## Сценарий 3 — разделённый сброс

В UI доступны два разных действия:

- **«Переустановить Harness»** — чистит слои DSH/NATIVE/UI, **сохраняя** рантайм (Node), кэш пакетов Termux и npm-кэш.
- **«Сбросить встроенную среду»** — полное удаление, требует подтверждения в отдельной карточке.

Что проверить:

- [ ] После «Переустановить Harness» в логе есть `Runtime: cached` и `DSH: install required`.
- [ ] После полного сброса весь путь снова холодный (как сценарий 1).
- [ ] Полный сброс без подтверждения невозможен.

## Сценарий 4 — invalidation маркеров

Быстрая проверка инвалидации по отпечатку:

- [ ] Обновите DSH (новая версия) → `DSH: …` и зависимые NATIVE/UI пересчитываются, RUNTIME остаётся `cached`.
- [ ] Удалите `files/.dsh-bootstrap/*` (или каталог маркеров) → слои пересчитываются, но кэши не удаляются.

## Известные ограничения

- На x86_64-эмуляторе koffi/node-pty всегда собираются из исходников и дополнительно проверяются загрузкой (`require('koffi')`) — быстрая валидация артефактов (`NativeArtifacts`) там неприменима, т.к. прекопилированные бинарники существуют только для ARM64.
- PRoot может печатать warnings линкера в stderr — сервис автоматически извлекает чистую версию из вывода (`sanitizeVersionOutput`), чтобы маркеры и кэш заголовков не загрязнялись.
