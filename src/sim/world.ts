import type {
  Command,
  PlayerId,
  Tower,
  Unit,
  Vec2,
  World,
} from "../data/types.ts";
import { ARENA, CARD_BY_ID, RULES, TOWER_STATS } from "../data/cards.ts";

// ---------------------------------------------------------------------------
// Helpers deterministas (sin Math.random en la simulación)
// ---------------------------------------------------------------------------

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------------------
// Creación del mundo
// ---------------------------------------------------------------------------

export function createWorld(): World {
  const towers: Tower[] = [
    makeTower(1, 0, "king", ARENA.enemyTower),
    makeTower(2, 1, "king", ARENA.playerTower),
    makeTower(3, 0, "princess", ARENA.enemyPrincessTowers[0]),
    makeTower(4, 0, "princess", ARENA.enemyPrincessTowers[1]),
    makeTower(5, 1, "princess", ARENA.playerPrincessTowers[0]),
    makeTower(6, 1, "princess", ARENA.playerPrincessTowers[1]),
  ];
  return {
    tick: 0,
    tickRate: RULES.tickRate,
    elapsed: 0,
    duration: RULES.duration,
    overtime: 0,
    doubleElixirAt: RULES.doubleElixirIn,
    units: [],
    towers,
    players: [
      { elixir: RULES.elixirStart, crowns: 0 },
      { elixir: RULES.elixirStart, crowns: 0 },
    ],
    nextUnitId: 1,
    winner: null,
    finished: false,
    events: [],
  };
}

