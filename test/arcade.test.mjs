import assert from "node:assert/strict";
import test from "node:test";

import {
  CHALLENGES,
  MODE_CONFIG,
  buildRound,
  calculateScore,
} from "../site/game-data.js";

test("cada desafio possui id único, quatro alternativas e resposta válida", () => {
  const ids = new Set();

  for (const challenge of CHALLENGES) {
    assert.equal(ids.has(challenge.id), false, `id duplicado: ${challenge.id}`);
    ids.add(challenge.id);
    assert.equal(challenge.choices.length, 4, challenge.id);
    assert.ok(challenge.answer >= 0 && challenge.answer < challenge.choices.length);
    assert.ok(MODE_CONFIG[challenge.mode], challenge.mode);
    assert.ok(challenge.explanation.length >= 40, challenge.id);
  }
});

test("modos especializados retornam apenas desafios da própria arena", () => {
  for (const mode of ["bug-hunt", "output-quest", "sql-arena"]) {
    const round = buildRound(mode, () => 0.5);
    assert.equal(round.length, MODE_CONFIG[mode].size);
    assert.ok(round.every((challenge) => challenge.mode === mode));
  }
});

test("mixed run combina seis desafios sem repetir id", () => {
  const round = buildRound("mixed", () => 0.42);
  assert.equal(round.length, 6);
  assert.equal(new Set(round.map(({ id }) => id)).size, 6);
});

test("pontuação recompensa tempo e sequência somente quando há acerto", () => {
  assert.equal(
    calculateScore({ correct: false, remainingSeconds: 20, streak: 8 }),
    0,
  );
  assert.equal(
    calculateScore({ correct: true, remainingSeconds: 10, streak: 1 }),
    150,
  );
  assert.equal(
    calculateScore({ correct: true, remainingSeconds: 10, streak: 3 }),
    200,
  );
});
