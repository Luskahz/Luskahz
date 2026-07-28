import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE_URL = "https://api.github.com";
const DEFAULT_USERNAME = "Luskahz";
const OUTPUT_PATH = path.resolve("assets/activity-dashboard.svg");
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

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const formatted = value / 1024 ** index;

  return `${formatted.toLocaleString("pt-BR", {
    maximumFractionDigits: index === 0 ? 0 : 1,
  })} ${units[index]}`;
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
      color: LANGUAGE_COLORS[name] ?? "#38BDF8",
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
  indexedActivity,
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
    activeProjects: maintainedRepositories.filter(
      (repository) => new Date(repository.pushed_at) >= activeAfter,
    ).length,
    followers: user.followers,
    stars: maintainedRepositories.reduce(
      (sum, repository) => sum + repository.stargazers_count,
      0,
    ),
    codeBytes: Object.values(languageTotals).reduce((sum, bytes) => sum + bytes, 0),
    languages: normalizeLanguages(languageTotals),
    indexedCommits: indexedActivity.indexedCommits,
    authoredPullRequests: indexedActivity.authoredPullRequests,
    reviewedPullRequests: indexedActivity.reviewedPullRequests,
    annualCommits: indexedActivity.annualCommits,
    updatedAt: now.toISOString(),
  };
}

function metricCard({ x, value, label, accent }) {
  return `
    <g transform="translate(${x} 78)">
      <rect width="248" height="104" rx="10" fill="#09151F" stroke="#1E3A4A" />
      <rect width="4" height="104" rx="2" fill="${accent}" />
      <text x="24" y="51" class="metric">${escapeXml(value)}</text>
      <text x="24" y="78" class="metric-label">${escapeXml(label)}</text>
    </g>`;
}

function renderCommitHistory(annualCommits) {
  const chartX = 48;
  const chartWidth = 590;
  const baseline = 375;
  const maxHeight = 108;
  const maximum = Math.max(...annualCommits.map(({ count }) => count), 1);
  const slotWidth = chartWidth / Math.max(annualCommits.length, 1);
  const barWidth = Math.min(116, slotWidth * 0.56);

  return annualCommits
    .map(({ year, count }, index) => {
      const height = Math.max((count / maximum) * maxHeight, count > 0 ? 5 : 0);
      const x = chartX + index * slotWidth + (slotWidth - barWidth) / 2;
      const y = baseline - height;

      return `
        <g>
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="5" fill="#0E7490" />
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="4" rx="2" fill="#22D3EE" />
          <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" class="chart-value">${count}</text>
          <text x="${(x + barWidth / 2).toFixed(1)}" y="398" text-anchor="middle" class="chart-label">${year}</text>
        </g>`;
    })
    .join("");
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
      const segment = `<rect x="${cursor.toFixed(2)}" y="448" width="${width.toFixed(2)}" height="13" fill="${language.color}" />`;
      cursor += width;
      return segment;
    })
    .join("");

  const legend = languages
    .map((language, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 48 + column * 368;
      const y = 492 + row * 28;

      return `
        <g transform="translate(${x} ${y})">
          <circle cx="6" cy="-4" r="5" fill="${language.color}" />
          <text x="19" class="language">${escapeXml(language.name)}</text>
          <text x="172" class="percentage">${language.percentage.toFixed(1).replace(".", ",")}%</text>
        </g>`;
    })
    .join("");

  return `
    <clipPath id="languageBarClip">
      <rect x="${barX}" y="448" width="${barWidth}" height="13" rx="6.5" />
    </clipPath>
    <g clip-path="url(#languageBarClip)">${segments}</g>
    ${legend}`;
}

