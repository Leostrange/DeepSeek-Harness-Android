"""Exercise the native ExactTextPatch implementation against the shipped archive twice."""
import json, os, struct, subprocess, tarfile, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets'
recipes=[json.loads((assets/name).read_text(encoding='utf-8')) for name in ['ru-agent-team-patch.json','ru-jobs-patch.json','ru-plugin-inventory-patch.json','ru-plugin-manager-copy-patch.json','ru-permission-patch.json','ru-auto-review-patch.json','ru-preset-picker-patch.json','ru-preset-editor-backend-patch.json','ru-preset-editor-host-patch.json','ru-preset-editor-remote-client-patch.json','ru-devtools-package-patch.json','response-language-policy-patch.json']]
recipes.append(json.loads((assets/'ru-stats-strip-patch.json').read_text(encoding='utf-8')))
modules={recipe['module'] for recipe in recipes}
sources={}
with tarfile.open(assets/'dsh-runtime.bin') as archive:
    for member in archive:
        module=next((name for name in modules if member.name.endswith('/node_modules/'+name)),None)
        if member.isfile() and module in modules:
            sources[module]=archive.extractfile(member).read()
assert set(sources)==modules
with tempfile.TemporaryDirectory(prefix='dsha-native-patches-') as temporary:
    base=Path(temporary);package=base/'com/deepseekharness/app/util';package.mkdir(parents=True)
    (package/'ExactTextPatch.java').write_bytes((root/'app/src/main/java/com/deepseekharness/app/util/ExactTextPatch.java').read_bytes())
    (package/'UiText.java').write_text('package com.deepseekharness.app.util; public final class UiText { public static String text(String text){return text;} }')
    (base/'Check.java').write_text("""import java.io.*;import java.nio.charset.StandardCharsets;import com.deepseekharness.app.util.ExactTextPatch;
public class Check {
 static String read(DataInputStream input)throws IOException{return new String(input.readNBytes(input.readInt()),StandardCharsets.UTF_8);}
 public static void main(String[] args)throws Exception {try(var input=new DataInputStream(new FileInputStream(args[0]))){int count=input.readInt();for(int n=0;n<count;n++){String name=read(input),source=read(input);int size=input.readInt();String[] before=new String[size],after=new String[size];for(int i=0;i<size;i++){before[i]=read(input);after[i]=read(input);}for(int pass=0;pass<2;pass++)for(int i=0;i<size;i++){try{String result=ExactTextPatch.apply(source,before[i],after[i]);if(!result.equals(source))throw new AssertionError(name+": archived patch unexpectedly changed bytes "+i);source=result;}catch(Exception error){throw new IllegalStateException(name+": patch "+i+" pass "+pass,error);}}}}System.out.println("PASS native installation replay: all 12 managed language recipes, twice, shipped runtime bytes unchanged");}
}""")
    with (base/'cases.bin').open('wb') as output:
        def integer(value):output.write(struct.pack('>i',value))
        def text(value):
            value=value.encode('utf-8') if isinstance(value,str) else value
            integer(len(value));output.write(value)
        integer(len(recipes))
        for recipe in recipes:
            text(recipe['module']);text(sources[recipe['module']]);integer(len(recipe['patches']))
            for patch in recipe['patches']:text(patch['before']);text(patch['after'])
    java=Path(os.environ['JAVA_HOME'])/'bin'
    subprocess.run([str(java/'javac.exe'),'-encoding','UTF-8','-d',str(base),str(package/'UiText.java'),str(package/'ExactTextPatch.java'),str(base/'Check.java')],check=True)
    subprocess.run([str(java/'java.exe'),'-cp',str(base),'Check',str(base/'cases.bin')],check=True)
