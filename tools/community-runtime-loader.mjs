import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function resolve(specifier,context,nextResolve){
  if(!specifier.startsWith('.')&&!specifier.startsWith('/')&&!specifier.includes(':')){
    try{return await nextResolve(specifier,{...context,parentURL:pathToFileURL(path.resolve(process.env.DSHA_TEST_RUNTIME,'package.json')).href});}
    catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
  }
  return nextResolve(specifier,context);
}
