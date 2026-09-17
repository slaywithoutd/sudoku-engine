import { expect, test } from "vitest";
import { createPlayClock, formatDuration } from "../../src/app/play-clock";

function harness(initial = 0) {
  const env = { t: 0, active: true, running: true };
  const clock = createPlayClock(initial, () => env.running, {
    now: () => env.t,
    pageActive: () => env.active,
  });
  const advance = (ms: number, step = 1000) => {
    for (let left = ms; left > 0; left -= step) {
      env.t += Math.min(step, left);
      clock.sync();
    }
  };
  clock.sync();
  return { env, clock, advance };
}

test("counts while running even though no timer is displayed", () => {
  const { clock, advance } = harness(2_000);
  advance(180_000);
  expect(clock.elapsed()).toBe(182_000);
});

test("inactive pages and paused games never count", () => {
  const { env, clock, advance } = harness();
  advance(10_000);
  env.active = false;
  clock.sync();
  advance(60_000);
  env.active = true;
  clock.sync();
  advance(5_000);
  env.running = false;
  clock.sync();
  advance(30_000);
  expect(clock.elapsed()).toBe(15_000);
});

test("a suspended device adds no sleep time; reset restarts accounting", () => {
  const { env, clock, advance } = harness();
  advance(4_000);
  env.t += 3_600_000; // laptop lid closed, no samples
  clock.sync();
  advance(2_000);
  expect(clock.elapsed()).toBe(6_000);
  clock.reset(0);
  advance(1_000);
  expect(clock.elapsed()).toBe(1_000);
});

test("formats durations", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(65_400)).toBe("1:05");
  expect(formatDuration(3_725_000)).toBe("1:02:05");
});
