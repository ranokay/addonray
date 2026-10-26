import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { directoryFiles, sha256 } from './check-package.mjs';
import {
  installErrorSupervisor,
  observeMainErrors,
} from '../lib/page-error-observer.ts';

function replaceOnce(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    'Instrumentation anchor drifted',
  );
  return source.replace(before, after);
}

// Only the separate measurement fixture uses these timed copies. The production
// bodies stay intact; added wrappers and sample publication add fixture overhead.
function measuredSource(observer, supervisor) {
  let source = observer.toString();
  source = replaceOnce(
    source,
    'function increment(',
    'function untimedIncrement(',
  );
  source = replaceOnce(
    source,
    'function finish(',
    `
    function finish(...args) {
      if (${supervisor ? 'ended' : 'finished'}) return untimedFinish(...args);
      const began = performance.now();
      try { return untimedFinish(...args); }
      finally { record('finalization', performance.now() - began); }
    }
    function increment(...args) {
      metrics.physicalCalls++;
      const began = performance.now();
      try { return untimedIncrement(...args); }
      finally { record('handler', performance.now() - began); }
    }
    function untimedFinish(`,
  );
  if (supervisor) {
    const anchor =
      'else if (message.kind === "start" && !useMain && !active && !ended) {';
    source = replaceOnce(
      source,
      anchor,
      `${anchor}\nconst measuredStart = performance.now();`,
    );
    source = replaceOnce(
      source,
      'send({ kind: "observing" });\n      }',
      'send({ kind: "observing" });\nrecord("setup", performance.now() - measuredStart);\n      }',
    );
  }
  return `function (...args) {
    const token = args[0];
    const attribute = 'data-addonray-error-metrics-' + token + '-${supervisor ? 'supervisor' : 'main'}';
    let previous=performance.now();const calibrationStart=previous;let minimumPositiveStep=null;let reads=0;
    for (;reads<100000;reads++) {const current=performance.now();if(current>previous){const step=current-previous;minimumPositiveStep=minimumPositiveStep===null?step:Math.min(minimumPositiveStep,step);previous=current;}if(current-calibrationStart>=20)break;}
    const metrics = { setup: [], handler: [], finalization: [], physicalCalls: 0, clock: {minimumPositiveStep,reads} };
    function record(kind, elapsed) {
      metrics[kind].push(elapsed);
      document.documentElement.setAttribute(attribute, JSON.stringify(metrics));
    }
    const began = performance.now();
    const result = (${source})(...args);
    record('setup', performance.now() - began);
    return result;
  }`;
}

