import assert from "node:assert/strict";
import test from "node:test";
import { InputSchema, ResultadoSchema } from "../src/lib/kiah-triagem.server.ts";

const owner = "8b02ee3d-c093-428d-a6cb-63b212f5a908";
test("triage requires a resolved owner and limits input", () => {
  assert.equal(InputSchema.safeParse({ texto: "Comprar café" }).success, false);
  assert.equal(InputSchema.safeParse({ user_id: owner, texto: "x".repeat(100001) }).success, false);
  assert.equal(InputSchema.safeParse({ user_id: owner, texto: "Comprar café" }).success, true);
});
test("model output must contain valid actionable records", () => {
  const valid = {
    ruido: false,
    raciocinio_curto: "Pedido explícito",
    tarefas: [
      {
        tipo: "tarefa_rotina",
        descricao_limpa: "Preparar material",
        prazo_iso: "2026-10-05T09:00:00-03:00",
      },
    ],
    itens_compra: [],
  };
  assert.equal(ResultadoSchema.safeParse(valid).success, true);
  for (const change of [{ prazo_iso: "sexta" }, { descricao_limpa: " " }, { tipo: "inventado" }]) {
    assert.equal(
      ResultadoSchema.safeParse({ ...valid, tarefas: [{ ...valid.tarefas[0], ...change }] })
        .success,
      false,
    );
  }
  assert.equal(
    ResultadoSchema.safeParse({
      ...valid,
      itens_compra: [{ descricao: "Café", categoria: "inventada" }],
    }).success,
    false,
  );
});
