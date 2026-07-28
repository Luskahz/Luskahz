import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE_URL = "https://api.github.com";
const DEFAULT_USERNAME = "Luskahz";
const OUTPUT_PATH = path.resolve("assets/github-overview.svg");
const ACTIVE_WINDOW_DAYS = 180;
const REQUEST_CONCURRENCY = 6;

const LANGUAGE_COLORS = {
  C: "#A8B9CC",
  CSS: "#A855F7",
  HTML: "#F97316",
  Java: "#F89820",
  JavaScript: "#F7DF1E",
  Kotlin: "#A97BFF",
  PHP: "#777BB4",
  Python: "#3776AB",
  Shell: "#89E051",
  TypeScript: "#3178C6",
};

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asCompactNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUpdateDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function normalizeLanguages(languageTotals) {
  const totalBytes = Object.values(languageTotals).reduce((sum, value) => sum + value, 0);

  if (totalBytes === 0) {
    return [{ name: "Dados em atualização", bytes: 1, percentage: 100, color: "#64748B" }];
  }

  const sorted = Object.entries(languageTotals)
    .sort(([, firstBytes], [, secondBytes]) => secondBytes - firstBytes)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: (bytes / totalBytes) * 100,
      color: LANGUAGE_COLORS[name] ?? "#8BE9FD",
    }));

  const visible = sorted.slice(0, 5);
  const remaining = sorted.slice(5);

  if (remaining.length > 0) {
    const bytes = remaining.reduce((sum, language) => sum + language.bytes, 0);
    visible.push({
      name: "Outras",
      bytes,
      percentage: (bytes / totalBytes) * 100,
      color: "#64748B",
    });
  }

  return visible;
}

export function summarizeProfile({
  user,
  repositories,
  languagesByRepository,
  now = new Date(),
}) {
  const maintainedRepositories = repositories.filter(
    (repository) => !repository.fork && !repository.archived && !repository.disabled,
  );
  const activeAfter = new Date(now);
  activeAfter.setUTCDate(activeAfter.getUTCDate() - ACTIVE_WINDOW_DAYS);

  const languageTotals = {};
  for (const repository of maintainedRepositories) {
    const languages = languagesByRepository.get(repository.full_name) ?? {};
    for (const [language, bytes] of Object.entries(languages)) {
      languageTotals[language] = (languageTotals[language] ?? 0) + bytes;
    }
  }

  return {
    username: user.login,
    publicRepositories: user.public_repos,
    maintainedProjects: maintainedRepositories.length,
    activeProjects: maintainedRepositories.filter(
      (repository) => new Date(repository.pushed_at) >= activeAfter,
    ).length,
    followers: user.followers,
    stars: maintainedRepositories.reduce(
      (sum, repository) => sum + repository.stargazers_count,
      0,
    ),
    languages: normalizeLanguages(languageTotals),
    updatedAt: now.toISOString(),
  };
}

function metricCard({ x, value, label, accent }) {
  return `
    <g transform="translate(${x} 78)">
      <rect width="248" height="108" rx="16" fill="#0B1324" stroke="#24324A" />
      <rect width="4" height="108" rx="2" fill="${accent}" />
      <text x="26" y="52" class="metric">${escapeXml(value)}</text>
      <text x="26" y="80" class="metric-label">${escapeXml(label)}</text>
    </g>`;
}

function renderLanguageBar(languages) {
  const barX = 48;
  const barWidth = 1104;
  let cursor = barX;

  const segments = languages
    .map((language, index) => {
      const width =
        index === languages.length - 1
          ? barX + barWidth - cursor
          : Math.max((language.percentage / 100) * barWidth, 2);
      const segment = `<rect x="${cursor.toFixed(2)}" y="248" width="${width.toFixed(2)}" height="14" fill="${language.color}" />`;
      cursor += width;
      return segment;
    })
    .join("");

  const legend = languages
    .map((language, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 48 + column * 368;
      const y = 300 + row * 34;
      return `
        <g transform="translate(${x} ${y})">
          <circle cx="6" cy="-5" r="6" fill="${language.color}" />
          <text x="20" class="language">${escapeXml(language.name)}</text>
          <text x="170" class="percentage">${language.percentage.toFixed(1).replace(".", ",")}%</text>
        </g>`;
    })
    .join("");

  return `
    <clipPath id="languageBarClip">
      <rect x="${barX}" y="248" width="${barWidth}" height="14" rx="7" />
    </clipPath>
    <g clip-path="url(#languageBarClip)">${segments}</g>
    ${legend}`;
}

