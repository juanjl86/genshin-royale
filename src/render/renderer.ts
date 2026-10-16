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

export function spriteUrl(cardId: string, size: 128 | 256 | 512 = 256): string {
  return `./sprites/${cardId}_${size}.png`;
}

export function draw(ctx: CanvasRenderingContext2D, world: World, vp: Viewport, selectedCardId: string | null): void {
  const { ox, oy, scale } = vp;

  // Fondo de arena
  ctx.fillStyle = "#101733";
  ctx.fillRect(0, 0, vp.w, vp.h);

  const aw = ARENA.cols * scale;
  const ah = ARENA.rows * scale;

  // Mitades
  ctx.fillStyle = "#16203f";
  ctx.fillRect(ox, oy, aw, ah / 2);
  ctx.fillStyle = "#132a44";
  ctx.fillRect(ox, oy + ah / 2, aw, ah / 2);

  // Rejilla tenue
  ctx.strokeStyle = "rgba(120,150,220,0.10)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= ARENA.cols; c++) {
    const { px } = cellToPx(vp, c, 0);
    ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + ah); ctx.stroke();
  }
  for (let r = 0; r <= ARENA.rows; r++) {
    const { py } = cellToPx(vp, 0, r);
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + aw, py); ctx.stroke();
  }

  // Río
  const { py: riverPy } = cellToPx(vp, 0, ARENA.riverY);
  ctx.fillStyle = "rgba(70,140,220,0.35)";
  ctx.fillRect(ox, riverPy - scale * 0.5, aw, scale);

  // Puentes (carriles)
  for (const bx of ARENA.bridgeXs) {
    const { px } = cellToPx(vp, bx - 1.4, ARENA.riverY);
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(px, riverPy - scale * 0.5, scale * 2.8, scale);
  }

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
      // Sombra en el suelo
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.85, r * 0.72, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      // Halo del bando (jugador rojo / enemigo azul)
      ctx.fillStyle = u.player === 0 ? "rgba(192,69,95,0.85)" : "rgba(63,111,192,0.85)";
      ctx.beginPath();
      ctx.arc(px, py + r * 0.85, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      // Sprite
      const dh = r * 2.6; // alto de dibujo
      const dw = dh * (img.width / img.height);
      ctx.drawImage(img, px - dw / 2, py + r * 0.85 - dh, dw, dh);
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
