import type { Command, World } from "./data/types.ts";
import { RULES } from "./data/cards.ts";
import { applyCommand, createWorld, stepWorld } from "./sim/world.ts";
import { aiThink, createAiState } from "./sim/ai.ts";
import { computeViewport, draw, pushSpawnFx, pushHitFx, pushHealFx, pushDeathFx, notifyAttack, notifyHurt } from "./render/renderer.ts";
import type { Viewport } from "./render/renderer.ts";
import { bindBoard, createInputState, renderDeck } from "./input/input.ts";

// ---------------------------------------------------------------------------
// Bootstrap del prototipo (Fase 1)
// ---------------------------------------------------------------------------

const canvas = document.getElementById("board") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

const deckEl = document.getElementById("deck") as HTMLElement;
const timerEl = document.getElementById("timer") as HTMLElement;
const phaseEl = document.getElementById("phase") as HTMLElement;
const elixirPlayerBar = document.getElementById("elixir-player") as HTMLElement;
const elixirPlayerNum = document.getElementById("elixir-player-num") as HTMLElement;
const elixirEnemyBar = document.getElementById("elixir-enemy") as HTMLElement;
const elixirEnemyNum = document.getElementById("elixir-enemy-num") as HTMLElement;
const crownsPlayerEl = document.getElementById("crowns-player") as HTMLElement;
const crownsEnemyEl = document.getElementById("crowns-enemy") as HTMLElement;
const bannerEl = document.getElementById("banner") as HTMLElement;
const restartBtn = document.getElementById("restart") as HTMLButtonElement;

let world: World = createWorld();
let ai = createAiState();
let vp: Viewport = computeViewport(canvas.width, canvas.height);
const input = createInputState();

// Comandos pendientes del jugador (se aplican en el próximo tick).
const pending: Command[] = [];

function onPlayerCommand(cmd: Command): void {
  pending.push(cmd);
}

function refreshDeck(): void {
  renderDeck(deckEl, input, () => world, refreshDeck);
}

function resize(): void {
  const stage = canvas.parentElement as HTMLElement;
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  vp = computeViewport(canvas.width, canvas.height);
}

function restart(): void {
  world = createWorld();
  ai = createAiState();
  input.selectedCardId = null;
  bannerEl.classList.remove("show");
  bannerEl.textContent = "";
  restartBtn.hidden = true;
  refreshDeck();
}

// --- Bucle principal con paso fijo (acumulador) ---
const FIXED_MS = 1000 / RULES.tickRate;
let acc = 0;
let last = performance.now();

function loop(now: number): void {
  const frame = Math.min(now - last, 250); // evita saltos tras pestaña oculta
  last = now;
  acc += frame;

  while (acc >= FIXED_MS) {
    world.events.length = 0;
    // Comandos del jugador
    while (pending.length > 0) {
      applyCommand(world, pending.shift() as Command);
    }
    // IA
    const aiCmd = aiThink(world, ai, 1 / RULES.tickRate);
    if (aiCmd) applyCommand(world, aiCmd);

    stepWorld(world);

    // Efectos (Fase 3): invocación (Bloque A) y combate (Bloque B)
    for (const ev of world.events) {
      if (ev.kind === "spawn") {
        const u = world.units.find((x) => x.id === ev.unitId);
        if (u) pushSpawnFx(u.pos.x, u.pos.y, ev.player, world.elapsed);
      } else if (ev.kind === "hit") {
        pushHitFx(ev.x, ev.y, ev.amount, world.elapsed);
        // parpadeo rojo en la unidad golpeada (buscar por posición cercana)
        let nearest: number | null = null;
        let nd = 0.6;
        for (const uu of world.units) {
          const d = Math.hypot(uu.pos.x - ev.x, uu.pos.y - ev.y);
          if (d < nd) { nd = d; nearest = uu.id; }
        }
        if (nearest !== null) notifyHurt(nearest, world.elapsed);
      } else if (ev.kind === "heal") {
        pushHealFx(ev.x, ev.y, ev.amount, world.elapsed);
      } else if (ev.kind === "tower-damaged") {
        const t = world.towers.find((x) => x.id === ev.towerId);
        if (t) pushHitFx(t.pos.x, t.pos.y, ev.amount, world.elapsed, true);
      } else if (ev.kind === "death") {
        const u = world.units.find((x) => x.id === ev.unitId);
        if (u) pushDeathFx(u.pos.x, u.pos.y, u.player, world.elapsed);
      }
    }
    acc -= FIXED_MS;
  }

  // Render
  if (canvas.width !== vp.w || canvas.height !== vp.h) {
    vp = computeViewport(canvas.width, canvas.height);
  }
  draw(ctx, world, vp, input.selectedCardId);
  updateHud();
  requestAnimationFrame(loop);
}

let lastCrowns = -1;
function updateHud(): void {
  const remain = Math.max(0, world.duration - world.elapsed);
  const m = Math.floor(remain / 60);
  const s = Math.floor(remain % 60);
  timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  phaseEl.textContent = world.elapsed >= world.doubleElixirAt ? "DOBLE ELIXIR" : "";

  const p = world.players[1];
  const e = world.players[0];
  elixirPlayerBar.style.width = `${(p.elixir / RULES.elixirMax) * 100}%`;
  elixirPlayerNum.textContent = `${Math.floor(p.elixir)}`;
  elixirEnemyBar.style.width = `${(e.elixir / RULES.elixirMax) * 100}%`;
  elixirEnemyNum.textContent = `${Math.floor(e.elixir)}`;

  crownsPlayerEl.textContent = `👑 ${p.crowns}`;
  crownsEnemyEl.textContent = `👑 ${e.crowns}`;

  if (world.players[1].crowns !== lastCrowns) {
    lastCrowns = world.players[1].crowns;
    refreshDeck();
  }

  if (world.finished) {
    const w = world.winner;
    bannerEl.textContent = w === 1 ? "¡GANASTE! 🏆" : w === 0 ? "PERDISTE 💀" : "EMPATE 🤝";
    bannerEl.classList.add("show");
    restartBtn.hidden = false;
  }
}

// --- Arranque ---
bindBoard(canvas, () => vp, () => world, input, onPlayerCommand, refreshDeck);
restartBtn.addEventListener("click", restart);
window.addEventListener("resize", resize);

resize();
refreshDeck();
requestAnimationFrame(loop);

// Exponer para depurar en consola
(window as unknown as Record<string, unknown>).__GR = {
  get world() { return world; },
  get input() { return input; },
  restart,
};
