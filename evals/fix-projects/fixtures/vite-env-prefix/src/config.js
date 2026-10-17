// Where the widget gets the weather from, read from the project's settings.
export const apiUrl = import.meta.env.API_URL;

export function forecastUrl(city) {
  if (!apiUrl) throw new Error('The weather could not load: the address of the weather service is undefined.');
  return `${apiUrl}/forecast?city=${encodeURIComponent(city)}`;
}
