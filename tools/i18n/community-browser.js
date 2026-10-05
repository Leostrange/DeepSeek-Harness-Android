/* Russian copy for the public community site. No native bridge or user-input rewriting. */
(function () {
  'use strict';
  if (!/^https:\/\/(www\.)?dsha\.cc(?:\/|$)/.test(location.href) || window.__dshaCommunityRussian) return;
  window.__dshaCommunityRussian = true;
  var dictionary = DSHA_COMMUNITY_RU;
  function translate(value) {
    var key = value.trim();
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
      return value.slice(0, value.indexOf(key)) + dictionary[key] + value.slice(value.indexOf(key) + key.length);
    }
    var count = key.match(/^显示\s*(\d+)\s*\/\s*(\d+)\s*个条目$/);
    if (count) return 'Показано: ' + count[1] + ' / ' + count[2];
    var builtin = key.match(/^打开插件管理，查看 (.+) 的状态。$/);
    if (builtin) return 'Откройте управление плагинами и проверьте состояние ' + builtin[1] + '.';
    if (key.indexOf('无法打开安装链接：') === 0) return 'Не удалось открыть ссылку установки: ' + key.slice('无法打开安装链接：'.length);
    if (value.indexOf('\n') >= 0) return value.split('\n').map(translate).join('\n');
    var field = key.match(/^(- (?:名称|类型|源码|发布版本|发布包|许可证)：)(.*)$/);
    if (field && dictionary[field[1]]) return dictionary[field[1]] + field[2];
    return value;
  }
  function translateTree(root) {
    if (root.nodeType === 3) {
      var parent = root.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,[contenteditable]')) return;
      var text = translate(root.nodeValue);
      if (text !== root.nodeValue) root.nodeValue = text;
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (root.matches('script,style,noscript,textarea,[contenteditable]')) return;
      ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (attr) {
        if (!root.hasAttribute(attr)) return;
        var before = root.getAttribute(attr), after = translate(before);
        if (before !== after) root.setAttribute(attr, after);
      });
    }
    Array.prototype.forEach.call(root.childNodes, translateTree);
  }
  function refreshSearch() {
    document.querySelectorAll('[data-search-text]').forEach(function (card) {
      if (!card.__dshaOriginalSearch) card.__dshaOriginalSearch = card.getAttribute('data-search-text');
      var text = card.__dshaOriginalSearch + ' ' + card.textContent;
      if (card.getAttribute('data-search-text') !== text) card.setAttribute('data-search-text', text);
    });
  }
  function refresh() {
    translateTree(document.documentElement);
    document.documentElement.lang = 'ru';
    refreshSearch();
  }
  refresh();
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; refresh(); }, 0);
  }).observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true,
    attributeFilter:['aria-label','title','placeholder','alt']});
}());
