import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './check-package.mjs';

// This separate extension exercises production owners and transport. Its driver
// supplies completed counts and inventories, never a page observer or React UI.
export async function preparePageErrorComparisonFixture(directory, target) {
  assert(['firefox', 'chrome'].includes(target));
  await mkdir(join(directory, 'comparison-core'), { recursive: true });
  const id = 'page-error-comparison-fixture@addonray.test';
  const manifest = {
    manifest_version: 3,
    name: 'AddonRay page-error comparison source fixture',
    version: '1.0',
    permissions: ['activeTab', 'management'],
    optional_permissions: ['scripting'],
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id,
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  };
  const inputs = {};
  const outputs = {};
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
  for (const name of [
    'browser-target',
    'comparison',
    'inspector',
    'investigation',
    'live-activity',
    'page-error-check',
    'page-error-handoff',
  ]) {
    const source = await readFile(`lib/${name}.ts`, 'utf8');
    const js = transpiler
      .transformSync(source)
      .replace(/from (["'])\.\/([a-z-]+)\1/g, 'from "./$2.js"');
    inputs[`lib/${name}.ts`] = sha256(Buffer.from(source));
    outputs[`comparison-core/${name}.js`] = sha256(Buffer.from(js));
    await writeFile(join(directory, 'comparison-core', `${name}.js`), js);
  }
  const files = {
    'manifest.json': JSON.stringify(manifest),
    'comparison-probe.html': `<!doctype html><title>Comparison source controller</title>
<button id="comparison-grant-scripting">Grant fixture scripting</button>
<script type="module" src="comparison-control.js"></script>`,
    'comparison-control.js': `const api=globalThis.browser??globalThis.chrome;
document.querySelector('#comparison-grant-scripting').onclick=()=>api.permissions.request({permissions:['scripting']});
globalThis.comparisonControl={ready:true};`,
    'page-error.html': `<!doctype html><title>Comparison source check</title>
<script type="module" src="comparison-donor.js"></script>`,
    'investigation.html': `<!doctype html><title>Comparison source investigation</title>
<script type="module" src="comparison-investigation.js"></script>`,
    'comparison-other.html': `<!doctype html><title>Unrelated comparison fixture document</title>
<script type="module" src="comparison-other.js"></script>`,
    'comparison-other.js': 'globalThis.comparisonOther={ready:true};',
    'comparison-common.js': common,
    'comparison-donor.js': donor(target),
    'comparison-investigation.js': investigation(target),
  };
  for (const [name, source] of Object.entries(files)) {
    outputs[name] = sha256(Buffer.from(source));
    await writeFile(join(directory, name), source);
  }
  return {
    id,
    target,
    inputs,
    outputs,
    productionInputs: inputs,
    permissions: manifest.permissions,
    optionalPermissions: manifest.optional_permissions,
    hostPermissions: [],
    authority:
      'Separately named source fixture. Exact production PageErrorCheck, Investigation and page-error handoff modules are transpiled without body changes. Driver-supplied inventory and completed-summary results replace collection; fixture controls replace React UI. Real own packaged Window endpoints perform the selected handoff.',
    seams: [
      'Required management on both targets is an explicit automation seam, not optional-management consent or revocation qualification. Scripting is actually requested and removed.',
      'Driver binds known normal about:blank source tabs after actual ID/incognito validation. This is not production toolbar bootstrap or source-page observation.',
      'Synthetic timing acceptance tests the shared model binding, not the existing popup timing transport.',
      'Receiver wrappers delay invocation or acknowledgment to schedule races without changing production bodies. Private/unknown classifications are simulated negative API values, not authentic private-window qualification.',
    ],
    gaps: [
      'No packaged React controls, native usability, page-error collector, timing collector, overhead, private-window or optional-management consent/revocation evidence is supplied by this fixture.',
    ],
  };
}

const common = `export const api=globalThis.browser??globalThis.chrome;
export function harnessApi(){
 let contextMode='actual';
 return {
  getContextMode:()=>contextMode,
  setContextMode:value=>{contextMode=value;},
  api:{extension:api.extension,runtime:api.runtime,permissions:api.permissions,tabs:{
   getCurrent:async()=>{
    if(contextMode==='throw')throw new Error('Simulated context failure');
    const tab=await api.tabs.getCurrent();
    if(contextMode==='actual')return tab;
    return tab?{...tab,incognito:contextMode==='private'?true:undefined}:undefined;
   },
  }},
 };
}
export function ownSummary(value){return value===null||Object.getPrototypeOf(value)===Object.prototype;}
`;

function donor(target) {
  return `import {createPageErrorCheck} from './comparison-core/page-error-check.js';
import {createPageErrorHandoff} from './comparison-core/page-error-handoff.js';
import {getBrowserContext} from './comparison-core/browser-target.js';
import {api,harnessApi,ownSummary} from './comparison-common.js';
const harness=harnessApi();
let next={status:'success',value:{scriptErrors:1,unhandledRejections:2,total:3,finish:'stop',observedMs:125}};
let last=null;let pending=0;let sourceReads=0;let results=[];let discoveries=[];
const check=createPageErrorCheck(api,{start:async(_id,_signal,observing)=>{observing();return next;},stop(){}},getBrowserContext('${target}'));
const unsubscribe=check.subscribe(()=>{});
const handoff=createPageErrorHandoff(harness.api,check,window);
globalThis.comparisonFixture={
 kind:'donor',
 async bind(id){sourceReads++;const tab=await api.tabs.get(id);return tab.id===id&&tab.incognito===false&&check.bindSource(id);},
 async complete(value){next={status:'success',value};await check.start();return check.getSnapshot();},
 async fail(status){next={status};await check.start();return check.getSnapshot();},
 reset(){check.startOver();last=null;results=[];discoveries=[];},
 async discover(){const result=await handoff.listDestinations();if(result.status==='success')discoveries=result.value;return result;},
 async attach(destination,side){return handoff.attach(destination,side);},
 startAttach(destination,side){const generation=check.getGeneration();pending++;last=null;void handoff.attach(destination,side).then(value=>{if(check.getGeneration()===generation){last=value;results.push(value);}},()=>{if(check.getGeneration()===generation){last={status:'error',reason:'Rejected handoff promise'};results.push(last);}}).finally(()=>{pending--;});return true;},
 context:harness.setContextMode,
 capture:()=>check.getAttachmentCapture(),
 state(){const snapshot=check.getSnapshot();return {snapshot,generation:check.getGeneration(),identity:check.identity,used:check.isAttachmentUsed(),last,pending,results,sourceReads,metadataOwn:Array.isArray(discoveries)&&Object.getPrototypeOf(discoveries)===Array.prototype&&discoveries.every(value=>Object.getPrototypeOf(value)===Object.prototype&&Object.getPrototypeOf(value.sides)===Array.prototype),summaryOwn:snapshot.outcome?.status!=='success'||ownSummary(snapshot.outcome.value)};},
};
window.addEventListener('pagehide',()=>{handoff.dispose();check.dispose();unsubscribe();delete globalThis.comparisonFixture;},{once:true});`;
}

function investigation(target) {
  return `import {createInvestigation} from './comparison-core/investigation.js';
import {installInvestigationErrorHandoff} from './comparison-core/page-error-handoff.js';
import {getBrowserContext} from './comparison-core/browser-target.js';
import {api,harnessApi,ownSummary} from './comparison-common.js';
const harness=harnessApi();
let inventoryFails=false;let beforeHold=false;let ackHold=false;let waiting=false;let waitingAck=false;let release=null;let releaseAck=null;let deliveries=0;let inFlight=0;
const model=createInvestigation({permissions:{request:permissions=>api.permissions.contains(permissions),onRemoved:api.permissions.onRemoved},management:{getAll:async()=>{if(inventoryFails)throw new Error('Synthetic inventory failure');return [{id:'synthetic-extension',name:'Synthetic inventory item',version:'1',type:'extension',enabled:true}];}}},getBrowserContext('${target}'));
const unsubscribe=model.subscribe(()=>{});
const remove=installInvestigationErrorHandoff(harness.api,model,window);
const endpoint=window.addonrayErrorInvestigation;
const receive=endpoint.receive;
endpoint.receive=async(...args)=>{
 deliveries++;
 inFlight++;
 try {
 if(beforeHold){beforeHold=false;waiting=true;await new Promise(done=>{release=done;});waiting=false;release=null;}
 const result=await receive(...args);
 if(ackHold&&result.status==='success'){ackHold=false;waitingAck=true;await new Promise(done=>{releaseAck=done;});waitingAck=false;releaseAck=null;}
 return result;
 } finally {inFlight--;}
};
globalThis.comparisonFixture={
 kind:'investigation',
 inventory:side=>side==='before'?model.captureBefore():model.captureAfter(),
 inventoryFailure:value=>{inventoryFails=value===true;},
 reset:()=>model.startOver(),
 timing(side,id){return model.attachTiming(side,id,{domContentLoaded:{status:'measured',milliseconds:1},loadEvent:{status:'measured',milliseconds:2},firstContentfulPaint:{status:'measured',milliseconds:3}},model.getGeneration());},
 assessment:value=>model.setAssessment(value),
 context:harness.setContextMode,
 hold:()=>{beforeHold=true;},holdAck:()=>{ackHold=true;},
 release:()=>{release?.();},releaseAck:()=>{releaseAck?.();},
 async invalidSender(){return endpoint.receive({identity:model.identity,generation:model.getGeneration(),side:'before'},window);},
 state(){const snapshot=model.getSnapshot();return {snapshot,generation:model.getGeneration(),identity:model.identity,label:model.label,sides:model.errorSides(),timingSides:model.timingSides(),waiting,waitingAck,inFlight,deliveries,ownCopies:ownSummary(snapshot.errorBefore)&&ownSummary(snapshot.errorAfter)};},
};
window.addEventListener('pagehide',()=>{remove();unsubscribe();delete globalThis.comparisonFixture;},{once:true});`;
}
