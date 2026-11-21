import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATCH_DURATION_MS,
  SLOT_COUNT,
  advanceTime,
  createMatch,
  rotate,
  startMatch,
} from './engine.mjs';

function directionToLane(gap, lane) {
  const clockwise = (lane - gap + SLOT_COUNT) % SLOT_COUNT;
  return clockwise <= SLOT_COUNT / 2 ? 1 : -1;
}

function stepTowardLane(state, ring, nowMs) {
  const gap = state[ring === 'inner' ? 'innerGap' : 'outerGap'];
  return rotate(state, ring, directionToLane(gap, state.targetLane), nowMs);
}

function distance(gap, lane) {
  const steps = Math.abs(gap - lane);
  return Math.min(steps, SLOT_COUNT - steps);
}

function alignRing(state, ring, nowMs) {
  const gap = state[ring === 'inner' ? 'innerGap' : 'outerGap'];
  const steps = distance(gap, state.targetLane);
  for (let step = 0; step < steps; step += 1) {
    state = stepTowardLane(state, ring, nowMs);
  }
  return state;
}

test('a match waits for an explicit start before counting time or moving', () => {
  const ready = Object.freeze(createMatch());
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.score, 0);
  assert.equal(ready.round, 1);
  assert.equal(ready.remainingMs, MATCH_DURATION_MS);
  assert.equal(ready.startedAt, null);
  assert.equal(ready.lastUpdatedAt, null);
  assert.equal(ready.lastClear, null);
  assert.equal(advanceTime(ready, 500_000), ready);
  assert.equal(rotate(ready, 'inner', 1, 500_000), ready);

  const started = startMatch(ready, 100);
  assert.equal(started.phase, 'playing');
  assert.equal(started.startedAt, 100);
  assert.equal(started.lastUpdatedAt, 100);
  assert.equal(startMatch(started, 200), started);
  assert.equal(ready.phase, 'ready');
});

test('an input rotates its own ring exactly one slot and wraps at the boundary', () => {
  let state = startMatch(createMatch(7), 0);
  const firstGap = state.innerGap;
  const outerGap = state.outerGap;
  const lane = state.targetLane;

  for (let step = 1; step <= SLOT_COUNT; step += 1) {
    state = rotate(Object.freeze(state), 'inner', 1, step);
    assert.equal(state.innerGap, (firstGap + step) % SLOT_COUNT);
    assert.equal(state.outerGap, outerGap);
    assert.equal(state.targetLane, lane);
    assert.equal(state.score, 0);
  }

  for (let step = 1; step <= SLOT_COUNT; step += 1) {
    state = rotate(state, 'inner', -1, SLOT_COUNT + step);
    assert.equal(state.innerGap, (firstGap - step + SLOT_COUNT) % SLOT_COUNT);
  }
});

test('both gaps must be aligned together before a new round can score', () => {
  const start = startMatch(createMatch(), 0);
  const innerAligned = stepTowardLane(start, 'inner', 10);
  assert.equal(innerAligned.innerGap, start.targetLane);
  assert.equal(innerAligned.score, 0);

  const innerMovedAway = rotate(innerAligned, 'inner', 1, 20);
  const outerAligned = stepTowardLane(innerMovedAway, 'outer', 30);
  assert.equal(outerAligned.outerGap, start.targetLane);
  assert.equal(outerAligned.score, 0);
  assert.equal(outerAligned.lastClear, null);

  const next = stepTowardLane(outerAligned, 'inner', 40);
  assert.equal(next.score, 1);
  assert.equal(next.round, 2);
  assert.notEqual(next.targetLane, start.targetLane);
  assert.notEqual(next.innerGap, next.targetLane);
  assert.notEqual(next.outerGap, next.targetLane);
  assert.equal(next.remainingMs, MATCH_DURATION_MS - 40);
  assert.deepEqual(next.lastClear, { round: 1, lane: start.targetLane, at: 40 });
});

