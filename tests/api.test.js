const test = require('node:test');
const assert = require('node:assert/strict');

test('package scripts and runtime requirements are configured', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.scripts.start, 'node server.js');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies['sql.js']);
  assert.ok(pkg.engines.node);
});

test('server exports the Express app for integration tests', () => {
  const server = require('../server');
  assert.equal(typeof server.app, 'function');
  assert.equal(typeof server.start, 'function');
});
