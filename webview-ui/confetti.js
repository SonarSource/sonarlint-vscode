/* global confetti */
// Constants for confetti configuration
const CONFETTI_COLORS = [
  '#FF6B6B', // Red
  '#FF8E53', // Orange
  '#FFA94D', // Light Orange
  '#FFD93D', // Yellow
  '#6BCF7F', // Green
  '#51CF66', // Light Green
  '#4DABF7', // Blue
  '#748FFC', // Light Blue
  '#9775FA', // Purple
  '#F06595', // Pink
  '#FF6B9D', // Hot Pink
  '#20C997'  // Teal
];
const BASE_PARTICLE_COUNT = 100;

// Constants for confetti bursts
const BURST_1_RATIO = 0.25;
const BURST_1_SPREAD = 26;
const BURST_1_VELOCITY = 10;

const BURST_2_RATIO = 0.2;
const BURST_2_SPREAD = 60;
const BURST_2_VELOCITY = 20;

const BURST_3_RATIO = 0.35;
const BURST_3_SPREAD = 100;
const BURST_3_VELOCITY = 15;
const BURST_3_DECAY = 0.91;

const BURST_4_RATIO = 0.1;
const BURST_4_SPREAD = 120;
const BURST_4_VELOCITY = 10;
const BURST_4_DECAY = 0.92;

const BURST_5_RATIO = 0.1;
const BURST_5_SPREAD = 120;
const BURST_5_VELOCITY = 20;

// Constants for timeouts
const CONFETTI_START_DELAY = 0;

// Constants for positioning
const HALF_DIVISOR = 2;

function calculateButtonOrigin(button) {
  const rect = button.getBoundingClientRect();
  const center = {
    x: rect.left + rect.width / HALF_DIVISOR,
    y: rect.top + rect.height / HALF_DIVISOR
  };
  return {
    x: center.x / window.innerWidth,
    y: center.y / window.innerHeight
  };
}

function createConfettiCanvas() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return canvas;
}

function fireConfettiBurst(particleRatio, opts, defaults) {
  confetti({
    ...defaults,
    ...opts,
    particleCount: Math.floor(BASE_PARTICLE_COUNT * particleRatio)
  });
}

function triggerConfettiAnimation(origin, colors, defaults) {
  fireConfettiBurst(BURST_1_RATIO, {
    spread: BURST_1_SPREAD,
    startVelocity: BURST_1_VELOCITY,
    origin,
    colors
  }, defaults);
  
  fireConfettiBurst(BURST_2_RATIO, {
    spread: BURST_2_SPREAD,
    startVelocity: BURST_2_VELOCITY,
    origin,
    colors
  }, defaults);
  
  fireConfettiBurst(BURST_3_RATIO, {
    spread: BURST_3_SPREAD,
    startVelocity: BURST_3_VELOCITY,
    decay: BURST_3_DECAY,
    origin,
    colors
  }, defaults);
  
  fireConfettiBurst(BURST_4_RATIO, {
    spread: BURST_4_SPREAD,
    startVelocity: BURST_4_VELOCITY,
    decay: BURST_4_DECAY,
    origin,
    colors
  }, defaults);
  
  fireConfettiBurst(BURST_5_RATIO, {
    spread: BURST_5_SPREAD,
    startVelocity: BURST_5_VELOCITY,
    origin,
    colors
  }, defaults);
}

function startConfetti() {
  const button = document.getElementById("joinBtn");
  if (!button) {
    return;
  }
  
  const origin = calculateButtonOrigin(button);

  const canvas = createConfettiCanvas();
  const defaults = {
    disableForReducedMotion: true
  };
  confetti.create(canvas, {});

  setTimeout(() => {
    triggerConfettiAnimation(origin, CONFETTI_COLORS, defaults);
  }, CONFETTI_START_DELAY);
}
