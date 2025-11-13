/* global confetti */

function calculateButtonOrigin(button) {
  const rect = button.getBoundingClientRect();
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
  return {
    x: center.x / window.innerWidth,
    y: center.y / window.innerHeight
  };
}

function triggerConfettiAnimation() {
  const button = document.getElementById("joinBtn");
  if (!button) {
    return;
  }
  
  const origin = calculateButtonOrigin(button);

  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  confetti.create(canvas, {});

  const bursts = [
    {particleCount: 25, spread: 26, velocity: 10},
    {particleCount: 20, spread: 60, velocity: 20},
    {particleCount: 35, spread: 100, velocity: 15, decay: 0.91},
    {particleCount: 10, spread: 120, velocity: 10, decay: 0.92},
    {particleCount: 10, spread: 120, velocity: 20}
  ];

  const colors = [
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

  for (const burst of bursts) {
    confetti({
      disableForReducedMotion: true,
      spread: burst.spread,
      startVelocity: burst.velocity,
      decay: burst.decay,
      origin,
      colors,
      particleCount: burst.particleCount
    });
  }
}
