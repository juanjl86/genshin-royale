// Tipos del dominio de simulación. Compartidos por cliente y (a futuro) servidor.

export type PlayerId = 0 | 1;

export type UnitRole = "melee" | "ranged" | "tank" | "healer" | "swarm" | "splash";

export interface CardDef {
  id: string;
  name: string;
  role: UnitRole;
  cost: number;
  icon: string; // emoji placeholder en Fase 1
  // stats de combate
  hp: number;
  damage: number;
  range: number; // en celdas
  speed: number; // celdas por segundo
  attackCooldown: number; // segundos entre ataques
  hitSpeed: number;
  count: number; // unidades por carta (swarm > 1)
  splashRadius?: number; // para splash
  healAmount?: number; // para healer
  targetBuildingsOnly?: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Unit {
  id: number;
  player: PlayerId;
  cardId: string;
  role: UnitRole;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  range: number;
  damage: number;
  attackTimer: number;
  attackCooldown: number;
  splashRadius: number;
  healAmount: number;
  targetBuildingsOnly: boolean;
  alive: boolean;
}

export interface Tower {
  id: number;
  player: PlayerId;
  kind: "princess" | "king";
  pos: Vec2;
  hp: number;
  maxHp: number;
  range: number;
  damage: number;
  attackCooldown: number;
  attackTimer: number;
  isKing: boolean;
}

export interface PlayerState {
  elixir: number;
  crowns: number;
}

export interface World {
  tick: number;
  tickRate: number; // Hz
  elapsed: number; // segundos
  duration: number; // segundos
  overtime: number; // segundos de prórroga restantes
  doubleElixirAt: number; // segundo en el que empieza el doble elixir
  units: Unit[];
  towers: Tower[];
  players: [PlayerState, PlayerState];
  nextUnitId: number;
  winner: PlayerId | null;
  finished: boolean;
  events: SimEvent[];
}

export type SimEvent =
  | { kind: "spawn"; unitId: number; cardId: string; player: PlayerId }
  | { kind: "death"; unitId: number; player: PlayerId }
  | { kind: "tower-damaged"; towerId: number; player: PlayerId; amount: number }
  | { kind: "tower-destroyed"; towerId: number; player: PlayerId }
  | { kind: "crown"; player: PlayerId; total: number }
  | { kind: "finish"; winner: PlayerId | null };

export type Command =
  | { t: "spawn"; player: PlayerId; cardId: string; x: number; y: number; tick: number }
  | { t: "spell"; player: PlayerId; cardId: string; x: number; y: number; tick: number }
  | { t: "surrender"; player: PlayerId; tick: number };
