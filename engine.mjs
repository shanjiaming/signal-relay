export const SLOT_COUNT = 8;
export const MATCH_DURATION_MS = 45_000;
export const DEFAULT_SEED = 20261121;

function wrapLane(lane) {
    return (lane + SLOT_COUNT) % SLOT_COUNT;
}

function roundBits(seed, round) {
    let value = seed + Math.imul(round, 0x9e3779b9);
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return (value ^ (value >>> 16)) >>> 0;
}

function roundSetup(seed, round, previousLane = null) {
    const bits = roundBits(seed, round);
    const targetLane = previousLane === null
        ? bits % SLOT_COUNT
        : wrapLane(previousLane + 1 + bits % (SLOT_COUNT - 1));
    const shortPath = round < 6 ? 1 : 1 + ((bits >>> 4) & 1);
    const laterLongPath = round < 4 ? 2 : 2 + ((bits >>> 5) & 1);
    const longPath = round === 1 ? 1 : laterLongPath;
    const innerStartsCloser = round % 2 === 0;
    const innerDistance = innerStartsCloser ? shortPath : longPath;
    const outerDistance = innerStartsCloser ? longPath : shortPath;
    const innerSide = (bits & 64) === 0 ? -1 : 1;
    const randomOuterSide = (bits & 128) === 0 ? -1 : 1;
    const outerSide = round === 1 ? -innerSide : randomOuterSide;

    return {
        targetLane,
        innerGap: wrapLane(targetLane + innerSide * innerDistance),
        outerGap: wrapLane(targetLane + outerSide * outerDistance),
    };
}

export function createMatch(seed = DEFAULT_SEED) {
    if (!Number.isSafeInteger(seed) || seed < 0) {
        throw new RangeError('Match seed must be a non-negative safe integer');
    }

    const normalizedSeed = seed >>> 0;
    return {
        phase: 'ready',
        seed: normalizedSeed,
        score: 0,
        round: 1,
        ...roundSetup(normalizedSeed, 1),
        remainingMs: MATCH_DURATION_MS,
        startedAt: null,
        lastUpdatedAt: null,
        lastClear: null,
    };
}

export function startMatch(state, nowMs) {
    if (state.phase !== 'ready' || !Number.isFinite(nowMs)) {
        return state;
    }

    return {
        ...state,
        phase: 'playing',
        startedAt: nowMs,
        lastUpdatedAt: nowMs,
    };
}

export function advanceTime(state, nowMs) {
    if (
        state.phase !== 'playing' ||
        !Number.isFinite(nowMs) ||
        nowMs <= state.lastUpdatedAt
    ) {
        return state;
    }

    const remainingMs = Math.max(0, MATCH_DURATION_MS - (nowMs - state.startedAt));
    return {
        ...state,
        phase: remainingMs === 0 ? 'finished' : 'playing',
        remainingMs,
        lastUpdatedAt: nowMs,
    };
}

export function rotate(state, ring, direction, nowMs) {
    if (
        (ring !== 'inner' && ring !== 'outer') ||
        (direction !== -1 && direction !== 1) ||
        state.phase !== 'playing' ||
        !Number.isFinite(nowMs) ||
        nowMs < state.lastUpdatedAt
    ) {
        return state;
    }

    const current = advanceTime(state, nowMs);
    if (current.phase === 'finished') {
        return current;
    }

    const gap = ring === 'inner' ? 'innerGap' : 'outerGap';
    const moved = {...current, [gap]: wrapLane(current[gap] + direction)};
    if (moved.innerGap !== moved.targetLane || moved.outerGap !== moved.targetLane) {
        return moved;
    }

    const round = moved.round + 1;
    return {
        ...moved,
        ...roundSetup(moved.seed, round, moved.targetLane),
        round,
        score: moved.score + 1,
        lastClear: {round: moved.round, lane: moved.targetLane, at: nowMs},
    };
}
