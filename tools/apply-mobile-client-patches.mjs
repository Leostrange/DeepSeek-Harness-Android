// 从固定上游产物重建 DSHA 局部差异；不执行上游安装/构建脚本。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const upstreamCommit = 'a094288883b343e848d7f9cf302d73ad8ed4794b';
export const upstreamClientHash = '88bfc7b315249cbe8a4fcbcaf41854cce3a8480a5b98a7bdb063ba78b1ae9a19';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function applyMobileClientPatches(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== upstreamClientHash)
    throw new Error('上游 client 字节不匹配固定 commit；请重新审阅补丁');
  let source = bytes.toString('utf8');
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('补丁锚点缺失或不唯一: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  replace('const consumed = new Map();', 'const consumed = new WeakMap();');
  replace(`    if (!isElementLike(target)) {
        consumed.set(target, until);
        return;
    }`, `    if (!isElementLike(target)) {
        if ((typeof target !== 'object' && typeof target !== 'function') || target === null) return;
        consumed.set(target, until);
        return;
    }`);
  replace(`    if (!isElementLike(target)) {
        for (const [t, until] of consumed) {
            if (until <= now)
                consumed.delete(t);
        }
        return false;
    }`, `    if (!isElementLike(target)) {
        if ((typeof target !== 'object' && typeof target !== 'function') || target === null) return false;
        const until = consumed.get(target);
        if (until === undefined) return false;
        if (until <= now) {
            consumed.delete(target);
            return false;
        }
        return true;
    }`);
  replace('if (event.touches.length > 1) {',
    'if (event.touches.length !== 1 || !event.cancelable || document.hidden) {');
  replace('            for (const record of records) {\n                keys.add(',
    "            for (const record of records) {\n                // 历史消息和流式文本不改变 shell；flow 外的插入仍可唤醒布局。\n                const target = record.target instanceof Element ? record.target : record.target.parentElement;\n                if (target?.closest('[data-chat-flow]')) continue;\n                keys.add(");
  replace('            core.note(keys);', '            if (keys.size) core.note(keys);');

  const guardStart = source.indexOf('__modules["effects/shortcut-modal-keyboard-guard.js"] = function (require, module, exports) {');
  const guardEnd = source.indexOf('\n__modules[', guardStart + 1);
  if (guardStart < 0 || guardEnd < 0) throw new Error('缺失快捷键守卫模块边界');
  const guard = readFileSync(path.join(project, 'tools/mobile-shortcut-guard.js'), 'utf8').trim();
  source = source.slice(0, guardStart) + '__modules["effects/shortcut-modal-keyboard-guard.js"] = function (require, module, exports) {\n' + guard + '\n};\n' + source.slice(guardEnd);

  // 可见窗口逐帧合并，稳定高度在 resize 风暴结束后再提交，避免键盘/PiP 抖动。
  replace(`        let stableVh = 0;
        let stableWidth = 0;
        const syncStableViewport = () => {
            const height = window.innerHeight;
            const width = window.innerWidth;
            if (stableVh === 0 || height > stableVh || width !== stableWidth) {
                stableVh = height;
                stableWidth = width;
                root.style.setProperty(exports.STABLE_VIEWPORT_VAR, \`${'${height}'}px\`);
            }
        };
        syncStableViewport();
        window.addEventListener('resize', syncStableViewport);`, `        let stableVh = 0;
        let stableWidth = 0;
        let visibleFrame = 0;
        let stableFrame = 0;
        let stableTimer = 0;
        let viewportDisposed = false;
        const applyVisibleViewport = () => {
            visibleFrame = 0;
            if (viewportDisposed) return;
            const height = window.innerHeight;
            const visible = window.visualViewport;
            const available = Math.max(1, Math.min(height, visible?.height ?? height));
            root.style.setProperty('--dsha-mobile-visible-vh', \`${'${available}'}px\`);
            root.style.setProperty('--dsha-mobile-viewport-top', \`${'${visible?.offsetTop ?? 0}'}px\`);
        };
        const applyStableViewport = () => {
            stableFrame = 0;
            if (viewportDisposed) return;
            const height = window.innerHeight;
            const width = window.innerWidth;
            if (stableVh === 0 || height > stableVh || width !== stableWidth) {
                stableVh = height;
                stableWidth = width;
                root.style.setProperty(exports.STABLE_VIEWPORT_VAR, \`${'${height}'}px\`);
            }
        };
        const syncViewport = () => {
            if (visibleFrame === 0) visibleFrame = requestAnimationFrame(applyVisibleViewport);
            if (stableTimer !== 0) clearTimeout(stableTimer);
            stableTimer = window.setTimeout(() => {
                stableTimer = 0;
                if (stableFrame === 0) stableFrame = requestAnimationFrame(applyStableViewport);
            }, 100);
        };
        applyVisibleViewport();
        applyStableViewport();
        window.addEventListener('resize', syncViewport);
        window.visualViewport?.addEventListener('resize', syncViewport);
        window.visualViewport?.addEventListener('scroll', syncViewport);`);
  replace("            window.removeEventListener('resize', syncStableViewport);\n            root.style.removeProperty(exports.STABLE_VIEWPORT_VAR);",
    "            viewportDisposed = true;\n            window.removeEventListener('resize', syncViewport);\n            window.visualViewport?.removeEventListener('resize', syncViewport);\n            window.visualViewport?.removeEventListener('scroll', syncViewport);\n            if (visibleFrame !== 0) cancelAnimationFrame(visibleFrame);\n            if (stableFrame !== 0) cancelAnimationFrame(stableFrame);\n            if (stableTimer !== 0) clearTimeout(stableTimer);\n            root.style.removeProperty('--dsha-mobile-visible-vh');\n            root.style.removeProperty('--dsha-mobile-viewport-top');\n            root.style.removeProperty(exports.STABLE_VIEWPORT_VAR);");
  replace('        // appears, and the keyboard simply covers their lower half. Content that\n        // would fall behind the keyboard gets a keyboard-sized bottom padding on\n        // the scroller (layout.css.ts), which shifts nothing visible.',
    '        // appears. DSHA also caps cards with the current visible viewport: deliberate\n        // keyboard input and same-width split-screen resizing must keep all actions\n        // reachable. No keyboard-padding implementation is assumed here.');

  replace('function createStatsLineTask() {', `// Cache detail stays in the token dialog; remove only its visible suffix.
function simplifyStatsSegments() {
    for (const pill of document.querySelectorAll('[data-mobile-nav="stats"] [class*="_pill"]')) {
        const text = pill.textContent || '';
        if (!/cache|кэш|缓存/i.test(text)) continue;
        const label = pill.querySelector('[class*="_label"]');
        if (label === null) continue;
        for (const node of Array.from(label.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE && /\\d/.test(node.textContent || '')) {
                const text = (node.textContent || '').trim();
                if (label.textContent !== text) label.textContent = text;
                break;
            }
        }
    }
}
function createStatsLineTask() {`);
  replace('if (!/(turns|steps|\\bLLM\\b|轮|步)/.test(text))', 'if (!/(turns|steps|витк|шаг|\\bLLM\\b|轮|步)/i.test(text))');
  source=source.replaceAll('        moveRing(anchor);\n','').replaceAll('            moveRing(root);\n','');

  const hideStart = source.indexOf('  /* 手机档收掉搜索行');
  const hideEnd = source.indexOf('  /* 这一层的遮罩', hideStart);
  if (hideStart < 0 || hideEnd < 0) throw new Error('手机搜索隐藏块锚点缺失');
  source = source.slice(0, hideStart) + '  /* DSHA 保留手机搜索；首次自动聚焦由定向守卫处理，宿主节点保持原位。 */\n' + source.slice(hideEnd);
  // 有键盘时缩短卡片是可操作性要求；禁止过渡让保存/关闭按钮滞留键盘下。
  // 只覆盖两种受影响的卡片，不复活上游已撤回的动画/合成层批次。
  const css = `
  /* DSHA 可见区域边界：分屏、短横屏、软键盘和 visualViewport 平移均可达。 */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])):not([data-shortcut-modal="shortcuts"]),
  [aria-modal="true"][data-shortcut-modal="shortcuts"] {
    top: calc(env(safe-area-inset-top, 0px) + 12px + var(--dsha-mobile-viewport-top, 0px)) !important;
    max-height: max(1px, calc(var(--dsha-mobile-visible-vh, 100vh) - 24px - env(safe-area-inset-top, 0px))) !important;
    min-height: 0 !important;
    box-sizing: border-box;
    overflow-y: auto;
    transition: none;
  }
  [aria-modal="true"][data-shortcut-modal="shortcuts"] > :first-child {
    min-height: 0;
    max-height: 100%;
  }
`;
  replace('  /* ---------- sidebar panel enter / exit (see effects/panel-exit.ts) ----------',
    css + '  /* ---------- sidebar panel enter / exit (see effects/panel-exit.ts) ----------');
  const sheetGuard = ':not([data-shortcut-modal="shortcuts"])';
  if(source.split(sheetGuard).length-1!==21)throw Error('Settings sheet predicate anchors changed');
  source=source.replaceAll(sheetGuard,sheetGuard+':not(.dsha-preset-editor)');
  return source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, action = '--check'] = process.argv.slice(2);
  if (!input || !['--check', '--write'].includes(action)) throw new Error('用法: node tools/apply-mobile-client-patches.mjs <上游lib/client.js> [--check|--write]');
  const patched = applyMobileClientPatches(readFileSync(input));
  const output = path.join(project, 'app/src/main/assets/builtin-plugins/dsh-web-mobile/lib/client.js');
  if (action === '--write') writeFileSync(output, patched);
  else if (readFileSync(output, 'utf8') !== patched) throw new Error('当前内置产物与锁定上游及 DSHA 补丁不符');
  console.log('移动插件补丁与上游指纹核验通过: ' + upstreamCommit);
}
