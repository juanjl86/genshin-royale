import { runDeterminismTest } from "./ai.ts";

const r = runDeterminismTest();
console.log(r.ok ? "✔ determinismo OK" : "✘ determinismo FALLÓ");
console.log(r.detail);
if (!r.ok) throw new Error("determinismo roto");
