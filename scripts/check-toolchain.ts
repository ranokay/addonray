import assert from 'node:assert/strict';

assert.equal(
  Bun.revision,
  '963452075e9d7e2a47a482f297143af5ed4f76c0',
  'Run through mise to use the pinned Bun canary.',
);
console.log(`Bun canary revision verified: ${Bun.revision}`);
