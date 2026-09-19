// Live Nairobi weather for the Yard Conditions widget (keyless Open-Meteo).

// WMO weather codes -> short human labels
const WMO_TEXT = {
  0: 'Clear Skies',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Morning Fog',
  48: 'Foggy',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  61: 'Light Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  80: 'Light Showers',
  81: 'Moderate Showers',
  82: 'Heavy Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Severe Thunderstorm'
};

export async function fetchNairobiYardConditions() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-1.2864&longitude=36.8172&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Africa/Nairobi',
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const c = json.current;
    if (!c) return null;
    const temp = Math.round(c.temperature_2m ?? 0);
    const humid = Math.round(c.relative_humidity_2m ?? 0);
    const rain = Number(c.precipitation ?? 0);
    const wmo = WMO_TEXT[c.weather_code] || 'Mixed Conditions';

    let body;
    if (rain > 0.5) {
      body = `${rain.toFixed(1)} mm of rain expected — we adjust mowing height to avoid rutting and hold off watering.`;
    } else if (rain > 0) {
      body = 'Light drizzle expected — skip watering today and let the crew keep the mow height raised.';
    } else if (humid < 35) {
      body = 'Very dry air — water deeply early in the morning and let the grass grow slightly longer to protect the crown.';
    } else {
      body = 'Dry but comfortable — deep-water twice weekly, ideally in the early morning for maximum uptake.';
    }

    return { title: `${wmo} • ${temp}°C`, body };
  } catch {
    return null;
  }
}

// Check URL query params for frictionless access (?client= or ?phone=)