function makeTower(id: number, player: PlayerId, kind: "princess" | "king", pos: Vec2): Tower {
  const s = TOWER_STATS[kind];
  return {
    id,
    player,
    kind,
    pos: { x: pos.x, y: pos.y },
    hp: s.hp,
    maxHp: s.hp,
    range: s.range,
    damage: s.damage,
    attackCooldown: s.attackCooldown,
    attackTimer: 0,
    isKing: kind === "king",
  };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

export function applyCommand(world: World, cmd: Command): boolean {
  if (world.finished) return false;
  switch (cmd.t) {
    case "spawn":
      return doSpawn(world, cmd.player, cmd.cardId, { x: cmd.x, y: cmd.y });
    case "spell":
      // Fase 1: los hechizos aún no están implementados.
      return false;
    case "surrender":
      world.finished = true;
      world.winner = cmd.player === 0 ? 1 : 0;
      world.events.push({ kind: "finish", winner: world.winner });
      return true;
  }
}

function doSpawn(world: World, player: PlayerId, cardId: string, at: Vec2): boolean {
  const card = CARD_BY_ID[cardId];
  if (!card) return false;
  const p = world.players[player];
  if (p.elixir + 1e-6 < card.cost) return false;

  // Validación de zona de despliegue (Fase 1): solo en tu mitad.
  const inOwnHalf =
    player === 0 ? at.y > ARENA.riverY : at.y < ARENA.riverY;
  if (!inOwnHalf) return false;

  p.elixir -= card.cost;

  const n = Math.max(1, card.count);
  for (let i = 0; i < n; i++) {
    // Formación simple y determinista (fila/columna) alrededor del punto.
    const ox = n === 1 ? 0 : (i - (n - 1) / 2) * 0.7;
    const oy = n === 1 ? 0 : (i % 2 === 0 ? 0 : 0.7);
    const u: Unit = {
      id: world.nextUnitId++,
      player,
      cardId,
      role: card.role,
      pos: { x: clamp(at.x + ox, 1, ARENA.cols - 1), y: clamp(at.y + oy, 1, ARENA.rows - 1) },
      hp: card.hp,
      maxHp: card.hp,
      speed: card.speed,
      range: card.range,
      damage: card.damage,
      attackTimer: 0,
      attackCooldown: card.attackCooldown,
      splashRadius: card.splashRadius ?? 0,
      healAmount: card.healAmount ?? 0,
      targetBuildingsOnly: card.targetBuildingsOnly ?? false,
      alive: true,
    };
    world.units.push(u);
    world.events.push({ kind: "spawn", unitId: u.id, cardId, player });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tick de simulación
// ---------------------------------------------------------------------------

export function stepWorld(world: World): void {
  if (world.finished) return;
  world.events.length = 0;

  const dt = 1 / world.tickRate;
  world.elapsed += dt;
  world.tick += 1;

  // Elixir
  const regen = world.elapsed >= world.doubleElixirAt ? RULES.elixirPerSec * 2 : RULES.elixirPerSec;
  for (const p of world.players) {
    p.elixir = Math.min(RULES.elixirMax, p.elixir + regen * dt);
  }

  // Unidades
  for (const u of world.units) {
    if (!u.alive) continue;
    updateUnit(world, u, dt);
  }
  // Torres
  for (const t of world.towers) {
    if (t.hp <= 0) continue;
    updateTower(world, t, dt);
  }

  // Limpieza de muertos
  world.units = world.units.filter((u) => u.alive);

  // Fin de partida por tiempo
  if (world.elapsed >= world.duration) {
    if (world.players[0].crowns === world.players[1].crowns && world.overtime === 0) {
      world.overtime = RULES.overtime; // prórroga por empate
      world.duration += RULES.overtime;
    } else {
      finish(world);
    }
  }
}

function updateUnit(world: World, u: Unit, dt: number): void {
  // Prioridad: torre enemiga si está en rango; si no, unidad enemiga más cercana.
  const enemyPlayer: PlayerId = u.player === 0 ? 1 : 0;
  let targetPos: Vec2 | null = null;
  let targetUnit: Unit | null = null;
  let targetTower: Tower | null = null;

  let best = Infinity;
  for (const t of world.towers) {
    if (t.player !== enemyPlayer || t.hp <= 0) continue;
    const d = dist(u.pos, t.pos);
    if (d < best) {
      best = d;
      targetTower = t;
      targetUnit = null;
      targetPos = t.pos;
    }
  }
  if (!u.targetBuildingsOnly) {
    for (const e of world.units) {
      if (e.player === u.player || !e.alive) continue;
      const d = dist(u.pos, e.pos);
      if (d < best) {
        best = d;
        targetUnit = e;
        targetTower = null;
        targetPos = e.pos;
      }
    }
  }

  if (!targetPos) return;

  // Healer: no ataca; si hay objetivo aliado herido cerca, cura.
  if (u.role === "healer") {
    let healed = false;
    for (const a of world.units) {
      if (a.player !== u.player || !a.alive || a === u) continue;
      if (a.hp >= a.maxHp) continue;
      if (dist(u.pos, a.pos) <= u.range) {
        u.attackTimer -= dt;
        if (u.attackTimer <= 0) {
          a.hp = Math.min(a.maxHp, a.hp + u.healAmount);
          world.events.push({ kind: "heal", x: a.pos.x, y: a.pos.y, amount: u.healAmount, player: u.player });
          u.attackTimer = u.attackCooldown;
        }
        healed = true;
        break;
      }
    }
    if (!healed) moveToward(u, targetPos, dt);
    return;
  }

  // ¿En rango de ataque?
  if (best <= u.range) {
    u.attackTimer -= dt;
    if (u.attackTimer <= 0) {
      u.attackTimer = u.attackCooldown;
      dealDamage(world, u, targetUnit, targetTower);
    }
    return; // se queda quieto atacando
  }

  moveToward(u, targetPos, dt);
}

function moveToward(u: Unit, target: Vec2, dt: number): void {
  const dx = target.x - u.pos.x;
  const dy = target.y - u.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-4) return;
  const step = u.speed * dt;
  const nx = dx / d;
  const ny = dy / d;
  u.pos.x = clamp(u.pos.x + nx * step, 0.5, ARENA.cols - 0.5);
  u.pos.y = clamp(u.pos.y + ny * step, 0.5, ARENA.rows - 0.5);
}

function dealDamage(world: World, attacker: Unit, targetUnit: Unit | null, targetTower: Tower | null): void {
  if (targetUnit && targetUnit.alive) {
    targetUnit.hp -= attacker.damage;
    world.events.push({ kind: "hit", x: targetUnit.pos.x, y: targetUnit.pos.y, amount: attacker.damage, player: attacker.player });
    if (attacker.splashRadius > 0) {
      for (const e of world.units) {
        if (e === targetUnit || e.player === attacker.player || !e.alive) continue;
        if (dist(e.pos, targetUnit.pos) <= attacker.splashRadius) {
          e.hp -= attacker.damage * 0.6;
          world.events.push({ kind: "hit", x: e.pos.x, y: e.pos.y, amount: attacker.damage * 0.6, player: attacker.player });
        }
      }
    }
    if (targetUnit.hp <= 0) {
      targetUnit.alive = false;
      world.events.push({ kind: "death", unitId: targetUnit.id, player: targetUnit.player });
    }
    return;
  }
  if (targetTower && targetTower.hp > 0) {
    targetTower.hp -= attacker.damage;
    world.events.push({
      kind: "tower-damaged",
      towerId: targetTower.id,
      player: targetTower.player,
      amount: attacker.damage,
    });
    if (targetTower.hp <= 0) onTowerDestroyed(world, targetTower);
  }
}

function updateTower(world: World, t: Tower, dt: number): void {
  const enemyPlayer: PlayerId = t.player === 0 ? 1 : 0;
  let target: Unit | null = null;
  let best = Infinity;
  for (const u of world.units) {
    if (u.player !== enemyPlayer || !u.alive) continue;
    const d = dist(t.pos, u.pos);
    if (d <= t.range && d < best) {
      best = d;
      target = u;
    }
  }
  if (!target) return;
  t.attackTimer -= dt;
  if (t.attackTimer <= 0) {
    t.attackTimer = t.attackCooldown;
    target.hp -= t.damage;
    world.events.push({ kind: "hit", x: target.pos.x, y: target.pos.y, amount: t.damage, player: t.player });
    if (target.hp <= 0) {
      target.alive = false;
      world.events.push({ kind: "death", unitId: target.id, player: target.player });
    }
  }
}

function onTowerDestroyed(world: World, t: Tower): void {
  world.events.push({ kind: "tower-destroyed", towerId: t.id, player: t.player });
  const scorer: PlayerId = t.player === 0 ? 1 : 0;
  const gained = t.isKing ? 3 : 1;
  world.players[scorer].crowns = Math.min(3, world.players[scorer].crowns + gained);
  world.events.push({ kind: "crown", player: scorer, total: world.players[scorer].crowns });
  finish(world);
}

function finish(world: World): void {
  if (world.finished) return;
  world.finished = true;
  const c0 = world.players[0].crowns;
  const c1 = world.players[1].crowns;
  world.winner = c0 === c1 ? null : c0 > c1 ? 0 : 1;
  world.events.push({ kind: "finish", winner: world.winner });
}

// ---------------------------------------------------------------------------
// Estado serializable (para comparaciones / tests de determinismo)
// ---------------------------------------------------------------------------

export function hashWorld(world: World): string {
  const parts: string[] = [world.tick.toFixed(0), world.elapsed.toFixed(3)];
  for (const t of world.towers) parts.push(`T${t.id}:${t.hp.toFixed(2)}`);
  for (const p of world.players) parts.push(`E${p.elixir.toFixed(3)}:${p.crowns}`);
  for (const u of world.units) {
    parts.push(`U${u.id}:${u.pos.x.toFixed(3)},${u.pos.y.toFixed(3)},${u.hp.toFixed(2)}`);
  }
  return parts.join("|");
}