export async function preparePageErrorFixture(directory, target) {
  assert(['firefox', 'chrome'].includes(target));
  const original = await directoryFiles(`.output/${target}-mv3`);
  for (const [path, bytes] of original) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), bytes);
  }
  const manifest = JSON.parse(original.get('manifest.json').toString());
  const id = 'page-error-source-fixture@addonray.test';
  const fixtureManifest = {
    ...manifest,
    name: 'AddonRay page-error source fixture',
    permissions: ['activeTab'],
    optional_permissions: ['management', 'scripting'],
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            ...manifest.browser_specific_settings,
            gecko: { ...manifest.browser_specific_settings.gecko, id },
          },
        }
      : {}),
  };
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(fixtureManifest),
  );
  await mkdir(join(directory, 'error-source-core'), { recursive: true });
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
  const inputs = {};
  const outputs = {};
  for (const name of [
    'page-error-check',
    'page-error-observer',
    'page-error-browser',
    'page-error-launch',
    'browser-target',
  ]) {
    const source = await readFile(`lib/${name}.ts`, 'utf8');
    const js = transpiler
      .transformSync(source)
      .replace(/from (["'])\.\/([a-z-]+)\1/g, 'from "./$2.js"');
    inputs[`lib/${name}.ts`] = sha256(Buffer.from(source));
    outputs[`error-source-core/${name}.js`] = sha256(Buffer.from(js));
    await writeFile(join(directory, 'error-source-core', `${name}.js`), js);
  }
  const supervisorSource = installErrorSupervisor.toString();
  const mainSource = observeMainErrors.toString();
  const measuredSupervisor = measuredSource(installErrorSupervisor, true);
  const measuredMain = measuredSource(observeMainErrors, false);
  await writeFile(
    join(directory, 'error-measured.js'),
    `export const measuredSupervisor = ${measuredSupervisor};\nexport const measuredMain = ${measuredMain};\n`,
  );
  const observerHashes = {
    supervisor: sha256(Buffer.from(supervisorSource)),
    main: sha256(Buffer.from(mainSource)),
    measuredSupervisor: sha256(Buffer.from(measuredSupervisor)),
    measuredMain: sha256(Buffer.from(measuredMain)),
  };
  await writeFile(
    join(directory, 'probe.html'),
    '<!doctype html><title>Page-error fixture controller</title><h1>Page-error fixture controller</h1>',
  );
  await writeFile(
    join(directory, 'popup.html'),
    `<!doctype html><title>Page-error source fixture</title>
<button id="new-page-error-check">New page-error check</button><p id="launch-status"></p>
<script type="module" src="error-popup.js"></script>`,
  );
  await writeFile(
    join(directory, 'error-popup.js'),
    `import {createPageErrorLauncher} from './error-source-core/page-error-launch.js';
const launcher = createPageErrorLauncher(globalThis.browser ?? globalThis.chrome, window);
window.addEventListener('pagehide', () => launcher.dispose(), {once:true});
document.querySelector('#new-page-error-check').onclick = async () => {
 const result = await launcher.open();
 document.querySelector('#launch-status').textContent = result.status;
};`,
  );
  await writeFile(
    join(directory, 'page-error.html'),
    `<!doctype html><title>Page-error owner fixture</title>
<button id="page-error-start">Start check</button><button id="page-error-stop">Stop</button>
<button id="page-error-clear">Clear</button><button id="page-error-reset">Start over</button>
<button id="error-grant-management">Grant fixture management</button>
<p id="page-error-status"></p><pre id="page-error-summary"></pre>
<script type="module" src="error-owner.js"></script>`,
  );
  await writeFile(
    join(directory, 'error-owner.js'),
    `import {createPageErrorCheck} from './error-source-core/page-error-check.js';
import {createPageErrorDriver} from './error-source-core/page-error-browser.js';
import {installPageErrorBinding} from './error-source-core/page-error-launch.js';
import {getBrowserContext} from './error-source-core/browser-target.js';
import {measuredSupervisor,measuredMain} from './error-measured.js';
const api = globalThis.browser ?? globalThis.chrome;
const context = getBrowserContext('${target}');
let measured = false;
let latestToken = null;
let permissionRequests = 0;
let traceStart = null;
let trace = [];
function record(kind) {
 if (traceStart !== null && trace.length < 40) trace.push({kind, elapsedMs: performance.now() - traceStart});
}
const driverApi = {
  permissions: {
    request: (p) => {permissionRequests++; return api.permissions.request(p);},
    contains: (p) => api.permissions.contains(p),
  },
  tabs: {
    get: (...args) => api.tabs.get(...args),
    getCurrent: () => api.tabs.getCurrent(),
    connect: (...args) => {
      const port = api.tabs.connect(...args);
      port.onMessage.addListener(message => {
        if (['supervisor-ready','observing','result','interrupted'].includes(message?.kind)) record('port:' + message.kind);
      });
      port.onDisconnect.addListener(() => record('port:disconnect'));
      return {
        onMessage: port.onMessage,
        onDisconnect: port.onDisconnect,
        postMessage: message => {
          if (['start','stop','discard'].includes(message?.kind)) record('send:' + message.kind);
          port.postMessage(message);
        },
        disconnect: () => {record('local:disconnect');port.disconnect();},
      };
    },
  },
  runtime: api.runtime,
  get scripting() {
    if (!api.scripting) return undefined;
    return {executeScript: (injection) => {
      latestToken = injection.args[0];
      const replacement = measured ? injection.world === 'MAIN' ? measuredMain : measuredSupervisor : injection.func;
      return api.scripting.executeScript({...injection,func:replacement});
    }};
  },
};
const productionDriver = createPageErrorDriver(driverApi, context);
const tracedDriver = {
 start: (tabId, signal, observing) => {
   record('start');
   const aborted = () => record('abort');
   signal.addEventListener('abort', aborted);
   return productionDriver.start(tabId, signal, () => {record('observing');observing();})
     .then(outcome => {record('outcome:' + outcome.status);return outcome;})
     .finally(() => signal.removeEventListener('abort', aborted));
 },
 stop: () => {record('stop');productionDriver.stop();},
};
const check = createPageErrorCheck(api, tracedDriver, context);
const remove = installPageErrorBinding(api, check, window);
check.subscribe(() => {
 const snapshot = check.getSnapshot();
 document.querySelector('#page-error-status').textContent = snapshot.phase;
 document.querySelector('#page-error-status').dataset.phase = snapshot.phase;
 document.querySelector('#page-error-summary').textContent = snapshot.outcome ? JSON.stringify(snapshot.outcome) : '';
});
window.addEventListener('pagehide', () => {remove();check.dispose();}, {once:true});
document.querySelector('#page-error-start').onclick = () => void check.start();
document.querySelector('#page-error-stop').onclick = check.stop;
document.querySelector('#page-error-clear').onclick = check.clear;
document.querySelector('#page-error-reset').onclick = check.startOver;
document.querySelector('#error-grant-management').onclick = () => api.permissions.request({permissions:['management']});
globalThis.checkFixture = {
 debug: () => ({...check.getSnapshot(), latestToken, permissionRequests, measured}),
 beginTrace: () => {traceStart=performance.now();trace=[];},
 trace: () => [...trace],
 measure: (value) => {measured = value === true;},
 revoke: (name) => api.permissions.remove({permissions:[name]}),
 calibrate: () => {
   const began = performance.now();let previous=began;let minimumPositiveStep=null;let reads=0;
   for (;reads<100000;reads++) {const current=performance.now();if(current>previous){const step=current-previous;minimumPositiveStep=minimumPositiveStep===null?step:Math.min(minimumPositiveStep,step);previous=current;}if(current-began>=20)break;}
   return {minimumPositiveStep,reads};
 },
};`,
  );
  return {
    id,
    target,
    inputs,
    outputs,
    observerHashes,
    authority:
      'Separately named source fixture. Exact production model/adapter/observer/bootstrap modules are transpiled without behavior substitutions. Minimal fixture popup/owner replace React entry points; regular lifecycle runs request actual optional permissions from Start. Measurement runs substitute explicitly hashed instrumented observer copies only.',
    permissions: fixtureManifest.permissions,
    optionalPermissions: fixtureManifest.optional_permissions,
    hostPermissions: fixtureManifest.host_permissions ?? [],
    preservedPackageAssets: [...original.keys()].filter(
      (path) =>
        !['manifest.json', 'popup.html', 'page-error.html'].includes(path),
    ),
    gaps: [
      'Fixture popup/owner controls are not packaged React UI or a human native-consent/usability verdict.',
      'DOM tokens and fixture metrics are page-visible. This is not hostile-page qualification.',
    ],
  };
}

export function pageErrorFixtureHandler(request, response) {
  const path = new URL(request.url, 'http://fixture.invalid').pathname;
  if (!path.startsWith('/page-errors/')) return false;
  if (path === '/page-errors/csp')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'nonce-error-fixture'; frame-src 'self'; base-uri 'none'",
    );
  response.setHeader('Content-Type', 'text/html');
  const heavy =
    path === '/page-errors/heavy'
      ? '<div>' + '<span>Controlled node</span>'.repeat(10000) + '</div>'
      : '';
  const frame =
    path === '/page-errors/source'
      ? '<iframe id="error-child" src="/page-errors/child"></iframe>'
      : '';
  response.end(`<!doctype html><title>PRIVATE_ERROR_TITLE_SENTINEL</title>
<button id="error-emit">Emit page-owned events</button><button id="error-flood">Emit 202 events</button>
<button id="error-excluded">Console and resource failures</button><button id="error-late">Block past deadline</button>
${heavy}${frame}<script nonce="error-fixture">
window.errorPositive = {errors:0,rejections:0,payloadReads:0,excluded:0,resourceFailures:0};
window.errorLife = {shows:0,hides:0,persisted:false};
window.beginErrorDurationTrace = () => {
 const began = performance.now();const events = [];
 const record = kind => {
  if(events.length === 10)return;
  events.push({kind,elapsedMs:performance.now()-began,visibility:document.visibilityState});
  document.documentElement.setAttribute('data-addonray-duration-trace',JSON.stringify(events));
 };
 record('scheduled');
 document.addEventListener('visibilitychange',()=>record('visibility'));
 addEventListener('pagehide',()=>record('pagehide'),{once:true});
 setTimeout(()=>record('sentinel-timer'),30000);
};
addEventListener('pageshow', event => {errorLife.shows++;errorLife.persisted=event.persisted;});
addEventListener('pagehide', () => errorLife.hides++);
addEventListener('error', event => {if(event.target===window)errorPositive.errors++;});
addEventListener('unhandledrejection', () => errorPositive.rejections++);
function emitErrorPair() {
 const value = Object.defineProperty({},'privateReason',{get(){errorPositive.payloadReads++;return 'PRIVATE_REJECTION_SENTINEL';}});
 Promise.reject(value);
 setTimeout(() => {throw Error('PRIVATE_ERROR_MESSAGE_SENTINEL');},0);
}
document.querySelector('#error-emit').onclick = emitErrorPair;
document.querySelector('#error-flood').onclick = () => {for(let i=0;i<101;i++)emitErrorPair();};
document.querySelector('#error-excluded').onclick = () => {errorPositive.excluded++;console.error('PRIVATE_CONSOLE_SENTINEL');const image=new Image();image.onerror=()=>errorPositive.resourceFailures++;image.src='/page-errors/missing.svg';};
document.querySelector('#error-late').onclick = () => {const deadline=performance.now()+31000;while(performance.now()<deadline){}window.reportError(Error('PRIVATE_LATE_SENTINEL'));};
</script>`);
  return true;
}
