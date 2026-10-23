import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { directoryFiles, sha256 } from './check-package.mjs';

// Firefox's driver cannot operate the actual React toolbar popup. This named
// source fixture keeps the investigation assets intact and discloses its consent seam.
export async function prepareHandoffFixture(directory) {
  const original = await directoryFiles('.output/firefox-mv3');
  for (const [path, bytes] of original) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), bytes);
  }
  const manifest = JSON.parse(original.get('manifest.json').toString());
  const id = 'timing-source-fixture@addonray.test';
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      ...manifest,
      name: 'AddonRay timing source fixture',
      permissions: ['activeTab'],
      optional_permissions: ['management', 'scripting'],
      browser_specific_settings: {
        ...manifest.browser_specific_settings,
        gecko: { ...manifest.browser_specific_settings.gecko, id },
      },
    }),
  );
  const inputs = {};
  const outputs = {};
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
  await mkdir(join(directory, 'source-core'), { recursive: true });
  for (const name of [
    'inspector',
    'session',
    'timing-handoff',
    'browser-target',
  ]) {
    const source = await readFile(`lib/${name}.ts`, 'utf8');
    const js = transpiler
      .transformSync(source)
      .replace(/from (["'])\.\/([a-z-]+)\1/g, 'from "./$2.js"');
    inputs[`lib/${name}.ts`] = sha256(Buffer.from(source));
    outputs[`source-core/${name}.js`] = sha256(Buffer.from(js));
    await writeFile(join(directory, 'source-core', `${name}.js`), js);
  }
  await writeFile(
    join(directory, 'popup.html'),
    `<!doctype html><title>Source timing fixture</title>
<h1>Selected-page access</h1><button id="grant-research">Allow research access</button><button id="page">Allow page access and inspect</button><p id="page-status"></p>
<button id="timing-destinations" disabled>Attach timing</button><div id="choices"></div>
<p id="timing-attachment-status"></p><script type="module" src="source-popup.js"></script>`,
  );
  await writeFile(
    join(directory, 'source-popup.js'),
    `import {createSession} from './source-core/session.js';
import {createPopupTimingHandoff} from './source-core/timing-handoff.js';
const api=browser;
const session=createSession({tabs:api.tabs,management:api.management,scripting:api.scripting,permissions:{request:(p)=>api.permissions.contains(p),onRemoved:api.permissions.onRemoved}});
const handoff=createPopupTimingHandoff(api,session,window);
let destinations=[];
const status=document.querySelector('#timing-attachment-status');
const choices=document.querySelector('#choices');
session.subscribe(()=>{
const state=session.getSnapshot();
if(!session.getTimingCapture())choices.replaceChildren();
document.querySelector('#page-status').textContent=state.page?.status==='success'?'Document: '+state.page.value.readyState:state.page?.reason??'';
document.querySelector('#timing-destinations').disabled=!session.getTimingCapture()||!session.isTimingCaptureCurrent(session.getTimingCapture().id);
});
window.addEventListener('pagehide',()=>session.clear());
document.querySelector('#grant-research').onclick=()=>api.permissions.request({permissions:['management','scripting']});
document.querySelector('#page').onclick=()=>session.inspectPage();
document.querySelector('#timing-destinations').onclick=async()=>{
status.textContent='';choices.replaceChildren();const result=await handoff.listDestinations();
if(result.status!=='success'){status.textContent='Timing attachment unavailable. '+result.reason;return;}
destinations=result.value;
for(const [id,label] of [['timing-destination','Choose an investigation'],['timing-side','Choose Before or After']]){
const select=document.createElement('select');select.id=id;select.add(new Option(label,''));choices.append(select);}
const selected=document.querySelector('#timing-destination');const side=document.querySelector('#timing-side');
for(const item of destinations)selected.add(new Option(item.label,item.identity));
const confirm=document.createElement('button');confirm.id='attach-timing';confirm.textContent='Confirm attachment';confirm.disabled=true;choices.append(confirm);
selected.onchange=()=>{side.replaceChildren(new Option('Choose Before or After',''));const item=destinations.find(d=>d.identity===selected.value);for(const value of item?.sides??[])side.add(new Option(value,value));confirm.disabled=true;};
side.onchange=()=>confirm.disabled=!selected.value||!side.value;
confirm.onclick=async()=>{confirm.disabled=true;const item=destinations.find(d=>d.identity===selected.value);const value=side.value;
const result=await handoff.attach(item,value);status.textContent=result.status==='success'?'Timing attached to '+item.label+', '+value+'. This capture has been used.':'Timing attachment failed. '+result.reason;
if(result.status==='success')choices.replaceChildren();else confirm.disabled=false;};
};`,
  );
  return {
    id,
    authority:
      'Firefox source-popup fixture with unchanged packaged investigation assets and approved optional management/scripting',
    inputs,
    outputs,
    consentSeam:
      'Fixture source session substitutes contains for request after a separate driver-clicked optional permission action; investigation assets still use their normal optional-consent path. No React-popup UI or human usability verdict.',
    preservedAssets: [...original.keys()].filter(
      (path) => !['manifest.json', 'popup.html'].includes(path),
    ),
  };
}
