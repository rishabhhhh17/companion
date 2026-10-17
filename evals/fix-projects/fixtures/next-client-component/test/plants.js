import test from 'node:test';
import assert from 'node:assert';
import { getPlants } from '../lib/plants.js';

test('there are plants this week', async () => {
  const plants = await getPlants();
  assert.strictEqual(plants.length, 2);
});
