# Genshin-Royale — Design Doc (1 página)

Tower-defense de cartas en tiempo real, 1v1, inspirado en Clash Royale pero con
personajes estilo Genshin Impact. **Código y arte propios** — no se usa ningún
asset ni binario de Supercell ni de HoYoverse.

## Partida

- Duración: **180 s** (3 min), prórroga 60 s si hay empate a coronas.
- **Doble elixir** en el último minuto.
- Gana quien tenga más coronas: 1 por torre de princesa, 3 por torre del rey.

## Arena (Fase 1 — 1 carril)

- Rejilla lógica de referencia: **18 columnas × 32 filas** (vertical, móvil).
- Fase 1: un solo carril central. El río divide en y=16.
- Torres por lado: 1 princesa (Fase 1) → 2 princesas + 1 rey (Fase 2+).

## Elixir

- Máximo 10, empieza en 5.
- Regeneración normal: 1 cada 2.8 s.
- Regeneración doble: 1 cada 1.4 s (últimos 60 s).

## Tipos de unidad

| Rol      | HP   | Daño | Rango | Velocidad | Elixir | Notas                      |
|----------|------|------|-------|-----------|--------|----------------------------|
| Melee    | alto | alto | corto | media     | 4      | golpea cuerpo a cuerpo     |
| Ranged   | bajo | med  | largo | media     | 3      | ataca a distancia          |
| Tanque   | muy  | bajo | corto | lenta     | 5      | absorbe daño               |
| Healer   | med  | 0    | corto | media     | 3      | cura aliados cercanos      |
| Swarm    | bajo | bajo | corto | rápida    | 2      | varias unidades por carta  |
| Splash   | med  | alto | med   | media     | 4      | daño en área               |

## Deck inicial (8 cartas placeholder para Fase 1)

1. **Paimon** — swarm (2 elixir)
2. **Amber** — ranged barato (3)
3. **Kaeya** — melee (4)
4. **Fischl** — ranged (3)
5. **Noelle** — tanque (5)
6. **Barbara** — healer (3)
7. **Xiangling** — splash (4)
8. **Razor** — melee rápido (4)

## Contrato de simulación

Tick fijo a **20 Hz** (50 ms). La simulación es **determinista y headless**:
mismo estado inicial + misma secuencia de comandos ⇒ mismo resultado.

```ts
type Command =
  | { t: "spawn"; player: 0 | 1; cardId: string; x: number; y: number; tick: number }
  | { t: "spell"; player: 0 | 1; cardId: string; x: number; y: number; tick: number }
  | { t: "surrender"; player: 0 | 1; tick: number };
```

## Alcance por fase

- **Fase 1 (este entregable):** 1 carril, 1 torre por lado, 8 cartas, vs IA simple,
  victoria por 1 corona. Sin servidor.
- **Fase 2:** 2 carriles + rey, sprites Genshin reales, balance.
- **Fase 3:** Capacitor → APK/AAB.
- **Fase 4:** servidor autoritativo reutilizando `src/sim/` tal cual.
