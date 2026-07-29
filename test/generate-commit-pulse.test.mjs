import assert from "node:assert/strict";
import test from "node:test";

import {
  renderCommitPulse,
  summarizeCommitPulse,
} from "../src/generate-commit-pulse.mjs";

const NOW = new Date("2026-07-28T15:00:00-03:00");

test("summarizeCommitPulse agrupa commits por dia e remove SHAs duplicados", () => {
  const summary = summarizeCommitPulse({
    now: NOW,
    commits: [
      { sha: "a", date: "2026-07-28" },
      { sha: "b", date: "2026-07-28" },
      { sha: "c", date: "2026-07-27" },
      { sha: "d", date: "2026-07-26" },
      { sha: "e", date: "2026-07-24" },
      { sha: "a", date: "2026-07-28" },
      { sha: "old", date: "2025-01-01" },
    ],
  });

  assert.equal(summary.startDate, "2025-07-29");
  assert.equal(summary.endDate, "2026-07-28");
  assert.equal(summary.totalCommits, 5);
  assert.equal(summary.activeDays, 4);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.longestStreak, 3);
  assert.deepEqual(summary.peakDay, {
    date: "2026-07-28",
    count: 2,
  });
  assert.equal(summary.weeks.length, 53);
  assert.ok(summary.weeks.every((week) => week.length === 7));
});

test("summarizeCommitPulse converte timestamps para o dia de São Paulo", () => {
  const summary = summarizeCommitPulse({
    now: NOW,
    commits: [
      {
        sha: "timezone",
        commit: {
          committer: {
            date: "2026-07-29T01:30:00Z",
          },
        },
      },
    ],
  });

  assert.equal(summary.totalCommits, 1);
  assert.equal(summary.peakDay.date, "2026-07-28");
});

test("sequência atual tolera somente o dia corrente ainda sem commit", () => {
  const summary = summarizeCommitPulse({
    now: NOW,
    commits: [
      { sha: "a", date: "2026-07-27" },
      { sha: "b", date: "2026-07-26" },
      { sha: "c", date: "2026-07-25" },
    ],
  });

  assert.equal(summary.currentStreak, 3);
});

test("renderCommitPulse produz SVG acessível com 53 semanas", () => {
  const summary = summarizeCommitPulse({
    now: NOW,
    username: "Luskahz",
    commits: [
      { sha: "a", date: "2026-07-28" },
      { sha: "b", date: "2026-07-27" },
    ],
  });
  const svg = renderCommitPulse(summary);
  const cells = svg.match(/data-day=/g) ?? [];

  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-labelledby="title description"/);
  assert.match(svg, /COMMITS PÚBLICOS/);
  assert.match(svg, /GitHub Commit Search/);
  assert.match(svg, /2 commits públicos distribuídos por dia/);
  assert.equal(cells.length, 53 * 7);
  assert.match(svg, /<\/svg>\s*$/);
});
