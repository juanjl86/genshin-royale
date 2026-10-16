import type { Command, PlayerId, World } from "../data/types.ts";
import { CARDS, CARD_BY_ID } from "../data/cards.ts";
import type { Viewport } from "../render/renderer.ts";
import { cellToPx, pxToCell } from "../render/renderer.ts";

export interface InputState {
  selectedCardId: string | null;
}

export function createInputState(): InputState {
  return { selectedCardId: null };
}

export function bindBoard(
  canvas: HTMLCanvasElement,
  getVp: () => Viewport,
  getWorld: () => World,
  input: InputState,
  onCommand: (cmd: Command) => void,
  refreshDeck: () => void,
): void {
  canvas.addEventListener("pointerdown", (ev) => {
    const world = getWorld();
    if (world.finished) return;
    if (!input.selectedCardId) return;

    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const { x, y } = pxToCell(getVp(), px, py);

    const cmd: Command = {
      t: "spawn",
      player: 1 as PlayerId,
      cardId: input.selectedCardId,
      x,
      y,
      tick: world.tick,
    };
    onCommand(cmd);
    input.selectedCardId = null;
    refreshDeck();
  });
}

// ---------------------------------------------------------------------------
// Deck UI
// ---------------------------------------------------------------------------

export function renderDeck(
  el: HTMLElement,
  input: InputState,
  getWorld: () => World,
  refreshDeck: () => void,
): void {
  el.innerHTML = "";
  const world = getWorld();
  const elixir = world.players[1].elixir;

  for (const card of CARDS) {
    const btn = document.createElement("button");
    btn.className = "card";
    const affordable = card.cost <= elixir + 1e-6 && !world.finished;
    if (!affordable) btn.classList.add("disabled");
    if (input.selectedCardId === card.id) btn.classList.add("selected");

    btn.innerHTML = `
      <span class="cost">${card.cost}</span>
      <span class="icon"><img src="./sprites/${card.id}_128.png" alt="${card.name}" /></span>
      <span class="name">${card.name}</span>
      <span class="role">${card.role}</span>
    `;

    btn.addEventListener("click", () => {
      if (getWorld().finished) return;
      const w = getWorld();
      if (card.cost > w.players[1].elixir + 1e-6) return;
      input.selectedCardId = input.selectedCardId === card.id ? null : card.id;
      refreshDeck();
    });

    el.appendChild(btn);
  }
}

// Utilidad para depurar desde consola
export const _DEBUG = { CARDS, CARD_BY_ID, cellToPx, pxToCell };
