/* RC2 手机布局：与受管 React 布局补丁配套，保留组件与操作回调。 */
(function () {
  'use strict';
  if (window.__dshaMobileLayoutBound) {
    if (window.__dshaMobileLayoutInstall) window.__dshaMobileLayoutInstall();
    return;
  }
  window.__dshaMobileLayoutBound = true;
  var css = `
html[data-dsha-pip] [data-mobile-nav="frame"] > :first-child,
html[data-dsha-pip] [data-mobile-nav="backdrop"] { display:none !important; }
html body .dsha-conversation-actions .QsffPG_menu,html body [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .dsha-conversation-actions .QsffPG_menu { top:var(--dsha-jobs-top) !important; left:var(--dsha-jobs-left) !important; right:auto !important; transform:none !important; position:fixed !important; max-width:calc(100vw - 32px) !important; width:min(500px,calc(100vw - 32px)) !important; padding:14px; border-radius:12px; background:var(--dsw-specific-menu); max-height:min(480px,calc(100dvh - var(--dsha-jobs-top,100px) - 16px)) !important; }
.QsffPG_empty { padding:12px 4px; color:var(--dsw-alias-label-tertiary); font-size:14px; line-height:22px; }

@media (max-width: 767px) {
  [data-phase] .EvIC1a_scroll { padding-inline:12px !important; }
  [data-dab-chat-card] { box-sizing:border-box !important; width:calc(100% - 8px) !important; max-width:calc(100% - 8px) !important; margin-inline:4px !important; }
  html body .bRhRbq_panel,html body .JObwrW_panel { left:var(--dsha-composer-center, 50%) !important; right:auto !important; top:auto !important; bottom:calc(100dvh - var(--dsha-composer-top, 70dvh) + 12px) !important; transform:translateX(-50%) !important; max-width:calc(100vw - 24px) !important; max-height:max(96px,calc(var(--dsha-composer-top, 70dvh) - 28px)) !important; overflow-y:auto !important; overscroll-behavior:contain; }
  [data-mobile-nav="frame"] .bhn1Oq_fade { display:none !important; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea:has([data-mobile-nav="drawer-actions"]) { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 8px; align-items:center; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea .hHd-Xa_footerActions { display:contents !important; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea [data-mobile-nav="drawer-actions"] { grid-column:1 / -1; grid-row:1; justify-self:center; width:100% !important; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea .sh-fa { grid-column:2; grid-row:2; justify-content:center; width:100%; min-width:0; padding-inline:4px; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea .hHd-Xa_settingsArea { grid-column:1; grid-row:2; width:100%; min-width:0; }
  [data-mobile-nav="frame"] .hHd-Xa_footArea .hHd-Xa_settingsArea > * { width:100%; min-width:0; }
  .Mbwy4a_footer { flex-direction:column !important; align-items:stretch !important; }
  .Mbwy4a_footerActions { width:100%; display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); }
  .Mbwy4a_footerActions > button { width:100%; }
  .Mbwy4a_card,.LVzXQa_card { box-sizing:border-box; }
  .Mbwy4a_body { min-width:0; overflow-x:hidden; }
  .zGbnIq_section,.pbvGtq_section,.qSYn7G_section { width:100%; min-width:0; max-width:100%; box-sizing:border-box; }
  .zGbnIq_editor,.zGbnIq_rowCard,.zGbnIq_setupCard,.zGbnIq_list { min-width:0; max-width:100%; box-sizing:border-box; }
  .zGbnIq_addModeTabs,.zGbnIq_addModes [role=tablist] { flex-wrap:wrap !important; }
  .zGbnIq_section [role=tablist] { display:grid !important; grid-auto-flow:column !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; min-width:0; max-width:100%; width:100%; }
  .zGbnIq_section [role=tablist] > [aria-hidden=true] { display:none !important; }
  .zGbnIq_section [role=tab][aria-selected=true] { background:var(--dsw-alias-bg-layer-2); border-radius:8px; }
  .zGbnIq_section [role=tab] { flex:1 1 140px; min-width:0; max-width:100%; white-space:normal !important; height:auto !important; overflow-wrap:anywhere; }
  .zGbnIq_section input,.zGbnIq_section select,.zGbnIq_section textarea { min-width:0; max-width:100%; box-sizing:border-box; }
  .zGbnIq_section button { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
  .qSYn7G_groupTitleRow { flex-wrap:wrap; min-width:0; }
  .qSYn7G_headerEnd { flex:1 1 100%; min-width:0; margin-left:0 !important; }
  .qSYn7G_switcher { width:100%; max-width:100%; min-width:0; height:auto !important; min-height:36px; white-space:normal !important; }
  .qSYn7G_switcherLabel { flex:1; min-width:0; max-width:100% !important; white-space:normal !important; overflow-wrap:anywhere; text-align:left; }
  .qSYn7G_groupToggle { flex-shrink:1 !important; min-width:0; }
  .qSYn7G_groupTitle { white-space:normal; overflow-wrap:anywhere; }
  .pbvGtq_tabs { flex-wrap:wrap; gap:8px !important; }
  [role=dialog]:has(.zGbnIq_section),[role=dialog]:has(.qSYn7G_section),[role=dialog]:has(.pbvGtq_section),[role=dialog]:has(.rtSEdW_cards) { box-sizing:border-box; max-width:calc(100vw - 24px); max-height:calc(100dvh - 24px); overflow-y:auto; min-width:0; }
  [role=dialog]:has(.zGbnIq_section) [role=tablist], [role=dialog]:has(.qSYn7G_section) [role=tablist] { min-width:0; max-width:100%; flex-wrap:wrap; }
  .rtSEdW_cards { grid-template-columns:minmax(0,1fr) !important; }

  .Mbwy4a_frame, .LVzXQa_frame {
    box-sizing: border-box; min-width: 0; max-width: 100%; padding-inline: 8px !important;
  }
  .Mbwy4a_card, .LVzXQa_card { min-width: 0; max-width: 100% !important; }
  .Mbwy4a_footer, .Mbwy4a_footerActions, .LVzXQa_footer, .LVzXQa_actions {
    min-width: 0; max-width: 100%; flex-wrap: wrap !important; gap: 8px !important;
  }
  .Mbwy4a_footerActions, .LVzXQa_actions { flex-shrink: 1 !important; }
  .Mbwy4a_footerActions > button, .LVzXQa_actions > button {
    min-width: 0 !important; max-width: 100%; height: auto !important;
    min-height: 32px; white-space: normal !important; overflow-wrap: anywhere;
  }
  .Mbwy4a_optionCopy, .Mbwy4a_headingBlock, .LVzXQa_summary {
    min-width: 0; overflow-wrap: anywhere;
  }
  .zGbnIq_modelRow { min-width:0; max-width:100%; }
  .zGbnIq_modelRow > *, .zGbnIq_editor > *, .X_2TxG_cardHead > * {
    min-width: 0; max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere;
  }
  .zGbnIq_rowActions, .zGbnIq_editorActions, .zGbnIq_editorHeader,
  .X_2TxG_cardHead, .X_2TxG_detailActions, .X_2TxG_actions, .X_2TxG_wizardActions {
    flex-wrap: wrap !important; max-width: 100%; gap: 8px !important;
  }
  .zGbnIq_editor input, .zGbnIq_editor select, .zGbnIq_modelRow input,
  .zGbnIq_modelRow select { min-width: 0; width: 100%; box-sizing: border-box; }
  .zGbnIq_rowActions { margin-left: 0 !important; }
  .X_2TxG_detailActions { flex-shrink: 1 !important; }
  .zGbnIq_editorActions button, .zGbnIq_rowActions button,
  .X_2TxG_actions button, .X_2TxG_detailActions button, .X_2TxG_wizardActions button {
    max-width: 100%; white-space: normal !important; height: auto !important;
    min-height: 32px; overflow-wrap: anywhere;
  }
  .QsffPG_menu { box-sizing:border-box; max-width:calc(100vw - 32px) !important; }
  .QsffPG_rowLine { display: flex !important; align-items: center; gap: 8px; }
  .QsffPG_row { flex: 1 1 0 !important; width: auto !important; min-width: 0; }
  .QsffPG_stop {
    position: static !important; flex: 0 0 auto !important;
    max-width: 40%; white-space: normal; overflow-wrap: anywhere;
  }
  .QsffPG_trigger:has(.QsffPG_triggerDot) { position: relative; }
  [data-team-running] .VoX2oq_trigger { position:relative; }
  .QsffPG_trigger:has(.QsffPG_triggerDot)::after,[data-team-running] .VoX2oq_trigger::after {
    content: ''; position: absolute; bottom: 0; left: 8%; width: 32%; height: 2px;
    border-radius: 2px; background: var(--dsw-alias-state-business-primary, #4f6ef7);
    animation: dsha-task-progress 1.2s ease-in-out infinite alternate;
  }
  .dsha-conversation-actions .QsffPG_triggerDot { display:none !important; }
}

.dsha-preset-editor { width:min(920px,calc(100vw - 24px)) !important; max-height:calc(100dvh - 24px) !important; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; border-radius:20px !important; --dsha-editor-line:color-mix(in srgb,currentColor 15%,transparent); --dsha-editor-panel:color-mix(in srgb,currentColor 4%,transparent); }
.dsha-preset-editor { padding:0 !important; display:flex; min-height:0; overflow:hidden; }
.dsha-editor-layout { display:flex; flex-direction:column; width:100%; max-height:inherit; min-height:0; }
.dsha-editor-header { display:flex; flex:none; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-bottom:1px solid var(--dsha-editor-line); }
.dsha-editor-header h2 { min-width:0; margin:0; font-size:18px; overflow-wrap:anywhere; }
.dsha-editor-header-actions { display:flex; flex:none; gap:8px; }
.dsha-editor-header-actions button { width:44px; padding:0 !important; font:24px/1 Arial,sans-serif !important; }
.dsha-preset-editor-body { padding:20px; overflow-y:auto; overflow-x:hidden; min-height:0; flex:1; }
.dsha-preset-editor-actions { box-sizing:border-box; padding:12px 20px; border-top:1px solid var(--dsha-editor-line); flex:none; }
.dsha-preset-editor-full .dsha-editor-layout { height:100%; }
.dsha-preset-help { max-width:calc(100vw - 24px); overflow-wrap:anywhere; }
.dsha-conversation-toolbar { --dsha-tab-gap:clamp(8px,3vw,18px); grid-column:1/-1; display:flex; align-items:stretch; justify-content:space-between; gap:8px; min-width:0; height:36px; padding-top:8px; }
.dsha-conversation-toolbar .wSkVaW_tabs { width:auto !important; flex:0 1 auto; min-width:0; height:36px; margin-top:0; gap:var(--dsha-tab-gap) !important; padding-left:8px; align-items:stretch !important; }
.dsha-conversation-actions > .VoX2oq_root,.dsha-conversation-actions > .QsffPG_root { display:flex; flex:0 0 auto !important; height:36px; align-items:stretch; }
.dsha-conversation-toolbar .wSkVaW_tab,.dsha-conversation-actions .VoX2oq_trigger,.dsha-conversation-actions .QsffPG_trigger { box-sizing:border-box; display:inline-flex; align-items:center !important; justify-content:center; height:36px !important; min-height:36px !important; padding:0 4px !important; color:var(--dsw-alias-label-tertiary); font-size:13px !important; font-weight:500; line-height:20px !important; border-radius:0; vertical-align:top; }
.dsha-conversation-toolbar .VoX2oq_trigger,.dsha-conversation-toolbar .QsffPG_trigger { box-sizing:border-box !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; height:36px !important; min-height:36px !important; padding-block:0 !important; margin:0 !important; line-height:20px !important; }
html body [data-mobile-nav=frame] header.wSkVaW_header .dsha-conversation-toolbar .wSkVaW_tabs > button.wSkVaW_tab,
html body [data-mobile-nav=frame] header.wSkVaW_header .dsha-conversation-actions .VoX2oq_root > button.VoX2oq_trigger,
html body [data-mobile-nav=frame] header.wSkVaW_header .dsha-conversation-actions .QsffPG_root > button.QsffPG_trigger {
  box-sizing:border-box !important; display:inline-flex !important; align-items:center !important; justify-content:center !important;
  width:auto !important; height:36px !important; min-height:36px !important; margin:0 !important; padding:0 2px !important;
  border-width:0 !important; font-family:inherit !important; font-size:13px !important; font-weight:500 !important; line-height:20px !important;
}
.dsha-conversation-actions .VoX2oq_triggerLabel,.dsha-conversation-actions .QsffPG_count { box-sizing:border-box; display:inline-flex !important; align-items:center; height:20px; margin:0 !important; padding:0 !important; font:inherit; line-height:20px !important; }
.dsha-conversation-actions .VoX2oq_trigger[aria-expanded=true],.dsha-conversation-actions .QsffPG_trigger[aria-expanded=true] { color:var(--dsw-alias-state-business-primary); }
.dsha-conversation-actions { display:flex; height:36px; gap:var(--dsha-tab-gap) !important; align-items:stretch; margin-left:auto; min-width:0; }
@media (min-width:321px) { .dsha-conversation-actions { gap:calc(var(--dsha-tab-gap) + 3px) !important; } }
.dsha-conversation-actions .ZKlsPq_trigger { box-sizing:border-box; height:32px; min-height:32px; padding-block:0; }
.VoX2oq_triggerLabel { display:inline !important; }
.dsha-conversation-actions .VoX2oq_trigger > svg { display:none; }
[data-team-panel] .VoX2oq_roster { grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; align-items:start; }
[data-team-panel] .VoX2oq_roster { max-height:min(55dvh,520px); overflow-y:auto; overscroll-behavior:contain; padding-right:4px; }
[data-team-panel] .VoX2oq_roster > .VoX2oq_member:first-child { grid-column:1; grid-row:1; position:sticky; top:0; z-index:1; }
[data-team-panel] .VoX2oq_roster > .VoX2oq_member:not(:first-child) { grid-column:2; }
[data-team-panel] .VoX2oq_body > section:nth-of-type(2) { display:none; }
.dsha-agent-switcher { display:none; }
.wSkVaW_headerActions:empty { display:none; }
.wSkVaW_titleCluster { min-width:0; flex:1; }
.wSkVaW_titleRow { min-width:0; }
.wSkVaW_headerUtilities { margin-left:auto; }
@media(max-width:600px) {
  .dsha-conversation-toolbar { gap:4px; flex-wrap:nowrap !important; }
  .dsha-conversation-toolbar .wSkVaW_tabs { padding-left:0; }
  .dsha-conversation-toolbar .wSkVaW_tab,.dsha-conversation-actions button { padding-inline:2px !important; font-size:12px !important; white-space:nowrap; }
  .dsha-editor-header { padding:12px; }
  .dsha-preset-editor-body { padding:12px; }
  .dsha-preset-editor-actions { padding:12px; }
  .uV2eYG_card .cubgiG_seatLabel { display:none; }
  .uV2eYG_card .cubgiG_menuAnchor { min-width:0; }
}
@media(max-width:320px) {
  .dsha-conversation-toolbar { --dsha-tab-gap:4px; gap:0; }
  .dsha-conversation-actions { gap:0 !important; }
.dsha-conversation-actions > .QsffPG_root { margin-left:4px !important; }
  .dsha-conversation-toolbar .wSkVaW_tab,.dsha-conversation-actions button { padding-inline:0 !important; font-size:10.5px !important; }
  .dsha-conversation-actions .VoX2oq_trigger,.dsha-conversation-actions .QsffPG_trigger { gap:1px !important; }
  html [data-mobile-nav=frame][data-phase] header.wSkVaW_header,html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header { padding-inline:12px !important; }
  html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=toggle] { left:12px !important; }
  html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=files] { right:12px !important; }
}
.dsha-preset-editor-full { position:fixed !important; inset:8px !important; width:calc(100vw - 16px) !important; max-width:none !important; height:calc(100dvh - 16px) !important; max-height:none !important; }
.dsha-preset-editor-body { min-width:0; font-size:14px; line-height:1.55; }
.dsha-editor-tabs { display:flex; gap:4px; padding:4px; border-radius:12px; background:var(--dsha-editor-panel); margin-bottom:20px; }
.dsha-preset-editor button { font:inherit; color:inherit; border:1px solid var(--dsha-editor-line); border-radius:10px; background:transparent; min-height:44px; padding:10px 16px; cursor:pointer; max-width:100%; white-space:normal; }
.dsha-preset-editor button:disabled { opacity:.45; cursor:default; }
.dsha-editor-tabs button { flex:1; border:0; font-weight:600; }
.dsha-editor-tabs button[aria-selected="true"] { background:color-mix(in srgb,#4f6ef7 12%,transparent); color:#4f6ef7; }
.dsha-editor-hint { margin:0 0 16px; opacity:.7; }
.dsha-editor-card { padding:18px; border:1px solid var(--dsha-editor-line); border-radius:14px; margin:0 0 12px; background:var(--dsha-editor-panel); min-width:0; }
.dsha-editor-card h3 { font-size:14px; margin:0 0 12px; overflow-wrap:anywhere; }
.dsha-editor-field { display:flex; flex-direction:column; gap:8px; margin-top:14px; }
.dsha-editor-field>span { font-weight:600; font-size:13px; }
.dsha-preset-editor textarea,.dsha-preset-editor input:not([type=checkbox]) { font:inherit; color:inherit; background:transparent; border:1px solid var(--dsha-editor-line); border-radius:10px; padding:12px; width:100%; min-width:0; box-sizing:border-box; }
.dsha-preset-editor textarea { resize:vertical; line-height:1.6; min-height:80px; }
.dsha-preset-editor textarea:focus,.dsha-preset-editor input:focus { outline:2px solid #4f6ef7; outline-offset:1px; }
.dsha-preset-editor textarea[readonly] { opacity:.85; }
.dsha-preset-editor textarea.dsha-editor-source { font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; min-height:280px; margin-top:12px; }
.dsha-editor-component { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.dsha-editor-component-name { flex:1 1 220px; min-width:0; display:flex; flex-direction:column; gap:4px; }
.dsha-editor-component-name strong,.dsha-editor-component-name code { overflow-wrap:anywhere; }
.dsha-editor-component-name code { font-size:11px; opacity:.65; }
.dsha-editor-component-actions { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.dsha-editor-component-actions button { min-width:44px; padding:8px 12px; }
.dsha-editor-enable { display:flex; align-items:center; gap:8px; min-height:44px; margin-right:8px; }
.dsha-editor-enable input { accent-color:#4f6ef7; width:18px; height:18px; }
.dsha-editor-component-actions .dsha-editor-remove { color:#c74444; }
.dsha-editor-add { display:flex; gap:8px; margin-top:16px; }
.dsha-editor-add input { flex:1; }
.dsha-editor-advanced { margin-top:20px; padding-top:16px; border-top:1px solid var(--dsha-editor-line); }
.dsha-editor-advanced summary { cursor:pointer; padding:8px 0; font-weight:600; }
.dsha-preset-editor-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:8px; width:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
.dsha-editor-save-state { flex:1 1 180px; font-size:12px; opacity:.65; }
.dsha-preset-editor .dsha-editor-primary { background:#4f6ef7; color:#fff; border-color:#4f6ef7; font-weight:600; }
.dsha-editor-error { color:#c74444; padding:12px; border-radius:10px; background:color-mix(in srgb,#c74444 7%,transparent); margin-bottom:12px; overflow-wrap:anywhere; }
@media(max-width:600px) { .dsha-editor-card { padding:12px; } .dsha-editor-save-state { flex-basis:100%; } .dsha-preset-editor-actions button { padding:10px 12px; } .dsha-editor-component-name { flex-basis:100%; } }
@keyframes dsha-task-progress { to { transform: translateX(160%); } }
@media (prefers-reduced-motion: reduce) {
  .QsffPG_trigger:has(.QsffPG_triggerDot)::after,[data-team-running] .VoX2oq_trigger::after { animation: none; }
}

@media(max-width:767px) {
 html body [data-composer-stats] { display:flex !important; flex-flow:row nowrap !important; gap:6px !important; min-width:0 !important; width:auto !important; flex:1 1 auto !important; overflow:visible !important; }
 html body [data-composer-stats] > span,html body [data-composer-stats] button,html body [data-composer-stats] button span { flex:0 0 auto !important; width:auto !important; min-width:0 !important; max-width:none !important; overflow:visible !important; text-overflow:clip !important; white-space:nowrap !important; }
 html body [data-composer-stats] button { font-size:10px !important; gap:3px !important; padding:0 2px !important; }
 html body [data-composer-stats] button span { font-size:10px !important; line-height:18px !important; }
 html body .dsha-editor-component,html body .dsha-editor-component-actions { box-sizing:border-box !important; min-width:0 !important; max-width:100% !important; position:static !important; }
 html body .dsha-editor-component { display:grid !important; grid-template-columns:minmax(0,1fr) !important; gap:10px !important; }
 html body .dsha-editor-component-name { grid-column:1 !important; grid-row:1 !important; width:100% !important; min-width:0 !important; }
 html body .dsha-editor-component-actions { grid-column:1 !important; grid-row:2 !important; width:100% !important; display:grid !important; grid-template-columns:minmax(0,1fr) 36px 36px !important; gap:6px !important; }
 html body .dsha-editor-component-actions .dsha-editor-remove { position:static !important; grid-column:1/-1 !important; width:100% !important; }
 html body [role=dialog].dsha-preset-editor { box-sizing:border-box; position:fixed !important; padding:0 !important; margin:0 !important; transform:none !important; left:0 !important; right:0 !important; top:var(--dsha-editor-top,0px) !important; bottom:auto !important; width:100vw !important; min-width:0 !important; max-width:none !important; height:var(--dsha-editor-height,100dvh) !important; max-height:var(--dsha-editor-height,100dvh) !important; display:flex !important; flex-direction:column !important; overflow:hidden !important; border-radius:0 !important; }
 html body [role=dialog].dsha-preset-editor > .dsha-editor-layout { box-sizing:border-box; width:100% !important; min-width:0 !important; height:100% !important; padding:0 !important; display:flex !important; flex-direction:column !important; align-items:stretch !important; gap:0 !important; }
 html body [role=dialog].dsha-preset-editor-full { left:0 !important; right:0 !important; top:var(--dsha-editor-top,0px) !important; bottom:auto !important; width:100vw !important; height:var(--dsha-editor-height,100dvh) !important; max-height:var(--dsha-editor-height,100dvh) !important; }
 html body .dsha-editor-header,html body .dsha-preset-editor-body,html body .dsha-preset-editor-actions { box-sizing:border-box; width:100%; min-width:0; max-width:100%; }
 html body .dsha-preset-editor-body { scroll-padding-block:72px 112px; overscroll-behavior:contain; }
 html body .dsha-editor-header { min-height:56px; padding:8px 16px; }
 html body .dsha-editor-header h2 { font-size:18px; }
 html body .dsha-preset-editor-body { padding:12px 16px 20px; }
 html body .dsha-editor-tabs { position:sticky; top:0; z-index:3; height:44px; margin:0 0 14px; padding:3px; backdrop-filter:blur(14px); }
 html body .dsha-editor-tabs button { min-height:38px; padding:6px 10px; }
 html body .dsha-editor-hint { margin-bottom:10px; font-size:13px; line-height:18px; }
 html body .dsha-editor-card { padding:12px; margin-bottom:10px; border-radius:12px; }
 html body .dsha-editor-card h3 { margin-bottom:8px; }
 html body .dsha-editor-field { margin-top:10px; }
 html body .dsha-preset-editor textarea { min-height:112px; max-height:42dvh; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; resize:none; }
 html body .dsha-preset-editor textarea[rows="8"] { height:min(34dvh,300px); }
 html body .dsha-preset-editor textarea[rows="3"] { height:116px; }
 html body .dsha-editor-component { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px 10px; min-height:64px; }
 html body .dsha-editor-component-name { grid-column:1; grid-row:1; }
 html body .dsha-editor-component-actions { grid-column:2; grid-row:1; display:grid; grid-template-columns:auto 36px 36px; align-items:center; gap:4px; }
 html body .dsha-editor-component-actions button { box-sizing:border-box; width:36px; min-width:36px; min-height:36px; padding:4px; }
 html body .dsha-editor-component-actions .dsha-editor-remove { grid-column:1/-1; width:100%; min-width:0; min-height:32px; color:#d85b62; font-size:11px; }
 html body .dsha-preset-editor-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(92px,auto) minmax(108px,auto); grid-template-rows:auto 44px; min-height:76px; padding:8px 16px 10px; gap:5px 8px; background:var(--dsw-specific-menu); }
 html body .dsha-editor-save-state { grid-column:1/-1; min-width:0; font-size:11px; line-height:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.72; }
 html body .dsha-preset-editor-actions button { min-width:0; min-height:44px; padding:8px 12px; }
 html body .dsha-preset-editor-actions button:nth-last-child(2) { grid-column:2; }
 html body .dsha-preset-editor-actions button:last-child { grid-column:3; }
 html body .dsha-preset-editor-actions button:only-of-type { grid-column:3; }
 html body .dsha-editor-header-actions button[aria-label="На весь экран"],html body .dsha-editor-header-actions button[aria-label="Full screen"],html body .dsha-editor-header-actions button[aria-label="Свернуть"],html body .dsha-editor-header-actions button[aria-label="Exit full screen"] { display:none !important; }
 html body [data-team-panel] { box-sizing:border-box; left:8px !important; right:8px !important; width:auto !important; max-height:min(70dvh,620px) !important; }
 html body [data-team-panel] .VoX2oq_body { padding:10px 12px 12px; overflow:hidden; }
 html body [data-team-panel] .dsha-agent-section > h3 { display:none; }
 html body [data-team-panel] .dsha-agent-switcher { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:4px; padding:4px; margin-bottom:10px; border-radius:10px; background:color-mix(in srgb,currentColor 6%,transparent); }
 html body [data-team-panel] .dsha-agent-switcher button { min-width:0; min-height:40px; padding:6px 8px; color:var(--dsw-alias-label-secondary); background:transparent; border:0; border-radius:8px; font-family:inherit; font-size:13px; font-weight:500; line-height:18px; }
 html body [data-team-panel] .dsha-agent-switcher button.is-active { color:var(--dsw-alias-state-business-primary); background:var(--dsw-alias-bg-layer-2); box-shadow:var(--dsw-elevation-stroke); }
 html body [data-team-panel] .VoX2oq_roster { display:flex !important; flex-direction:column; gap:8px; max-height:min(52dvh,480px); padding:0 4px 0 0; }
 html body [data-team-panel] .VoX2oq_roster > .VoX2oq_member { position:static; width:100%; min-height:58px; }
 html body [data-team-panel] .dsha-agent-section[data-dsha-agent-view="subagents"] .VoX2oq_roster > .VoX2oq_member:first-child { display:none; }
 html body [data-team-panel] .dsha-agent-section[data-dsha-agent-view="agent"] .VoX2oq_roster > .VoX2oq_member:not(:first-child) { display:none; }
 html body .rtSEdW_card:has([data-dsha-edit]) .rtSEdW_cardFoot { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:stretch; gap:4px; }
 html body .rtSEdW_card:has([data-dsha-edit]) .rtSEdW_cardHelp { display:contents; }
 html body .rtSEdW_card:has([data-dsha-edit]) .rtSEdW_cardFoot button { box-sizing:border-box; min-width:0; width:100%; height:auto !important; align-self:stretch !important; min-height:44px; margin:0; padding:5px 3px; white-space:normal; overflow-wrap:anywhere; justify-content:center; font-size:12px; line-height:16px; }
 html [data-mobile-nav=frame][data-phase] header.wSkVaW_header,html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header { padding-inline:16px !important; grid-template-columns:28px minmax(0,1fr) !important; column-gap:8px !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=toggle] { display:inline-flex !important; position:absolute !important; left:16px !important; top:6px !important; height:28px !important; margin:0 !important; padding:0 !important; width:28px !important; }
 
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=files] { display:inline-flex !important; position:absolute !important; right:16px !important; top:6px !important; width:28px !important; height:28px !important; margin:0 !important; padding:0 !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header > .wSkVaW_headerLeading { padding:0 !important; width:28px !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .dsha-conversation-toolbar { display:flex !important; flex-wrap:nowrap !important; align-items:center !important; gap:8px; width:100%; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .dsha-conversation-toolbar .wSkVaW_tabs { flex:0 1 auto !important; width:auto !important; padding-left:0 !important; margin:0 !important; align-items:center !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .dsha-conversation-actions .QsffPG_count { margin-inline:0 !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .dsha-conversation-actions { flex:0 0 auto !important; margin-left:auto !important; align-items:center !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .wSkVaW_headerUtilities { margin:0 0 0 auto !important; padding:0 !important; width:auto !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .wSkVaW_titleRow { padding:0 36px 0 0 !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .wSkVaW_crumbs > .wSkVaW_crumbSeg:not(:last-child) { display:none !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header .wSkVaW_crumbs { min-width:0; overflow:hidden; }
 html [data-mobile-nav=frame] [data-phase] .uV2eYG_trailing,html [data-mobile-nav=frame] [data-phase] .uV2eYG_standardControls { gap:8px !important; }
 html [data-mobile-nav=frame] [data-phase] .uV2eYG_trailing .cubgiG_menuAnchor { margin:0 !important; flex:0 0 auto !important; }
 html [data-mobile-nav=frame] [data-phase] .uV2eYG_trailing .cubgiG_seat { padding:0 !important; gap:0 !important; min-height:34px; }
}
@media(max-width:320px) {
 html [data-mobile-nav=frame][data-phase] header.wSkVaW_header,html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header { padding-inline:12px !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=toggle] { left:12px !important; }
 html [data-mobile-nav=frame] [data-phase] header.wSkVaW_header [data-mobile-nav=files] { right:12px !important; }
}
@media(min-width:481px) and (max-width:767px) {
 html body [data-team-panel] .dsha-agent-section > h3 { display:flex; }
 html body [data-team-panel] .dsha-agent-switcher { display:none; }
 html body [data-team-panel] .VoX2oq_roster { display:grid !important; grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; }
 html body [data-team-panel] .dsha-agent-section[data-dsha-agent-view] .VoX2oq_roster > .VoX2oq_member:first-child { display:flex; grid-column:1; grid-row:1; position:sticky; top:0; }
 html body [data-team-panel] .dsha-agent-section[data-dsha-agent-view] .VoX2oq_roster > .VoX2oq_member:not(:first-child) { display:flex; grid-column:2; }
}
`;
  function install() {
    if (!document.head) return false;
    if (!document.getElementById('dsha-mobile-layout')) {
      var style = document.createElement('style');
      style.id = 'dsha-mobile-layout';
      style.textContent = css;
      document.head.appendChild(style);
    }
    return true;
  }
  window.__dshaMobileLayoutInstall = function () { install(); syncEditorViewport(); };
  if (!install()) {
    var observer = new MutationObserver(function () {
      if (install()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }
  function syncEditorViewport() {
    if (!document.documentElement) return;
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    var top = viewport ? viewport.offsetTop : 0;
    document.documentElement.style.setProperty('--dsha-editor-height', Math.max(240, Math.round(height)) + 'px');
    document.documentElement.style.setProperty('--dsha-editor-top', Math.max(0, Math.round(top)) + 'px');
  }
  var statsSeat = null;
  var statsQueued = false;
  var statsWatching = false;
  var statsResize = typeof ResizeObserver === 'function' ? new ResizeObserver(queueStatsPosition) : null;
  function syncStatsPosition() {
    statsQueued = false;
    if (window.innerWidth > 767) return;
    var seat = document.querySelector('.wSkVaW_composerSeat');
    if (seat !== statsSeat) {
      if (statsResize && statsSeat) statsResize.unobserve(statsSeat);
      statsSeat = seat;
      if (statsResize && seat) statsResize.observe(seat);
    }
    if (!seat) return;
    var seatRect = seat.getBoundingClientRect();
    document.documentElement.style.setProperty('--dsha-composer-top', Math.max(0, Math.round(seatRect.top)) + 'px');
    document.documentElement.style.setProperty('--dsha-composer-center', Math.round((seatRect.left + seatRect.right) / 2) + 'px');
  }
  function queueStatsPosition() {
    if (statsQueued) return;
    statsQueued = true;
    requestAnimationFrame(syncStatsPosition);
  }
  function watchStatsPosition() {
    if (!document.body || statsWatching) return;
    statsWatching = true;
    new MutationObserver(queueStatsPosition).observe(document.body, { childList:true, subtree:true });
    queueStatsPosition();
  }
  syncEditorViewport();
  if (document.body) watchStatsPosition();
  document.addEventListener('DOMContentLoaded', function () { install(); syncEditorViewport(); watchStatsPosition(); }, { once: true });
  window.addEventListener('resize', function () { syncEditorViewport(); queueStatsPosition(); }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { syncEditorViewport(); queueStatsPosition(); }, { passive: true });
    window.visualViewport.addEventListener('scroll', syncEditorViewport, { passive: true });
  }
  document.addEventListener('focusin', function (event) {
    var field = event.target;
    if (!(field instanceof HTMLElement) || !field.closest('.dsha-preset-editor')) return;
    if (!field.matches('textarea,input')) return;
    window.setTimeout(function () {
      field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 120);
  });
})();
