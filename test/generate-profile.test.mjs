import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeXml,
  renderOverviewSvg,
  summarizeProfile,
} from "../src/generate-profile.mjs";

test("escapeXml protege o conteúdo inserido no SVG", () => {
  assert.equal(
    escapeXml('<script data-value="a&b">'),
    "&lt;script data-value=&quot;a&amp;b&quot;&gt;",
  );
});

test("summarizeProfile ignora forks e repositórios arquivados nas métricas autorais", () => {
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
    now: new Date("2026-07-27T12:00:00Z"),
  });

  assert.equal(result.maintainedProjects, 1);
  assert.equal(result.activeProjects, 1);
  assert.equal(result.stars, 4);
  assert.deepEqual(
    result.languages.map(({ name, percentage }) => [name, percentage]),
    [
      ["Java", 90],
      ["TypeScript", 10],
    ],
  );
});

test("renderOverviewSvg produz um SVG acessível com as métricas calculadas", () => {
  const svg = renderOverviewSvg({
    username: "Luskahz",
    publicRepositories: 29,
    maintainedProjects: 20,
    activeProjects: 8,
    stars: 11,
    followers: 7,
    languages: [
      { name: "Java", percentage: 60, color: "#F89820" },
      { name: "TypeScript", percentage: 40, color: "#3178C6" },
    ],
    updatedAt: "2026-07-27T12:00:00Z",
  });

  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-labelledby="title description"/);
  assert.match(svg, /29/);
  assert.match(svg, /Java/);
  assert.match(svg, /60,0%/);
  assert.match(svg, /<\/svg>\s*$/);
});
