// How long the arrow takes to fly to its target: the distance over 800 points a second, never faster than 0.6 s
// (so it can be followed) and never slower than 1.4 s (so it never feels slow).
export function flightMs(distance: number): number { return Math.min(1400, Math.max(600, (distance / 800) * 1000)); }
