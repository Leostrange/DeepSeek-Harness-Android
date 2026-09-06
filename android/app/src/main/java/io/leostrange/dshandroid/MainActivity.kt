package io.leostrange.dshandroid

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import io.leostrange.dshandroid.R
import java.io.File
import java.util.Locale

private const val HARNESS_URL = "http://127.0.0.1:3080"

/** Request code for the system file/document picker opened on behalf of DSH. */
private const val REQ_FILE_CHOOSER = 4101

/** Request code for the system folder picker (workspace directory). */
private const val REQ_FOLDER_PICKER = 4102

/** Terminal-style palette used on the boot / install / status screen. */
private val TermBg = Color(0xFF0B0E14)
private val TermPanel = Color(0xFF12161F)
private val TermHeader = Color(0xFF171D29)
private val TermBorder = Color(0xFF29303E)
private val TermText = Color(0xFFD9E0EA)
private val TermDim = Color(0xFF7E8A9B)
private val TermGreen = Color(0xFF3ECF8E)
private val TermYellow = Color(0xFFE6C07B)
private val TermRed = Color(0xFFE4686F)
private val TermBlue = Color(0xFF5CA8F2)
private val TermLogText = Color(0xFF9DA9BB)

/** Accent color used for the stage marker on the terminal title bar. */
private fun stageColor(stage: HarnessStage): Color = when {
    stage == HarnessStage.RUNNING -> TermGreen
    stage == HarnessStage.ERROR -> TermRed
    else -> TermYellow
}


/** App language + first-run state. Language codes: en / zh / ru. */
internal object AppPrefs {
    const val KEY_LANG = "app_lang"
    const val KEY_ONBOARDED = "onboarded"
    const val KEY_THEME = "app_theme"

    fun prefs(context: Context) = context.getSharedPreferences("dsh_android", Context.MODE_PRIVATE)

    fun language(context: Context): String? = prefs(context).getString(KEY_LANG, null)

    fun setLanguage(context: Context, lang: String) = prefs(context).edit().putString(KEY_LANG, lang).apply()

    fun onboarded(context: Context): Boolean = prefs(context).getBoolean(KEY_ONBOARDED, false)

    fun setOnboarded(context: Context) = prefs(context).edit().putBoolean(KEY_ONBOARDED, true).apply()

    /** Theme preference: "light", "dark", or "system". Default is "dark". */
    fun theme(context: Context): String = prefs(context).getString(KEY_THEME, "dark") ?: "dark"

    fun setTheme(context: Context, theme: String) = prefs(context).edit().putString(KEY_THEME, theme).apply()

    // ── Chat font customization (applied to DSH via CSS injection) ─────────
    const val KEY_FONT_ZOOM = "chat_font_zoom"       // "1" = DSH default
    const val KEY_FONT_FAMILY = "chat_font_family"   // "" | serif|mono|inter|lora|jbmono|ibmsans|ibmmono
    const val KEY_LINE_HEIGHT = "chat_line_height"   // "" = DSH default

    fun fontZoom(context: Context): String = prefs(context).getString(KEY_FONT_ZOOM, "1") ?: "1"

    fun setFontZoom(context: Context, zoom: String) = prefs(context).edit().putString(KEY_FONT_ZOOM, zoom).apply()

    fun fontFamily(context: Context): String = prefs(context).getString(KEY_FONT_FAMILY, "") ?: ""

    fun setFontFamily(context: Context, family: String) = prefs(context).edit().putString(KEY_FONT_FAMILY, family).apply()

    fun lineHeight(context: Context): String = prefs(context).getString(KEY_LINE_HEIGHT, "") ?: ""

    fun setLineHeight(context: Context, lh: String) = prefs(context).edit().putString(KEY_LINE_HEIGHT, lh).apply()
}

private data class AppLanguage(val code: String, val nativeName: String)

private val APP_LANGUAGES = listOf(
    AppLanguage("en", "English"),
    AppLanguage("zh", "中文"),
    AppLanguage("ru", "Русский"),
)

/**
 * Workaround for a WebView rendering quirk seen on emulator/device WebView:
 * CSS percentage and viewport (vh/dvh) heights resolve to 0px on the root
 * element even though window.innerHeight is correct. The whole DSH layout
 * (html/body/#root height:100%) collapses to zero-height containers, which
 * paints as a blank page below our top bar.
 *
 * This script pins the root element height to window.innerHeight in px (the
 * only unit that resolves correctly) and re-applies it whenever the viewport
 * resizes (soft keyboard, rotation). Runs before any page script via
 * addDocumentStartJavaScript, and again at onPageFinished as a safety net.
 */
private const val WEBVIEW_HEIGHT_FIX_JS =
    "window.__dshHf || (window.__dshHf = (function () {" +
        "function apply() {" +
        "var de = document.documentElement; if (!de) return;" +
        "var h = window.innerHeight || de.clientHeight;" +
        "if (h > 0) de.style.setProperty('height', h + 'px', 'important');" +
        "}" +
        "apply();" +
        "window.addEventListener('resize', apply);" +
        "window.addEventListener('orientationchange', function () { setTimeout(apply, 100); setTimeout(apply, 400); });" +
        "setTimeout(apply, 60); setTimeout(apply, 300); setTimeout(apply, 1200);" +
        "return true;" +
        "})());"

/**
 * DSH web shows its full-screen "Add an API key" onboarding panel whenever no
 * provider key is configured. On a phone this must not block the whole UI on
 * every launch — the API key is configured later from DSH Settings (Models).
 * This script dismisses the panel ("Configure later") as soon as it appears,
 * without touching the rest of the DSH UI. It is idempotent and language-safe:
 * it targets the dialog that owns the API-key input and clicks the secondary
 * (non-save) button in it.
 */
private const val WEBVIEW_SKIP_API_OVERLAY_JS =
    "window.__dshSkipApi || (window.__dshSkipApi = (function () {" +
        "var tries = 0;" +
        "function dismiss() {" +
        "if (++tries > 200) return;" +
        "try {" +
        "var input = document.querySelector('input[type=password]');" +
        "if (!input) { setTimeout(dismiss, 600); return; }" +
        "var dlg = input;";

private const val WEBVIEW_SKIP_API_OVERLAY_JS_B =
    "while (dlg && dlg.parentElement && dlg.parentElement !== document.body) { dlg = dlg.parentElement; }" +
        "var btns = Array.prototype.slice.call(dlg.querySelectorAll('button'));" +
        "var later = btns.find(function (b) { return /configure later|not now|skip|позже|пропуст|稍后|跳过/i.test(((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')).trim()); });" +
        "if (later) { later.click(); return; }" +
        "}" +
        "catch (e) {}" +
        "setTimeout(dismiss, 600);" +
        "}" +
        "setTimeout(dismiss, 1200);" +
        "setTimeout(dismiss, 3000);" +
        "return true;" +
        "})());"

/** Single document-start script: height fix + API-overlay dismissal. */
private const val WEBVIEW_DOC_START_JS =
    WEBVIEW_HEIGHT_FIX_JS + WEBVIEW_SKIP_API_OVERLAY_JS + WEBVIEW_SKIP_API_OVERLAY_JS_B

/**
 * Runs after every page load. Two jobs:
 *
 * 1. Small visual fixes for phone use: DSH dims the screen with a full black
 *    mask when drawers/dialogs open, which looks like the UI "took over" the
 *    whole phone. A softer mask keeps the context visible.
 *
 * 2. Russian UI layer. The DSH web client only ships English and Chinese, so
 *    when the app language is Russian we overlay a dictionary-based translator
 *    that rewrites the visible chrome (menu, workspace/mode pills, dialog
 *    buttons, placeholders) into Russian. It re-runs on DOM changes so SPA
 *    navigation stays translated. `__LANG__` is substituted per WebView.
 */
