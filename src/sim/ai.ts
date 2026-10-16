import type { Command, PlayerId, World } from "../data/types.ts";
import { ARENA, CARD_BY_ID, RULES } from "../data/cards.ts";
import { applyCommand, createWorld, stepWorld } from "./world.ts";

// ---------------------------------------------------------------------------
// IA simple (Fase 1): junta elixir, decide una carta barata/razonable y la
// tira cerca del río para presionar. Determinista (no usa azar).
// ---------------------------------------------------------------------------

const AI_DECK = ["paimon", "amber", "kaeya", "fischl", "noelle", "xiangling", "razor", "barbara"];
const AI_PLAYER: PlayerId = 0;

export function createAiState(): { cooldown: number } {
  return { cooldown: 2.5 };
}

export function aiThink(world: World, state: { cooldown: number }, dt: number): Command | null {
  state.cooldown -= dt;
  if (state.cooldown > 0) return null;

  const p = world.players[AI_PLAYER];
  // Ordena por coste ascendente; escoge la más cara que pueda pagar.
  const affordable = AI_DECK
    .map((id) => CARD_BY_ID[id])
    .filter((c) => c.cost <= p.elixir)
    .sort((a, b) => b.cost - a.cost);

  if (affordable.length === 0) return null;

  // Ahorra para cartas grandes si tiene elixir bajo.
  const card = p.elixir >= 8 ? affordable[0] : affordable[Math.min(1, affordable.length - 1)];

  // Coloca cerca del río para atacar pronto; alterna carriles de forma determinista.
  const lane = world.tick % ARENA.bridgeXs.length;
  const x = ARENA.bridgeXs[lane] + ((world.tick % 3) - 1) * 1.2;
  const y = ARENA.enemySpawn.y + (world.tick % 2);

  state.cooldown = 2.0 + (card.cost % 3) * 0.5;
  return { t: "spawn", player: AI_PLAYER, cardId: card.id, x, y, tick: world.tick };
}

// ---------------------------------------------------------------------------
// Test de determinismo: dos mundos iguales + misma secuencia ⇒ mismo hash.
// Ejecutar: npm run sim:test
// ---------------------------------------------------------------------------

export function runDeterminismTest(): { ok: boolean; detail: string } {
  const script = (w: World): void => {
    applyCommand(w, { t: "spawn", player: 1, cardId: "kaeya", x: 9, y: 20, tick: 0 });
    applyCommand(w, { t: "spawn", player: 0, cardId: "fischl", x: 9, y: 12, tick: 0 });
    for (let i = 0; i < 400; i++) {
      if (i === 60) applyCommand(w, { t: "spawn", player: 1, cardId: "paimon", x: 9, y: 21, tick: i });
      if (i === 120) applyCommand(w, { t: "spawn", player: 0, cardId: "razor", x: 9, y: 11, tick: i });
      stepWorld(w);
    }
  };

  const a = createWorld();
  const b = createWorld();
  script(a);
  script(b);

  const ha = hashOf(a);
  const hb = hashOf(b);
  return { ok: ha === hb, detail: `A=${ha}\nB=${hb}` };
}

function hashOf(w: World): string {
  const parts: string[] = [w.tick.toFixed(0), w.elapsed.toFixed(3)];
  for (const t of w.towers) parts.push(`T${t.id}:${t.hp.toFixed(2)}`);
  for (const p of w.players) parts.push(`E${p.elixir.toFixed(3)}:${p.crowns}`);
  for (const u of w.units) parts.push(`U${u.id}:${u.pos.x.toFixed(3)},${u.pos.y.toFixed(3)},${u.hp.toFixed(2)}`);
  return parts.join("|");
}

// Referencias para evitar warnings de "no usado" si el bundler poda.
export const _RULES = RULES;
export { stepWorld, createWorld };
