"""Verify the separate port APK identity, signature, runtime and custom assets."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APK = ROOT / 'app/build/outputs/apk/standard/ruTrial/app-standard-ruTrial.apk'
ASSETS = ROOT / 'app/src/main/assets'
SDK = Path(os.environ['ANDROID_HOME']) / 'build-tools/37.0.0'

def run(*args):
    return subprocess.check_output(list(map(str, args)), cwd=ROOT, text=True,
                                   encoding='utf8', errors='replace')

signing = run(SDK / 'apksigner.bat', 'verify', '--verbose', '--print-certs', APK)
certificate = '9026a2270ff16f0842b40c65da6b812106b3ebfc8b77e2307e91010db4f4bb5d'
assert certificate in signing.lower() and 'Verifies' in signing
badging = run(SDK / 'aapt2.exe', 'dump', 'badging', APK)
for expected in ["name='com.dsh.client.ru020'", "versionCode='163'",
                 "versionName='0.2.0-rc2-ru-port2-experimental'",
                 "minSdkVersion:'30'", "native-code: 'arm64-v8a'"]:
    assert expected in badging, expected
assert 'application-debuggable' not in badging

with zipfile.ZipFile(APK) as archive:
    assert archive.testzip() is None
    for name in ['builtin-plugins.json', 'runtime-patches.json', 'runtime-descriptor.json',
                 'language-patch.json', 'web-integration/mobile-layout.js',
                 'web-integration/community-ru.js', 'web-integration/ru-locales.json',
                 'preset-editor-client.js', 'preset-editor-host.js', 'preset-editor-yaml.js',
                 'builtin-plugins/dsh-any-background/lib/client.js',
                 'builtin-plugins/dsh-any-background/lib/index.js',
                 'builtin-plugins/dsh-session-health/lib/client.js',
                 'builtin-plugins/dsh-session-health/lib/index.js']:
        assert archive.read('assets/' + name) == (ASSETS / name).read_bytes(), name
    registry = json.loads(archive.read('assets/runtime-patches.json'))
    assert registry['dshVersion'] == '0.2.0-rc.2'
    custom = [row['asset'] for row in registry['active']
              if row['asset'].startswith('ru-') or row['asset'] == 'response-language-policy-patch.json']
    assert len(custom) == 13, custom
    for name in custom:
        assert archive.read('assets/' + name) == (ASSETS / name).read_bytes(), name
    with archive.open('assets/dsh-runtime.bin') as stream:
        with tarfile.open(fileobj=stream, mode='r|gz') as runtime:
            version = None
            for member in runtime:
                if member.name == 'usr/local/share/dsha/dsh-runtime.version':
                    version = runtime.extractfile(member).read().decode().strip()
            assert version == '0.2.0-rc.2', version
    # Build157 shares physical archives while recovery retains its own logical runtime.
    assert 'assets/recovery-dsh-runtime.bin' not in archive.namelist()
    assert 'assets/recovery-rootfs.bin' not in archive.namelist()

recovery = json.loads(run('python', ROOT / 'tools/verify-recovery-apk.py', APK))
assert recovery['result'] == 'PASS', recovery
sha = hashlib.file_digest(APK.open('rb'), 'sha256').hexdigest()
result = dict(result='PASS', apk=str(APK), bytes=APK.stat().st_size, sha256=sha,
              applicationId='com.dsh.client.ru020', dshVersion='0.2.0-rc.2',
              certificateSha256=certificate, customRecipes=len(custom), recovery=recovery)
(ROOT / 'app/build/port-apk-verification.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(result, ensure_ascii=False, indent=2))
