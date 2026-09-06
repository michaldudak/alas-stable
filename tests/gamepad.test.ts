import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stickAxis } from '../src/platform/gamepad.ts';

await test('analog steering removes drift and retains proportional input', () => {
	assert.equal(stickAxis(), 0);
	assert.equal(stickAxis(0.17), 0);
	assert.equal(stickAxis(0.59), 0.5);
	assert.equal(stickAxis(-1), -1);
	assert.equal(stickAxis(1), 1);
	assert.equal(stickAxis(2), 1);
	assert.equal(stickAxis(NaN), 0);
});
