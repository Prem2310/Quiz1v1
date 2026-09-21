/** Mirrors LEAGUE_THRESHOLDS in the API's app/core/scoring.py — a league is the band its rating falls in. */
export const LEAGUE_BANDS: { name: string; from: number; to: number }[] = [
  { name: "Novice", from: 0, to: 1000 },
  { name: "Bronze", from: 1000, to: 1200 },
  { name: "Silver", from: 1200, to: 1400 },
  { name: "Gold", from: 1400, to: 1600 },
  { name: "Platinum", from: 1600, to: 1800 },
  { name: "Diamond", from: 1800, to: Infinity },
];

/** Where a rating sits inside its league, and how far it is from the next one. */
export function leagueProgress(rating: number) {
  const index = Math.max(0, LEAGUE_BANDS.findIndex((band) => rating < band.to));
  const band = LEAGUE_BANDS[index] ?? LEAGUE_BANDS[LEAGUE_BANDS.length - 1]!;
  const next = LEAGUE_BANDS[index + 1] ?? null;
  const pct = next ? Math.min(1, Math.max(0, (rating - band.from) / (band.to - band.from))) : 1;
  return { band, next, pct, toNext: next ? Math.ceil(band.to - rating) : 0 };
}