private const val WEBVIEW_PAGE_FIX_JS = """
(() => {
  // Focus the composer textarea when no dialog is open. Shared helper for the
  // tap-dismiss and dialog-close handlers below.
  function focusComposer() {
    try {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="dialog"]:not([hidden])')) return;
      var ta = document.querySelector('textarea');
      if (ta) { ta.focus({ preventScroll: true }); return; }
      var ce = document.querySelector('[contenteditable="true"]');
      if (ce) { ce.focus({ preventScroll: true }); }
    } catch (e) {}
  }
  window.focusComposer = focusComposer;

  // Full pointer-event activation. Radix-based popovers/menus open on
  // pointerdown, so a plain el.click() does NOT open them (the native session
  // drivers relied on click and silently failed). Dispatch the whole sequence
  // a real touch produces.
  function tapEl(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      var o = { bubbles: true, cancelable: true, view: window,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
        pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
      return true;
    } catch (e) { try { el.click(); return true; } catch (e2) { return false; } }
  }
  window.__dshTap = tapEl;

  // This WebView resolves viewport units (vh/dvh) to 0px even though
  // window.innerHeight is correct, so DSH's own rules like
  // `max-height: calc(100vh - 24px)` collapse every popover/menu/dialog to a
  // 0px sliver — they open but are invisible ("buttons don't work"). Patch the
  // CSSOM: rewrite every viewport-unit value to computed pixels. Originals are
  // remembered so the patch can be recomputed when the viewport resizes
  // (soft keyboard) or when DSH mounts new stylesheets (SPA chunks).
  function patchVhUnits() {
    var vh = window.innerHeight || 780;
    var vw = window.innerWidth || 412;
    function fixValue(v) {
      return v
        .replace(/(-?[0-9]*\.?[0-9]+)(d?vh|svh|lvh)\b/g, function (m, n) { return (parseFloat(n) * vh / 100) + 'px'; })
        .replace(/(-?[0-9]*\.?[0-9]+)(d?vw|svw|lvw)\b/g, function (m, n) { return (parseFloat(n) * vw / 100) + 'px'; });
    }
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.cssRules && rule.cssRules.length) { walk(rule.cssRules); continue; }
        if (!rule.style) continue;
        var memo = rule.__dshVh || (rule.__dshVh = {});
        for (var j = 0; j < rule.style.length; j++) {
          var prop = rule.style[j];
          if (!(prop in memo)) {
            var val = rule.style.getPropertyValue(prop);
            if (/[0-9](vh|vw|dvh|dvw|svh|lvh|svw|lvw)\b/.test(val)) memo[prop] = val;
          }
        }
        for (var p in memo) {
          try { rule.style.setProperty(p, fixValue(memo[p]), 'important'); } catch (e) {}
        }
      }
    }
    var sheets = document.styleSheets;
    for (var s = 0; s < sheets.length; s++) {
      try { if (sheets[s].cssRules && sheets[s].cssRules.length) walk(sheets[s].cssRules); } catch (e) {}
    }
  }
  window.__dshPatchVh = patchVhUnits;

  // Re-appliable CSS/JS fix. Runs on every page-fix injection and again on
  // SPA navigation, so a route change that replaces the head or the body can
  // never drop the mask softening, width cap or tap-focus helper.
  function ensureStyles() {
    try {
      var head = document.head || document.documentElement;
      if (!head) return;
      if (!window.__dshStyleEl) {
        var st = document.createElement('style');
        st.textContent =
          // Softer overlay mask — the default black blocks the whole screen.
          '[class*="_mask"] { background-color: rgba(8, 11, 16, 0.38) !important; }' +
          ' html, body { min-height: 100% !important; }' +
          // Cap popovers/menus/dialogs to the phone width.
          ' [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper] { max-width: 92vw !important; }' +
          // Allow text selection inside dialogs (needed for model/key input).
          ' [role="dialog"] input, [role="dialog"] textarea { -webkit-user-select: text !important; }' +
          // Phone: the sidebar is ALWAYS a fixed overlay drawer. The chat
          // column keeps its size (manageSidebar reserves the rail gutter via
          // margin-left), so expanding the panel never squeezes or shifts it.
          '@media (max-width: 640px) {' +
          '  [class*="sidebarCol"] { position: fixed !important; left: 0 !important;' +
          '    top: 0 !important; bottom: 0 !important; z-index: 60 !important;' +
          '    -webkit-tap-highlight-color: transparent; }' +
          '  [class*="sidebarCol"].dsh-sb-open { box-shadow: 4px 0 24px rgba(0,0,0,0.5) !important; }' +
          // DSH lays out rail/chat/details with grid auto-placement. This
          // WebView mis-orders dissolved display:contents items, so the
          // details pane lands in the chat track while the chat collapses
          // to 0 width — the screen shows only the (empty) details pane and
          // the chat "never appears". Pin every column to its track.
          '  [class*="sidebarCol"] { grid-column: 1 !important; }' +
          '  [class*="centerCol"] { grid-column: 2 !important; }' +
          '  [class*="detailsCol"] { grid-column: 3 !important; }' +
          // Optional rail-hiding (chip in the native handle): collapses the
          // 56px icon rail so the chat takes the whole screen. The class is
          // toggled from Compose and persisted in localStorage.
          '  html.dsh-hide-rail [class*="sidebarCol"] { display: none !important; }' +
          '  html.dsh-hide-rail [class*="_frame"] { grid-template-columns: 0px minmax(0, 1fr) 0px !important;' +
          '    padding-left: 12px !important; padding-right: 12px !important; }' +
          // Empty-session state: DSH centers the header+composer vertically,
          // leaving dead space under the composer. The chat belongs to the
          // bottom of the screen (and must sit right on the keyboard).
          '  [class*="scrollBody"] { justify-content: flex-end !important; }' +
          // ...but an overflowing flex column can never scroll back to its
          // top, so JS flips this class on when content overflows.
          '  [class*="scrollBody"].dsh-overflow { justify-content: flex-start !important; }' +
          // Model/effort popovers overflow the right screen edge on phones —
          // clamp their panels to the viewport.
          '  [data-radix-popper-content-wrapper] > * { max-width: calc(100vw - 12px) !important; }' +
          // Skeleton chips shown while DSH is still loading the model catalog:
          // the model/effort pills pop in later, leaving the composer row
          // half-empty (BUG-001/FEAT-003).
          '  .dsh-skel { display: inline-flex; gap: 8px; margin-right: 8px; align-items: center; }' +
          '  .dsh-skel > i { display: block; width: 72px; height: 32px; border-radius: 16px;' +
          '    background: rgba(255,255,255,0.09); animation: dshPulse 1.4s ease-in-out infinite; }' +
          '  .dsh-skel > i:nth-child(2) { width: 56px; animation-delay: .2s; }' +
          '  @keyframes dshPulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }' +
          // Chat must use the whole width: drop desktop max-width caps and
          // let long error/log lines wrap instead of squeezing into a
          // one-word-per-column sliver.
          '  [class*="scrollBody"], [class*="centerCol"] > [class*="_root"] { max-width: none !important; }' +
          '  [role="article"], [class*="bubble"], [class*="turn"], [class*="step"], [class*="message"]' +
          ' { max-width: none !important; }' +
          '  pre, code, [class*="credential"], [class*="Preformatted"]' +
          ' { max-width: 100% !important; white-space: pre-wrap !important;' +
          '   word-break: break-word !important; overflow-wrap: anywhere !important; }' +
          // Settings dialog on a phone: go fullscreen with the nav as a
          // horizontally scrollable tab row on top and the content scrolling
          // vertically below. Real DSH structure (0.1.2-rc.1): the dialog root
          // carries both role=dialog and the *_panel class, its direct
          // children are *_nav (with *_navList/_navCell) and *_content
          // (holding *_header with the close button + *_options). Default
          // layout overflows: content is 850px inside a 767px panel (no
          // scroll → pages unreachable) and the 4th tab is clipped (nothing
          // below Models tappable).
          // Sizing uses explicit offsets + auto (never 100%/vh units): some
          // WebViews resolve viewport/percent heights to 0, which would make
          // the fullscreen panel collapse.
          '  [role="dialog"][class*="_panel"] { position: fixed !important;' +
          '    left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important;' +
          '    width: auto !important; height: auto !important; max-width: none !important;' +
          '    max-height: none !important; border-radius: 0 !important; transform: none !important;' +
          '    display: flex !important; flex-direction: column !important; overflow: hidden !important; }' +
          '  [role="dialog"] > [class*="_nav"] { flex: 0 0 auto !important; width: 100% !important;' +
          '    max-width: none !important; overflow-x: auto !important; }' +
          '  [role="dialog"] [class*="_navList"] { flex-direction: row !important; flex-wrap: nowrap !important;' +
          '    width: auto !important; max-width: 100% !important; overflow-x: auto !important; }' +
          '  [role="dialog"] [class*="_navTitle"] { display: none !important; }' +
          '  [role="dialog"] [class*="_navCell"] { flex: 0 0 auto !important; white-space: nowrap !important; }' +
          // Content is a column: the header (with the close button) stays
          // pinned and ONLY *_options scrolls — otherwise scrolling down
          // hides the close button and there is no way out of settings.
          '  [role="dialog"] > [class*="_content"] { flex: 1 1 auto !important; min-height: 0 !important;' +
          '    width: 100% !important; max-width: none !important; max-height: none !important;' +
          '    display: flex !important; flex-direction: column !important;' +
          '    overflow-y: auto !important; -webkit-overflow-scrolling: touch; }' +
          '  [role="dialog"] > [class*="_content"] > [class*="_header"] { flex: 0 0 auto !important; }' +
          '  [role="dialog"] > [class*="_content"] > [class*="_options"] { flex: 1 1 auto !important;' +
          '    min-height: 0 !important; max-height: none !important; overflow-y: auto !important;' +
          '    -webkit-overflow-scrolling: touch; }' +
          '  [role="dialog"] [class*="_options"] { max-height: none !important; }' +
          // Modal dialogs must stay tappable: a parent can set
          // pointer-events:none (modal background blocking) and forget the
          // dialog itself — on touch that makes EVERY control inside dead.
          '  [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]' +
          ' { pointer-events: auto !important; }' +
          '}';
        head.appendChild(st);
        window.__dshStyleEl = st;
      } else if (window.__dshStyleEl.parentNode !== head) {
        head.appendChild(window.__dshStyleEl);
      }
      patchVhUnits();
      // Sidebar management on phone: reserve the rail gutter so the chat
      // column never moves, and shadow the panel while it is expanded.
      function manageSidebar() {
        try {
          var sb = document.querySelector('[class*="sidebarCol"]');
          if (!sb) return;
          var center = document.querySelector('[class*="centerCol"]');
          if (window.innerWidth > 640) {
            sb.classList.remove('dsh-sb-open');
            if (center) center.style.marginLeft = '';
            return;
          }
          // On phone the rail is position:fixed (CSS injection) and covers
          // its own 56px without pushing the chat — the old margin-left
          // here just burned 56px of the chat width (narrow menu complaint).
          // The chat column keeps the full grid track; the expanded drawer
          // overlays it.
          if (center && center.style.marginLeft) center.style.marginLeft = '';
          var w = sb.getBoundingClientRect().width;
          if (w >= 150) { sb.classList.add('dsh-sb-open'); } else { sb.classList.remove('dsh-sb-open'); }
        } catch (e) {}
      }
      function sidebarToggleBtn() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        for (var i = 0; i < btns.length; i++) {
          var aria = btns[i].getAttribute('aria-label') || '';
          if (/收起侧边栏|collapse sidebar|open sidebar|collapse|收起/i.test(aria)) return btns[i];
        }
        return null;
      }
      // Model/effort pills appear only after the async catalog load; show
      // pulsing skeleton chips in the composer row until they arrive.
      function ensureSkeletons() {
        try {
          var send = null;
          var btns = document.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            var r = btns[i].getBoundingClientRect();
            var l = btns[i].getAttribute('aria-label') || '';
            if (r.width > 0 && r.y > window.innerHeight * 0.6 && /Отправить|Send|发送/.test(l)) { send = btns[i]; break; }
          }
          var skel = document.querySelector('.dsh-skel');
          var row = send ? send.parentElement : null;
          if (!row) { if (skel) skel.remove(); return; }
          var hasPills = /DeepSeek|MiMo|GPT|Claude|Qwen|Высок|Высо|Средн|Низк|High|Low|Medium/.test(row.textContent || '');
          if (hasPills) { if (skel) skel.remove(); return; }
          if (!skel) {
            skel = document.createElement('span');
            skel.className = 'dsh-skel';
            skel.innerHTML = '<i></i><i></i>';
          }
          if (skel.parentElement !== row) row.insertBefore(skel, send);
        } catch (e) {}
      }
      if (!window.__dshSidebarWatch) {
        window.__dshSidebarWatch = true;
        // Restore the hidden-rail preference (set from the native handle chip)
        // before the first paint of the chat, so the rail never flashes.
        try {
          if (localStorage.getItem('dshRailHidden') === '1') {
            document.documentElement.classList.add('dsh-hide-rail');
          }
        } catch (e) {}
        // Native font settings (settings sheet) → CSS for the whole Harness.
        // __dshRegisterFont installs an @font-face from a base64 data URL;
        // __dshApplyFont maps the stored key to a font stack. Typefaces apply
        // to the entire Harness UI; the size chip drives a root zoom factor
        // (scales everything, px sizes included) and line spacing is global.
        window.__dshRegisterFont = function (family, dataUrl) {
          try {
            var s = document.getElementById('dshFF_' + family) || document.createElement('style');
            s.id = 'dshFF_' + family;
            s.textContent = "@font-face { font-family: '" + family + "'; src: url(" + dataUrl + "); }";
            if (!s.parentNode) document.head.appendChild(s);
          } catch (e) {}
        };
        window.__dshApplyFont = function () {
          try {
            var zoom = localStorage.getItem('dshFontZoom') || '1';
            var fam = localStorage.getItem('dshFontFamily') || '';
            var lh = localStorage.getItem('dshLineHeight') || '';
            var stacks = {
              '': '',
              serif: 'Georgia, "Times New Roman", serif !important;',
              mono: 'ui-monospace, Menlo, Consolas, monospace !important;',
              inter: "'Inter', Roboto, sans-serif !important;",
              lora: "'Lora', Georgia, serif !important;",
              jbmono: "'JetBrains Mono', ui-monospace, monospace !important;",
              ibmsans: "'IBM Plex Sans', Roboto, sans-serif !important;",
              ibmmono: "'IBM Plex Mono', ui-monospace, monospace !important;"
            };
            var s = document.getElementById('dshFontStyle') || document.createElement('style');
            s.id = 'dshFontStyle';
            s.textContent = 'body { ' + (stacks[fam] !== undefined ? 'font-family: ' + stacks[fam] : '') + ' }' +
              '#root { zoom: ' + zoom + ' !important; }' +
              (lh ? 'body, #root { line-height: ' + lh + ' !important; }' : '');
            if (!s.parentNode) document.head.appendChild(s);
          } catch (e) {}
        };
        window.__dshApplyFont();
        // Intercept blob: downloads (Session log export renders an <a
        // download href=blob:...> — WebView never fires DownloadListener
        // for those, so bridge the bytes to the app ourselves).
        document.addEventListener('click', function (e) {
          try {
            var a = e.target && e.target.closest ? e.target.closest('a[href^="blob:"]') : null;
            if (!a) return;
            e.preventDefault(); e.stopPropagation();
            fetch(a.getAttribute('href')).then(function (r) { return r.blob(); }).then(function (b) {
              new Promise(function (res) {
                var fr = new FileReader();
                fr.onload = function () { res(fr.result); };
                fr.readAsDataURL(b);
              }).then(function (dataUrl) {
                var name = (a.getAttribute('download') || 'session-log.zip').replace(/[\\/:*?"<>|]/g, '_');
                if (window.AndroidClipboard && window.AndroidClipboard.saveDownload) {
                  window.AndroidClipboard.saveDownload(name, dataUrl);
                }
              });
            });
          } catch (err) {}
        }, true);
        // "+ / Commands" popover: append an attach button at the end that
        // opens the native chooser (files / gallery / project folder).
        setInterval(function () {
          try {
            var lists = document.querySelectorAll('[role=menu]');
            for (var i = 0; i < lists.length; i++) {
              var list = lists[i];
              var txt = (list.textContent || '');
              if (txt.indexOf('compact') < 0 && txt.indexOf('export') < 0) continue;
              if (list.querySelector('.dsh-attach-item')) continue;
              var item = document.createElement('div');
              item.className = 'dsh-attach-item';
              item.setAttribute('role', 'menuitem');
              item.textContent = '📎 Добавить файл или фото…';
              item.style.cssText = 'padding:10px 14px;cursor:pointer;font-weight:600;';
              item.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = '*/*';
                inp.style.display = 'none';
                document.body.appendChild(inp);
                inp.click();
                setTimeout(function () { inp.remove(); }, 120000);
              });
              list.appendChild(item);
            }
          } catch (e) {}
        }, 700);
        // Chat scroll fix: with the composer pinned to the bottom, an
        // overflowing flex column can't scroll to the top. When content
        // overflows, switch that container back to flex-start.
        setInterval(function () {
          try {
            var sbs = document.querySelectorAll('[class*="scrollBody"]');
            for (var i = 0; i < sbs.length; i++) {
              var sb = sbs[i];
              var over = sb.scrollHeight > sb.clientHeight + 2;
              sb.classList.toggle('dsh-overflow', over);
            }
          } catch (e) {}
        }, 500);
        setInterval(function () { manageSidebar(); ensureSkeletons(); }, 500);
        document.addEventListener('click', function (e) {
          try {
            var sb = document.querySelector('[class*="sidebarCol"]');
            if (!sb || !e.target) return;
            // Dialogs/popovers own their taps — the fullscreen settings dialog
            // puts its close button exactly in the sidebar's corner zone, so
            // this check MUST run before the whale-corner toggle below or the
            // dialog can never be dismissed.
            if (e.target.closest && e.target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
            var w = sb.getBoundingClientRect().width;
            var expanded = w >= 150;
            if (!expanded) return;
            // Whale-icon behaviour: the rail whale sits at the panel's top-left
            // corner. When the panel is expanded DSH may cover it with a plain
            // logo that only "flashes" — so treat a tap in the top-left 64px
            // box as a toggle and close the drawer.
            var r = sb.getBoundingClientRect();
            if (e.clientX - r.left < 64 && e.clientY - r.top < 64) {
              e.preventDefault(); e.stopPropagation();
              tapEl(sidebarToggleBtn());
              return;
            }
            if (sb.contains(e.target)) return;
            // Tap outside an open sidebar → collapse it back to the rail.
            tapEl(sidebarToggleBtn());
          } catch (err) {}
        }, true);
      } else {
        manageSidebar();
      }
      // On a narrow viewport DSH opens the workspace sidebar at a fixed 280px,
      // squeezing the chat column. Our overlay CSS above removes the squeeze;
      // still collapse the panel at load so the chat leads.
      function autoCollapse() {
        try {
          if (window.innerWidth > 640) return;
          var sb = document.querySelector('[class*="sidebarCol"]');
          if (!sb) return;
          var w = sb.getBoundingClientRect().width;
          if (w < 150) return;
          tapEl(sidebarToggleBtn());
        } catch (e) {}
      }
      if (!window.__dshAutoCollapse) {
        window.__dshAutoCollapse = true;
        setTimeout(autoCollapse, 900);
        setTimeout(autoCollapse, 2200);
      } else {
        autoCollapse();
      }
      // Tap-to-dismiss: when a mask/overlay is visible, tapping it closes the
      // open dialog and restores focus to the composer.
      if (!window.__dshTapDismiss) {
        window.__dshTapDismiss = true;
        document.addEventListener('click', function (e) {
          var t = e.target;
          if (!t) return;
          // Click on the semi-transparent mask → close the open dialog/drawer.
          if (t.classList && (t.className || '').toString().match(/_mask|overlay|backdrop/i)) {
            var dialogs = document.querySelectorAll('[role="dialog"][data-state="open"], [role="dialog"]:not([hidden])');
            for (var i = 0; i < dialogs.length; i++) {
              var closeBtn = dialogs[i].querySelector('button[aria-label*="Close"], button[aria-label*="Закрыть"], button[data-state]');
              if (closeBtn) { tapEl(closeBtn); break; }
            }
            // Radix/Dialog UIs also respond to Escape.
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            setTimeout(focusComposer, 300);
          }
        }, true);
      }
      // Focus composer textarea on tap (only when no dialog is open).
      if (!window.__dshTapFocus) {
        window.__dshTapFocus = true;
        document.addEventListener('touchend', function (e) {
          var t = e.target;
          if (!t || !t.closest) return;
          var field = t.closest('textarea, input[type=text], input:not([type]), [contenteditable="true"]');
          if (!field) return;
          if (document.querySelector('[role="dialog"][data-state="open"], [role="dialog"]:not([hidden])')) return;
          if (document.activeElement === field) return;
          try { field.focus({ preventScroll: true }); } catch (err) { try { field.focus(); } catch (e2) {} }
        }, true);
      }
      // After a dialog closes (open → closed transition only — never during
      // normal streaming DOM churn), restore focus to the composer so the
      // keyboard comes back.
      if (!window.__dshModalWatch) {
        window.__dshModalWatch = true;
        var wasOpen = false;
        setInterval(function () {
          var open = false;
          try {
            open = !!document.querySelector('[role="dialog"][data-state="open"], [role="dialog"]:not([hidden])');
          } catch (e) {}
          if (wasOpen && !open) setTimeout(focusComposer, 250);
          wasOpen = open;
        }, 400);
      }
      // Recompute viewport-unit patches when the viewport changes (soft
      // keyboard) and keep patching freshly mounted stylesheets.
      if (!window.__dshVhWatch) {
        window.__dshVhWatch = true;
        window.addEventListener('resize', function () { setTimeout(patchVhUnits, 60); });
        setInterval(patchVhUnits, 2500);
      }
    } catch (e) {}
  }
  ensureStyles();
  // Re-run the whole fix on SPA route changes (works for any language).
  if (!window.__dshNavHook) {
    window.__dshNavHook = true;
    var navHook = function () { setTimeout(ensureStyles, 60); setTimeout(ensureStyles, 400); };
    window.addEventListener('popstate', navHook);
    try {
      var _push = history.pushState, _rep = history.replaceState;
      history.pushState = function () { var r = _push.apply(this, arguments); navHook(); return r; };
      history.replaceState = function () { var r = _rep.apply(this, arguments); navHook(); return r; };
    } catch (e) {}
  }
  var lang = '__LANG__';
  if (lang !== 'ru') return true;
  window.__dshRu = (function () {
    if (window.__dshRuInstalled) return true;
    window.__dshRuInstalled = true;
    var D = {
      // Sidebar / navigation
      'Open sidebar': 'Открыть меню',
      'Close sidebar': 'Закрыть меню',
      'New session': 'Новый сеанс',
      'Add workspace': 'Добавить пространство',
      'Search sessions': 'Поиск сеансов',
      'Choose workspace': 'Пространство',
      'Workspaces': 'Пространства',
      'Workspace': 'Пространство',
      'New Session': 'Новый сеанс',
      'Ungrouped': 'Без группы',
      // Mode pills
      'Standard mode': 'Стандартный режим',
      'Minimal mode': 'Минимальный режим',
      'Creator mode': 'Режим создателя',
      'PTC mode': 'Режим PTC',
      // Composer / chat
      'Commands': 'Команды',
      'Send message': 'Отправить',
      'Describe what you want to build...': 'Опишите, что вы хотите создать…',
      'Describe what you want to build…': 'Опишите, что вы хотите создать…',
      // File / folder dialogs
      'Select workspace directory': 'Выбор папки пространства',
      'Select Workspace Directory': 'Выбор папки пространства',
      'New folder': 'Новая папка',
      'Show hidden files': 'Показать скрытые файлы',
      'New folder name': 'Имя новой папки',
      'Folder name': 'Имя папки',
      // Generic buttons
      'Cancel': 'Отмена',
      'Open': 'Открыть',
      'Create': 'Создать',
      'Close': 'Закрыть',
      'Configure later': 'Позже',
      'Save and continue': 'Сохранить и продолжить',
      'Add an API key to get started': 'Добавьте API-ключ для начала работы',
      'Preview': 'Предпросмотр',
      'Into the Unknown': 'В неизведанное',
      'Choose a workspace to start': 'Выберите пространство для старта',
      'Copy': 'Копировать',
      'Delete': 'Удалить',
      'Rename': 'Переименовать',
      'Share': 'Поделиться',
      'Details': 'Сведения',
      'Close details': 'Скрыть сведения',
      'Click a tool row in the message flow to view its details':
        'Нажмите на строку инструмента в переписке, чтобы увидеть подробности',
      'Conversation display': 'Отображение диалога',
      'Controls process content in completed turns': 'Показ процессов в завершённых ответах',
      'Only affects conversation content': 'Влияет только на содержимое переписки',
      'Compact': 'Компактно',
      'Working…': 'Работаю…',
      'Working...': 'Работаю…',
      'Retry': 'Повторить',
      'Back': 'Назад',
      'Yes': 'Да',
      'No': 'Нет',
      'Save': 'Сохранить',
      'Edit': 'Изменить',
      'Remove': 'Удалить',
      'Add': 'Добавить',
      'Apply': 'Применить',
      'Done': 'Готово',
      'Submit': 'Отправить',
      'Confirm': 'Подтвердить',
      // Access / permission pill + popover (rendered inside a shadow root)
      'Read Only': 'Только чтение',
      'Workspace Write': 'Запись в рабочей области',
      'Full access': 'Полный доступ',
      'Access mode, current: Workspace Write': 'Режим доступа: Пространство',
      'Access mode, current: Full access': 'Режим доступа: Полный доступ',
      'Access mode, current: Read Only': 'Режим доступа: Только чтение',
      'Access mode': 'Режим доступа',
      // Effort / thinking
      'Effort': 'Усилие',
      'Thinking': 'Усилие',
      'Low': 'Низкое',
      'Medium': 'Среднее',
      'High': 'Высокое',
      'Ultra': 'Максимальное',
      // Settings tabs (from screenshots)
      'Settings': 'Настройки',
      'General': 'Основные',
      'Models': 'Модели',
      'Model': 'Модель',
      'Plugins': 'Плагины',
      'Agent Presets': 'Пресеты агентов',
      'Agent preset': 'Пресет агента',
      'Server': 'Сервер',
      'API key': 'API-ключ',
      'Session': 'Сеанс',
      'Language': 'Язык',
      'English': 'Английский',
      'Chinese': 'Китайский',
      'Русский': 'Русский',
      // Settings → General (from screenshots)
      'Appearance': 'Оформление',
      'Light': 'Светлая',
      'Dark': 'Тёмная',
      'System': 'Системная',
      'Enter behavior when busy': 'Поведение Enter при занятости',
      'Send': 'Направлять',
      // Settings → Models (from screenshots)
      'Add provider': 'Добавить провайдера',
      'Add custom provider': 'Добавить пользовательского провайдера',
      'Change': 'Изменить',
      // Settings → Plugins (from screenshots)
      'Terminal': 'Терминал',
      'Agent cycle': 'Цикл агента',
      'Web search': 'Веб-поиск',
      'Plugin configuration': 'Конфигурация плагинов',
      'Plugin list': 'Список плагинов',
      'Settings for each command the agent runs.': 'Ограничения для каждой команды, выполняемой агентом.',
      'How the agent invokes tool calls.': 'Как агент запускает вызовы инструментов.',
      'Search provider by DeepSeek.': 'Поисковый провайдер DeepSeek.',
      // Settings → Agent Presets (from screenshots)
      'Built-in': 'Встроенный',
      'In use': 'Используется',
      'Standard mode': 'Стандартный режим',
      'PTC mode': 'Режим PTC',
      'Minimal mode': 'Минимальный режим',
      'Creator mode': 'Режим Creator',
      'Full-featured code agent: file editing, terminal, file and web search, skills, planning, goals, sub-agents and workflows.': 'Полноценный агент для кода: редактирование файлов, терминал, поиск по файлам и в вебе, навыки, планирование, цели, субагенты и рабочие процессы.',
      'All standard mode features, with tools available through Code Mode SDK: the model can combine multi-step operations in a single TypeScript program.': 'Все возможности стандартного режима, а инструменты доступны через Code Mode SDK: модель может объединять многошаговые операции в одной TypeScript-программе.',
      'Code agent with two tools: persistent bash and str_replace_editor.': 'Агент для кода с двумя инструментами: постоянным bash и str_replace_editor.',
      'Built for developing custom presets: all standard mode features plus runtime inspection, plugin experiments, and preset creation hints.': 'Создан для разработки собственных пресетов: все возможности стандартного режима плюс инспекция рантайма, эксперименты с плагинами и подсказки по созданию пресетов.',
      'Create custom preset in Creator mode': 'Создать свой пресет в режиме Creator',
      // Workspace
      'Untitled': 'Без названия',
      'Loading plugins…': 'Загрузка плагинов…',
      'No results': 'Ничего не найдено',
      'No sessions': 'Нет сеансов',
      // DSH-specific
      'DeepSeek': 'DeepSeek',
      'MiMo': 'MiMo',
      'Thinking mode': 'Режим мышления',
      'Thinking budget': 'Бюджет мышления',
      // DSH Settings dialog (verified on device 0.1.2-rc.1)
      'Permission': 'Права',
      'Choose the default permission mode for new sessions': 'Режим прав по умолчанию для новых сессий',
      'Agent presets': 'Пресеты агентов',
      'Open configuration file': 'Открыть файл конфигурации',
      'Font size': 'Размер шрифта',
      'Only affects conversation text': 'Влияет только на текст беседы',
      'Theme': 'Тема',
      'General': 'Основные',
      'Provider': 'Провайдер',
      'Providers': 'Провайдеры',
      'Add provider': 'Добавить провайдера',
      'Add a custom provider': 'Добавить пользовательского провайдера',
      'Fetch available models': 'Получить список моделей',
      'Model catalog': 'Каталог моделей',
      'API protocol': 'API-протокол',
      'Base URL': 'Базовый URL',
      'Display name': 'Отображаемое имя',
      'Provider ID': 'ID провайдера',
      'Plugin configuration': 'Конфигурация плагинов',
      'Plugin list': 'Список плагинов',
      // Full-access confirmation dialog (verified on device 0.1.2-rc.1)
      'Enable Full access?': 'Включить полный доступ?',
      'Enable Full access': 'Включить полный доступ',
      'I understand the risks and want to continue': 'Я понимаю риски и хочу продолжить',
      'Cancel': 'Отмена'
    };
    function trText(n) {
      if (!n || n.nodeType !== 3) return;
      var p = n.parentElement;
      if (p && p.isContentEditable) return;
      var t = (n.data || '').trim();
      if (!t || t.length > 60) return;
      var v = D[t];
      if (v) n.data = v;
    }
    function trAttr(el) {
      if (!el || !el.getAttribute) return;
      var a = el.getAttribute('aria-label');
      if (a) { var v = D[a.trim()]; if (v) el.setAttribute('aria-label', v); }
      var ti = el.getAttribute('title');
      if (ti) { var w = D[ti.trim()]; if (w) el.setAttribute('title', w); }
      var ph = el.getAttribute('placeholder');
      if (ph) { var u = D[ph.trim()]; if (u) el.setAttribute('placeholder', u); }
    }
    // DSH renders part of its UI (access pill, model/effort popovers) inside
    // shadow roots, which a document.body tree-walker cannot see. Walk the
    // whole composed tree and translate text/attrs in every open shadow root.
    function collectText(root, out) {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = w.nextNode())) out.push(n);
    }
    function collectEls(root, out) {
      var nodes = root.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        out.push(nodes[i]);
        if (nodes[i].shadowRoot) collectEls(nodes[i].shadowRoot, out);
      }
      // Without this return scan() crashed on `els.length` before attaching
      // its watchers — the RU layer only ever translated the first text pass
      // and never saw shadow-root content.
      return out;
    }
    var __observed = [];
    // Full-document scans are expensive (every element + every shadow root),
    // so mutations only QUEUE a scan: bursts coalesce into one run 120ms
    // later. Without this the observer pegged the renderer on every DOM
    // change and froze the WebView.
    var __scanQueued = false;
    function queueScan() {
      if (__scanQueued) return;
      __scanQueued = true;
      setTimeout(function () { __scanQueued = false; scan(); }, 120);
    }
    function watch(root) {
      if (!root || __observed.indexOf(root) >= 0) return;
      __observed.push(root);
      try {
        new MutationObserver(queueScan).observe(root, { childList: true, subtree: true, characterData: true });
      } catch (e) {}
    }
    function scan() {
      if (!document.body || document.hidden) return;
      var texts = [];
      collectText(document.body, texts);
      for (var i = 0; i < texts.length && i < 6000; i++) trText(texts[i]);
      var els = collectEls(document.body, []);
      for (var j = 0; j < els.length; j++) {
        var e = els[j];
        if (!e || !e.tagName) continue;
        trAttr(e);
        if (e.shadowRoot) {
          watch(e.shadowRoot);
          var st = [];
          collectText(e.shadowRoot, st);
          for (var k = 0; k < st.length && k < 2000; k++) trText(st[k]);
        }
      }
    }
    function boot() {
      if (!document.body) { setTimeout(boot, 250); return; }
      scan();
      watch(document.body);
      watch(document.documentElement);
      // SPA navigation: re-scan after history changes so freshly routed
      // chrome is translated and any replaced style/node tree is repaired.
      try {
        var hook = function () { queueScan(); setTimeout(queueScan, 400); };
        window.addEventListener('popstate', hook);
        var push = history.pushState, rep = history.replaceState;
        history.pushState = function () { var r = push.apply(this, arguments); hook(); return r; };
        history.replaceState = function () { var r = rep.apply(this, arguments); hook(); return r; };
      } catch (e) {}
      for (var i = 1; i <= 8; i++) setTimeout(queueScan, i * 1000);
      setInterval(queueScan, 2000);
    }
    setTimeout(boot, 200);
    return true;
  })();
  return true;
})();
"""

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val language = AppPrefs.language(newBase)
        if (language != null) {
            val config = Configuration(newBase.resources.configuration)
            config.setLocale(Locale.forLanguageTag(language))
            super.attachBaseContext(newBase.createConfigurationContext(config))
        } else {
            super.attachBaseContext(newBase)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Apply saved theme before setContent so the color scheme is correct.
        applyThemeMode(AppPrefs.theme(this))
        startHarnessService(HarnessForegroundService.ACTION_START)

        setContent {
            val darkTheme = when (AppPrefs.theme(this)) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            val colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()
            MaterialTheme(colorScheme = colorScheme) {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    if (!AppPrefs.onboarded(this)) {
                        OnboardingScreen(onFinished = { recreate() })
                    } else {
                        MainScreen()
                    }
                }
            }
        }
    }

    @Composable
    private fun OnboardingScreen(onFinished: (String) -> Unit) {
        var selected by remember { mutableStateOf<String?>(null) }
        var saving by remember { mutableStateOf(false) }
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(48.dp))
            Text("DeepSeek Harness", style = MaterialTheme.typography.headlineMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.onboarding_title), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.onboarding_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(32.dp))
            APP_LANGUAGES.forEach { lang ->
                val checked = selected == lang.code
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .clickable { selected = lang.code },
                    colors = CardDefaults.cardColors(
                        containerColor = if (checked) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = checked, onClick = { selected = lang.code })
                        Spacer(Modifier.width(12.dp))
                        Text(lang.nativeName, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = {
                    saving = true
                    selected?.let { lang ->
                        AppPrefs.setLanguage(this@MainActivity, lang)
                        AppPrefs.setOnboarded(this@MainActivity)
                        syncDshLanguage(lang)
                        onFinished(lang)
                    }
                },
                enabled = selected != null && !saving,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.onboarding_continue))
            }
        }
    }

    @Composable
    private fun LanguageDialog(onDismiss: () -> Unit) {
        var selected by remember { mutableStateOf(AppPrefs.language(this) ?: "en") }
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.change_language)) },
            text = {
                Column {
                    APP_LANGUAGES.forEach { lang ->
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { selected = lang.code }.padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = selected == lang.code, onClick = { selected = lang.code })
                            Spacer(Modifier.width(10.dp))
                            Text(lang.nativeName)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        AppPrefs.setLanguage(this, selected)
                        syncDshLanguage(selected)
                        onDismiss()
                        recreate()
                    },
                ) { Text(stringResource(R.string.onboarding_continue)) }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.btn_cancel)) }
            },
        )
    }

    private fun startHarnessService(action: String) {
        val intent = Intent(this, HarnessForegroundService::class.java).apply { this.action = action }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    /**
     * Mirrors the app language into the embedded DSH web UI. DSH stores its UI
     * language server-side at `~/.dsh/settings.yaml` under `locale.preference`;
     * it supports `en` and `zh` (no Russian). We rewrite the file and the next
     * WebView page load picks the preference up. Russian maps to English: the
     * RU injection layer translates the English base, so DSH must not stay on
     * 中文 — otherwise there is nothing for the dictionary to translate.
     */
    private fun syncDshLanguage(lang: String) {
        val dshLang = when (lang) {
            "en", "zh" -> lang
            "ru" -> "en"
            else -> return
        }
        val file = File(filesDir, "runtime-root/data/data/com.termux/files/home/.dsh/settings.yaml")
        if (!file.isFile) return
        try {
            val lines = file.readLines().toMutableList()
            val localeIdx = lines.indexOfFirst { it.trimStart() == "locale:" }
            if (localeIdx >= 0) {
                // Preference lives in the indented block after "locale:".
                var prefIdx = -1
                var i = localeIdx + 1
                while (i < lines.size && lines[i].startsWith(" ")) {
                    if (lines[i].trimStart().startsWith("preference:")) prefIdx = i
                    i++
                }
                if (prefIdx >= 0) {
                    lines[prefIdx] = "  preference: $dshLang"
                } else {
                    lines.add(localeIdx + 1, "  preference: $dshLang")
                }
            } else {
                if (lines.lastOrNull()?.isNotBlank() == true) lines.add("")
                lines.add("locale:")
                lines.add("  preference: $dshLang")
            }
            file.writeText(lines.joinToString("\n") + "\n")
        } catch (_: Exception) {
            // Runtime may still be installing; sync is best-effort and retried
            // implicitly on the next language change.
        }
    }

    private fun applyAppLanguage(lang: String) {
        AppPrefs.setLanguage(this, lang)
        syncDshLanguage(lang)
        recreate()
    }

    /** Applies the theme mode. Theme switching is handled in Compose via
     *  darkColorScheme()/lightColorScheme() based on the stored preference. */
    private fun applyThemeMode(mode: String) {
        // Store the preference; Compose picks it up on next recomposition.
        AppPrefs.setTheme(this, mode)
    }

    /** The dsh web credentials store (server side of the installed runtime). */
    private fun dshCredentialsFile(): File =
        File(filesDir, "runtime-root/data/data/com.termux/files/home/.dsh/.credentials.yaml")

    private fun loadDshApiKey(): String? {
        val file = dshCredentialsFile()
        if (!file.isFile) return null
        return try {
            file.readLines()
                .firstOrNull { it.trimStart().startsWith("DEEPSEEK_API_KEY:") }
                ?.substringAfter(':')
                ?.trim()
                ?.trim('"')
        } catch (_: Exception) {
            null
        }
    }

    /** Rewrites the DEEPSEEK_API_KEY ref while preserving all other records. */
    private fun saveDshApiKey(key: String): Boolean {
        if (key.isBlank()) return false
        val file = dshCredentialsFile()
        return try {
            file.parentFile?.mkdirs()
            val lines = if (file.isFile) file.readLines().toMutableList() else mutableListOf("version: 1", "records: {}")
            val refsIdx = lines.indexOfFirst { it.trimStart() == "refs:" }
            val oldIdx = lines.indexOfFirst { it.trimStart().startsWith("DEEPSEEK_API_KEY:") }
            if (oldIdx >= 0) lines.removeAt(oldIdx)
            val newLine = "  DEEPSEEK_API_KEY: \"$key\""
            if (refsIdx >= 0) {
                lines.add(refsIdx + 1, newLine)
            } else {
                if (lines.lastOrNull()?.isNotBlank() == true) lines.add("")
                lines.add("refs:")
                lines.add(newLine)
            }
            file.writeText(lines.joinToString("\n") + "\n")
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun removeDshApiKey() {
        val file = dshCredentialsFile()
        if (!file.isFile) return
        try {
            val lines = file.readLines().toMutableList()
            lines.removeAll { it.trimStart().startsWith("DEEPSEEK_API_KEY:") }
            file.writeText(lines.joinToString("\n") + "\n")
        } catch (_: Exception) {
        }
    }

    @Composable
    private fun MainScreen() {
        val snapshot by HarnessRuntimeState.state.collectAsState()
        // While the harness is booting we paint the whole screen like a dark
        // terminal; make the status bar match so there is no light seam.
        val defaultStatusColor = remember { window.statusBarColor }
        SideEffect {
            window.statusBarColor =
                if (snapshot.ready) defaultStatusColor else android.graphics.Color.rgb(11, 14, 20)
        }

        if (snapshot.ready) {
            // Full-bleed DSH UI (phone mode). Native controls live on a slim
            // edge handle at the right border (vertically centered) so they
            // never cover DSH's own header buttons or dialogs. Tapping the
            // handle expands the language/settings/stop chips.
            var settingsOpen by remember { mutableStateOf(false) }
            var toolsOpen by remember { mutableStateOf(false) }
            var railHidden by rememberSaveable { mutableStateOf(false) }
            var webViewRef by remember { mutableStateOf<WebView?>(null) }
            // imePadding: with targetSdk 35 edge-to-edge is forced and
            // adjustResize never resizes the window — without this the
            // composer stays hidden under the soft keyboard.
            Box(modifier = Modifier.fillMaxSize().imePadding()) {
                HarnessWebView(
                    url = snapshot.harnessUrl ?: HARNESS_URL,
                    modifier = Modifier.fillMaxSize(),
                    onAttach = {
                        webViewRef = it; currentWebView = it
                        // Sync the chip state with the page's stored preference.
                        it?.evaluateJavascript(
                            "(function(){try{return localStorage.getItem('dshRailHidden')||'0';}catch(e){return '0';}})()",
                        ) { v -> railHidden = v?.contains("1") == true }
                        // Re-register the bundled typeface after (re)load —
                        // @font-face styles die with the page.
                        val fam = AppPrefs.fontFamily(this@MainActivity)
                        if (bundledFonts.containsKey(fam)) {
                            registerCustomFont(it, fam)
                        }
                    },
                )
                if (snapshot.stage == HarnessStage.RUNNING) {
                    Row(
                        modifier = Modifier.align(Alignment.CenterEnd),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (toolsOpen) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                QuickChip(
                                    icon = if (railHidden) "◨" else "◧",
                                    description = stringResource(R.string.btn_hide_rail),
                                ) {
                                    // The page toggles the class itself and
                                    // reports the new state back — the chip's
                                    // Compose state must never drift from the
                                    // page (it used to stick hidden forever).
                                    webViewRef?.evaluateJavascript(
                                        "(function(){var el=document.documentElement;" +
                                            "var now=!el.classList.contains('dsh-hide-rail');" +
                                            "el.classList.toggle('dsh-hide-rail', now);" +
                                            "try{localStorage.setItem('dshRailHidden', now?'1':'0');}catch(e){}" +
                                            "return now;})()",
                                    ) { v -> railHidden = v?.contains("true") == true }
                                    toolsOpen = false
                                }
                                QuickChip(
                                    icon = "⚙",
                                    description = stringResource(R.string.action_settings),
                                ) {
                                    settingsOpen = true
                                    toolsOpen = false
                                }
                                QuickChip(
                                    icon = "⏹",
                                    description = stringResource(R.string.btn_stop),
                                ) {
                                    startHarnessService(HarnessForegroundService.ACTION_STOP)
                                    toolsOpen = false
                                }
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(topStart = 14.dp, bottomStart = 14.dp),
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.75f),
                            tonalElevation = 2.dp,
                            shadowElevation = 3.dp,
                            modifier = Modifier.clickable { toolsOpen = !toolsOpen },
                        ) {
                            Box(
                                modifier = Modifier.width(22.dp).height(76.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    if (toolsOpen) "⟩" else "⟨",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                if (settingsOpen) {
                    NativeSettingsSheet(
                        webView = webViewRef,
                        onClose = { settingsOpen = false },
                    )
                }
            }
        } else {
            var showLanguageDialog by remember { mutableStateOf(false) }
            Column(modifier = Modifier.fillMaxSize().background(TermBg)) {
                DshTopBar(
                    stage = snapshot.stage,
                    onRetry = { startHarnessService(HarnessForegroundService.ACTION_START) },
                    onStop = { startHarnessService(HarnessForegroundService.ACTION_STOP) },
                    onChangeLanguage = { showLanguageDialog = true },
                )
                RuntimeStatusScreen(
                    snapshot = snapshot,
                    onRetry = { startHarnessService(HarnessForegroundService.ACTION_START) },
                    onReinstall = { startHarnessService(HarnessForegroundService.ACTION_REINSTALL) },
                    onResetRuntime = { startHarnessService(HarnessForegroundService.ACTION_RESET_RUNTIME) },
                )
            }
            if (showLanguageDialog) {
                LanguageDialog(onDismiss = { showLanguageDialog = false })
            }
        }
    }

    @Composable
    private fun QuickChip(icon: String, description: String, onClick: () -> Unit) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
            tonalElevation = 3.dp,
            shadowElevation = 4.dp,
        ) {
            IconButton(onClick = onClick) {
                Text(icon, style = MaterialTheme.typography.titleLarge)
            }
        }
    }

    /** Maps a host directory to a guest path inside the proot sandbox.
     *  Only internal storage is supported: proot binds host /sdcard to
     *  guest /sdcard, so /storage/emulated/0/<rel> becomes /sdcard/<rel>.
     *  Returns guest path + display title, or null for unsupported roots. */
    private fun mapHostDirToGuestPath(dir: File): Pair<String, String>? = runCatching {
        val canon = dir.canonicalFile.path
        val emulated = "/storage/emulated/0"
        val rel = when {
            canon == emulated || canon == "/sdcard" -> ""
            canon.startsWith("$emulated/") -> canon.removePrefix(emulated)
            canon.startsWith("/sdcard/") -> canon.removePrefix("/sdcard")
            else -> return null
        }
        val guest = "/sdcard$rel"
        val title = rel.trim('/').substringAfterLast('/').ifBlank { "Workspace" }
        guest to title
    }.getOrNull()

    /**
     * In-app directory browser. The system SAF picker depends on device OEM
     * documents UI and often confuses users; this dialog walks the internal
     * storage tree directly (allowed by MANAGE_EXTERNAL_STORAGE) and returns
     * a real path — no SAF URIs involved.
     */
    @Composable
    private fun FolderPickerDialog(initial: File, onDismiss: () -> Unit, onPick: (File) -> Unit) {
        var current by remember { mutableStateOf(initial) }
        val dirs = remember(current) {
            current.listFiles { f -> f.isDirectory && !f.name.startsWith(".") }
                ?.sortedBy { it.name.lowercase() } ?: emptyList()
        }
        val canGoUp = remember(current) {
            val p = current.parentFile ?: return@remember false
            p.path == "/storage/emulated/0" || p.path.startsWith("/storage/emulated/") || p.path == "/sdcard"
        }
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.ws_pick_title)) },
            text = {
                Column {
                    Text(
                        current.path,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (canGoUp) {
                        TextButton(onClick = { current = current.parentFile!! }) {
                            Text("↩ …")
                        }
                    }
                    Column(
                        modifier = Modifier
                            .height(320.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        if (dirs.isEmpty()) {
                            Text(
                                "—",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        dirs.forEach { d ->
                            TextButton(onClick = { current = d }) {
                                Text("📁 ${d.name}", maxLines = 1)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { onPick(current) }) {
                    Text(stringResource(R.string.ws_pick_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.btn_close))
                }
            },
        )
    }

    @Composable
    private fun NativeSettingsSheet(webView: WebView?, onClose: () -> Unit) {
        var dshMode by remember { mutableStateOf("") }
        var dshAccess by remember { mutableStateOf("") }
        var dshEffort by remember { mutableStateOf("") }
        var dshResult by remember { mutableStateOf("") }
        @OptIn(ExperimentalMaterial3Api::class)
        ModalBottomSheet(onDismissRequest = onClose) {
            var apiKey by remember { mutableStateOf(loadDshApiKey() ?: "") }
            var feedback by remember { mutableStateOf("") }
            var langSelected by remember { mutableStateOf(AppPrefs.language(this@MainActivity) ?: "en") }
            var showFolderPicker by remember { mutableStateOf(false) }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(stringResource(R.string.action_settings), style = MaterialTheme.typography.headlineSmall)

                Text(stringResource(R.string.change_language), style = MaterialTheme.typography.titleMedium)
                APP_LANGUAGES.forEach { lang ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { langSelected = lang.code }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = langSelected == lang.code, onClick = { langSelected = lang.code })
                        Spacer(Modifier.width(10.dp))
                        Text(lang.nativeName)
                        Spacer(Modifier.weight(1f))
                        if (lang.code == "zh") {
                            Text(stringResource(R.string.settings_lang_harness_zh), style = MaterialTheme.typography.labelSmall)
                        }
                        if (lang.code == "ru") {
                            Text(stringResource(R.string.settings_lang_harness_en), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                Button(
                    onClick = {
                        applyAppLanguage(langSelected)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.settings_lang_apply))
                }
                Text(
                    stringResource(R.string.settings_lang_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                HorizontalDivider()

                // ── Theme ──────────────────────────────────────────────────
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.titleMedium)
                var themeSelected by remember { mutableStateOf(AppPrefs.theme(this@MainActivity)) }
                val themes = listOf(
                    Triple("light", stringResource(R.string.settings_theme_light), "☀️"),
                    Triple("dark", stringResource(R.string.settings_theme_dark), "🌙"),
                    Triple("system", stringResource(R.string.settings_theme_system), "💻"),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    themes.forEach { (key, label, icon) ->
                        FilterChip(
                            selected = themeSelected == key,
                            onClick = {
                                themeSelected = key
                                AppPrefs.setTheme(this@MainActivity, key)
                                applyThemeMode(key)
                            },
                            label = { Text("$icon $label") },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                HorizontalDivider()

                Text(stringResource(R.string.settings_api_key), style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text(stringResource(R.string.settings_api_key_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            feedback = if (saveDshApiKey(apiKey.trim())) {
                                // The key reaches DSH via the DEEPSEEK_API_KEY
                                // env var, which is applied only when the
                                // `dsh web` process starts — restart to pick
                                // it up (reload alone would not be enough).
                                restartHarness()
                                getString(R.string.settings_key_saved)
                            } else {
                                getString(R.string.settings_key_save_failed)
                            }
                        },
                        enabled = apiKey.isNotBlank(),
                    ) {
                        Text(stringResource(R.string.settings_key_save))
                    }
                    OutlinedButton(
                        onClick = {
                            removeDshApiKey()
                            apiKey = ""
                            restartHarness()
                            feedback = getString(R.string.settings_key_removed)
                        },
                    ) {
                        Text(stringResource(R.string.settings_key_remove))
                    }
                }
                if (feedback.isNotBlank()) {
                    Text(feedback, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                Text(
                    stringResource(R.string.settings_restart_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                HorizontalDivider()

                Text(stringResource(R.string.dsh_session_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.dsh_session_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SheetPickerRow(
                    label = stringResource(R.string.dsh_mode),
                    options = listOf(
                        "Стандартный" to "standard",
                        "PTC" to "ptc",
                        "Минимальный" to "minimal",
                        "Creator" to "creator",
                    ),
                    selected = dshMode,
                ) { key ->
                    dshMode = key
                    applyDshPicker(webView, listOf(allModePillLabels(), modeLabels(key))) { res -> dshResult = res }
                }
                SheetPickerRow(
                    label = stringResource(R.string.dsh_access),
                    options = listOf(
                        "Только чтение" to "read",
                        "Запись в области" to "write",
                        "Полный доступ" to "full",
                    ),
                    selected = dshAccess,
                ) { key ->
                    dshAccess = key
                    applyDshPicker(webView, listOf(allAccessPillLabels(), accessLabels(key))) { res -> dshResult = res }
                }
                SheetPickerRow(
                    label = stringResource(R.string.dsh_effort),
                    options = listOf(
                        "Low" to "low",
                        "Medium" to "medium",
                        "High" to "high",
                        "Ultra" to "ultra",
                    ),
                    selected = dshEffort,
                ) { key ->
                    dshEffort = key
                    applyDshPicker(
                        webView,
                        listOf(
                            listOf("High", "Low", "Medium", "Ultra", "Auto", "Высокое", "Низкое", "Среднее", "Максимальное"),
                            listOf("Усилие", "Effort", "Thinking"),
                            effortValueLabels(key),
                        ),
                    ) { res -> dshResult = res }
                }
                if (dshResult.isNotBlank()) {
                    val ok = dshResult.startsWith("ok")
                    Text(
                        (if (ok) getString(R.string.dsh_pick_ok) else getString(R.string.dsh_pick_fail)) + " · " + dshResult,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                }

                HorizontalDivider()

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.settings_server), style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.width(8.dp))
                    Text("http://127.0.0.1:3080", style = MaterialTheme.typography.bodyMedium)
                }

                HorizontalDivider()

                Text(stringResource(R.string.storage_title), style = MaterialTheme.typography.titleSmall)
                Text(
                    stringResource(R.string.storage_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (hasAllFilesAccess()) {
                    Text(
                        stringResource(R.string.storage_ok),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Button(onClick = { requestAllFilesAccess() }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.storage_grant))
                    }
                }
                OutlinedButton(onClick = { pickWorkspaceFolder() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.ws_add))
                }
                OutlinedButton(
                    onClick = { showFolderPicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.ws_pick_inapp))
                }
                OutlinedButton(
                    onClick = {
                        feedback = if (ChatArchive.backupNow(this@MainActivity) != null) {
                            getString(R.string.backup_done)
                        } else {
                            getString(R.string.backup_failed)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.backup_now))
                }
                if (showFolderPicker) {
                    FolderPickerDialog(
                        initial = File("/sdcard"),
                        onDismiss = { showFolderPicker = false },
                        onPick = { dir ->
                            showFolderPicker = false
                            val mapped = mapHostDirToGuestPath(dir)
                            feedback = if (mapped != null && registerWorkspace(mapped.first, mapped.second)) {
                                restartHarness()
                                getString(R.string.ws_added, mapped.second)
                            } else {
                                getString(R.string.ws_add_failed)
                            }
                        },
                    )
                }

                HorizontalDivider()

                // ── Chat font ──────────────────────────────────────────────
                Text(stringResource(R.string.font_section), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.font_size), style = MaterialTheme.typography.labelMedium)
                var fontSizeSel by remember { mutableStateOf(AppPrefs.fontZoom(this@MainActivity)) }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("1" to "DSH", "0.95" to "95%", "1.1" to "110%", "1.25" to "125%", "1.4" to "140%").forEach { (key, label) ->
                        FilterChip(
                            selected = fontSizeSel == key,
                            onClick = {
                                fontSizeSel = key
                                AppPrefs.setFontZoom(this@MainActivity, key)
                                webView?.evaluateJavascript(
                                    "(function(v){try{localStorage.setItem('dshFontZoom',v);}catch(e){}" +
                                        "if(window.__dshApplyFont)window.__dshApplyFont();})('" + key + "')",
                                    null,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                Text(stringResource(R.string.font_family), style = MaterialTheme.typography.labelMedium)
                var fontFamSel by remember { mutableStateOf(AppPrefs.fontFamily(this@MainActivity)) }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "" to stringResource(R.string.font_system),
                        "inter" to "Inter",
                        "lora" to "Lora",
                        "ibmsans" to "IBM Sans",
                    ).forEach { (key, label) ->
                        FilterChip(
                            selected = fontFamSel == key,
                            onClick = {
                                fontFamSel = key
                                AppPrefs.setFontFamily(this@MainActivity, key)
                                registerCustomFont(webView, key)
                                webView?.evaluateJavascript(
                                    "(function(v){try{localStorage.setItem('dshFontFamily',v);}catch(e){}" +
                                        "if(window.__dshApplyFont)window.__dshApplyFont();})('" + key + "')",
                                    null,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "jbmono" to "JetBrains Mono",
                        "ibmmono" to "IBM Plex Mono",
                        "serif" to stringResource(R.string.font_serif),
                        "mono" to stringResource(R.string.font_mono),
                    ).forEach { (key, label) ->
                        FilterChip(
                            selected = fontFamSel == key,
                            onClick = {
                                fontFamSel = key
                                AppPrefs.setFontFamily(this@MainActivity, key)
                                registerCustomFont(webView, key)
                                webView?.evaluateJavascript(
                                    "(function(v){try{localStorage.setItem('dshFontFamily',v);}catch(e){}" +
                                        "if(window.__dshApplyFont)window.__dshApplyFont();})('" + key + "')",
                                    null,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                // Live preview with the actual selected typeface and metrics.
                val previewTypeface = remember(fontFamSel) {
                    val asset = when (fontFamSel) {
                        "inter" -> "fonts/Inter.ttf"
                        "lora" -> "fonts/Lora.ttf"
                        "jbmono" -> "fonts/JetBrainsMono.ttf"
                        else -> null
                    }
                    asset?.let { runCatching { android.graphics.Typeface.createFromAsset(assets, it) }.getOrNull() }
                }
                AndroidView(
                    factory = { ctx ->
                        android.widget.TextView(ctx).apply {
                            setTextColor(android.graphics.Color.WHITE)
                            textSize = 16f
                            text = "Быстрая коричневая лиса прыгает 0123 {code}"
                        }
                    },
                    update = { tv ->
                        tv.typeface = previewTypeface ?: android.graphics.Typeface.DEFAULT
                        tv.textSize = 16f * (fontSizeSel.toFloatOrNull() ?: 1f)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
                        .padding(12.dp),
                )
                Text(stringResource(R.string.font_lineheight), style = MaterialTheme.typography.labelMedium)
                var lineHeightSel by remember { mutableStateOf(AppPrefs.lineHeight(this@MainActivity)) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("" to "DSH", "1.5" to "1.5", "1.7" to "1.7", "1.9" to "1.9").forEach { (key, label) ->
                        FilterChip(
                            selected = lineHeightSel == key,
                            onClick = {
                                lineHeightSel = key
                                AppPrefs.setLineHeight(this@MainActivity, key)
                                webView?.evaluateJavascript(
                                    "(function(v){try{localStorage.setItem('dshLineHeight',v);}catch(e){}" +
                                        "if(window.__dshApplyFont)window.__dshApplyFont();})('" + key + "')",
                                    null,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                OutlinedButton(
                    onClick = {
                        AppPrefs.setFontZoom(this@MainActivity, "1")
                        AppPrefs.setFontFamily(this@MainActivity, "")
                        AppPrefs.setLineHeight(this@MainActivity, "")
                        fontSizeSel = "1"; fontFamSel = ""; lineHeightSel = ""
                        webView?.evaluateJavascript(
                            "(function(){try{localStorage.removeItem('dshFontZoom');" +
                                "localStorage.removeItem('dshFontFamily');localStorage.removeItem('dshLineHeight');" +
                                "}catch(e){} if(window.__dshApplyFont)window.__dshApplyFont();})()",
                            null,
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.font_reset))
                }

                HorizontalDivider()

                // ── DeepSeek Harness update ────────────────────────────────
                Button(
                    onClick = {
                        val intent = android.content.Intent(this@MainActivity, HarnessForegroundService::class.java)
                            .setAction(HarnessForegroundService.ACTION_UPDATE_HARNESS)
                        runCatching { startForegroundService(intent) }
                        feedback = getString(R.string.harness_update_started)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.harness_update))
                }

                HorizontalDivider()

                // ── Android SDK in the sandbox ─────────────────────────────
                Text(stringResource(R.string.sdk_section), style = MaterialTheme.typography.titleMedium)
                val sdkInstalled = ChatArchive.dshHome(this@MainActivity)
                    .resolve("android-sdk/.installed").isFile
                val sdkVersions = ChatArchive.dshHome(this@MainActivity)
                    .resolve("android-sdk/versions.txt")
                    .takeIf { it.isFile }?.readLines()?.take(3)?.joinToString("\n") ?: ""
                Text(
                    if (sdkInstalled) sdkVersions else stringResource(R.string.sdk_missing),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = {
                        val intent = android.content.Intent(this@MainActivity, HarnessForegroundService::class.java)
                            .setAction(HarnessForegroundService.ACTION_INSTALL_SDK)
                        runCatching { startForegroundService(intent) }
                        feedback = getString(R.string.sdk_started)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(if (sdkInstalled) R.string.sdk_update else R.string.sdk_install))
                }

                HorizontalDivider()

                Text(stringResource(R.string.dsh_model_pick), style = MaterialTheme.typography.titleSmall)
                OutlinedButton(onClick = {
                    openDshModelPicker { res -> dshResult = "model:$res" }
                }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.dsh_model_pick_btn))
                }
                Button(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.btn_close))
                }
            }
        }
    }

    @Composable
    private fun TrafficDot(color: Color) {
        Box(Modifier.size(10.dp).background(color, CircleShape))
    }

    @Composable
    private fun Mono(
        text: String,
        size: TextUnit,
        color: Color = TermText,
        weight: FontWeight = FontWeight.Normal,
    ) {
        Text(
            text,
            fontFamily = FontFamily.Monospace,
            fontSize = size,
            fontWeight = weight,
            color = color,
        )
    }

    @Composable
    private fun RuntimeStatusScreen(
        snapshot: HarnessSnapshot,
        onRetry: () -> Unit,
        onReinstall: () -> Unit,
        onResetRuntime: () -> Unit,
    ) {
        val uiLang = AppPrefs.language(LocalContext.current) ?: "ru"
        var logsExpanded by rememberSaveable { mutableStateOf(false) }
        val logLineCount = snapshot.logTail.lineSequence().count { it.isNotBlank() }
        val showBootSpinner = snapshot.stage in setOf(
            HarnessStage.BOOTSTRAPPING,
            HarnessStage.VERIFYING,
            HarnessStage.INSTALLING_HARNESS,
            HarnessStage.STARTING,
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(TermBg)
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Terminal window chrome.
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = TermPanel,
                border = BorderStroke(1.dp, TermBorder),
            ) {
                Column {
                    // Title bar: traffic lights, app name, stage marker.
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(TermHeader)
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TrafficDot(TermRed)
                        Spacer(Modifier.width(6.dp))
                        TrafficDot(TermYellow)
                        Spacer(Modifier.width(6.dp))
                        TrafficDot(TermGreen)
                        Spacer(Modifier.width(12.dp))
                        Mono(stringResource(R.string.app_name), 12.sp, TermText, FontWeight.SemiBold)
                        Spacer(Modifier.width(8.dp))
                        Mono("· 127.0.0.1:3080", 10.sp, TermDim)
                        Spacer(Modifier.weight(1f))
                        Mono("● " + snapshot.stage.name, 10.sp, stageColor(snapshot.stage), FontWeight.Bold)
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(TermBorder))

                    Column(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        // Current command + live status, like a shell prompt.
                        Row {
                            Mono("$ ", 13.sp, TermGreen, FontWeight.Bold)
                            Spacer(Modifier.width(8.dp))
                            Mono(RuntimeStatusMessages.localize(uiLang, snapshot.message), 13.sp, TermText)
                        }
                        snapshot.progress?.let { p ->
                            LinearProgressIndicator(
                                progress = { p },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                color = TermGreen,
                                trackColor = TermHeader,
                            )
                        }
                        if (snapshot.message.contains("кэш") || snapshot.message.contains("cached") || snapshot.message.contains("cache")) {
                            Mono(stringResource(R.string.cache_hint), 11.sp, TermYellow)
                        }
                        if (showBootSpinner) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = TermGreen,
                                )
                                Spacer(Modifier.width(10.dp))
                                Mono(stringResource(R.string.first_run_hint), 11.sp, TermDim)
                            }
                        }

                        snapshot.error?.let { error ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFF2A161A),
                                border = BorderStroke(1.dp, Color(0xFF6B2A30)),
                            ) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Mono(stringResource(R.string.error_title), 12.sp, TermRed, FontWeight.Bold)
                                    Mono(
                                        RuntimeStatusMessages.localize(uiLang, error),
                                        11.sp,
                                        TermLogText,
                                    )
                                }
                            }
                        }

                        // Compact, collapsible log console.
                        if (snapshot.logTail.isNotBlank()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(TermHeader)
                                    .clickable { logsExpanded = !logsExpanded }
                                    .padding(horizontal = 10.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Mono(if (logsExpanded) "▾" else "▸", 11.sp, TermGreen, FontWeight.Bold)
                                Spacer(Modifier.width(8.dp))
                                Mono(stringResource(R.string.log_tail_title), 11.sp, TermText, FontWeight.SemiBold)
                                Spacer(Modifier.width(6.dp))
                                Mono("[$logLineCount]", 10.sp, TermDim)
                                Spacer(Modifier.weight(1f))
                                Mono(
                                    stringResource(if (logsExpanded) R.string.log_hide else R.string.log_show),
                                    10.sp,
                                    TermBlue,
                                )
                            }
                            AnimatedVisibility(visible = logsExpanded) {
                                Column(
                                    Modifier.padding(top = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Box(
                                        Modifier
                                            .fillMaxWidth()
                                            .background(Color(0xFF0A0D13), RoundedCornerShape(8.dp))
                                            .border(1.dp, TermBorder, RoundedCornerShape(8.dp))
                                            .padding(10.dp),
                                    ) {
                                        Text(
                                            snapshot.logTail,
                                            fontFamily = FontFamily.Monospace,
                                            fontSize = 10.sp,
                                            lineHeight = 14.sp,
                                            color = TermLogText,
                                        )
                                    }
                                    OutlinedButton(
                                        onClick = { copyToClipboard(snapshot.logTail) },
                                        modifier = Modifier.fillMaxWidth(),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TermBlue),
                                        border = BorderStroke(1.dp, TermBorder),
                                    ) {
                                        Text(stringResource(R.string.btn_copy_log))
                                    }
                                }
                            }
                        }

                        // Actions for the stopped / error states.
                        if (snapshot.stage == HarnessStage.ERROR || snapshot.stage == HarnessStage.STOPPED) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = onRetry,
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFF14301F),
                                        contentColor = TermGreen,
                                    ),
                                    border = BorderStroke(1.dp, Color(0xFF2E7D4F)),
                                ) {
                                    Text(stringResource(R.string.btn_retry))
                                }
                                OutlinedButton(
                                    onClick = onReinstall,
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TermText),
                                    border = BorderStroke(1.dp, TermBorder),
                                ) {
                                    Text(stringResource(R.string.btn_reinstall_harness))
                                }
                            }

                            if (!snapshot.fullResetConfirmed) {
                                OutlinedButton(
                                    onClick = { HarnessRuntimeState.update { it.copy(fullResetConfirmed = true) } },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TermRed),
                                    border = BorderStroke(1.dp, Color(0xFF6B2A30)),
                                ) {
                                    Text(stringResource(R.string.btn_reset_runtime))
                                }
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFF2A161A),
                                    border = BorderStroke(1.dp, Color(0xFF6B2A30)),
                                ) {
                                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Mono(stringResource(R.string.reset_runtime_warning), 11.sp, TermLogText)
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(
                                                onClick = {
                                                    HarnessRuntimeState.update { it.copy(fullResetConfirmed = false) }
                                                    onResetRuntime()
                                                },
                                                modifier = Modifier.weight(1f),
                                                colors = ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFF3A1519),
                                                    contentColor = TermRed,
                                                ),
                                            ) {
                                                Text(stringResource(R.string.btn_reset_runtime_confirm))
                                            }
                                            OutlinedButton(
                                                onClick = { HarnessRuntimeState.update { it.copy(fullResetConfirmed = false) } },
                                                modifier = Modifier.weight(1f),
                                                colors = ButtonDefaults.outlinedButtonColors(contentColor = TermText),
                                                border = BorderStroke(1.dp, TermBorder),
                                            ) {
                                                Text(stringResource(R.string.btn_cancel))
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Box(Modifier.fillMaxWidth().height(1.dp).background(TermBorder))
                        Mono(stringResource(R.string.privacy_note), 10.sp, TermDim)
                    }
                }
            }
        }
    }

    @Composable
    private fun DshTopBar(stage: HarnessStage, onRetry: () -> Unit, onStop: () -> Unit, onChangeLanguage: () -> Unit = {}) {
        @OptIn(ExperimentalMaterial3Api::class)
        TopAppBar(
            title = {
                Column {
                    Mono(stringResource(R.string.app_name), 14.sp, TermText, FontWeight.SemiBold)
                    Mono(stringResource(R.string.app_subtitle), 10.sp, TermDim)
                }
            },
            actions = {
                IconButton(onClick = onChangeLanguage) { Text("🌐") }
                if (stage == HarnessStage.RUNNING) {
                    TextButton(onClick = onStop) {
                        Mono(stringResource(R.string.btn_stop), 13.sp, TermGreen, FontWeight.SemiBold)
                    }
                } else {
                    IconButton(onClick = onRetry) { Mono("↻", 18.sp, TermText) }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = TermBg,
                scrolledContainerColor = TermBg,
                titleContentColor = TermText,
                actionIconContentColor = TermText,
            ),
        )
    }

    /**
     * Whether the app can read the real /sdcard (needed by the proot bind).
     * On Android 11+ this requires the user to grant "All files access".
     */
    private fun hasAllFilesAccess(): Boolean =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R ||
            android.os.Environment.isExternalStorageManager()

    private fun requestAllFilesAccess() {
        if (hasAllFilesAccess()) return
        val intent = android.content.Intent(
            android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.parse("package:$packageName"),
        )
        try {
            startActivity(intent)
        } catch (_: Exception) {
            try {
                startActivity(android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            } catch (_: Exception) {
            }
        }
    }

    /** In-flight result of a DSH <input type=file> request, routed to the system picker. */
    private var pendingFileChooser: ((Array<android.net.Uri>?) -> Unit)? = null

    /**
     * DSH's web UI (add files to chat, attach files, avatar upload…) triggers
     * file inputs. A stock WebView shows nothing for those, so route them to
     * the real Android document picker.
     */
    private fun openSystemFileChooser(
        callback: (Array<android.net.Uri>?) -> Unit,
        params: WebChromeClient.FileChooserParams?,
    ) {
        if (pendingFileChooser != null) {
            // A chooser is already open; cancel the previous request.
            val stale = pendingFileChooser
            pendingFileChooser = null
            stale?.invoke(null)
        }
        pendingFileChooser = callback
        // Ask what to attach: files, gallery photos, or a project folder that
        // becomes a new DSH workspace (reuses the in-app browser).
        runOnUiThread {
            android.app.AlertDialog.Builder(this)
                .setTitle(R.string.attach_choose)
                .setItems(
                    arrayOf(
                        getString(R.string.attach_files),
                        getString(R.string.attach_gallery),
                        getString(R.string.attach_folder),
                    ),
                ) { dialog, which ->
                    dialog.dismiss()
                    when (which) {
                        0 -> openFilesIntent(callback, params)
                        1 -> openGalleryIntent(callback)
                        else -> {
                            pendingFileChooser = null
                            callback(null)
                            showNativeFolderPicker(File("/sdcard")) { dir ->
                                val mapped = mapHostDirToGuestPath(dir)
                                if (mapped != null && registerWorkspace(mapped.first, mapped.second)) {
                                    restartHarness()
                                    android.widget.Toast.makeText(
                                        this,
                                        getString(R.string.ws_added, mapped.second),
                                        android.widget.Toast.LENGTH_LONG,
                                    ).show()
                                } else {
                                    android.widget.Toast.makeText(
                                        this,
                                        getString(R.string.ws_add_failed),
                                        android.widget.Toast.LENGTH_LONG,
                                    ).show()
                                }
                            }
                        }
                    }
                }
                .setNegativeButton(android.R.string.cancel) { dialog, _ ->
                    dialog.dismiss()
                    pendingFileChooser = null
                    callback(null)
                }
                .show()
        }
    }

    /** Gallery-only picker for attaching photos to the chat. */
    private fun openGalleryIntent(callback: (Array<android.net.Uri>?) -> Unit) {
        val intent = android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        runCatching { startActivityForResult(intent, REQ_FILE_CHOOSER) }
            .onFailure {
                val cb = pendingFileChooser
                pendingFileChooser = null
                cb?.invoke(null)
            }
    }

    /** Classic View dialog walking the internal-storage tree (View-based
     *  twin of the Compose FolderPickerDialog, usable from WebChromeClient). */
    private fun showNativeFolderPicker(dir: File, onPick: (File) -> Unit) {
        val dirs = dir.listFiles { f -> f.isDirectory && !f.name.startsWith(".") }
            ?.sortedBy { it.name.lowercase() } ?: emptyList()
        val canGoUp = dir.parentFile?.path?.startsWith("/storage/emulated") == true ||
            dir.path.startsWith("/storage/emulated/0/")
        val items = buildList {
            if (canGoUp) add("↩ …")
            addAll(dirs.map { "📁 ${it.name}" })
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(dir.path)
            .setItems(items.toTypedArray()) { dialog, which ->
                dialog.dismiss()
                if (canGoUp && which == 0) {
                    showNativeFolderPicker(dir.parentFile!!, onPick)
                } else {
                    val chosen = dirs[if (canGoUp) which - 1 else which]
                    showNativeFolderPicker(chosen, onPick)
                }
            }
            .setPositiveButton(R.string.ws_pick_confirm) { dialog, _ ->
                dialog.dismiss()
                onPick(dir)
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    /** Original file-picker intent (kept from the plain attach flow). */
    private fun openFilesIntent(
        callback: (Array<android.net.Uri>?) -> Unit,
        params: WebChromeClient.FileChooserParams?,
    ) {
        val multiple = params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        val intent = runCatching { params?.createIntent() }.getOrNull()
            ?: android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply { type = "*/*" }
        intent.addCategory(android.content.Intent.CATEGORY_OPENABLE)
        // DSH's "+" attachment flow often requests images only; allow any
        // file type (docs, archives, code) — the page filters what it needs.
        intent.type = "*/*"
        intent.removeExtra(android.content.Intent.EXTRA_MIME_TYPES)
        intent.putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
        runCatching { startActivityForResult(intent, REQ_FILE_CHOOSER) }
            .onFailure {
                val cb = pendingFileChooser
                pendingFileChooser = null
                cb?.invoke(null)
            }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        if (requestCode == REQ_FOLDER_PICKER && resultCode == RESULT_OK && data?.data != null) {
            val resolved = workspaceTreePath(data.data!!)
            if (resolved != null && registerWorkspace(resolved.first, resolved.second)) {
                android.widget.Toast.makeText(
                    this,
                    getString(R.string.ws_added, resolved.second),
                    android.widget.Toast.LENGTH_SHORT,
                ).show()
                restartHarness()
            } else {
                // Silent failure here looked like "the picker does nothing".
                android.widget.Toast.makeText(
                    this,
                    getString(R.string.ws_add_failed),
                    android.widget.Toast.LENGTH_LONG,
                ).show()
            }
            return
        }
        if (requestCode == REQ_FILE_CHOOSER) {
            val callback = pendingFileChooser
            pendingFileChooser = null
            if (callback != null) {
                val uris = when {
                    resultCode != RESULT_OK -> null
                    data?.clipData != null ->
                        (0 until data.clipData!!.itemCount).map { data.clipData!!.getItemAt(it).uri }.toTypedArray()
                    data?.data != null -> arrayOf(data.data!!)
                    else -> null
                }
                callback(uris)
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    /**
     * Drives a DSH popover picker (work mode / access / effort) by clicking the
     * visible control, then the requested options inside the popover. Each step
     * is a list of accepted labels (RU + EN); the first visible match wins.
     * The popovers are DSH's own, so base behavior stays untouched.
     */
    private fun applyDshPicker(
        webView: WebView?,
        steps: List<List<String>>,
        onResult: (String) -> Unit,
    ) {
        if (webView == null) {
            onResult("no-webview")
            return
        }
        val stepsJson = org.json.JSONArray()
        steps.forEach { step -> stepsJson.put(org.json.JSONArray(step)) }
        val script = """
            (function () {
              if (!window.__dshPickNS) {
                window.__dshPickNS = { result: 'idle' };
                window.__dshPickSteps = function (steps) {
                  var idx = 0;
                  function vis(e) {
                    if (!e) return false;
                    var r = e.getBoundingClientRect();
                    var cs = getComputedStyle(e);
                    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
                  }
                  // DSH renders part of the composer (e.g. the permission pill) inside
                  // a shadow root, which document.querySelectorAll cannot see. Walk the
                  // whole composed tree: document + every open shadowRoot, depth-first
                  // (parents before children, shadow content after its host).
                  function allCandidates() {
                    var out = [];
                    function walk(root) {
                      var nodes = root.querySelectorAll('*');
                      for (var i = 0; i < nodes.length; i++) {
                        out.push(nodes[i]);
                        if (nodes[i].shadowRoot) walk(nodes[i].shadowRoot);
                      }
                    }
                    walk(document);
                    return out;
                  }
                  function tryFind(arr) {
                    var all = allCandidates();
                    for (var i = 0; i < arr.length; i++) {
                      var label = arr[i];
                      var cand = all.filter(function (e) {
                        if (!vis(e)) return false;
                        return (e.textContent || '').trim() === label;
                      });
                      // The deepest (last) exact-text element is the clickable leaf.
                      if (cand.length) return cand[cand.length - 1];
                    }
                    return null;
                  }
                  // Radix popovers open on pointerdown, so a bare el.click() is
                  // not enough — dispatch the full pointer sequence a real
                  // touch produces (same as window.__dshTap in the page fix).
                  function tapEl(el) {
                    if (window.__dshTap && window.__dshTap(el)) return;
                    try {
                      var r = el.getBoundingClientRect();
                      var o = { bubbles: true, cancelable: true, view: window,
                        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
                        pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 };
                      el.dispatchEvent(new PointerEvent('pointerdown', o));
                      el.dispatchEvent(new MouseEvent('mousedown', o));
                      el.dispatchEvent(new PointerEvent('pointerup', o));
                      el.dispatchEvent(new MouseEvent('mouseup', o));
                      el.dispatchEvent(new MouseEvent('click', o));
                    } catch (e) { try { el.click(); } catch (e2) {} }
                  }
                  // Options can take a moment to mount inside DSH's popovers,
                  // so retry each step a few times before giving up.
                  var tries = 0;
                  function clickStep() {
                    var arr = steps[idx];
                    var el = tryFind(arr);
                    if (!el) {
                      if (tries < 6) { tries++; setTimeout(clickStep, 400); return; }
                      window.__dshPickNS.result = 'no:' + arr.join('|');
                      return;
                    }
                    tries = 0;
                    tapEl(el);
                    idx++;
                    if (idx >= steps.length) { window.__dshPickNS.result = 'ok'; return; }
                    setTimeout(clickStep, 750);
                  }
                  clickStep();
                };
              }
              window.__dshPickNS.result = 'pending';
              window.__dshPickSteps(__STEPS__);
              return 'started';
            })()
        """.replace("__STEPS__", stepsJson.toString())
        webView.evaluateJavascript(script, null)
        // Allow for per-step retries (up to ~2.4 s each) plus inter-step delays.
        webView.postDelayed({
            webView.evaluateJavascript("window.__dshPickNS.result") { res ->
                onResult((res ?: "").trim().trim('"'))
            }
        }, steps.size * 750L + 3200L)
    }

    /** Mode labels as shown on the DSH pill / options (RU first, then EN).
     * Note: the injected RU layer translates the built-in Creator preset to
     * "Режим создателя", so that spelling must be accepted too. */
    private fun modeLabels(mode: String): List<String> = when (mode) {
        "standard" -> listOf("Стандартный режим", "Standard mode")
        "ptc" -> listOf("Режим PTC", "PTC mode")
        "minimal" -> listOf("Минимальный режим", "Minimal mode")
        else -> listOf("Режим создателя", "Режим Creator", "Creator mode")
    }

    /** Any label that identifies the mode pill inside the DSH page. */
    private fun allModePillLabels(): List<String> = listOf(
        "Стандартный режим", "Режим PTC", "Минимальный режим", "Режим создателя", "Режим Creator",
        "Standard mode", "PTC mode", "Minimal mode", "Creator mode",
    )

    /** Access/permission option labels as shown in the popover (DSH's own
     * composer pill is rendered inside a shadow root and keeps its English
     * spellings: "Read Only", "Workspace Write", "Full access"). */
    private fun accessLabels(kind: String): List<String> = when (kind) {
        "read" -> listOf("Read Only", "Только чтение", "Read only", "Read-only")
        "write" -> listOf("Workspace Write", "Запись в рабочей области", "Workspace write")
        else -> listOf("Full access", "Полный доступ")
    }

    /** Labels of the access pill itself. */
    private fun allAccessPillLabels(): List<String> = listOf(
        "Full access", "Полный доступ", "Workspace Write", "Запись в рабочей области",
        "Read Only", "Только чтение", "Workspace write", "Read only", "Read-only",
    )

    /** Effort/thinking level labels shown in the DSH effort submenu. */
    private fun effortValueLabels(level: String): List<String> = when (level) {
        "low" -> listOf("Low", "Низкое")
        "medium" -> listOf("Medium", "Среднее")
        "ultra" -> listOf("Ultra", "Максимальное")
        else -> listOf("High", "Высокое")
    }

    @Composable
    private fun SheetPickerRow(
        label: String,
        options: List<Pair<String, String>>,
        selected: String,
        onPick: (String) -> Unit,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, style = MaterialTheme.typography.titleSmall)
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                options.forEach { (display, key) ->
                    FilterChip(
                        selected = selected == key,
                        onClick = { onPick(key) },
                        label = { Text(display) },
                    )
                }
            }
        }
    }

    /** Opens the system folder picker; result handled in onActivityResult. */
    private fun pickWorkspaceFolder() {
        val intent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            flags = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        }
        runCatching { startActivityForResult(intent, REQ_FOLDER_PICKER) }
            .onFailure { }
    }

    /** Maps a SAF tree URI to a real path inside the sandbox (guest fs). */
    private fun workspaceTreePath(uri: Uri): Pair<String, String>? {
        return runCatching {
            val docId = android.provider.DocumentsContract.getTreeDocumentId(uri)
            when {
                docId.startsWith("primary:") -> {
                    val rel = docId.removePrefix("primary:").trim('/')
                    val guest = if (rel.isEmpty()) "/sdcard" else "/sdcard/$rel"
                    guest to (rel.substringAfterLast('/').ifBlank { "Workspace" })
                }
                else -> null
            }
        }.getOrNull()
    }

    /** Appends a workspace record to the DSH storage file (server reloads on restart). */
    private fun registerWorkspace(guestPath: String, title: String): Boolean {
        return try {
            val file = File(
                filesDir,
                "runtime-root/data/data/com.termux/files/home/.dsh/storages/workspace.json",
            )
            if (!file.isFile) return false
            val root = org.json.JSONObject(file.readText())
            val global = root.optJSONObject("global") ?: return false
            val tables = root.optJSONObject("tables") ?: return false
            val workspaces = tables.optJSONObject("workspaces") ?: return false
            val id = "ws-" + java.util.UUID.randomUUID()
            val now = java.time.Instant.now().toString()
            workspaces.put(
                id,
                org.json.JSONObject()
                    .put("path", guestPath)
                    .put("title", title)
                    .put("sessionIds", org.json.JSONArray()
                    )
                    .put("createdAt", now)
                    .put("updatedAt", now),
            )
            global.append("workspaceIds", id)
            file.writeText(root.toString(2) + "\n")
            true
        } catch (_: Exception) {
            false
        }
    }

    /** Restarts the harness so the freshly registered workspace is picked up. */
    private fun restartHarness() {
        startHarnessService(HarnessForegroundService.ACTION_STOP)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            startHarnessService(HarnessForegroundService.ACTION_START)
        }, 1200)
    }

    /** Opens DSH's own model/effort chooser and leaves it ready for the user. */
    private fun openDshModelPicker(onResult: (String) -> Unit) {
        val webView = currentWebView
        if (webView == null) {
            onResult("no-webview")
            return
        }
        val script = """
            (function () {
              function vis(e) {
                var r = e.getBoundingClientRect(); var cs = getComputedStyle(e);
                return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
              }
              function tapEl(el) {
                if (window.__dshTap && window.__dshTap(el)) return;
                try {
                  var r = el.getBoundingClientRect();
                  var o = { bubbles: true, cancelable: true, view: window,
                    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
                    pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 };
                  el.dispatchEvent(new PointerEvent('pointerdown', o));
                  el.dispatchEvent(new MouseEvent('mousedown', o));
                  el.dispatchEvent(new PointerEvent('pointerup', o));
                  el.dispatchEvent(new MouseEvent('mouseup', o));
                  el.dispatchEvent(new MouseEvent('click', o));
                } catch (e) { try { el.click(); } catch (e2) {} }
              }
              var done = function (v) { window.__dshModelOpen = v; };
              window.__dshModelOpen = 'pending';
              var pill = null;
              var all = Array.prototype.slice.call(document.querySelectorAll('button, [role=button]'));
              for (var i = 0; i < all.length; i++) {
                var e = all[i];
                var t = (e.textContent || '');
                if (!vis(e)) continue;
                if (/(DeepSeek|MiMo|GPT|Claude|Qwen|Llama|High|Low|Усилие)/.test(t) && t.length < 80 && e.getBoundingClientRect().width < 500) { pill = e; break; }
              }
              if (!pill) { done('no-pill'); return; }
              tapEl(pill);
              setTimeout(function () {
                var row = null;
                var all2 = Array.prototype.slice.call(document.querySelectorAll('div, span, button'));
                for (var j = 0; j < all2.length; j++) {
                  var e2 = all2[j];
                  if (!vis(e2)) continue;
                  var t2 = (e2.textContent || '').trim();
                  if ((t2 === 'Модель' || t2 === 'Model') && e2.childElementCount <= 1) { row = e2; break; }
                }
                if (!row) { done('no-row'); return; }
                tapEl(row);
                setTimeout(function () { done('ok'); }, 600);
              }, 520);
            })()
        """
        webView.evaluateJavascript(script, null)
        webView.postDelayed({
            webView.evaluateJavascript("window.__dshModelOpen") { res ->
                onResult((res ?: "").trim().trim('"'))
            }
        }, 1800)
    }

    @Volatile
    private var currentWebView: WebView? = null

    private fun copyToClipboard(text: String) {
        val manager = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        manager.setPrimaryClip(ClipData.newPlainText("dsh", text))
    }

    /** Bundled free fonts (SIL OFL): family key → asset path / CSS family. */
    private val bundledFonts = mapOf(
        "inter" to ("fonts/Inter.ttf" to "Inter"),
        "lora" to ("fonts/Lora.ttf" to "Lora"),
        "jbmono" to ("fonts/JetBrainsMono.ttf" to "JetBrains Mono"),
        "ibmsans" to ("fonts/IBMPlexSans.ttf" to "IBM Plex Sans"),
        "ibmmono" to ("fonts/IBMPlexMono.ttf" to "IBM Plex Mono"),
    )
    private val fontDataCache = mutableMapOf<String, String>()

    /** Registers a bundled @font-face in the page (base64 data URL, cached). */
    private fun registerCustomFont(webView: WebView?, key: String) {
        if (webView == null) return
        val (asset, family) = bundledFonts[key] ?: return
        val dataUrl = fontDataCache.getOrPut(key) {
            val bytes = assets.open(asset).use { it.readBytes() }
            "data:font/ttf;base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        }
        webView.evaluateJavascript(
            "window.__dshRegisterFont && window.__dshRegisterFont('$family','$dataUrl');", null,
        )
    }

    /** Best-effort file name from Content-Disposition / mime / url. */
    private fun suggestName(contentDisposition: String?, mimetype: String?, url: String): String {
        val fromCd = contentDisposition?.substringAfter("filename=", "")?.trim('"', ' ', ';')
        val fromUrl = url.substringAfterLast('/').substringBefore('?').takeIf { it.isNotBlank() && !it.startsWith("blob") }
        val base = fromCd?.takeIf { it.isNotBlank() } ?: fromUrl ?: "session-log"
        val ext = when {
            base.contains('.') -> ""
            mimetype == "text/plain" -> ".txt"
            else -> ".log"
        }
        return base + ext
    }

    /**
     * Saves a WebView download (often a `blob:` URL — Session log uses one)
     * into the shared Downloads collection. Blob bytes are fetched from the
     * page context via JS (base64 round-trip), plain http(s) URLs are passed
     * to the system DownloadManager.
     */
    private fun saveBlobDownload(url: String, name: String) {
        if (url.startsWith("blob:")) {
            val webView = currentWebView ?: return
            runOnUiThread {
                val script = "(function(){return fetch('" + url + "').then(function(r){return r.blob()})" +
                    ".then(function(b){return new Promise(function(res){var fr=new FileReader();" +
                    "fr.onload=function(){res(fr.result.split(',')[1]);};fr.readAsDataURL(b);});});})()" +
                    ".catch(function(e){return 'ERR:'+e;})"
                webView.evaluateJavascript(script, android.webkit.ValueCallback<String> { result ->
                    val data = result?.trim()?.trim('"') ?: return@ValueCallback
                    if (data.startsWith("ERR:") || data == "null") {
                        android.widget.Toast.makeText(this, getString(R.string.dsh_pick_fail), android.widget.Toast.LENGTH_SHORT).show()
                        return@ValueCallback
                    }
                    runCatching { saveBytesToDownloads(name, android.util.Base64.decode(data, android.util.Base64.DEFAULT)) }
                        .onSuccess { path ->
                            android.widget.Toast.makeText(this, getString(R.string.download_saved, path), android.widget.Toast.LENGTH_LONG).show()
                        }
                        .onFailure {
                            android.widget.Toast.makeText(this, getString(R.string.dsh_pick_fail), android.widget.Toast.LENGTH_SHORT).show()
                        }
                })
            }
        } else {
            runCatching {
                val request = android.app.DownloadManager.Request(android.net.Uri.parse(url))
                    .setTitle(name)
                    .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                val manager = getSystemService(DOWNLOAD_SERVICE) as android.app.DownloadManager
                manager.enqueue(request)
            }
        }
    }

    /** Writes bytes into the shared Downloads collection (MediaStore). */
    private fun saveBytesToDownloads(name: String, bytes: ByteArray): String {
        val resolver = contentResolver
        val values = android.content.ContentValues().apply {
            put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name)
            put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/octet-stream")
        }
        val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("MediaStore insert failed")
        resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException("no output stream")
        return "Download/$name"
    }

    private fun pasteFromClipboard(): String {
        val manager = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        return manager.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
    }

    inner class ClipboardBridge {
        @JavascriptInterface
        fun copy(text: String) = runOnUiThread { copyToClipboard(text) }

        @JavascriptInterface
        fun paste(): String = pasteFromClipboard()

        @JavascriptInterface
        fun hasContent(): Boolean {
            val manager = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            return manager.hasPrimaryClip()
        }

        /** Blob-download bridge (Session log): name + data:base64 payload. */
        @JavascriptInterface
        fun saveDownload(name: String, dataUrl: String) {
            runCatching {
                val b64 = dataUrl.substringAfter("base64,")
                val path = saveBytesToDownloads(
                    name.ifBlank { "session-log.zip" },
                    android.util.Base64.decode(b64, android.util.Base64.DEFAULT),
                )
                runOnUiThread {
                    android.widget.Toast.makeText(this@MainActivity, getString(R.string.download_saved, path), android.widget.Toast.LENGTH_LONG).show()
                }
            }.onFailure {
                runOnUiThread {
                    android.widget.Toast.makeText(this@MainActivity, getString(R.string.dsh_pick_fail), android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    @Composable
    private fun HarnessWebView(url: String, modifier: Modifier = Modifier, onAttach: (WebView?) -> Unit = {}) {
        // The tokenized URL can arrive after the first composition (service
        // captures it from the dsh web output); reload when it changes.
        var loadedUrl by remember { mutableStateOf<String?>(null) }
        AndroidView(
            factory = { context ->
                WebView(context).apply {
                    // Allow `chrome://inspect` / DevTools on this debug APK.
                    WebView.setWebContentsDebuggingEnabled(true)
                    @SuppressLint("SetJavaScriptEnabled")
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.allowContentAccess = true
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    // Ensure the on-screen keyboard can open and text fields can
                    // grab focus inside the DSH page.
                    isFocusable = true
                    isFocusableInTouchMode = true
                    requestFocus()
                    addJavascriptInterface(ClipboardBridge(), "AndroidClipboard")
                    // Session log / file downloads: DSH serves them as blob:
                    // URLs which Android's DownloadManager cannot fetch, so
                    // pull the bytes through JS and save to Downloads.
                    setDownloadListener { url, _, contentDisposition, mimetype, _ ->
                        saveBlobDownload(url, suggestName(contentDisposition, mimetype, url))
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val uri = request?.url ?: return false
                            if (uri.host != "127.0.0.1" && uri.host != "localhost") {
                                return runCatching {
                                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    true
                                }.getOrDefault(false)
                            }
                            return false
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            // Safety net: re-apply in case the document-start hook
                            // ran before the viewport size / overlay was final.
                            view?.evaluateJavascript(WEBVIEW_DOC_START_JS, null)
                            // Softer overlay dim + (for Russian) the DSH UI layer.
                            val pageLang = AppPrefs.language(context) ?: "en"
                            view?.evaluateJavascript(WEBVIEW_PAGE_FIX_JS.replace("__LANG__", pageLang), null)
                        }
                    }
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        androidx.webkit.WebViewCompat.addDocumentStartJavaScript(this, WEBVIEW_DOC_START_JS, emptySet())
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallback: android.webkit.ValueCallback<Array<android.net.Uri>>?,
                            fileChooserParams: FileChooserParams?,
                        ): Boolean {
                            if (filePathCallback == null) return false
                            this@MainActivity.openSystemFileChooser(
                                { uris -> filePathCallback.onReceiveValue(uris) },
                                fileChooserParams,
                            )
                            return true
                        }
                    }
                    // Re-apply the app language to DSH config (best-effort, e.g.
                    // after a cold install created the settings file late).
                    syncDshLanguage(AppPrefs.language(context) ?: "en")
                    loadUrl(url)
                    loadedUrl = url
                }
            },
            modifier = modifier,
            update = { webView ->
                onAttach(webView)
                if (loadedUrl != url && url.isNotBlank()) {
                    loadedUrl = url
                    webView.loadUrl(url)
                }
            },
        )
    }
}
