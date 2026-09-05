import * as THREE from 'three';
import { createIcons, Camera, Volume2, VolumeX, Pause, Play, RotateCcw, HelpCircle, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerLeftUp, Trees, Palette, Check, Maximize } from 'lucide';
import '@fontsource-variable/inter';
import './style.css';
import { createWorld } from './world.js';
import { createHorse } from './horse.js';
import { createHorsePreview } from './horse-preview.js';
import { setupAppearancePanel } from './appearance-panel.js';
import { createState, changeGait, requestJump, step, GAITS } from './physics.js';
import { Soundscape } from './audio.js';
import { createHorseAnimation } from './horse-animation.js';

const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const button = (id, glyph, label, shortcut = '') => `<button type="button" id="${id}" title="${label}${shortcut ? ` (${shortcut})` : ''}" aria-label="${label}">${icon(glyph)}<span>${label}</span>${shortcut ? `<kbd>${shortcut}</kbd>` : ''}</button>`;
document.querySelector('#app').innerHTML = `
  <canvas id="game" tabindex="0" aria-label="Gra jeździecka 3D. Góra i dół zmieniają tempo, lewo i prawo skręcają, spacja to skok, C zmienia kamerę, Escape zatrzymuje grę."></canvas>
  <header><div class="brand"><div class="brand-mark">${icon('trees')}</div><div><h1>Końska Polana</h1><p>Mała wyprawa. Wielka przyjaźń.</p></div></div>
  <div class="tools">${button('sound', 'volume-2', 'Dźwięk')}${button('help', 'help-circle', 'Pomoc')}${button('pause', 'pause', 'Pauza', 'Esc')}</div></header>
  <div class="location">${icon('trees')}<span id="location">Przy stadninie</span><span class="dot"></span> Swobodna jazda</div>
  <aside class="side-tools">${button('camera', 'camera', 'Zza konia', 'C')}${button('wardrobe', 'palette', 'Wygląd konia')}${button('home', 'rotate-ccw', 'Do stajni')}${button('fullscreen', 'maximize', 'Pełny ekran')}</aside>
  <div id="hint" class="hint"><div class="hint-key">↑</div><div><strong>Ruszaj na małą wyprawę</strong><p>Naciśnij ↑ lub W. Koń sam utrzyma tempo.</p></div></div>
  <footer><div class="gait"><div class="gait-label"><span>Tempo</span><strong id="gait">Postój</strong></div><div class="gait-steps" aria-hidden="true"><b></b><b></b><b></b><b></b></div><div class="tempo-buttons">${button('slower', 'arrow-down', 'Wolniej')}${button('faster', 'arrow-up', 'Szybciej')}</div></div>
  <div class="controls"><div><div class="keys"><kbd>←</kbd><kbd>→</kbd></div><span>Skręcaj</span></div><div><div class="keys"><kbd>↑</kbd><kbd>↓</kbd></div><span>Zmieniaj tempo</span></div><button type="button" class="jump" id="jump">${icon('corner-left-up')}<span>Skok</span><kbd>Spacja</kbd></button></div>
  <div class="map-wrap"><canvas id="map" width="180" height="180" aria-label="Mapa okolicy z pozycją konia"></canvas><span>Twoja okolica</span></div></footer>
  <dialog id="pause-dialog"><div class="dialog-top"><h2>Chwila odpoczynku</h2></div><p>Polana poczeka na Ciebie.</p><button type="button" id="resume" class="primary">${icon('play')} Wracamy do jazdy</button><div class="mini-help"><kbd>↑ ↓</kbd> tempo <kbd>← →</kbd> skręcanie <kbd>Spacja</kbd> skok</div></dialog>
  <dialog id="help-dialog"><div class="dialog-top"><h2>Wskakuj na siodło</h2>${button('close-help', 'x', 'Zamknij')}</div><div class="help-grid"><div><kbd>↑</kbd><kbd>↓</kbd><h3>Wybierz tempo</h3><p>Naciśnij i puść. Od postoju do galopu.</p></div><div><kbd>←</kbd><kbd>→</kbd><h3>Skręcaj</h3><p>Przytrzymaj, żeby skręcić. Działa też WASD.</p></div><div><kbd>Spacja</kbd><h3>Przeskocz przeszkodę</h3><p>Skocz chwilę przed poprzeczką. Nie musisz trafić idealnie.</p></div><div><kbd>C</kbd><h3>Rozejrzyj się</h3><p>Zmieniaj widok. Przeciągnij myszą po świecie, żeby się rozglądać.</p></div></div><button type="button" id="help-play" class="primary">${icon('play')} Jedziemy</button></dialog>
  <dialog id="dress-dialog"><div class="dialog-top"><h2>Twój koń</h2>${button('close-dress', 'x', 'Zamknij')}</div><p>Obejrzyj z każdej strony i wybierz kolory.</p><div class="dress-layout"><div class="horse-preview"><canvas id="horse-preview" tabindex="0" aria-label="Podgląd konia 3D. Przeciągnij, aby obrócić, użyj kółka myszy, aby przybliżyć. Strzałki również obracają i przybliżają."></canvas><div class="preview-tools">${button('preview-left', 'arrow-left', 'Obróć w lewo')}${button('preview-right', 'arrow-right', 'Obróć w prawo')}<button type="button" id="preview-in" aria-label="Przybliż">+</button><button type="button" id="preview-out" aria-label="Oddal">−</button>${button('preview-reset', 'rotate-ccw', 'Cały koń')}</div><p>Przeciągnij, żeby obrócić · Kółko myszy przybliża</p><button type="button" id="preview-rider" aria-pressed="false">${icon('check')} Pokaż jeźdźca</button></div><div class="dress-options"><div id="swatches"></div><button type="button" id="dress-play" class="primary">${icon('play')} Wracamy na polanę</button></div></div></dialog>
  <div id="error" hidden><h2>Nie udało się otworzyć świata 3D</h2><p>Spróbuj w aktualnej przeglądarce z włączoną akceleracją grafiki.</p></div>
`;
const icons = { Camera, Volume2, VolumeX, Pause, Play, RotateCcw, HelpCircle, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerLeftUp, Trees, Palette, Check, Maximize };
const refreshIcons = () => createIcons({ icons }); refreshIcons();
const canvas = document.querySelector('#game');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (error) { document.querySelector('#error').hidden = false; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 350);
const world = createWorld(scene), horse = createHorse(); scene.add(horse.root);
const preview = createHorsePreview(document.getElementById('horse-preview'), horse);
const horseAnimation = createHorseAnimation(horse);
const state = createState(), audio = new Soundscape(), keys = new Set();
let firstPerson = false, paused = false, look = 0, dragging = false, previousMouse = 0, elapsed = 0, hintUntil = 9, started = false;
const $ = (id) => document.getElementById(id);
const dialogs = [$('pause-dialog'), $('help-dialog'), $('dress-dialog')];
function focusGame() { canvas.focus({ preventScroll: true }); }
function showDialog(dialog) {
  keys.clear(); dragging = false; paused = true; dialog.showModal();
}
function closeDialog(dialog) { dialog.close(); paused = false; focusGame(); }
for (const dialog of dialogs) dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
function pause() { if (!dialogs.some(d => d.open)) showDialog($('pause-dialog')); }
function hint(title, subtitle, duration = 4) {
  $('hint').querySelector('strong').textContent = title; $('hint').querySelector('p').textContent = subtitle;
  hintUntil = elapsed + duration; $('hint').classList.remove('hidden');
}
function updateGait() {
  $('gait').textContent = GAITS[state.gait];
  document.querySelectorAll('.gait-steps b').forEach((bar, i) => bar.classList.toggle('on', i <= state.gait));
  $('slower').disabled = state.gait === 0; $('faster').disabled = state.gait === 3;
}
function tempo(delta) {
  changeGait(state, delta); updateGait();
  if (!started && state.gait) { started = true; hint('Świetnie! Teraz wybierz swoją drogę.', '← → skręcaj · Spacja — skok', 6); }
}
function toggleCamera() {
  firstPerson = !firstPerson; horse.rider.visible = !firstPerson; look = 0;
  $('camera').querySelector('span').textContent = firstPerson ? 'Oczami jeźdźca' : 'Zza konia';
  $('camera').setAttribute('aria-pressed', String(firstPerson)); updateCamera(1, true);
}
function home() {
  Object.assign(state, createState()); look = 0; updateGait(); updateCamera(1, true); focusGame();
  hint('Z powrotem przy stajni', 'Dokąd teraz pojedziemy?');
}
$('faster').onclick = () => { tempo(1); focusGame(); };
$('slower').onclick = () => { tempo(-1); focusGame(); };
$('jump').onclick = () => { requestJump(state); focusGame(); };
$('camera').onclick = () => { toggleCamera(); focusGame(); };
$('home').onclick = home; $('pause').onclick = pause;
$('resume').onclick = () => closeDialog($('pause-dialog'));
$('help').onclick = () => showDialog($('help-dialog'));
for (const id of ['close-help', 'help-play']) $(id).onclick = () => closeDialog($('help-dialog'));
$('wardrobe').onclick = () => showDialog($('dress-dialog'));
$('preview-left').onclick = () => preview.rotate(-1);
$('preview-right').onclick = () => preview.rotate(1);
$('preview-in').onclick = () => preview.zoom(1);
$('preview-out').onclick = () => preview.zoom(-1);
$('preview-reset').onclick = () => preview.reset();
$('preview-rider').onclick = () => $('preview-rider').setAttribute('aria-pressed', String(preview.toggleRider()));
for (const id of ['close-dress', 'dress-play']) $(id).onclick = () => closeDialog($('dress-dialog'));
$('sound').onclick = () => {
  audio.enabled = !audio.enabled; $('sound').innerHTML = `${icon(audio.enabled ? 'volume-2' : 'volume-x')}<span>Dźwięk</span>`;
  $('sound').setAttribute('aria-pressed', String(audio.enabled)); refreshIcons(); focusGame();
};
$('sound').setAttribute('aria-pressed', 'true');
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { hint('Pełny ekran jest niedostępny', 'Możesz dalej jeździć w tym oknie.'); } focusGame();
};
setupAppearancePanel(document.getElementById('swatches'), horse);
addEventListener('keydown', event => {
  void audio.unlock();
  if (dialogs.some(d => d.open)) return;
  if (event.target instanceof HTMLButtonElement) return;
  const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyC', 'Escape'];
  if (!gameKeys.includes(event.code)) return;
  event.preventDefault(); keys.add(event.code);
  if (event.repeat) return;
  if (['ArrowUp', 'KeyW'].includes(event.code)) tempo(1);
  if (['ArrowDown', 'KeyS'].includes(event.code)) tempo(-1);
  if (event.code === 'Space') requestJump(state);
  if (event.code === 'KeyC') toggleCamera();
  if (event.code === 'Escape') pause();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('pointerdown', () => { void audio.unlock(); });
canvas.addEventListener('pointerdown', event => { dragging = true; previousMouse = event.clientX; canvas.setPointerCapture(event.pointerId); focusGame(); });
canvas.addEventListener('pointermove', event => { if (dragging) { look -= (event.clientX - previousMouse) * 0.006; look = THREE.MathUtils.clamp(look, -2.6, 2.6); previousMouse = event.clientX; } });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const desiredCamera = new THREE.Vector3(), target = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  const heading = state.heading + look;
  if (firstPerson) {
    desiredCamera.set(state.x - Math.sin(state.heading) * 0.3, 4.1 + state.height, state.z - Math.cos(state.heading) * 0.3);
    target.set(desiredCamera.x + Math.sin(heading) * 15, desiredCamera.y - 0.35, desiredCamera.z + Math.cos(heading) * 15);
  } else {
    desiredCamera.set(state.x - Math.sin(heading) * 9, 5.7 + state.height * 0.55, state.z - Math.cos(heading) * 9);
    target.set(state.x + Math.sin(state.heading) * 2.5, 1.7 + state.height * 0.65, state.z + Math.cos(state.heading) * 2.5);
  }
  camera.position.lerp(desiredCamera, snap ? 1 : 1 - Math.exp(-dt * 7)); camera.lookAt(target);
}
const map = $('map').getContext('2d');
function drawMap() {
  map.clearRect(0, 0, 180, 180); map.fillStyle = '#aabc89'; map.fillRect(0, 0, 180, 180);
  const point = (x, z) => [90 + x * 0.7, 90 + z * 0.7];
  map.fillStyle = '#648562'; map.beginPath(); map.ellipse(88, 39, 70, 28, 0, 0, 7); map.fill();
  map.strokeStyle = '#e8d7b0'; map.lineWidth = 5; map.beginPath();
  world.points.forEach((p, i) => { const [x, y] = point(p.x, p.z); if (i) map.lineTo(x, y); else map.moveTo(x, y); }); map.stroke();
  map.fillStyle = '#e4cda5'; map.fillRect(...point(-16, -38), 22.4, 40.6);
  map.fillStyle = '#a96a4f'; map.fillRect(...point(-41.5, 1), 12, 8);
  map.strokeStyle = '#7b8f7d'; map.lineWidth = 2;
  for (const o of world.obstacles) { map.beginPath(); map.moveTo(...point(-4, o.z)); map.lineTo(...point(4, o.z)); map.stroke(); }
  map.save(); map.translate(...point(state.x, state.z)); map.rotate(-state.heading);
  map.fillStyle = '#fff9e9'; map.strokeStyle = '#345b4a'; map.lineWidth = 2.5; map.beginPath(); map.moveTo(0, 8); map.lineTo(-5, -5); map.lineTo(0, -2); map.lineTo(5, -5); map.closePath(); map.fill(); map.stroke(); map.restore();
}
updateGait(); updateCamera(1, true); focusGame();
let previousTime = performance.now();
renderer.setAnimationLoop(time => {
  const dt = Math.min(0.04, Math.max(0, (time - previousTime) / 1000)); previousTime = time;
  if (!paused) {
    elapsed += dt;
    const turn = Number(keys.has('ArrowLeft') || keys.has('KeyA')) - Number(keys.has('ArrowRight') || keys.has('KeyD'));
    const oldGait = state.gait;
    if (step(state, dt, turn, world.obstacles, world.solids)) { audio.tone(170, 0.18, 0.07, 65, 'triangle'); hint('Poprzeczka zaraz wróci na miejsce', 'Spróbuj nacisnąć spację przed przeszkodą.'); }
    if (state.gait !== oldGait) updateGait();
    horse.root.position.set(state.x, state.height, state.z); horse.root.rotation.y = state.heading;
    const footfalls = horseAnimation.update(dt, state, elapsed);
    for (const obstacle of world.obstacles) { obstacle.rails.rotation.x = obstacle.down ? 1.4 : 0; obstacle.rails.position.y = obstacle.down ? -0.28 : 0; }
    if (!dragging) look *= Math.exp(-dt * 2.5);
    updateCamera(dt); audio.tick(dt, state, Math.abs(state.x) < 16 && state.z < 20 && state.z > -38, footfalls);
    $('location').textContent = state.z < -40 ? 'Leśna ścieżka' : Math.abs(state.x) < 17 && state.z < 21 ? 'Plac do skoków' : state.x < -20 && state.z < 25 && state.z > -10 ? 'Stadnina' : 'Słoneczna polana';
    $('hint').classList.toggle('hidden', elapsed > hintUntil);
  }
  drawMap(); renderer.render(scene, camera);
  if ($('dress-dialog').open) preview.render();
});
// A read-only snapshot helps repeatable browser checks without altering gameplay.
if (import.meta.env.DEV) window.__polana = { snapshot: () => ({ ...state, paused, firstPerson, obstacles: world.obstacles.map(({ z, down }) => ({ z, down })), calls: renderer.info.render.calls }) };
