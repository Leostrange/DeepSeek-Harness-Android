Title: fix: complete Russian localization and mobile settings/keyboard layout

Russian users see mixed-language setup, diagnostics, recovery and Web UI text. This contribution completes the Russian display catalog, fills missing descriptions for known bundled plugins, and fixes horizontal overflow on Settings → Models and Settings → Built-in plugins.

It also removes the duplicate mobile sidebar opener, centers the Team popup, and resizes the whole chat with native IME progress. Handled insets are passed to WebView as explicit zero values, preventing a stale keyboard inset from leaving a dark gap after the keyboard closes. Browser-only viewport handling is preserved.

Validation:
- The user confirmed that build363 starts, translations are complete, and the reported layouts and keyboard behavior are fixed on their Android16 device.
- Fresh checks: 12 language-catalog tests, 11 deployment tests, 6 mobile-gear contracts; recipe syntax/locale/fallback checks; source i18n; generated resources; source hygiene; manifest; changelog;1296 documentation links.
- The official fixed-input ZIP was verified against its published SHA-256. The ARM DSH runtime was rebuilt from locked npm inputs: its SHA-256 reproduces 5d0552168f52120be5247773978ed370132871b385bafa652b611461e560caa4. Package proofs were regenerated for657 packages; the descriptor verifies213 assets and486 launcher inputs.
- Dedicated review covered the full57-file diff. Source findings were corrected. Review remains REQUEST_CHANGES for release packaging prerequisites: the new fixed-input distribution/lock must be published before merge, and complete Android/Chromium gates must run in supported CI.
- The four browser-layout tests could not be rerun here because Chromium could not create its local socket (EPERM). Prior browser/Robolectric results are preserved in the original preparation, not reported as fresh passes.
- This exact contribution tree has not been built/installed as an APK. It adds small translation-semantic corrections and source-proof cleanup after the accepted build363.

Base: DSH-APP/DSHA main b597a9b5fd395355eca0976b6555be2b990d1010.
Head:17a16a88d0ed3ff1197741a108e3d29f355623a3.
No signing keys, APK package/version changes, user data, screenshots or logs are included.
Site dsha.cc availability is a separate issue and is not claimed fixed.