export function renderOverviewSvg(summary) {
  const metricCards = [
    {
      value: asCompactNumber(summary.publicRepositories),
      label: "repositórios públicos",
      accent: "#22D3EE",
    },
    {
      value: asCompactNumber(summary.activeProjects),
      label: "ativos nos últimos 180 dias",
      accent: "#34D399",
    },
    {
      value: asCompactNumber(summary.stars),
      label: "estrelas recebidas",
      accent: "#FBBF24",
    },
    {
      value: asCompactNumber(summary.followers),
      label: "pessoas acompanhando",
      accent: "#A78BFA",
    },
  ]
    .map((metric, index) => metricCard({ ...metric, x: 48 + index * 276 }))
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="390" viewBox="0 0 1200 390" role="img" aria-labelledby="title description">
  <title id="title">GitHub de ${escapeXml(summary.username)} em números</title>
  <desc id="description">Métricas de repositórios públicos, atividade, estrelas, seguidores e linguagens utilizadas.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070B16" />
      <stop offset="1" stop-color="#10142A" />
    </linearGradient>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0H0V30" fill="none" stroke="#94A3B8" stroke-opacity=".045" />
    </pattern>
    <style>
      .eyebrow { fill: #8BE9FD; font: 700 13px ui-sans-serif, system-ui, sans-serif; letter-spacing: 2.8px; }
      .title { fill: #F8FAFC; font: 700 23px ui-sans-serif, system-ui, sans-serif; }
      .metric { fill: #F8FAFC; font: 750 34px ui-sans-serif, system-ui, sans-serif; }
      .metric-label { fill: #94A3B8; font: 500 13px ui-sans-serif, system-ui, sans-serif; }
      .section { fill: #CBD5E1; font: 650 14px ui-sans-serif, system-ui, sans-serif; }
      .language { fill: #CBD5E1; font: 600 13px ui-sans-serif, system-ui, sans-serif; }
      .percentage { fill: #64748B; font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-anchor: end; }
      .footer { fill: #64748B; font: 500 11px ui-sans-serif, system-ui, sans-serif; }
    </style>
  </defs>

  <rect width="1200" height="390" rx="24" fill="url(#background)" />
  <rect width="1200" height="390" rx="24" fill="url(#grid)" />
  <rect x=".75" y=".75" width="1198.5" height="388.5" rx="23.25" fill="none" stroke="#334155" stroke-width="1.5" />

  <text x="48" y="39" class="eyebrow">GITHUB / VISÃO GERAL</text>
  <text x="48" y="65" class="title">Projetos públicos de @${escapeXml(summary.username)}</text>
  <circle cx="1138" cy="43" r="7" fill="#34D399" />
  <text x="1122" y="47" class="footer" text-anchor="end">ATUALIZAÇÃO AUTOMÁTICA</text>

  ${metricCards}

  <text x="48" y="226" class="section">Linguagens nos projetos autorais e ativos</text>
  ${renderLanguageBar(summary.languages)}

  <text x="48" y="370" class="footer">Fonte: GitHub REST API · forks e repositórios arquivados não entram na análise de linguagens</text>
  <text x="1152" y="370" class="footer" text-anchor="end">Atualizado em ${escapeXml(formatUpdateDate(summary.updatedAt))}</text>
</svg>
`;
}

async function githubRequest(pathname, token) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Luskahz-profile-engine",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function fetchRepositories(username, token) {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const currentPage = await githubRequest(
      `/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
      token,
    );
    repositories.push(...currentPage);

    if (currentPage.length < 100) {
      return repositories;
    }
  }
}

async function fetchLanguages(repositories, token) {
  const languagesByRepository = new Map();

  for (let start = 0; start < repositories.length; start += REQUEST_CONCURRENCY) {
    const batch = repositories.slice(start, start + REQUEST_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (repository) => ({
        name: repository.full_name,
        languages: await githubRequest(
          `/repos/${repository.full_name}/languages`,
          token,
        ),
      })),
    );

    for (const result of results) {
      languagesByRepository.set(result.name, result.languages);
    }
  }

  return languagesByRepository;
}

export async function generateProfile({
  username = process.env.GITHUB_USERNAME ?? DEFAULT_USERNAME,
  token = process.env.GITHUB_TOKEN,
  outputPath = OUTPUT_PATH,
} = {}) {
  const user = await githubRequest(`/users/${encodeURIComponent(username)}`, token);
  const repositories = await fetchRepositories(username, token);
  const eligibleRepositories = repositories.filter(
    (repository) => !repository.fork && !repository.archived && !repository.disabled,
  );
  const languagesByRepository = await fetchLanguages(eligibleRepositories, token);
  const summary = summarizeProfile({
    user,
    repositories,
    languagesByRepository,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderOverviewSvg(summary), "utf8");

  return summary;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  generateProfile()
    .then((summary) => {
      console.log(
        `Painel gerado para @${summary.username}: ${summary.publicRepositories} repositórios públicos.`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
