import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BEHAVIOR_STORAGE_KEY,
  clearBehavior,
  loadBehavior,
  MAX_MODERATOR_GUIDANCE_LENGTH,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  saveBehavior,
  validateBehavior,
} from './modelmixBehavior.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test('behavior bound constants match the backend contract', () => {
  assert.equal(MIN_TEMPERATURE, 0.0);
  assert.equal(MAX_TEMPERATURE, 2.0);
  assert.equal(MAX_MODERATOR_GUIDANCE_LENGTH, 2000);
});

test('validateBehavior accepts valid temperature and guidance independently', () => {
  assert.deepEqual(validateBehavior({ temperature: 0.7, moderator_guidance: 'Be concise' }), { valid: true });
  assert.deepEqual(validateBehavior({ temperature: 0.7 }), { valid: true });
  assert.deepEqual(validateBehavior({ moderator_guidance: 'Be concise' }), { valid: true });
  assert.deepEqual(validateBehavior({}), { valid: true });
  assert.deepEqual(validateBehavior(), { valid: true });
  assert.deepEqual(validateBehavior({ temperature: 0.0, moderator_guidance: 'x'.repeat(2000) }), { valid: true });
  assert.deepEqual(validateBehavior({ temperature: 2.0, moderator_guidance: '' }), { valid: true });
});

test('validateBehavior rejects temperature outside bounds', () => {
  for (const bad of [-0.01, 2.01, 3, 1e9, NaN, Infinity, -Infinity, '0.7']) {
    const result = validateBehavior({ temperature: bad });
    assert.equal(result.valid, false, `temperature=${String(bad)}`);
    if (!result.valid) assert.ok('temperature' in result.errors, 'error keyed by temperature');
  }
});

test('validateBehavior treats an absent temperature as independent, not an error', () => {
  assert.deepEqual(validateBehavior({ temperature: undefined, moderator_guidance: 'x' }), { valid: true });
  assert.deepEqual(validateBehavior({ temperature: null, moderator_guidance: 'x' }), { valid: true });
});

test('validateBehavior rejects over-long guidance', () => {
  const result = validateBehavior({ moderator_guidance: 'x'.repeat(2001) });
  assert.equal(result.valid, false);
  assert.ok('moderator_guidance' in result.errors);
  const nonString = validateBehavior({ moderator_guidance: 123 });
  assert.equal(nonString.valid, false);
});

test('loadBehavior returns null when nothing is saved or storage is unavailable', () => {
  assert.equal(loadBehavior(memoryStorage()), null);
  assert.equal(loadBehavior(undefined), null);
  assert.equal(loadBehavior({}), null);
});

test('loadBehavior parses a valid saved object and rejects corrupt shapes without throwing', () => {
  const storage = memoryStorage();
  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({ temperature: 0.8, moderator_guidance: 'Flag uncertainty' }));
  assert.deepEqual(loadBehavior(storage), { temperature: 0.8, moderator_guidance: 'Flag uncertainty' });

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({ temperature: 1.1 }));
  assert.deepEqual(loadBehavior(storage), { temperature: 1.1 });

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({ moderator_guidance: 'Only guidance' }));
  assert.deepEqual(loadBehavior(storage), { moderator_guidance: 'Only guidance' });

  storage.setItem(BEHAVIOR_STORAGE_KEY, 'not-json{{');
  assert.equal(loadBehavior(storage), null);

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify([]));
  assert.equal(loadBehavior(storage), null);

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({}));
  assert.equal(loadBehavior(storage), null);

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({ temperature: 2.5 }));
  assert.equal(loadBehavior(storage), null);

  storage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify({ moderator_guidance: 'x'.repeat(2001) }));
  assert.equal(loadBehavior(storage), null);
});

test('saveBehavior writes and clearBehavior removes', () => {
  const storage = memoryStorage();
  assert.equal(saveBehavior({ temperature: 0.9, moderator_guidance: 'Preferred style' }, storage), true);
  assert.deepEqual(loadBehavior(storage), { temperature: 0.9, moderator_guidance: 'Preferred style' });
  assert.equal(clearBehavior(storage), true);
  assert.equal(loadBehavior(storage), null);
});

test('saveBehavior refuses invalid or empty values without writing', () => {
  const storage = memoryStorage();
  assert.equal(saveBehavior({ temperature: 3.0 }, storage), false);
  assert.equal(saveBehavior({ moderator_guidance: 'x'.repeat(2001) }, storage), false);
  assert.equal(saveBehavior({}, storage), false);
  assert.equal(saveBehavior(undefined, storage), false);
  assert.equal(loadBehavior(storage), null);
});

test('helpers tolerate broken or throwing storage without throwing', () => {
  assert.equal(saveBehavior({ temperature: 0.7 }, {}), false);
  assert.equal(clearBehavior({}), false);
  assert.equal(loadBehavior({}), null);

  const throwing = {
    getItem() { throw new Error('nope'); },
    setItem() { throw new Error('nope'); },
    removeItem() { throw new Error('nope'); },
  };
  assert.equal(loadBehavior(throwing), null);
  assert.equal(saveBehavior({ temperature: 0.7 }, throwing), false);
  assert.equal(clearBehavior(throwing), false);
});
