import test from 'node:test';
import assert from 'node:assert';
import { forecastUrl } from '../src/config.js';

test('the widget asks the weather service about the city', () => {
  assert.strictEqual(forecastUrl('Oslo'), 'https://api.weather.example/forecast?city=Oslo');
});
