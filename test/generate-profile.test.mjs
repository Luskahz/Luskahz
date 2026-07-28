import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeXml,
  formatBytes,
  renderActivityDashboard,
  summarizeProfile,
} from "../src/generate-profile.mjs";

test("escapeXml protege conteúdo inserido no SVG", () => {
  assert.equal(
    escapeXml('<script data-value="a&b">'),
    "&lt;script data-value=&quot;a&amp;b&quot;&gt;",
  );
});

test("formatBytes apresenta o volume sem fingir que bytes são linhas", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1_572_864), "1,5 MB");
});

test("summarizeProfile ignora forks e arquivados no volume autoral", () => {
  const repositories = [
    {
      full_name: "Luskahz/api",
      fork: false,
      archived: false,
      disabled: false,
      pushed_at: "2026-07-20T00:00:00Z",
      stargazers_count: 4,
    },
    {
      full_name: "Luskahz/old",
      fork: false,
      archived: true,
      disabled: false,
      pushed_at: "2026-07-20T00:00:00Z",
      stargazers_count: 100,
    },
    {
      full_name: "Luskahz/fork",
      fork: true,
      archived: false,
      disabled: false,
      pushed_at: "2026-07-20T00:00:00Z",
      stargazers_count: 50,
    },
  ];
  const languagesByRepository = new Map([
    ["Luskahz/api", { Java: 900, TypeScript: 100 }],
    ["Luskahz/old", { PHP: 10_000 }],
  ]);

  const result = summarizeProfile({
    user: { login: "Luskahz", public_repos: 3, followers: 7 },
    repositories,
    languagesByRepository,
    indexedActivity: {
      indexedCommits: 798,
      authoredPullRequests: 58,
      reviewedPullRequests: 12,
      annualCommits: [
        { year: 2024, count: 21 },
        { year: 2025, count: 338 },
        { year: 2026, count: 439 },
      ],
    },
    now: new Date("2026-07-28T12:00:00Z"),
  });

  assert.equal(result.activeProjects, 1);
  assert.equal(result.stars, 4);
  assert.equal(result.codeBytes, 1000);
  assert.equal(result.indexedCommits, 798);
  assert.deepEqual(
    result.languages.map(({ name, percentage }) => [name, percentage]),
    [
      ["Java", 90],
      ["TypeScript", 10],
    ],
  );
});

test("renderActivityDashboard produz SVG acessível com escopo explícito", () => {
  const svg = renderActivityDashboard({
    username: "Luskahz",
    publicRepositories: 29,
    activeProjects: 13,
    stars: 9,
    followers: 7,
    codeBytes: 1_572_864,
    indexedCommits: 798,
    authoredPullRequests: 58,
    reviewedPullRequests: 12,
    annualCommits: [
      { year: 2024, count: 21 },
      { year: 2025, count: 338 },
      { year: 2026, count: 439 },
    ],
    languages: [
      { name: "Java", percentage: 60, color: "#F89820" },
      { name: "TypeScript", percentage: 40, color: "#3178C6" },
    ],
    updatedAt: "2026-07-28T12:00:00Z",
  });

  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-labelledby="title description"/);
  assert.match(svg, /798/);
  assert.match(svg, /pull requests criadas/);
  assert.match(svg, /1,5 MB/);
  assert.match(svg, /bytes de linguagem ≠ linhas autorais/);
  assert.match(svg, /<\/svg>\s*$/);
});
