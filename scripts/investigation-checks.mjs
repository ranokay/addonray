import assert from 'node:assert/strict';
import { By, until } from 'selenium-webdriver';

const beforeSelector = '[data-testid="before-snapshot"]';
const afterSelector = '[data-testid="after-snapshot"]';
const changesSelector = '[data-testid="comparison-changes"]';
const assessmentSelector = 'input[name="page-assessment"]:checked';

// Browser drivers and fixture controllers supply test authority; the production route only captures inventory.
export async function checkInvestigation({
  driver,
  popupUrl,
  investigationUrl,
  localUrl,
  settingsUrl,
  fixtureId,
  fixtureName,
  fixtureInitiallyEnabled,
  setFixtureEnabled,
  revokeManagement,
  authority,
  passed,
}) {
  await driver.get(popupUrl);
  await driver.wait(until.elementLocated(By.id('new-investigation')), 10000);
  const popupWindow = await driver.getWindowHandle();
  const investigationWindows = [];

  async function empty() {
    assert.equal((await driver.findElements(By.css(beforeSelector))).length, 0);
    assert.equal((await driver.findElements(By.css(afterSelector))).length, 0);
    assert.equal(
      (await driver.findElements(By.css(changesSelector))).length,
      0,
    );
    assert.equal(
      (await driver.findElements(By.css(assessmentSelector))).length,
      0,
    );
    assert.equal(
      await driver.findElement(By.id('capture-before')).isEnabled(),
      true,
    );
    assert.equal(
      await driver.findElement(By.id('capture-after')).isEnabled(),
      false,
    );
  }

  async function launch() {
    await driver.switchTo().window(popupWindow);
    const existing = new Set(await driver.getAllWindowHandles());
    await driver.findElement(By.id('new-investigation')).click();
    const handle = await driver.wait(async () => {
      const created = (await driver.getAllWindowHandles()).filter(
        (candidate) => !existing.has(candidate),
      );
      assert(
        created.length <= 1,
        'One popup action must open at most one investigation',
      );
      return created[0];
    }, 10000);
    investigationWindows.push(handle);
    await driver.switchTo().window(handle);
    await driver.wait(
      async () => (await driver.getCurrentUrl()) === investigationUrl,
      10000,
    );
    await driver.wait(until.elementLocated(By.id('capture-before')), 10000);
    await empty();
    return handle;
  }

  async function capture(which) {
    await driver.findElement(By.id(`capture-${which}`)).click();
    await driver.wait(
      until.elementLocated(
        By.css(which === 'before' ? beforeSelector : afterSelector),
      ),
      10000,
    );
  }

  async function snapshotFixture(selector, expectedEnabled) {
    const snapshot = await driver.findElement(By.css(selector));
    const details = await snapshot.findElement(By.css('details'));
    if (!(await details.getAttribute('open'))) {
      await details.findElement(By.css('summary')).click();
    }
    const texts = await Promise.all(
      (await snapshot.findElements(By.css('li'))).map((row) => row.getText()),
    );
    const matches = texts.filter((text) => text.includes(fixtureId));
    assert.equal(
      matches.length,
      1,
      'Captured inventory must contain the controlled fixture once',
    );
    assert(matches[0].includes(fixtureName));
    assert.match(matches[0], expectedEnabled ? /\bEnabled\b/ : /\bDisabled\b/);
  }

  async function pairRemains() {
    assert.equal((await driver.findElements(By.css(beforeSelector))).length, 1);
    assert.equal((await driver.findElements(By.css(afterSelector))).length, 1);
    assert.equal(
      await driver
        .findElement(By.css(assessmentSelector))
        .getAttribute('value'),
      'uncertain',
    );
  }

  const first = await launch();
  assert.equal(
    await driver.executeAsyncScript((done) =>
      (globalThis.browser ?? globalThis.chrome).permissions
        .contains({ permissions: ['management'] })
        .then(done),
    ),
    true,
    'The fresh-route check must run with an already retained inventory grant',
  );
  passed(
    `${authority}: popup launch opens an empty investigation despite retained inventory access`,
  );

  await capture('before');
  await snapshotFixture(beforeSelector, fixtureInitiallyEnabled);
  assert.equal(
    await driver.findElement(By.id('capture-before')).isEnabled(),
    false,
  );
  assert.equal(
    await driver.findElement(By.id('capture-after')).isEnabled(),
    true,
  );
  for (const url of [localUrl, settingsUrl]) {
    await driver.switchTo().newWindow('tab');
    await driver.get(url);
    await driver.wait(
      async () => (await driver.getCurrentUrl()) === url,
      10000,
    );
    await driver.wait(
      () => driver.executeScript(() => document.readyState === 'complete'),
      10000,
    );
    if (url === localUrl) {
      assert.equal(
        await driver.findElement(By.css('h1')).getText(),
        'Controlled local page',
      );
    }
    await driver.close();
    await driver.switchTo().window(first);
    await snapshotFixture(beforeSelector, fixtureInitiallyEnabled);
    assert.equal((await driver.findElements(By.css(afterSelector))).length, 0);
  }
  passed(
    `${authority}: Before snapshot survives switching to the controlled page and browser settings`,
  );

  await setFixtureEnabled(!fixtureInitiallyEnabled);
  await driver.switchTo().window(first);
  await capture('after');
  await snapshotFixture(beforeSelector, fixtureInitiallyEnabled);
  await snapshotFixture(afterSelector, !fixtureInitiallyEnabled);
  const changes = await driver.findElement(By.css(changesSelector));
  const changeRows = await changes.findElements(By.css('li'));
  assert.equal(
    changeRows.length,
    1,
    'The controlled transition must produce exactly one reported change',
  );
  const changeText = await changeRows[0].getText();
  assert(changeText.includes(fixtureId));
  assert(changeText.includes(fixtureName));
  assert.match(
    changeText,
    fixtureInitiallyEnabled ? /\bDisabled\b/ : /\bEnabled\b/,
  );
  assert.equal(
    (await driver.findElements(By.css(assessmentSelector))).length,
    0,
  );
  assert.equal(
    await driver.findElement(By.id('capture-before')).isEnabled(),
    false,
  );
  assert.equal(
    await driver.findElement(By.id('capture-after')).isEnabled(),
    false,
  );
  await driver
    .findElement(By.css('input[name="page-assessment"][value="uncertain"]'))
    .click();
  await pairRemains();
  passed(
    `${authority}: fixed Before/After snapshots report the fixture transition and accept an explicit manual assessment`,
  );

  await driver.switchTo().window(popupWindow);
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Clear popup results"]'))
    .click();
  await driver.switchTo().window(first);
  await pairRemains();

  const second = await launch();
  assert.notEqual(second, first);
  await capture('before');
  await snapshotFixture(beforeSelector, !fixtureInitiallyEnabled);
  await driver.findElement(By.id('start-over')).click();
  await empty();
  await capture('before');
  await snapshotFixture(beforeSelector, !fixtureInitiallyEnabled);
  await driver.close();
  investigationWindows.pop();
  await launch();
  await driver.close();
  investigationWindows.pop();
  await driver.switchTo().window(first);
  await pairRemains();
  passed(
    `${authority}: new and reopened investigations start fresh while popup Clear and other investigations preserve the original`,
  );

  await driver.findElement(By.id('start-over')).click();
  await empty();
  await capture('before');
  await capture('after');
  assert.equal(
    await driver.findElement(By.css(changesSelector)).getText(),
    'No reported additions, removals or enabled-state changes.',
  );
  await driver
    .findElement(By.css('input[name="page-assessment"][value="worse"]'))
    .click();
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.id('capture-before')), 10000);
  await empty();
  passed(
    `${authority}: Start over and reload discard snapshots, changes and assessment`,
  );

  if (revokeManagement) {
    await capture('before');
    await capture('after');
    await driver
      .findElement(By.css('input[name="page-assessment"][value="better"]'))
      .click();
    assert.equal(await revokeManagement(), true);
    await driver.wait(
      async () =>
        (await driver.findElements(By.css(beforeSelector))).length === 0,
      10000,
    );
    await empty();
    passed(
      `${authority}: actual optional management revocation discards the populated comparison`,
    );
  }

  for (const handle of investigationWindows) {
    await driver.switchTo().window(handle);
    await driver.close();
  }
  await driver.switchTo().window(popupWindow);
}
