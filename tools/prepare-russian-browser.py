"""Generate the RC2 language bridge from recovered locale data and the reviewed helper."""
import json
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets/web-integration'
catalog=json.loads((assets/'ru-locales.json').read_text(encoding='utf8'))
catalog['settings.anyBg']=json.loads((root/'tools/i18n/theme-ru.json').read_text(encoding='utf8'))
plugin_copy=json.loads((root/'tools/i18n/plugin-copy-ru.json').read_text(encoding='utf8'))
helper='const DSHA_PLUGIN_COPY_RU = '+json.dumps(plugin_copy,ensure_ascii=False,indent=2)+';\n'+(root/'tools/i18n/russian-browser.js').read_text(encoding='utf8')
content='/* 俄语文案来自 Alpha2；RC2 服务及控件代码保留。 */\nconst DSHA_RU_LOCALES = '+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n'+helper+'\n'+(assets/'mobile-layout.js').read_text(encoding='utf8')
target=assets/'language.js'
if sys.argv[1:]==['--check']:
    if target.read_text(encoding='utf8')!=content:raise SystemExit('Run prepare-russian-browser.py --write')
elif sys.argv[1:]==['--write']:
    target.write_text(content,encoding='utf8')
else:raise SystemExit('usage: prepare-russian-browser.py --check|--write')
print('Russian Web dictionaries:',len(catalog))
