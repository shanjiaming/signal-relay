import {
    advanceTime,
    createMatch,
    MATCH_DURATION_MS,
    rotate,
    SLOT_COUNT,
    startMatch,
} from './engine.mjs';

const board = document.querySelector('#board');
const context = board.getContext('2d');
const score = document.querySelector('#score');
const clock = document.querySelector('#clock');
const clockDetail = clock.querySelector('span');
const lane = document.querySelector('#lane');
const progress = document.querySelector('#time-bar');
const instructions = document.querySelector('#instructions');
const announcement = document.querySelector('#announcement');
const start = document.querySelector('#start');
const sound = document.querySelector('#sound');
const turns = [...document.querySelectorAll('[data-ring]')];
const media = matchMedia('(prefers-reduced-motion: reduce)');
const full = Math.PI * 2;
const step = full / SLOT_COUNT;
const center = board.width / 2;
const colors = {
    ink: '#c9ddd1',
    line: '#304a40',
    target: '#f6ff9b',
    inner: '#8ef0bd',
    outer: '#ffd07d',
};
const inputs = new Map([
    ['a', {ring: 'inner', direction: -1}],
    ['d', {ring: 'inner', direction: 1}],
    ['j', {ring: 'outer', direction: -1}],
    ['l', {ring: 'outer', direction: 1}],
]);

let match = createMatch();
let frame;
let audio;
let soundOn = false;

function angle(slot) {
    return slot * step - Math.PI / 2;
}

function point(radius, radians) {
    return [center + Math.cos(radians) * radius, center + Math.sin(radians) * radius];
}

function ray(radiusFrom, radiusTo, radians, color, width = 1) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(...point(radiusFrom, radians));
    context.lineTo(...point(radiusTo, radians));
    context.stroke();
}

function disk(radius, x, y, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, full);
    context.fill();
}

function arc(radius, from, to, color, width) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.arc(center, center, radius, from, to);
    context.stroke();
}

function drawRing(role, radius, slot, color, matched) {
    const radians = angle(slot);
    const gap = 0.26;
    arc(radius, 0, full, '#20362d', 24);
    arc(radius, radians + gap, radians + full - gap, color, matched ? 9 : 4);
    for (const end of [radians - gap, radians + gap]) {
        ray(radius - 10, radius + 10, end, color, 4);
    }
    const [x, y] = point(radius, radians);
    if (role === 'inner') {
        disk(5, x, y, color);
    } else {
        context.save();
        context.translate(x, y);
        context.rotate(Math.PI / 4);
        context.fillStyle = color;
        context.fillRect(-4, -4, 8, 8);
        context.restore();
    }
}

function drawBoard(now) {
    context.clearRect(0, 0, board.width, board.height);
    context.lineCap = 'round';
    arc(233, 0, full, colors.line, 2);
    arc(218, 0, full, colors.line, 1);

    const targetAngle = angle(match.targetLane);
    context.lineCap = 'butt';
    ray(51, 218, targetAngle, '#f6ff9b16', 37);
    context.setLineDash([7, 7]);
    ray(56, 218, targetAngle, '#f6ff9b80', 2);
    context.setLineDash([]);
    context.lineCap = 'round';

    context.font = '600 17px "IBM Plex Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let index = 0; index < SLOT_COUNT; index++) {
        const radians = angle(index);
        const active = index === match.targetLane;
        const [x, y] = point(248, radians);
        if (active) {
            disk(16, x, y, colors.target);
            context.fillStyle = '#151e16';
        } else {
            context.fillStyle = colors.ink;
            ray(209, 217, radians, colors.line, 2);
        }
        context.fillText(String(index + 1), x, y + 1);
    }

    drawRing('outer', 174, match.outerGap, colors.outer, match.outerGap === match.targetLane);
    drawRing('inner', 105, match.innerGap, colors.inner, match.innerGap === match.targetLane);

    const edge = angle(match.innerGap);
    const boundary = angle(match.outerGap);
    ray(31, 72, edge, '#8ef0bd85', 3);
    ray(195, 213, boundary, '#ffd07d65', 3);
    disk(46, center, center, '#16271f');
    disk(28, center, center, '#2d4839');
    disk(14, center, center, colors.target);
    disk(5, center, center, '#1c3024');

    if (match.lastClear) {
        const elapsed = now - match.lastClear.at;
        const duration = media.matches ? 120 : 450;
        if (elapsed >= 0 && elapsed < duration) {
            const age = elapsed / duration;
            const glowAngle = angle(match.lastClear.lane);
            context.save();
            context.globalAlpha = 1 - age;
            ray(31, 223, glowAngle, colors.target, 3);
            const [x, y] = point(media.matches ? 206 : 37 + age * 177, glowAngle);
            disk(8, x, y, colors.target);
            disk(4, x, y, '#fefff1');
            context.restore();
        }
    }
}

