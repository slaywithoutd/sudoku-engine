export interface ClockEnvironment {
  now(): number;
  /** True while the page is visible and its window has focus. */
  pageActive(): boolean;
}
export interface PlayClock {
  /** Active play milliseconds, including the running interval. */
  elapsed(): number;
  /** Re-evaluates whether time should count (call on any relevant change). */
  sync(): void;
  /** Replaces the accumulated time (e.g. reset) and restarts the interval. */
  reset(ms: number): void;
}
/** Gaps longer than this between samples mean the device slept or the tab froze. */
export const MAX_SAMPLE_GAP_MS = 5_000;

/**
 * Counts only active play: the game must be running (started, not paused,
 * not complete) and the page visible and focused. Visibility of the timer UI
 * is irrelevant. Samples bound each interval, so a suspended device never
 * adds its sleep time.
 */
export function createPlayClock(
  initialMs: number,
  running: () => boolean,
  env: ClockEnvironment,
): PlayClock {
  let accumulated = initialMs,
    activeSince: number | null = null,
    lastSample = env.now();
  const sync = () => {
    const now = env.now(),
      should = running() && env.pageActive();
    if (activeSince !== null) {
      if (now - lastSample > MAX_SAMPLE_GAP_MS) {
        // Count up to the last observed sample only; the gap was not play.
        accumulated += lastSample - activeSince;
        activeSince = should ? now : null;
      } else if (!should) {
        accumulated += now - activeSince;
        activeSince = null;
      }
    } else if (should) activeSince = now;
    lastSample = now;
  };
  return {
    elapsed: () => accumulated + (activeSince === null ? 0 : env.now() - activeSince),
    sync,
    reset(ms) {
      accumulated = ms;
      activeSince = null;
      sync();
    },
  };
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