export function renderActivityDashboard(summary) {
  const cards = [
    {
      value: summary.indexedCommits.toLocaleString("pt-BR"),
      label: "commits públicos indexados",
      accent: "#22D3EE",
    },
    {
      value: summary.authoredPullRequests.toLocaleString("pt-BR"),
      label: "pull requests criadas",
      accent: "#34D399",
    },
    {
      value: summary.reviewedPullRequests.toLocaleString("pt-BR"),
      label: "pull requests revisadas",
      accent: "#A78BFA",
    },
    {
      value: summary.publicRepositories.toLocaleString("pt-BR"),
      label: "repositórios públicos",
      accent: "#FBBF24",
    },
  ]
    .map((metric, index) => metricCard({ ...metric, x: 48 + index * 276 }))
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="548" viewBox="0 0 1200 548" role="img" aria-labelledby="title description">
  <title id="title">Atividade pública de ${escapeXml(summary.username)} no GitHub</title>
  <desc id="description">Commits, pull requests, revisões, repositórios, evolução anual e linguagens dos projetos públicos.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050B12" />
      <stop offset="1" stop-color="#09131E" />
    </linearGradient>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="#38BDF8" stroke-opacity=".045" />
    </pattern>
    <style>
      text { font-style: normal; }
      .eyebrow, .metric, .section, .chart-value, .chart-label, .percentage, .big {
        font-family: "DejaVu Sans Mono", "Courier New", monospace;
      }
      .title, .metric-label, .language, .footer, .small {
        font-family: "DejaVu Sans", Arial, sans-serif;
      }
      .eyebrow { fill: #22D3EE; font-size: 12px; font-weight: 700; letter-spacing: 2.4px; }
      .title { fill: #F8FAFC; font-size: 21px; font-weight: 700; }
      .metric { fill: #F8FAFC; font-size: 32px; font-weight: 700; }
      .metric-label { fill: #94A3B8; font-size: 12px; font-weight: 500; }
      .section { fill: #CBD5E1; font-size: 13px; font-weight: 700; letter-spacing: .6px; }
      .chart-value { fill: #E2E8F0; font-size: 13px; font-weight: 700; }
      .chart-label { fill: #64748B; font-size: 12px; font-weight: 600; }
      .language { fill: #CBD5E1; font-size: 12px; font-weight: 600; }
      .percentage { fill: #64748B; font-size: 11px; font-weight: 600; text-anchor: end; }
      .footer { fill: #526476; font-size: 10px; font-weight: 500; }
      .big { fill: #F8FAFC; font-size: 28px; font-weight: 700; }
      .small { fill: #94A3B8; font-size: 12px; font-weight: 500; }
    </style>
  </defs>

  <rect width="1200" height="548" rx="18" fill="url(#background)" />
  <rect width="1200" height="548" rx="18" fill="url(#grid)" />
  <rect x="1" y="1" width="1198" height="546" rx="17" fill="none" stroke="#1E3A4A" stroke-width="2" />

  <text x="48" y="31" class="eyebrow">~/ACTIVITY --PUBLIC</text>
  <text x="48" y="58" class="title">O que o GitHub consegue provar — sem contar atividade privada</text>
  <circle cx="1140" cy="39" r="5" fill="#34D399" />
  <text x="1126" y="43" text-anchor="end" class="footer">LIVE DATA</text>

  ${cards}

  <text x="48" y="223" class="section">COMMITS POR ANO</text>
  <path d="M48 375H638" stroke="#1E3A4A" />
  ${renderCommitHistory(summary.annualCommits)}

  <g transform="translate(690 214)">
    <rect width="462" height="190" rx="11" fill="#08141D" stroke="#1E3A4A" />
    <text x="24" y="32" class="section">CODE FOOTPRINT</text>
    <text x="24" y="78" class="big">${escapeXml(formatBytes(summary.codeBytes))}</text>
    <text x="24" y="102" class="small">volume atual detectado por linguagens</text>
    <path d="M24 122H438" stroke="#1E3A4A" />
    <text x="24" y="151" class="big">${summary.activeProjects}</text>
    <text x="72" y="148" class="small">projetos ativos / 180 dias</text>
    <text x="275" y="151" class="big">${summary.stars}</text>
    <text x="310" y="148" class="small">estrelas</text>
    <text x="24" y="178" class="footer">bytes de linguagem ≠ linhas autorais</text>
  </g>

  <text x="48" y="430" class="section">LINGUAGENS NOS REPOSITÓRIOS AUTORAIS ATUAIS</text>
  ${renderLanguageBar(summary.languages)}

  <text x="48" y="536" class="footer">GitHub Search + REST API · forks e repositórios arquivados não entram no volume de código</text>
  <text x="1152" y="536" text-anchor="end" class="footer">Atualizado em ${escapeXml(formatUpdateDate(summary.updatedAt))}</text>
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
        languages: await githubRequest(`/repos/${repository.full_name}/languages`, token),
      })),
    );

    for (const result of results) {
      languagesByRepository.set(result.name, result.languages);
    }
  }

  return languagesByRepository;
}

async function searchCount(endpoint, query, token) {
  const result = await githubRequest(
    `/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=1`,
    token,
  );
  return result.total_count;
}

async function fetchIndexedActivity(username, token, accountCreatedAt, now = new Date()) {
  const indexedCommits = await searchCount("commits", `author:${username}`, token);
  const authoredPullRequests = await searchCount(
    "issues",
    `author:${username} type:pr`,
    token,
  );
  const reviewedPullRequests = await searchCount(
    "issues",
    `reviewed-by:${username} type:pr`,
    token,
  );

  const createdYear = new Date(accountCreatedAt).getUTCFullYear();
  const currentYear = now.getUTCFullYear();
  const firstVisibleYear = Math.max(createdYear, currentYear - 3);
  const annualCommits = [];

  for (let year = firstVisibleYear; year <= currentYear; year += 1) {
    const count = await searchCount(
      "commits",
      `author:${username} committer-date:${year}-01-01..${year}-12-31`,
      token,
    );
    annualCommits.push({ year, count });
  }

  return {
    indexedCommits,
    authoredPullRequests,
    reviewedPullRequests,
    annualCommits,
  };
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
  const indexedActivity = await fetchIndexedActivity(
    username,
    token,
    user.created_at,
  );
  const summary = summarizeProfile({
    user,
    repositories,
    languagesByRepository,
    indexedActivity,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderActivityDashboard(summary), "utf8");

  return summary;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  generateProfile()
    .then((summary) => {
      console.log(
        `Painel gerado: ${summary.indexedCommits} commits e ${summary.authoredPullRequests} PRs públicas.`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