test('separate player inputs at the same timestamp can clear a round', () => {
  const start = startMatch(createMatch(), 0);
  const outerAligned = stepTowardLane(start, 'outer', 25);
  const next = stepTowardLane(outerAligned, 'inner', 25);
  assert.equal(next.score, 1);
  assert.deepEqual(next.lastClear, { round: 1, lane: start.targetLane, at: 25 });
});

test('a clear immediately before expiry counts and a clear at expiry does not', () => {
  const start = startMatch(createMatch(), 100);
  const deadline = 100 + MATCH_DURATION_MS;
  const innerAligned = stepTowardLane(start, 'inner', deadline - 2);

  const cleared = stepTowardLane(innerAligned, 'outer', deadline - 1);
  assert.equal(cleared.score, 1);
  assert.equal(cleared.phase, 'playing');
  assert.equal(cleared.remainingMs, 1);

  const missed = stepTowardLane(innerAligned, 'outer', deadline);
  assert.equal(missed.phase, 'finished');
  assert.equal(missed.score, 0);
  assert.equal(missed.round, 1);
  assert.equal(missed.outerGap, start.outerGap);
  assert.equal(missed.remainingMs, 0);
  assert.equal(rotate(missed, 'inner', 1, deadline + 1), missed);
  assert.equal(advanceTime(missed, deadline + 500), missed);
  assert.equal(startMatch(missed, deadline + 500), missed);
});

test('the match ends when no one plays and keeps monotonic time', () => {
  const start = startMatch(createMatch(), 100);
  const current = advanceTime(start, 250);
  assert.equal(current.remainingMs, MATCH_DURATION_MS - 150);
  assert.equal(current.lastUpdatedAt, 250);
  assert.equal(advanceTime(current, 249), current);
  assert.equal(rotate(current, 'inner', 1, 249), current);

  const finished = advanceTime(current, 100 + MATCH_DURATION_MS + 5_000);
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.score, 0);
  assert.equal(finished.remainingMs, 0);
});

test('invalid input leaves an active match unchanged', () => {
  const ready = createMatch();
  const playing = startMatch(ready, 0);
  assert.throws(() => createMatch(-1), RangeError);
  assert.throws(() => createMatch(1.5), RangeError);
  assert.equal(startMatch(ready, NaN), ready);
  assert.equal(advanceTime(playing, Infinity), playing);
  assert.equal(rotate(playing, 'both', 1, 10), playing);
  assert.equal(rotate(playing, 'inner', 2, 10), playing);
  assert.equal(rotate(playing, 'outer', 1, NaN), playing);
});

function playSeed(seed) {
  let state = startMatch(createMatch(seed), 0);
  const rounds = [];

  for (let round = 1; round <= 24; round += 1) {
    const inner = distance(state.innerGap, state.targetLane);
    const outer = distance(state.outerGap, state.targetLane);
    assert.ok(inner >= 1 && inner <= 3);
    assert.ok(outer >= 1 && outer <= 3);
    if (round === 1) {
      assert.deepEqual([inner, outer], [1, 1]);
    } else if (round % 2 === 0) {
      assert.ok(inner <= outer);
    } else {
      assert.ok(outer <= inner);
    }
    assert.notEqual(state.targetLane, state.lastClear?.lane);
    rounds.push([state.targetLane, state.innerGap, state.outerGap]);
    state = alignRing(state, 'inner', round * 250);
    state = alignRing(state, 'outer', round * 250);
    assert.equal(state.score, round);
    assert.equal(state.round, round + 1);
  }

  return rounds;
}

test('seeded challenges replay exactly and remain solvable across seeds', () => {
  assert.deepEqual(playSeed(37), playSeed(37));
  assert.notDeepEqual(playSeed(37), playSeed(38));
  for (let seed = 0; seed < 32; seed += 1) {
    playSeed(seed);
  }
});
