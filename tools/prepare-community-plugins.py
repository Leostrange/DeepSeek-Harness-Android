"""Register reviewed, bundled community packages and apply their Russian copy.

Downloads are kept under app/build/community-plugins; never execute download scripts.
Original versions and licenses stay intact. Run again after editing plugin sources.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets'
NAMES = ['dsh-peak-chip', 'dsh-batch-tool-calls', 'dsh-any-background',
         'dsh-session-health', 'dsh-subagent-model-picker']
COPY = {
 'dsh-peak-chip': ('Тарифы и расходы DeepSeek', 'Пиковый и льготный тарифы DeepSeek, баланс аккаунта, пополнения и расходы за день.'),
 'dsh-batch-tool-calls': ('Пакетные вызовы инструментов', 'Объединяет независимые вызовы инструментов в одном шаге, сокращая число шагов и повторную передачу контекста.'),
 'dsh-any-background': ('Оформление и фон', 'Цвет темы, фон из изображений и видео, генераторы фона, прозрачность и размытие отдельных областей, профили оформления.'),
 'dsh-session-health': ('Здоровье сессии', 'Реальные показатели токенов и заполнения контекста, оценка стоимости продолжения, значок здоровья, отчёт /health и обзор сессий.'),
 'dsh-subagent-model-picker': ('Выбор модели субагентов', 'Выбор провайдера, модели и лимита токенов для каждого субагента, автоматический выбор модели и каталог доступных моделей.'),
}
translations = json.loads((ROOT/'tools/i18n/community-plugin-strings-ru.json').read_text(encoding='utf8'))
translations.update(json.loads((ROOT/'tools/i18n/community-plugin-template-fragments-ru.json').read_text(encoding='utf8')))
native = json.loads((ROOT/'tools/i18n/ru.json').read_text(encoding='utf8'))
web = json.loads((ROOT/'tools/i18n/plugin-copy-ru.json').read_text(encoding='utf8'))
contract_path = ASSETS/'managed-runtime-inputs.json'
contract = json.loads(contract_path.read_text(encoding='utf8'))
known = {item['asset'] for item in contract['installs']}
for name in NAMES:
 package = ASSETS/'builtin-plugins'/name
 meta_path = package/'package.json'
 meta = json.loads(meta_path.read_text(encoding='utf8'))
 original = meta['description']
 title, description = COPY[name]
 native[name] = title
 web[name] = title
 native[original] = description
 web[original] = description
 meta['description'] = description
 # Runtime inventory reads dsh.displayName; npm identifiers remain stable.
 meta.setdefault('dsh', {})['displayName'] = title
 meta_path.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 for f in package.rglob('*.js'):
  if name == 'dsh-any-background': continue  # Its zh/en/ru locale catalog is separate.
  source = f.read_text(encoding='utf8')
  source = re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)) if int(m[1],16)>127 else m[0],source)
  for before, after in sorted(translations.items(),key=lambda item:len(item[0]),reverse=True):
   escaped = ''.join('\\u'+format(ord(c),'04X') if ord(c)>127 else c for c in before)
   source = source.replace(before,after)
   source = re.sub(re.escape(escaped),lambda _:after,source,flags=re.IGNORECASE) if escaped!=before else source
  f.write_text(source,encoding='utf8')
 for f in sorted(package.rglob('*')):
  if not f.is_file(): continue
  asset = f.relative_to(ASSETS).as_posix()
  if asset not in known:
   contract['installs'].append({'asset':asset,'target':'root/dsha-'+name[4:]+'/'+f.relative_to(package).as_posix(),'executable':False})
   known.add(asset)
native['本地导入'] = 'Локальный импорт'
web['本地导入'] = 'Локальный импорт'
for file, data in [(ROOT/'tools/i18n/ru.json',native),(ROOT/'tools/i18n/plugin-copy-ru.json',web),(contract_path,contract)]:
 file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Bundled community plugins:', ', '.join(NAMES))
