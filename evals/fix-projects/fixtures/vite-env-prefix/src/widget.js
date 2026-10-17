import { forecastUrl } from './config.js';

export async function showWeather(city, el) {
  const res = await fetch(forecastUrl(city));
  const data = await res.json();
  el.textContent = `${city}: ${data.summary}`;
}
