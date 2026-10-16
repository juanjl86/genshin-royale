import type { World } from "../data/types.ts";
import { ARENA } from "../data/cards.ts";

export interface Viewport {
  w: number;
  h: number;
  scale: number; // px por celda
  ox: number; // offset x en px
  oy: number; // offset y en px
}

export function computeViewport(canvasW: number, canvasH: number): Viewport {
  const scale = Math.min(canvasW / ARENA.cols, canvasH / ARENA.rows);
  const w = ARENA.cols * scale;
  const h = ARENA.rows * scale;
  return { w: canvasW, h: canvasH, scale, ox: (canvasW - w) / 2, oy: (canvasH - h) / 2 };
}

export function cellToPx(vp: Viewport, x: number, y: number): { px: number; py: number } {
  return { px: vp.ox + x * vp.scale, py: vp.oy + y * vp.scale };
}

export function pxToCell(vp: Viewport, px: number, py: number): { x: number; y: number } {
  return { x: (px - vp.ox) / vp.scale, y: (py - vp.oy) / vp.scale };
}

const ROLE_COLORS: Record<string, string> = {
  melee: "#ef5350",
  ranged: "#7ec8ff",
  tank: "#b0bec5",
  healer: "#81e6a0",
  swarm: "#ffd166",
  splash: "#ff8a65",
};

const ROLE_GLYPH: Record<string, string> = {
  melee: "⚔",
  ranged: "⌖",
  tank: "⬢",
  healer: "✚",
  swarm: "◦",
  splash: "✷",
};

// --- Sprites (Fase 2) ---
// Precarga de imágenes por cardId. Si falta una imagen, se cae al glifo.
const SPRITE_IDS = [
  "paimon",
  "amber",
  "kaeya",
  "fischl",
  "noelle",
  "barbara",
  "xiangling",
  "razor",
];
const sprites: Record<string, HTMLImageElement> = {};
const spriteReady: Record<string, boolean> = {};

for (const id of SPRITE_IDS) {
  const img = new Image();
  img.src = `./sprites/${id}_256.png`;
  img.onload = () => {
    spriteReady[id] = true;
  };
  sprites[id] = img;
}

// Torres (Fase 2b)
const towerSprites: Record<string, HTMLImageElement> = {};
const towerReady: Record<string, boolean> = {};
for (const key of ["tower-blue", "tower-red"]) {
  const img = new Image();
  img.src = `./sprites/${key}_256.png`;
  img.onload = () => {
    towerReady[key] = true;
  };
  towerSprites[key] = img;
}

export function hasSprite(cardId: string): boolean {
  return !!spriteReady[cardId];
}
// --- Efectos de muerte (Fase 3, Bloque C) ---
interface DeathFx {
  x: number;
  y: number;
  t0: number;
  player: number;
}
const deathFx: DeathFx[] = [];
export function pushDeathFx(x: number, y: number, player: number, tNow: number): void {
  deathFx.push({ x, y, t0: tNow, player });
  if (deathFx.length > 40) deathFx.shift();
}

// --- Efectos de invocación (Fase 3, Bloque A) ---
interface SpawnFx {
  x: number;
  y: number;
  t0: number;
  player: number;
}
const spawnFx: SpawnFx[] = [];
let fxWorldElapsedRef = 0;

/** Registra una onda de invocación en la posición dada (coordenadas de celda). */
export function pushSpawnFx(x: number, y: number, player: number, tNow: number): void {
  spawnFx.push({ x, y, t0: tNow, player });
  if (spawnFx.length > 40) spawnFx.shift();
}

// --- Animación de unidades (Fase 3, Bloque C + D) ---
// Cada unidad "respira" (bob) según su id y el tiempo; al atacar da un empujón.
const attackFlash = new Map<number, number>(); // unitId -> instante (elapsed) del último ataque
export function notifyAttack(unitId: number, tNow: number): void {
  attackFlash.set(unitId, tNow);
}

/** Alto extra (en celdas) del "brinco" de ataque si acaba de golpear; 0..1 fase. */
function attackPhase(unitId: number, tNow: number): number {
  const t = attackFlash.get(unitId);
  if (t === undefined) return 0;
  const a = (tNow - t) / 0.22;
  return a < 0 || a > 1 ? 0 : a;
}
function attackPop(unitId: number, tNow: number): number {
  return Math.sin(attackPhase(unitId, tNow) * Math.PI) * 0.35;
}

