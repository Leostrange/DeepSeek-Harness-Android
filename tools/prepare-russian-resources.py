"""Generate missing Android Russian resources from the reviewed native catalog."""
import json,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[1]
ru=json.loads((root/'tools/i18n/ru.json').read_text(encoding='utf8'))
def value(text):
    text=text or ''
    if text.startswith('"') and text.endswith('"'):text=text[1:-1]
    return text.replace('\\n','\n').replace('\\"','"').replace("\\'","'")
def encode(text):return '"'+text.replace('\\','\\\\').replace('"','\\"').replace('\n','\\n')+'"'
total=0
for scope in ['main','standard','low']:
    directory=root/f'app/src/{scope}/res';target=directory/'values-ru/current_strings.xml'
    existing={};trees={}
    for file in (directory/'values-ru').glob('*.xml'):
        if file==target:continue
        tree=ET.parse(file);trees[file]=tree
        for entry in tree.getroot().findall('string'):existing[entry.get('name')]=(file,entry)
    english={}
    for file in (directory/'values-en').glob('*.xml'):
        for entry in ET.parse(file).getroot().findall('string'):english[entry.get('name')]=value(entry.text)
    generated=ET.Element('resources');changed=set()
    for file in (directory/'values').glob('*.xml'):
        for entry in ET.parse(file).getroot().findall('string'):
            if entry.get('translatable')=='false' or len(entry):continue
            name=entry.get('name');source=value(entry.text);translated=ru.get(source)
            if not translated:continue
            if name in existing:
                owner,current=existing[name];prior=value(current.text)
                if prior==source or prior==english.get(name):current.text=encode(translated);changed.add(owner)
            else:
                current=ET.SubElement(generated,'string',dict(entry.attrib));current.text=encode(translated);total+=1
    for file in changed:
        ET.indent(trees[file],space='    ');trees[file].write(file,encoding='utf-8',xml_declaration=True)
    if len(generated):
        target.parent.mkdir(exist_ok=True);ET.indent(generated,space='    ')
        ET.ElementTree(generated).write(target,encoding='utf-8',xml_declaration=True)
print('Generated current Russian Android resources:',total)
