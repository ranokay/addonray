import assert from 'node:assert/strict';
import { By } from 'selenium-webdriver';

const summary = {
  scriptErrors: 1,
  unhandledRejections: 2,
  total: 3,
  finish: 'stop',
  observedMs: 125,
};

function copiedMetadata(result) {
  assert.equal(result.status, 'success', JSON.stringify(result));
  for (const destination of result.value) {
    assert.deepEqual(Object.keys(destination).sort(), [
      'generation',
      'identity',
      'label',
      'sides',
    ]);
    assert.match(destination.identity, /^[a-f0-9-]{36}$/);
    assert.equal(
      destination.label,
      `Investigation ${destination.identity.slice(0, 8)}`,
    );
    assert(Number.isSafeInteger(destination.generation));
    assert(
      destination.sides.every((side) => ['before', 'after'].includes(side)),
    );
  }
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|https?:|about:blank/);
  return result.value;
}

export async function checkPageErrorComparisons({
  driver,
  fixtureUrl,
  approveOptional,
  report,
  passed,
}) {
  const originHandle = await driver.getWindowHandle();
  const base = new URL('.', fixtureUrl).href;
  const ownedHandles = new Set();
  const tabs = new Map();
  let control;
  const evidence = {
    authority:
      'Named minimal source fixture with production check, investigation and handoff modules. Inventories, completed-summary driver results and timing seeds are synthetic. Actual own packaged views and permission APIs are used; React controls and collectors are not exercised.',
    scheduling:
      'Fixture receiver wrappers hold invocation or acknowledgment to schedule races around unchanged production functions. The source timeout remains the real production five-second timeout.',
    contexts:
      'Actual normal own-tab and known source flags are checked. Private, unknown and rejected classification values are explicit API simulations only.',
    observations: {},
    cleanup: {},
  };
  report.pageErrorComparison = evidence;
  report.gaps.push(
    'Page-error comparison API checks use a separate required-management fixture, synthetic inventory/completed-summary/timing inputs and scheduling wrappers. They do not establish optional-management consent/revocation, collector output, native React usability, authentic private-window guards or hostile same-extension-document isolation.',
  );

  async function open(alias, page) {
    await driver.switchTo().newWindow('tab');
    const handle = await driver.getWindowHandle();
    ownedHandles.add(handle);
    tabs.set(alias, handle);
    await driver.get(new URL(page, base).href);
    await driver.wait(
      () =>
        driver.executeScript(
          () =>
            !!(
              globalThis.comparisonFixture ??
              globalThis.comparisonControl ??
              globalThis.comparisonOther
            ),
        ),
      10000,
    );
    return handle;
  }
  async function call(alias, method, ...args) {
    await driver.switchTo().window(tabs.get(alias));
    const result = await driver.executeAsyncScript(
      async (method, args, done) => {
        try {
          const fixture = globalThis.comparisonFixture;
          if (!fixture) return done({ failure: 'Fixture is unavailable' });
          const value = await fixture[method](...args);
          done({ result: value === undefined ? null : value });
        } catch (error) {
          done({ failure: String(error) });
        }
      },
      method,
      args,
    );
    assert.equal(result.failure, undefined, result.failure);
    return result.result;
  }
  const state = (alias) => call(alias, 'state');
  async function createSource(alias) {
    await driver.switchTo().window(control);
    const before = new Set(await driver.getAllWindowHandles());
    const tab = await driver.executeAsyncScript((done) => {
      (globalThis.browser ?? globalThis.chrome).tabs
        .create({ url: 'about:blank', active: false })
        .then(({ id, incognito }) => done({ id, incognito }));
    });
    assert(Number.isSafeInteger(tab.id));
    assert.equal(tab.incognito, false);
    const handle = await driver.wait(
      async () =>
        (await driver.getAllWindowHandles()).find(
          (value) => !before.has(value),
        ),
      10000,
    );
    ownedHandles.add(handle);
    tabs.set(alias, handle);
    return tab.id;
  }
  async function donor(alias, sourceId) {
    await open(alias, 'page-error.html');
    assert.equal(await call(alias, 'bind', sourceId), true);
    const result = await call(alias, 'complete', summary);
    assert.equal(result.outcome.status, 'success');
  }
  async function investigation(alias) {
    await open(alias, 'investigation.html');
    await call(alias, 'inventory', 'before');
    assert.equal((await state(alias)).snapshot.before.status, 'success');
  }
  async function choose(donorAlias, targetAlias) {
    const target = await state(targetAlias);
    const choices = copiedMetadata(await call(donorAlias, 'discover'));
    const chosen = choices.find((value) => value.identity === target.identity);
    assert(chosen, `Destination ${targetAlias} is absent`);
    return chosen;
  }
  async function transfer(donorAlias, targetAlias, side = 'before') {
    const selected = await choose(donorAlias, targetAlias);
    return call(donorAlias, 'attach', selected, side);
  }
  async function resetPair(donorAlias, targetAlias) {
    await call(donorAlias, 'reset');
    await call(donorAlias, 'complete', summary);
    await call(targetAlias, 'reset');
    await call(targetAlias, 'inventory', 'before');
  }
  async function held(donorAlias, targetAlias, ack = false) {
    const selected = await choose(donorAlias, targetAlias);
    await call(targetAlias, ack ? 'holdAck' : 'hold');
    await call(donorAlias, 'startAttach', selected, 'before');
    await driver.wait(async () => {
      const value = await state(targetAlias);
      return ack ? value.waitingAck : value.waiting;
    }, 10000);
    return selected;
  }
  async function settled(donorAlias) {
    return driver.wait(async () => {
      const value = await state(donorAlias);
      return value.pending === 0 && value;
    }, 8000);
  }
  async function close(alias) {
    const handle = tabs.get(alias);
    await driver.switchTo().window(handle);
    await driver.close();
    ownedHandles.delete(handle);
    tabs.delete(alias);
    await driver.switchTo().window(control);
  }
  async function refresh(alias) {
    await driver.switchTo().window(tabs.get(alias));
    await driver.navigate().refresh();
    await driver.wait(
      () => driver.executeScript(() => !!globalThis.comparisonFixture),
      10000,
    );
  }
  async function grantScripting() {
    await driver.switchTo().window(control);
    await driver.findElement(By.id('comparison-grant-scripting')).click();
    await approveOptional?.({
      permissions: ['scripting'],
      ownerHandle: control,
    });
    await driver.wait(
      () =>
        driver.executeAsyncScript((done) =>
          (globalThis.browser ?? globalThis.chrome).permissions
            .contains({ permissions: ['scripting'] })
            .then(done),
        ),
      10000,
    );
  }

  try {
    control = await open('control', 'comparison-probe.html');
    await grantScripting();
    const grants = await driver.executeAsyncScript((done) =>
      (globalThis.browser ?? globalThis.chrome).permissions.getAll().then(done),
    );
    assert(grants.permissions.includes('management'));
    assert(grants.permissions.includes('scripting'));
    assert.deepEqual(grants.origins ?? [], []);
    evidence.observations.grants = grants;
    const sourceA = await createSource('sourceA');
    const sourceB = await createSource('sourceB');
    await donor('donorA', sourceA);
    await donor('donorB', sourceB);
    await investigation('targetA');
    await investigation('targetB');
    const normalViews = {};
    for (const alias of ['donorA', 'targetA']) {
      await driver.switchTo().window(tabs.get(alias));
      const tab = await driver.executeAsyncScript((done) =>
        (globalThis.browser ?? globalThis.chrome).tabs
          .getCurrent()
          .then(({ id, incognito }) => done({ id, incognito })),
      );
      assert.equal(tab.incognito, false);
      normalViews[alias] = tab;
    }
    evidence.observations.normalViews = normalViews;

    const choices = copiedMetadata(await call('donorA', 'discover'));
    assert.equal(choices.length, 2);
    assert.equal((await state('donorA')).metadataOwn, true);
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    assert.equal((await state('targetB')).snapshot.errorBefore, null);
    assert.equal((await state('targetA')).deliveries, 0);
    assert.equal((await state('targetB')).deliveries, 0);
    evidence.observations.discovery = choices;
    passed(
      'Page-error discovery copies only eligible normal-view metadata without delivering summaries',
    );

    assert.equal((await transfer('donorA', 'targetA')).status, 'success');
    let target = await state('targetA');
    assert.deepEqual(target.snapshot.errorBefore, summary);
    assert.equal(target.ownCopies, true);
    assert.equal((await state('targetB')).snapshot.errorBefore, null);
    assert.equal((await state('donorA')).used, true);
    assert.deepEqual((await state('donorA')).snapshot.outcome.value, summary);
    const otherChoice = choices.find(
      (value) => value.identity !== target.identity,
    );
    assert.notEqual(
      (await call('donorA', 'attach', otherChoice, 'before')).status,
      'success',
    );
    assert.equal((await state('targetB')).snapshot.errorBefore, null);
    passed(
      'A selected page-error receiver owns a canonical copy and the readable completed check can attach only once',
    );

    await call('donorA', 'reset');
    assert.deepEqual((await state('targetA')).snapshot.errorBefore, summary);
    await close('donorA');
    assert.deepEqual((await state('targetA')).snapshot.errorBefore, summary);
    await donor('donorA', sourceA);
    passed(
      'Production investigation error copies survive donor reset and actual donor tab closure',
    );

    await call('targetA', 'reset');
    await call('targetA', 'inventory', 'before');
    assert.equal(
      (await call('targetA', 'timing', 'before', sourceA)).status,
      'success',
    );
    assert.notEqual((await transfer('donorB', 'targetA')).status, 'success');
    assert.equal((await state('donorB')).used, false);
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    assert.equal((await transfer('donorA', 'targetA')).status, 'success');
    await resetPair('donorA', 'targetA');
    assert.equal((await transfer('donorA', 'targetA')).status, 'success');
    assert.notEqual(
      (await call('targetA', 'timing', 'before', sourceB)).status,
      'success',
    );
    assert.equal(
      (await call('targetA', 'timing', 'before', sourceA)).status,
      'success',
    );
    evidence.observations.sharedBinding = (await state('targetA')).snapshot;
    passed(
      'Production shared source binding rejects timing-first and error-first cross-kind mismatches',
    );

    await call('targetA', 'inventory', 'after');
    await call('donorA', 'reset');
    await call('donorA', 'complete', summary);
    assert.equal(
      (await transfer('donorA', 'targetA', 'after')).status,
      'success',
    );
    await call('targetA', 'assessment', 'better');
    target = await state('targetA');
    assert.deepEqual(target.snapshot.errorBefore, summary);
    assert.deepEqual(target.snapshot.errorAfter, summary);
    assert.deepEqual(
      target.snapshot.timingBefore,
      evidence.observations.sharedBinding.timingBefore,
    );
    assert.equal(target.snapshot.timingAfter, null);
    assert.equal(target.snapshot.assessment, 'better');
    assert.equal(target.ownCopies, true);
    assert.deepEqual(target.sides, []);
    await call('donorA', 'reset');
    await call('donorA', 'complete', summary);
    const filledChoice = {
      identity: target.identity,
      label: target.label,
      generation: target.generation,
      sides: ['before'],
    };
    assert.notEqual(
      (await call('donorA', 'attach', filledChoice, 'before')).status,
      'success',
    );
    assert.deepEqual((await state('targetA')).snapshot, target.snapshot);
    await call('targetA', 'reset');
    await call('targetA', 'inventory', 'before');
    await call('targetA', 'inventoryFailure', true);
    await call('targetA', 'inventory', 'after');
    target = await state('targetA');
    assert.notEqual(target.snapshot.after.status, 'success');
    assert.deepEqual(target.sides, []);
    await call('targetA', 'inventoryFailure', false);
    passed(
      'Fixed error slots and After-started ordering preserve optional timing data and the independent manual assessment',
    );

    for (const value of [
      {
        scriptErrors: 0,
        unhandledRejections: 0,
        total: 0,
        finish: 'timeout',
        observedMs: 30000,
      },
      {
        scriptErrors: 199,
        unhandledRejections: 1,
        total: 200,
        finish: 'limit',
        observedMs: 15,
      },
    ]) {
      await resetPair('donorA', 'targetA');
      await call('donorA', 'reset');
      await call('donorA', 'complete', value);
      assert.equal((await transfer('donorA', 'targetA')).status, 'success');
      assert.deepEqual((await state('targetA')).snapshot.errorBefore, value);
    }
    passed(
      'Production transfer preserves confirmed Stop, timeout and capped counts with their original durations',
    );

    await resetPair('donorA', 'targetA');
    const stale = await choose('donorA', 'targetA');
    await call('targetA', 'reset');
    await call('targetA', 'inventory', 'before');
    assert.notEqual(
      (await call('donorA', 'attach', stale, 'before')).status,
      'success',
    );
    assert.equal((await state('donorA')).used, false);
    const previous = await choose('donorA', 'targetA');
    await refresh('targetA');
    await call('targetA', 'inventory', 'before');
    assert.notEqual((await state('targetA')).identity, previous.identity);
    assert.notEqual(
      (await call('donorA', 'attach', previous, 'before')).status,
      'success',
    );
    assert.equal((await state('donorA')).used, false);
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    passed(
      'Investigation reset and actual reload reject old selections without consuming the completed check',
    );

    await resetPair('donorA', 'targetA');
    const duplicateTarget = await choose('donorA', 'targetB');
    await held('donorA', 'targetA');
    await call('donorA', 'startAttach', duplicateTarget, 'before');
    await call('targetA', 'release');
    let donorState = await settled('donorA');
    assert.equal(donorState.used, true);
    assert.equal(
      donorState.results.filter((value) => value.status === 'success').length,
      1,
    );
    assert.deepEqual((await state('targetA')).snapshot.errorBefore, summary);
    assert.equal((await state('targetB')).snapshot.errorBefore, null);
    passed(
      'Concurrent production confirmations commit once and cannot fill a second investigation',
    );

    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    await call('donorA', 'reset');
    await call('donorA', 'complete', { ...summary, scriptErrors: 2, total: 4 });
    await call('targetA', 'release');
    donorState = await settled('donorA');
    assert.equal(donorState.used, false);
    assert.equal(donorState.snapshot.outcome.value.total, 4);
    assert.equal(donorState.last, null);
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    await call('targetA', 'reset');
    await call('targetA', 'inventory', 'before');
    await call('targetA', 'release');
    donorState = await settled('donorA');
    assert.equal(donorState.used, false);
    assert.notEqual(donorState.last.status, 'success');
    target = await state('targetA');
    assert.equal(target.snapshot.errorBefore, null);
    assert.equal(target.snapshot.before.status, 'success');
    passed(
      'Production donor and receiver generation changes reject pending old transfers without restoring erased data',
    );

    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    donorState = await settled('donorA');
    assert.notEqual(donorState.last.status, 'success');
    assert.equal(donorState.used, false);
    await call('targetA', 'release');
    await driver.wait(
      async () => (await state('targetA')).inFlight === 0,
      10000,
    );
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    assert.equal((await state('donorA')).used, false);
    assert.equal((await transfer('donorA', 'targetA')).status, 'success');
    passed(
      'The production timeout cancels late receiver work while allowing a fresh explicit confirmation',
    );

    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    await close('targetA');
    donorState = await settled('donorA');
    assert.notEqual(donorState.last.status, 'success');
    assert.equal(donorState.used, false);
    await investigation('targetA');
    passed(
      'Actual receiver closure before acceptance bounds the transfer without consuming the completed check',
    );

    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA', true);
    assert.deepEqual((await state('targetA')).snapshot.errorBefore, summary);
    assert.equal((await state('donorA')).used, true);
    await close('targetA');
    donorState = await settled('donorA');
    assert.notEqual(donorState.last.status, 'success');
    assert.match(donorState.last.reason, /used.*cannot attach again/i);
    assert.equal(donorState.used, true);
    assert.equal((await state('targetB')).snapshot.errorBefore, null);
    evidence.observations.lostAcknowledgment = donorState;
    await investigation('targetA');
    passed(
      'Real receiver closure after acceptance keeps the check used and reports uncertain acknowledgment',
    );

    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    await close('donorA');
    await call('targetA', 'release');
    await driver.wait(
      async () => (await state('targetA')).inFlight === 0,
      10000,
    );
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    await donor('donorA', sourceA);
    await resetPair('donorA', 'targetA');
    await held('donorA', 'targetA');
    await refresh('donorA');
    assert.equal((await state('donorA')).snapshot.phase, 'unbound');
    await call('targetA', 'release');
    await driver.wait(
      async () => (await state('targetA')).inFlight === 0,
      10000,
    );
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    assert.notEqual((await call('donorA', 'discover')).status, 'success');
    assert.equal(await call('donorA', 'bind', sourceA), true);
    await call('donorA', 'complete', summary);
    passed(
      'Actual donor close and reload reject stale transfers and a reloaded check has no binding or summary',
    );

    await resetPair('donorA', 'targetA');
    const targetIdentity = (await state('targetA')).identity;
    for (const actor of ['donorA', 'targetA']) {
      for (const mode of ['private', 'unknown', 'throw']) {
        await call(actor, 'context', mode);
        const result = await call('donorA', 'discover');
        if (actor === 'donorA') assert.notEqual(result.status, 'success');
        else
          assert(
            !copiedMetadata(result).some(
              (value) => value.identity === targetIdentity,
            ),
          );
        await call(actor, 'context', 'actual');
      }
    }
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    passed(
      'Production context guards reject simulated private, unknown and failed own-view classifications',
    );

    assert.notEqual((await call('targetA', 'invalidSender')).status, 'success');
    await open('other', 'comparison-other.html');
    await driver.switchTo().window(control);
    const boundary = await driver.executeAsyncScript(async (identity, done) => {
      const api = globalThis.browser ?? globalThis.chrome;
      const views = api.extension.getViews({ type: 'tab' });
      const target = views.find(
        (view) =>
          view.addonrayErrorInvestigation &&
          view.comparisonFixture?.state().identity === identity,
      );
      const other = views.find(
        (view) =>
          view.location.href === api.runtime.getURL('/comparison-other.html'),
      );
      const selected = {
        identity,
        generation: target.comparisonFixture.state().generation,
        side: 'before',
        actionId: crypto.randomUUID(),
      };
      const fake = {
        location: { href: api.runtime.getURL('/page-error.html') },
      };
      done({
        control: await target.addonrayErrorInvestigation.receive(
          selected,
          window,
        ),
        other: await target.addonrayErrorInvestigation.receive(selected, other),
        fake: await target.addonrayErrorInvestigation.receive(selected, fake),
      });
    }, targetIdentity);
    assert(
      Object.values(boundary).every((value) => value.status !== 'success'),
    );
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    passed(
      'Unrelated packaged documents and forged non-view objects cannot use the production error receiver',
    );

    for (const failure of ['denied', 'interrupted', 'invalid-result']) {
      await call('donorA', 'reset');
      await call('donorA', 'fail', failure);
      assert.equal((await state('donorA')).snapshot.outcome.status, failure);
      assert.equal(await call('donorA', 'capture'), null);
      assert.notEqual((await call('donorA', 'discover')).status, 'success');
    }
    await call('donorA', 'reset');
    await call('donorA', 'complete', {
      ...summary,
      raw: 'PRIVATE_RAW_SENTINEL',
    });
    assert.equal(
      (await state('donorA')).snapshot.outcome.status,
      'invalid-result',
    );
    assert.equal(await call('donorA', 'capture'), null);
    await call('donorA', 'reset');
    await driver.switchTo().window(tabs.get('donorA'));
    const accessor = await driver.executeAsyncScript(async (done) => {
      let reads = 0;
      const value = {
        unhandledRejections: 2,
        total: 3,
        finish: 'stop',
        observedMs: 125,
      };
      Object.defineProperty(value, 'scriptErrors', {
        enumerable: true,
        get() {
          reads++;
          return 1;
        },
      });
      const snapshot = await globalThis.comparisonFixture.complete(value);
      done({ reads, status: snapshot.outcome.status });
    });
    assert.deepEqual(accessor, { reads: 0, status: 'invalid-result' });
    passed(
      'Failed and malformed production check outcomes never expose an attachable summary',
    );

    await resetPair('donorA', 'targetA');
    const reads = (await state('donorA')).sourceReads;
    await close('sourceA');
    assert.equal((await transfer('donorA', 'targetA')).status, 'success');
    assert.equal((await state('donorA')).sourceReads, reads);
    assert.deepEqual((await state('targetA')).snapshot.errorBefore, summary);
    passed(
      'A confirmed past observation transfers after its source closes without a new source read',
    );

    await call('targetB', 'reset');
    await call('targetB', 'inventory', 'before');
    assert.equal(
      (await call('targetB', 'timing', 'before', sourceB)).status,
      'success',
    );
    assert.equal((await transfer('donorB', 'targetB')).status, 'success');
    await call('targetB', 'inventory', 'after');
    await call('targetB', 'assessment', 'better');
    await call('donorB', 'reset');
    await call('donorB', 'complete', summary);
    await call('targetA', 'reset');
    await call('targetA', 'inventory', 'before');
    await held('donorB', 'targetA');
    await driver.switchTo().window(control);
    assert.equal(
      await driver.executeAsyncScript((done) =>
        (globalThis.browser ?? globalThis.chrome).permissions
          .remove({ permissions: ['scripting'] })
          .then(done),
      ),
      true,
    );
    await driver.wait(async () => {
      const source = await state('donorB');
      const receiver = await state('targetA');
      const populated = await state('targetB');
      return (
        source.snapshot.outcome === null &&
        receiver.snapshot.before === null &&
        populated.snapshot.before === null
      );
    }, 10000);
    await call('targetA', 'release');
    await settled('donorB');
    assert.equal((await state('targetA')).snapshot.errorBefore, null);
    assert.equal((await state('targetA')).snapshot.timingBefore, null);
    const cleared = (await state('targetB')).snapshot;
    assert.equal(cleared.errorBefore, null);
    assert.equal(cleared.timingBefore, null);
    assert.equal(cleared.assessment, null);
    evidence.observations.revocation = {
      donor: await state('donorB'),
      investigation: await state('targetA'),
      populatedInvestigation: await state('targetB'),
    };
    passed(
      'Actual optional scripting removal clears production owners and rejects a pending error transfer',
    );
    evidence.result = 'passed-with-declared-fixture-gaps';
  } finally {
    const remaining = new Set(await driver.getAllWindowHandles());
    for (const handle of ownedHandles) {
      if (!remaining.has(handle)) continue;
      await driver.switchTo().window(handle);
      await driver.close();
    }
    evidence.cleanup.ownedViewsClosed = true;
    await driver.switchTo().window(originHandle);
  }
}