// Parpadeo de daño: unitId -> instante del último golpe recibido
const hurtFlash = new Map<number, number>();
export function notifyHurt(unitId: number, tNow: number): void {
  hurtFlash.set(unitId, tNow);
}
/** 0..1 seg\u00fan cu\u00e1nto hace que recibi\u00f3 el golpe (1 = reci\u00e9n golpeado). */
function hurtAmount(unitId: number, tNow: number): number {
  const t = hurtFlash.get(unitId);
  if (t === undefined) return 0;
  const a = (tNow - t) / 0.18;
  return a < 0 || a > 1 ? 0 : 1 - a;
}

// Seguimiento de movimiento: inferimos si la unidad se mueve comparando posiciones.
const lastPos = new Map<number, { x: number; y: number; t: number }>();
interface MoveInfo {
  moving: boolean;
  dirX: number; // -1..1 hacia d\u00f3nde se mueve
  speed: number; // celdas/seg
}
function movementOf(u: { id: number; pos: { x: number; y: number } }, tNow: number): MoveInfo {
  const prev = lastPos.get(u.id);
  let info: MoveInfo = { moving: false, dirX: 0, speed: 0 };
  if (prev) {
    const dt = Math.max(1e-3, tNow - prev.t);
    const dx = u.pos.x - prev.x;
    const dy = u.pos.y - prev.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const sp = d / dt;
    info = { moving: sp > 0.15, dirX: d > 1e-4 ? dx / d : 0, speed: sp };
  }
  lastPos.set(u.id, { x: u.pos.x, y: u.pos.y, t: tNow });
  return info;
}

// --- Efectos de combate (Fase 3, Bloque B) ---
interface HitFx {
  x: number;
  y: number;
  amount: number;
  t0: number;
  crit: boolean; // golpe grande (más daño) → texto más grande
}
const hitFx: HitFx[] = [];

/** Registra un golpe (número flotante + chispa). */
export function pushHitFx(x: number, y: number, amount: number, tNow: number, isTower = false): void {
  hitFx.push({ x, y, amount: Math.round(amount), t0: tNow, crit: isTower || amount >= 60 });
  if (hitFx.length > 60) hitFx.shift();
}

/** Registra una curación (número verde flotante). */
const healFx: { x: number; y: number; amount: number; t0: number }[] = [];
export function pushHealFx(x: number, y: number, amount: number, tNow: number): void {
  healFx.push({ x, y, amount: Math.round(amount), t0: tNow });
  if (healFx.length > 40) healFx.shift();
}


