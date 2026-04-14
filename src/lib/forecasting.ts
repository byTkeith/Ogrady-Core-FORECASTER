/**
 * Holt-Winters Triple Exponential Smoothing (Additive)
 * This is a client-side implementation for immediate visualization
 * while the server handles the heavy AI-driven analysis.
 */

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export function holtWinters(
  data: number[],
  seasonLength: number,
  alpha: number,
  beta: number,
  gamma: number,
  horizon: number
) {
  const n = data.length;
  if (n < seasonLength * 2) return null;

  let level = 0;
  let trend = 0;
  const seasonal = new Array(seasonLength).fill(0);

  // Initial level: average of first season
  for (let i = 0; i < seasonLength; i++) {
    level += data[i];
  }
  level /= seasonLength;

  // Initial trend: average difference between seasons
  for (let i = 0; i < seasonLength; i++) {
    trend += (data[i + seasonLength] - data[i]) / seasonLength;
  }
  trend /= seasonLength;

  // Initial seasonal components
  for (let i = 0; i < seasonLength; i++) {
    seasonal[i] = data[i] - level;
  }

  const results = [...data];
  const forecast: number[] = [];

  // Smoothing
  for (let i = 0; i < n; i++) {
    const lastLevel = level;
    const lastTrend = trend;
    const lastSeasonal = seasonal[i % seasonLength];

    level = alpha * (data[i] - lastSeasonal) + (1 - alpha) * (lastLevel + lastTrend);
    trend = beta * (level - lastLevel) + (1 - beta) * lastTrend;
    seasonal[i % seasonLength] = gamma * (data[i] - level) + (1 - gamma) * lastSeasonal;
  }

  // Forecast
  for (let m = 1; m <= horizon; m++) {
    forecast.push(level + m * trend + seasonal[(n + m - 1) % seasonLength]);
  }

  return forecast;
}
