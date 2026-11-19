import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidChannelFilter,
  sanitizeChannelInput,
  formatChannelFilter,
  getActiveHopChannels,
  isValidMacAddress,
  dedupeCharset,
  buildCharsetString,
} from './channel';

test('empty channel filter is valid regardless of bands', () => {
  assert.equal(isValidChannelFilter('', true, true), true);
  assert.equal(isValidChannelFilter('', false, false), true);
});

test('accepts known channels for enabled bands', () => {
  assert.equal(isValidChannelFilter('1,6,11', true, false), true);
  assert.equal(isValidChannelFilter('36,149,165', false, true), true);
  assert.equal(isValidChannelFilter('1,36', true, true), true);
});

test('rejects channels whose band is disabled', () => {
  assert.equal(isValidChannelFilter('1', false, true), false);
  assert.equal(isValidChannelFilter('36', true, false), false);
});

test('rejects out-of-plan 5 GHz and invalid channels', () => {
  assert.equal(isValidChannelFilter('163', true, true), false);
  assert.equal(isValidChannelFilter('37', true, true), false);
  assert.equal(isValidChannelFilter('145', true, true), false);
  assert.equal(isValidChannelFilter('99', true, true), false);
});

test('rejects malformed channel filter inputs', () => {
  assert.equal(isValidChannelFilter('1,', true, true), false);
  assert.equal(isValidChannelFilter(',1', true, true), false);
  assert.equal(isValidChannelFilter('1,,6', true, true), false);
  assert.equal(isValidChannelFilter('x', true, true), false);
  assert.equal(isValidChannelFilter('6,6', true, true), false);
});

test('sanitizeChannelInput strips non-numeric non-comma chars', () => {
  assert.equal(sanitizeChannelInput('1, 6a,11!'), '1,6,11');
});

test('formatChannelFilter sorts numerically and deduplicates', () => {
  assert.equal(formatChannelFilter([44, 6, 11, 6, 1]), '1,6,11,44');
});

test('getActiveHopChannels respects valid filter or falls back to band defaults', () => {
  assert.deepEqual(getActiveHopChannels(true, true, '6,44'), [6, 44]);
  assert.equal(getActiveHopChannels(true, false, '').length, 13);
  assert.equal(getActiveHopChannels(false, true, '').length, 25);
});

test('isValidMacAddress validates colon and dash formats', () => {
  assert.equal(isValidMacAddress('00:11:22:33:44:55'), true);
  assert.equal(isValidMacAddress('AA-BB-CC-DD-EE-FF'), true);
  assert.equal(isValidMacAddress('ZZ:11:22:33:44:55'), false);
  assert.equal(isValidMacAddress('00:11:22:33:44'), false);
});

test('dedupeCharset removes duplicate characters preserving order', () => {
  assert.equal(dedupeCharset('aabb1231a#'), 'ab123#');
});

test('buildCharsetString prefers custom charset over flags', () => {
  assert.equal(
    buildCharsetString({
      custom: '1122AB',
      lowercase: true,
      uppercase: false,
      numbers: false,
      symbols: false,
    }),
    '12AB'
  );
  assert.equal(
    buildCharsetString({
      custom: '',
      lowercase: false,
      uppercase: false,
      numbers: true,
      symbols: false,
    }),
    '0123456789'
  );
});