export function draw(ctx: CanvasRenderingContext2D, world: World, vp: Viewport, selectedCardId: string | null): void {
  const { ox, oy, scale } = vp;

  // Fondo exterior
  ctx.fillStyle = "#0a1020";
  ctx.fillRect(0, 0, vp.w, vp.h);

  const aw = ARENA.cols * scale;
  const ah = ARENA.rows * scale;

  // Césped: mitad enemiga (arriba, más fría) y mitad jugador (abajo, más cálida)
  const halfH = ah / 2;
  const grassEnemy = ctx.createLinearGradient(0, oy, 0, oy + halfH);
  grassEnemy.addColorStop(0, "#2f6b3f");
  grassEnemy.addColorStop(1, "#3a7a46");
  ctx.fillStyle = grassEnemy;
  ctx.fillRect(ox, oy, aw, halfH);

  const grassPlayer = ctx.createLinearGradient(0, oy + halfH, 0, oy + ah);
  grassPlayer.addColorStop(0, "#3a7a46");
  grassPlayer.addColorStop(1, "#2f6b3f");
  ctx.fillStyle = grassPlayer;
  ctx.fillRect(ox, oy + halfH, aw, halfH);

  // Franjas de césped (cortado) muy sutiles
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  for (let r = 0; r < ARENA.rows; r += 2) {
    const { py } = cellToPx(vp, 0, r);
    ctx.fillRect(ox, py, aw, scale);
  }
  ctx.restore();

  // Río con textura
  const { py: riverPy } = cellToPx(vp, 0, ARENA.riverY);
  const riverH = scale * 1.0;
  const riverGrad = ctx.createLinearGradient(0, riverPy - riverH / 2, 0, riverPy + riverH / 2);
  riverGrad.addColorStop(0, "#2b6fb5");
  riverGrad.addColorStop(0.5, "#3e8fd0");
  riverGrad.addColorStop(1, "#2b6fb5");
  ctx.fillStyle = riverGrad;
  ctx.fillRect(ox, riverPy - riverH / 2, aw, riverH);
  // Brillo del agua (líneas onduladas)
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#cfeaff";
  ctx.lineWidth = Math.max(1, scale * 0.06);
  for (let i = 0; i < 3; i++) {
    const yy = riverPy - riverH * 0.3 + i * riverH * 0.3;
    ctx.beginPath();
    for (let px = ox; px <= ox + aw; px += 6) {
      const wy = yy + Math.sin(px * 0.12 + i) * scale * 0.08;
      if (px === ox) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Caminos de tierra hacia los puentes
  for (const bx of ARENA.bridgeXs) {
    const { px } = cellToPx(vp, bx, 0);
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(px - scale * 0.9, oy, scale * 1.8, ah);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(px - scale * 0.9, oy, scale * 0.25, ah);
  }

  // Puentes (tablas de madera) sobre el río
  for (const bx of ARENA.bridgeXs) {
    const { px } = cellToPx(vp, bx - 1.4, ARENA.riverY);
    ctx.fillStyle = "#a07840";
    ctx.fillRect(px, riverPy - scale * 0.5, scale * 2.8, scale);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#5c4423";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const tx = px + (scale * 2.8 / 6) * i;
      ctx.beginPath(); ctx.moveTo(tx, riverPy - scale * 0.5); ctx.lineTo(tx, riverPy + scale * 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  // Bordes del campo
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(2, scale * 0.12);
  ctx.strokeRect(ox, oy, aw, ah);

  // Torres
  for (const t of world.towers) {
    if (t.hp <= 0) continue;
    const { px, py } = cellToPx(vp, t.pos.x, t.pos.y);
    const r = scale * 1.4;
    const key = t.player === 0 ? "tower-red" : "tower-blue";
    const img = towerSprites[key];
    if (img && towerReady[key]) {
      const dh = r * 2.6;
      const dw = dh * (img.width / img.height);
      ctx.drawImage(img, px - dw / 2, py + r * 0.7 - dh, dw, dh);
    } else {
      ctx.fillStyle = t.player === 0 ? "#c0455f" : "#3f6fc0";
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0e1220";
      ctx.beginPath(); ctx.arc(px, py, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    // barra de vida
    const hpPct = Math.max(0, t.hp / t.maxHp);
    const bw = r * 2.2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(px - bw / 2, py - r - 8, bw, 5);
    ctx.fillStyle = hpPct > 0.5 ? "#6bd66b" : hpPct > 0.25 ? "#f0c24b" : "#ef5350";
    ctx.fillRect(px - bw / 2, py - r - 8, bw * hpPct, 5);
  }

  // Unidades
  for (const u of world.units) {
    if (!u.alive) continue;
    const { px, py } = cellToPx(vp, u.pos.x, u.pos.y);
    const r = scale * (u.role === "tank" ? 0.85 : u.role === "swarm" ? 0.55 : 0.7);
    const img = sprites[u.cardId];
    if (img && spriteReady[u.cardId]) {
      const mv = movementOf(u, world.elapsed);
      const ap = attackPhase(u.id, world.elapsed);
      const hurt = hurtAmount(u.id, world.elapsed);

      // --- Animación ---
      // 1) Bob de reposo (respira). Si camina, rebote más marcado.
      const walkSpeed = Math.min(1, mv.speed / 1.1);
      const bobAmp = scale * (0.05 + walkSpeed * 0.14);
      const bobFreq = 3 + walkSpeed * 9;
      const bob = Math.abs(Math.sin(world.elapsed * bobFreq + u.id * 1.7)) * bobAmp - bobAmp * 0.5;
      // 2) Brinco de ataque
      const pop = Math.sin(ap * Math.PI) * scale * 0.35;
      const dySpr = -bob - pop;
      // 3) Inclinación al caminar (lean hacia la dirección)
      const lean = mv.dirX * walkSpeed * 0.16;
      // 4) Squash & stretch al atacar (se achata y estira)
      const sy = 1 + Math.sin(ap * Math.PI) * 0.12;
      const sx = 1 - Math.sin(ap * Math.PI) * 0.08;

      // Sombra en el suelo (se encoge cuando la unidad está en el aire)
      const airLift = Math.max(0, -dySpr) / (scale * 0.5);
      const shadowScale = Math.max(0.55, 1 - airLift * 0.35);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.85, r * 0.72 * shadowScale, r * 0.28 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      // Halo del bando (jugador rojo / enemigo azul)
      ctx.fillStyle = u.player === 0 ? "rgba(192,69,95,0.85)" : "rgba(63,111,192,0.85)";
      ctx.beginPath();
      ctx.arc(px, py + r * 0.85, r * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Sprite con inclinación, squash/stretch y bob
      ctx.save();
      ctx.translate(px, py + r * 0.85 + dySpr);
      ctx.rotate(lean);
      const dh = r * 2.6 * sy;
      const dw = dh * (img.width / img.height) * (1 / sy) * sx;
      // Tinte rojo al recibir daño (parpadeo)
      if (hurt > 0) {
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(img, -dw / 2, -dh, dw, dh);
      if (hurt > 0) {
        ctx.globalAlpha = hurt * 0.55;
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(-dw / 2, -dh, dw, dh);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else {
      const col = ROLE_COLORS[u.role] ?? "#fff";
      ctx.fillStyle = u.player === 0 ? "#c0455f" : "#3f6fc0";
      ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.font = `${Math.round(r * 1.4)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ROLE_GLYPH[u.role] ?? "?", px, py + 1);
    }

    const hpPct = Math.max(0, u.hp / u.maxHp);
    const bw = r * 1.6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(px - bw / 2, py - r - 5, bw, 3);
    ctx.fillStyle = u.player === 0 ? "#ff9aa5" : "#9ec6ff";
    ctx.fillRect(px - bw / 2, py - r - 5, bw * hpPct, 3);
  }

  // Partículas de invocación (Fase 3, Bloque A)
  for (const fx of spawnFx) {
    const t = (world.elapsed - fx.t0) / 0.55;
    if (t < 0 || t > 1) continue;
    const { px, py } = cellToPx(vp, fx.x, fx.y);
    const rr = scale * (0.6 + t * 1.8);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = fx.player === 0 ? "#ff8a9a" : "#8ab6ff";
    ctx.lineWidth = Math.max(2, scale * 0.18 * (1 - t));
    ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
    // destello interior
    ctx.globalAlpha = (1 - t) * 0.35;
    ctx.fillStyle = fx.player === 0 ? "#ffd0d8" : "#cfe2ff";
    ctx.beginPath(); ctx.arc(px, py, rr * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Efectos de combate: números flotantes (Fase 3, Bloque B)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const fx of hitFx) {
    const t = (world.elapsed - fx.t0) / 0.7;
    if (t < 0 || t > 1) continue;
    const { px, py } = cellToPx(vp, fx.x, fx.y);
    const rise = t * scale * 1.1;
    const yy = py - scale * 0.6 - rise;
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const size = Math.round(scale * (fx.crit ? 0.62 : 0.5) * (1 - t * 0.25));
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(`-${fx.amount}`, px, yy);
    ctx.fillStyle = fx.crit ? "#ffd24b" : "#ff6b6b";
    ctx.fillText(`-${fx.amount}`, px, yy);
    // chispa
    ctx.globalAlpha = Math.max(0, alpha) * 0.7;
    ctx.fillStyle = "#fff2c4";
    const sp = scale * 0.16 * (1 - t);
    ctx.beginPath(); ctx.arc(px, py - scale * 0.2, sp, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const fx of healFx) {
    const t = (world.elapsed - fx.t0) / 0.8;
    if (t < 0 || t > 1) continue;
    const { px, py } = cellToPx(vp, fx.x, fx.y);
    const yy = py - scale * 0.6 - t * scale * 1.0;
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const size = Math.round(scale * 0.5 * (1 - t * 0.25));
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(`+${fx.amount}`, px, yy);
    ctx.fillStyle = "#7dffa6";
    ctx.fillText(`+${fx.amount}`, px, yy);
    ctx.restore();
  }

  // Indicador de zona de despliegue del jugador cuando hay carta seleccionada
  if (selectedCardId) {
    ctx.fillStyle = "rgba(240,194,75,0.08)";
    ctx.fillRect(ox, riverPy, aw, ah - (riverPy - oy));
    ctx.strokeStyle = "rgba(240,194,75,0.5)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(ox, riverPy); ctx.lineTo(ox + aw, riverPy); ctx.stroke();
    ctx.setLineDash([]);
  }
}
