"""Generate the public-community translation asset from reviewed copy."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'tools/i18n/community-ru.json').read_text(encoding='utf8'))
source = 'var DSHA_COMMUNITY_RU = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n'
source += (root / 'tools/i18n/community-browser.js').read_text(encoding='utf8')
target = root / 'app/src/main/assets/web-integration/community-ru.js'
if sys.argv[1:] == ['--write']:
    target.write_text(source, encoding='utf8')
elif sys.argv[1:] == ['--check']:
    assert target.read_text(encoding='utf8') == source, 'Run prepare-community-russian.py --write'
else:
    raise SystemExit('usage: prepare-community-russian.py --write|--check')
print('Russian community strings:', len(catalog))