function refreshReadout(now) {
    const tenth = Math.ceil(match.remainingMs / 100);
    const whole = String(Math.floor(tenth / 10)).padStart(2, '0');
    if (clock.firstChild.textContent !== whole) {
        clock.firstChild.textContent = whole;
    }
    const readouts = [
        [clockDetail, '.' + (tenth % 10)],
        [score, String(match.score).padStart(2, '0')],
        [lane, String(match.targetLane + 1).padStart(2, '0')],
    ];
    for (const [element, value] of readouts) {
        if (element.textContent !== value) element.textContent = value;
    }
    clock.parentElement.classList.toggle('urgent', tenth <= 100);
    progress.style.transform = `scaleX(${match.remainingMs / MATCH_DURATION_MS})`;
    drawBoard(now);
}

function announceRound(prefix = '') {
    announcement.textContent =
        `${prefix} Lane ${match.targetLane + 1}. Inner ring at ${match.innerGap + 1}, outer ring at ${match.outerGap + 1}.`;
}

function tone() {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    const startAt = audio.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(335, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(598, startAt + 0.11);
    volume.gain.setValueAtTime(0.12, startAt);
    volume.gain.exponentialRampToValueAtTime(0.001, startAt + 0.15);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.16);
}

function finish() {
    const result = `Relay complete. ${match.score} ${match.score === 1 ? 'signal' : 'signals'} sent.`;
    instructions.textContent = result;
    announcement.textContent = result;
    for (const button of turns) button.disabled = true;
    start.textContent = 'Play again';
    start.hidden = false;
    start.focus({preventScroll: true});
}

function tick() {
    const now = performance.now();
    const previous = match.phase;
    match = advanceTime(match, now);
    refreshReadout(now);
    if (previous === 'playing' && match.phase === 'finished') finish();
    frame = match.phase === 'playing' ? requestAnimationFrame(tick) : undefined;
}

function move(ring, direction) {
    if (match.phase !== 'playing') return;
    const now = performance.now();
    const priorScore = match.score;
    match = rotate(match, ring, direction, now);
    refreshReadout(now);
    if (match.phase === 'finished') {
        finish();
    } else if (match.score > priorScore) {
        tone();
        announceRound(`Signal sent. Score ${match.score}.`);
    } else {
        announceRound();
    }
}

function begin() {
    if (match.phase === 'playing') return;
    if (frame !== undefined) cancelAnimationFrame(frame);
    const now = performance.now();
    match = startMatch(createMatch(), now);
    start.hidden = true;
    instructions.textContent = 'Line up both gaps with the marked lane before time runs out.';
    for (const button of turns) button.disabled = false;
    announceRound('Relay begun.');
    refreshReadout(now);
    frame = requestAnimationFrame(tick);
}

start.addEventListener('click', begin);
sound.addEventListener('click', async () => {
    if (!soundOn) {
        try {
            const AudioEngine = window.AudioContext ?? window.webkitAudioContext;
            audio ??= new AudioEngine();
            await audio.resume();
        } catch {
            sound.textContent = 'Sound unavailable';
            sound.disabled = true;
            return;
        }
    }
    soundOn = !soundOn;
    sound.textContent = soundOn ? 'Sound on' : 'Sound off';
    sound.setAttribute('aria-pressed', String(soundOn));
});

for (const button of turns) {
    button.addEventListener('click', () => move(button.dataset.ring, Number(button.dataset.turn)));
    button.disabled = true;
}

document.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.repeat || match.phase !== 'playing') return;
    const input = inputs.get(event.key.toLowerCase());
    if (!input) return;
    event.preventDefault();
    const button = turns.find((item) => item.dataset.ring === input.ring && Number(item.dataset.turn) === input.direction);
    button.classList.add('pressed');
    move(input.ring, input.direction);
});

document.addEventListener('keyup', (event) => {
    const input = inputs.get(event.key.toLowerCase());
    if (!input) return;
    const button = turns.find((item) => item.dataset.ring === input.ring && Number(item.dataset.turn) === input.direction);
    button.classList.remove('pressed');
});

window.addEventListener('blur', () => {
    for (const button of turns) button.classList.remove('pressed');
});

refreshReadout(performance.now());
