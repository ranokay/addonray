const workerScript = `<script>
window.__addonrayBudgetWorker = null;
window.startAddonrayBudgetWorker = () => {
 if (window.__addonrayBudgetWorker) return {created:true,already:true,hardwareConcurrency:navigator.hardwareConcurrency ?? null};
 const worker = new Worker(URL.createObjectURL(new Blob(["postMessage('started'); while (true) {}"],{type:'text/javascript'})));
 worker.onmessage = () => document.documentElement.setAttribute('data-addonray-budget-worker','started');
 window.__addonrayBudgetWorker = worker;
 return {created:true,already:false,hardwareConcurrency:navigator.hardwareConcurrency ?? null};
};
window.stopAddonrayBudgetWorker = () => {
 const worker = window.__addonrayBudgetWorker;
 if (!worker) return {terminated:false,reason:'missing'};
 worker.terminate();
 window.__addonrayBudgetWorker = null;
 document.documentElement.removeAttribute('data-addonray-budget-worker');
 return {terminated:true};
};
</script>`;

// The diagnostic budget study needs one page-owned busy worker. Keep this
// control out of ordinary source pages and the CSP fixture so qualification
// pages retain their existing bytes and authority.
export function budgetStudyWorkerScript(url: URL): string {
  return url.searchParams.has('budget-study') &&
    url.pathname !== '/page-errors/csp'
    ? workerScript
    : '';
}
