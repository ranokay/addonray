import { expect, it } from 'bun:test';
import { budgetStudyWorkerScript } from '../scripts/page-error-study-worker';

it('adds the study worker control only to requested non-CSP source pages', () => {
  const study = budgetStudyWorkerScript(
    new URL('http://fixture.invalid/page-errors/empty?budget-study=1'),
  );
  expect(study).toContain('startAddonrayBudgetWorker');
  expect(study).toContain('stopAddonrayBudgetWorker');

  const ordinary = budgetStudyWorkerScript(
    new URL('http://fixture.invalid/page-errors/empty'),
  );
  expect(ordinary).toBe('');

  const csp = budgetStudyWorkerScript(
    new URL('http://fixture.invalid/page-errors/csp?budget-study=1'),
  );
  expect(csp).toBe('');
});
