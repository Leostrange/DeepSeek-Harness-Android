#!/usr/bin/env python3
"""Validate the shared installer/identity manifest and Gradle consumer contract."""
import re
import json
from pathlib import Path
from runtime_input_contract import load, asset_paths, launcher_paths
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = load(ROOT)
checker_spec = importlib.util.spec_from_file_location('descriptor_source_checker',
                                                     ROOT / 'tools/verify-runtime-descriptor-source.py')
checker = importlib.util.module_from_spec(checker_spec)
checker_spec.loader.exec_module(checker)
source_proof = checker.verify(ROOT)
launchers = launcher_paths(ROOT, spec)
installer = (ROOT / 'app/src/main/java/com/deepseekharness/app/runtime/RuntimeTools.java').read_text(encoding='utf8')
if '"managed-runtime-inputs.json"' not in installer or 'manifest.getJSONArray("installs")' not in installer:
    raise SystemExit('RuntimeTools не использует контракт управляемых входов')
descriptor = json.loads((ROOT / 'app/src/main/assets/runtime-descriptor.json').read_text(encoding='utf8'))
identified = set(descriptor['inputs'])
reads = set(re.findall(r'(?:assetText|patchClientModule)\(context,\s*(?:rootfs,\s*)?"([^"]+)"', installer))
reads.discard('runtime-descriptor.json')
if reads - identified:
    raise SystemExit('Фактические патчи не вошли в идентичность рантайма: ' + ','.join(sorted(reads - identified)))
builtin_registry = json.loads((ROOT / 'app/src/main/assets/builtin-plugins.json').read_text(encoding='utf8'))
builtin_names = {row['name'] for row in builtin_registry['plugins'] if not row.get('internal')}
installed_names = {row['asset'].split('/')[1] for row in spec['installs'] if row['asset'].startswith('builtin-plugins/')}
if builtin_names != installed_names:
    raise SystemExit('Объявление подписанных встроенных плагинов отличается от таблицы установок')
for row in spec['installs']:
    if row['asset'].startswith('builtin-plugins/'):
        _, name, suffix = row['asset'].split('/', 2)
        if row['target'] != 'root/dsha-' + name[4:] + '/' + suffix:
            raise SystemExit('Цель установки встроенных плагинов отличается от существующего контракта')
gradle = (ROOT / 'app/build.gradle').read_text(encoding='utf8')
task = gradle.split('def prepareRuntimeDescriptor = tasks.register("prepareRuntimeDescriptor", Exec) {', 1)[1].split('def verifyRuntimeDescriptorInputs', 1)[0]
for required in ['inputs.file(runtimeInputContractFile)', 'runtimeInputContract.assetFiles', 'runtimeInputContract.installs', 'runtimeInputContract.assetTrees', 'runtimeInputContract.launcherTrees', 'runtimeInputContract.launcherSources', 'tools/runtime_input_contract.py', 'tools/dsh-runtime/package.json']:
    if required not in task:
        raise SystemExit('Gradle не использует полный контракт входов: ' + required)
print(f'Контракт одноразовых входов рантайма пройден: установок - {len(spec["installs"])}, ресурсов - {len(identified)}, стартовых входов - {len(launchers)}; отсутствующие офлайн-архивы ждут полной проверки пакета: {source_proof["deferredArchives"]}')
