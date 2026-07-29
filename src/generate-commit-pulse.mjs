import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { escapeXml } from "./generate-profile.mjs";

const API_BASE_URL = "https://api.github.com";
const DEFAULT_USERNAME = "Luskahz";
const DEFAULT_OUTPUT_PATH = path.resolve("assets/commit-pulse.svg");
const TIME_ZONE = "America/Sao_Paulo";
const WINDOW_DAYS = 365;
const DAY_IN_MILLISECONDS = 86_400_000;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 1_000;

const MONTH_LABELS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

const LEVEL_COLORS = [
  "#0A1822",
  "#0E5265",
  "#087F91",
  "#0EA5B7",
  "#22D3EE",
];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function civilDateToEpochDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error(`Data civil inválida: ${value}`);
  }

  const [, year, month, day] = match;
  return Math.floor(
    Date.UTC(Number(year), Number(month) - 1, Number(day)) /
      DAY_IN_MILLISECONDS,
  );
}

function epochDayToCivilDate(epochDay) {
  return new Date(epochDay * DAY_IN_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

function getCivilDateInTimeZone(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function formatShortDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();
}

function getWindow(now = new Date(), timeZone = TIME_ZONE) {
  const endDate = getCivilDateInTimeZone(now, timeZone);
  const endDay = civilDateToEpochDay(endDate);
  const startDay = endDay - (WINDOW_DAYS - 1);

  return {
    startDay,
    endDay,
    startDate: epochDayToCivilDate(startDay),
    endDate,
  };
}

function getCommitDate(commit, timeZone = TIME_ZONE) {
  if (commit.date && /^\d{4}-\d{2}-\d{2}$/.test(commit.date)) {
    return commit.date;
  }

  const timestamp =
    commit.commit?.committer?.date ??
    commit.commit?.author?.date ??
    commit.committedAt;

  if (!timestamp) {
    return null;
  }

  return getCivilDateInTimeZone(new Date(timestamp), timeZone);
}

function normalizeCommits(commits, timeZone) {
  const uniqueCommits = new Map();

  for (const [index, commit] of commits.entries()) {
    const date = getCommitDate(commit, timeZone);
    const sha = commit.sha ?? `${date ?? "unknown"}:${index}`;

    if (date && !uniqueCommits.has(sha)) {
      uniqueCommits.set(sha, { sha, date });
    }
  }

  return [...uniqueCommits.values()];
}

function calculateCurrentStreak(days) {
  let index = days.length - 1;

  // Não zera a sequência durante a manhã antes do primeiro commit do dia.
  if (days[index]?.count === 0) {
    index -= 1;
  }

  let streak = 0;
  while (index >= 0 && days[index].count > 0) {
    streak += 1;
    index -= 1;
  }

  return streak;
}

function calculateLongestStreak(days) {
  let longest = 0;
  let current = 0;

  for (const day of days) {
    if (day.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

function getLevel(count, maximum) {
  if (count <= 0 || maximum <= 0) {
    return 0;
  }

  const normalized = Math.log1p(count) / Math.log1p(maximum);
  return clamp(Math.ceil(normalized * 4), 1, 4);
}

export function summarizeCommitPulse({
  commits,
  now = new Date(),
  timeZone = TIME_ZONE,
  username = DEFAULT_USERNAME,
}) {
  const window = getWindow(now, timeZone);
  const countsByDate = new Map();

  for (const { date } of normalizeCommits(commits, timeZone)) {
    const day = civilDateToEpochDay(date);
    if (day >= window.startDay && day <= window.endDay) {
      countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
    }
  }

  const days = Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const date = epochDayToCivilDate(window.startDay + index);
    return {
      date,
      count: countsByDate.get(date) ?? 0,
    };
  });

  const totalCommits = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter(({ count }) => count > 0).length;
  const peakDay = days.reduce(
    (peak, day) => (day.count > peak.count ? day : peak),
    days[0],
  );
  const maximum = peakDay.count;
  const gridStartDay =
    window.startDay -
    new Date(window.startDay * DAY_IN_MILLISECONDS).getUTCDay();

  const cells = Array.from({ length: 53 * 7 }, (_, index) => {
    const epochDay = gridStartDay + index;
    const date = epochDayToCivilDate(epochDay);
    const inRange = epochDay >= window.startDay && epochDay <= window.endDay;
    const count = inRange ? (countsByDate.get(date) ?? 0) : 0;

    return {
      date,
      count,
      inRange,
      level: inRange ? getLevel(count, maximum) : -1,
    };
  });

  const weeks = Array.from({ length: 53 }, (_, weekIndex) =>
    cells.slice(weekIndex * 7, weekIndex * 7 + 7),
  );
  const monthLabels = [];

  for (const [weekIndex, week] of weeks.entries()) {
    const firstVisibleDay = week.find(({ inRange }) => inRange);
    const firstDayOfMonth = week.find(
      ({ date, inRange }) => inRange && date.endsWith("-01"),
    );
    const labelDay =
      firstDayOfMonth ?? (weekIndex === 0 ? firstVisibleDay : null);

    if (labelDay) {
      const monthIndex = Number(labelDay.date.slice(5, 7)) - 1;
      monthLabels.push({
        weekIndex,
        label: MONTH_LABELS[monthIndex],
      });
    }
  }

  const weeklyTotals = weeks.map((week) =>
    week.reduce((sum, day) => sum + day.count, 0),
  );

  return {
    username,
    ...window,
    days,
    weeks,
    monthLabels,
    totalCommits,
    activeDays,
    currentStreak: calculateCurrentStreak(days),
    longestStreak: calculateLongestStreak(days),
    averagePerActiveDay:
      activeDays === 0 ? 0 : totalCommits / activeDays,
    peakDay,
    maximum,
    weeklyTotals,
    updatedAt: new Date(now).toISOString(),
  };
}

function renderHeatmap(summary) {
  const gridX = 90;
  const gridY = 142;
  const cellSize = 11;
  const columnGap = 3;
  const rowGap = 8;
  const columnPitch = cellSize + columnGap;
  const rowPitch = cellSize + rowGap;

  return summary.weeks
    .flatMap((week, weekIndex) =>
      week.map((day, weekday) => {
        const x = gridX + weekIndex * columnPitch;
        const y = gridY + weekday * rowPitch;
        const fill =
          day.level < 0 ? "#07111A" : LEVEL_COLORS[day.level];
        const stroke =
          day.level <= 0 ? "#18303D" : LEVEL_COLORS[day.level];
        const opacity = day.inRange ? 1 : 0.32;
        const glow = day.level === 4 ? ' filter="url(#cellGlow)"' : "";
        const label = `${day.date}: ${day.count} ${
          day.count === 1 ? "commit público" : "commits públicos"
        }`;

        return `<rect data-day="${day.date}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width=".8" opacity="${opacity}"${glow}><title>${escapeXml(label)}</title></rect>`;
      }),
    )
    .join("\n      ");
}

function renderMonthLabels(summary) {
  const gridX = 90;
  const columnPitch = 14;

  return summary.monthLabels
    .map(
      ({ weekIndex, label }) =>
        `<text x="${gridX + weekIndex * columnPitch}" y="119" class="month">${label}</text>`,
    )
    .join("\n      ");
}

function renderWeeklyPulse(summary) {
  const values = summary.weeklyTotals.slice(-12);
  const x = 914;
  const y = 294;
  const width = 218;
  const height = 34;
  const maximum = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => ({
    x: x + index * step,
    y: y + height - (value / maximum) * height,
  }));
  const line = points
    .map(({ x: pointX, y: pointY }, index) =>
      `${index === 0 ? "M" : "L"}${pointX.toFixed(1)} ${pointY.toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${(x + width).toFixed(1)} ${(y + height).toFixed(1)} L${x} ${(y + height).toFixed(1)} Z`;

  return `
      <path d="${area}" fill="url(#pulseArea)" />
      <path d="${line}" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${points
        .map(
          ({ x: pointX, y: pointY }) =>
            `<circle cx="${pointX.toFixed(1)}" cy="${pointY.toFixed(1)}" r="2.2" fill="#34D399" />`,
        )
        .join("\n      ")}`;
}

function renderLegend() {
  return LEVEL_COLORS.map(
    (color, index) =>
      `<rect x="${650 + index * 19}" y="319" width="11" height="11" rx="3" fill="${color}" stroke="${index === 0 ? "#18303D" : color}" />`,
  ).join("\n      ");
}

export function renderCommitPulse(summary) {
  const heatmap = renderHeatmap(summary);
  const months = renderMonthLabels(summary);
  const weeklyPulse = renderWeeklyPulse(summary);
  const legend = renderLegend();
  const totalLabel = summary.totalCommits.toLocaleString("pt-BR");
  const averageLabel = summary.averagePerActiveDay
    .toFixed(1)
    .replace(".", ",");
  const peakDateLabel =
    summary.peakDay.count > 0
      ? formatShortDate(summary.peakDay.date)
      : "SEM DADOS";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="390" viewBox="0 0 1200 390" role="img" aria-labelledby="title description">
  <title id="title">Pulso de commits públicos de ${escapeXml(summary.username)}</title>
  <desc id="description">${totalLabel} commits públicos distribuídos por dia nos últimos 365 dias.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050B12" />
      <stop offset="1" stop-color="#07151E" />
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08141D" />
      <stop offset="1" stop-color="#091923" />
    </linearGradient>
    <linearGradient id="pulseArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22D3EE" stop-opacity=".30" />
      <stop offset="1" stop-color="#22D3EE" stop-opacity="0" />
    </linearGradient>
    <pattern id="gridPattern" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#38BDF8" stroke-opacity=".035" />
    </pattern>
    <filter id="cellGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="2.4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <style>
      text { font-style: normal; }
      .eyebrow, .metric, .metric-small, .month, .weekday, .legend, .footer {
        font-family: "DejaVu Sans Mono", "Courier New", monospace;
      }
      .title, .label, .caption {
        font-family: "DejaVu Sans", Arial, sans-serif;
      }
      .eyebrow { fill: #22D3EE; font-size: 12px; font-weight: 700; letter-spacing: 2.4px; }
      .title { fill: #F8FAFC; font-size: 21px; font-weight: 700; }
      .month { fill: #64748B; font-size: 9px; font-weight: 700; letter-spacing: .5px; }
      .weekday { fill: #526476; font-size: 9px; font-weight: 700; }
      .metric { fill: #F8FAFC; font-size: 40px; font-weight: 700; }
      .metric-small { fill: #E2E8F0; font-size: 18px; font-weight: 700; }
      .label { fill: #64748B; font-size: 10px; font-weight: 700; letter-spacing: .8px; }
      .caption { fill: #94A3B8; font-size: 10px; font-weight: 500; }
      .legend { fill: #526476; font-size: 9px; font-weight: 700; }
      .footer { fill: #526476; font-size: 10px; font-weight: 500; }
    </style>
  </defs>

  <rect width="1200" height="390" rx="18" fill="url(#background)" />
  <rect width="1200" height="390" rx="18" fill="url(#gridPattern)" />
  <rect x="1" y="1" width="1198" height="388" rx="17" fill="none" stroke="#1E3A4A" stroke-width="2" />

  <text x="40" y="31" class="eyebrow">~/COMMIT-PULSE --365D</text>
  <text x="40" y="59" class="title">Ritmo de código, dia por dia</text>
  <circle cx="1143" cy="37" r="5" fill="#34D399">
    <animate attributeName="opacity" values="1;.35;1" dur="2.2s" repeatCount="indefinite" />
  </circle>
  <text x="1128" y="41" text-anchor="end" class="footer">PUBLIC SIGNAL</text>

  <rect x="40" y="84" width="824" height="260" rx="12" fill="url(#panel)" stroke="#1E3A4A" />
  ${months}
  <text x="58" y="173" class="weekday">SEG</text>
  <text x="58" y="211" class="weekday">QUA</text>
  <text x="58" y="249" class="weekday">SEX</text>
  <g>
      ${heatmap}
  </g>
  <rect x="90" y="138" width="1" height="145" rx=".5" fill="#7DD3FC" opacity=".55">
    <animate attributeName="x" values="90;829;90" dur="11s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0;.55;0" dur="11s" repeatCount="indefinite" />
  </rect>

  <text x="90" y="329" class="footer">${escapeXml(formatShortDate(summary.startDate))} → ${escapeXml(formatShortDate(summary.endDate))}</text>
  <text x="617" y="329" class="legend">MENOS</text>
  ${legend}
  <text x="750" y="329" class="legend">MAIS</text>

  <rect x="884" y="84" width="276" height="260" rx="12" fill="url(#panel)" stroke="#1E3A4A" />
  <text x="910" y="111" class="label">COMMITS PÚBLICOS</text>
  <text x="910" y="153" class="metric">${escapeXml(totalLabel)}</text>
  <text x="910" y="172" class="caption">${summary.activeDays} dias ativos · média ${escapeXml(averageLabel)} por dia ativo</text>
  <path d="M910 188H1134" stroke="#1E3A4A" />

  <text x="910" y="211" class="label">SEQUÊNCIA ATUAL</text>
  <text x="910" y="237" class="metric-small">${summary.currentStreak} DIAS</text>
  <text x="1040" y="211" class="label">RECORDE</text>
  <text x="1040" y="237" class="metric-small">${summary.longestStreak} DIAS</text>

  <text x="910" y="267" class="label">PICO</text>
  <text x="910" y="286" class="caption">${summary.peakDay.count} commits · ${escapeXml(peakDateLabel)}</text>
  <text x="1134" y="267" text-anchor="end" class="label">PULSO · 12 SEMANAS</text>
  ${weeklyPulse}

  <text x="40" y="375" class="footer">GitHub Commit Search · author + committer-date · somente atividade pública</text>
  <text x="1160" y="375" text-anchor="end" class="footer">Atualizado em ${escapeXml(formatShortDate(summary.endDate))}</text>
</svg>
`;
}

async function githubRequest(pathname, token) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Luskahz-commit-pulse",
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

function buildSearchPath(username, startDate, endDate, page) {
  const query = `author:${username} committer-date:${startDate}..${endDate}`;
  const parameters = new URLSearchParams({
    q: query,
    sort: "committer-date",
    order: "asc",
    per_page: String(SEARCH_PAGE_SIZE),
    page: String(page),
  });

  return `/search/commits?${parameters}`;
}

async function fetchCommitRange({
  username,
  token,
  startDay,
  endDay,
}) {
  const startDate = epochDayToCivilDate(startDay);
  const endDate = epochDayToCivilDate(endDay);
  const firstPage = await githubRequest(
    buildSearchPath(username, startDate, endDate, 1),
    token,
  );

  if (firstPage.total_count > SEARCH_RESULT_LIMIT && startDay < endDay) {
    const middleDay = Math.floor((startDay + endDay) / 2);
    const firstHalf = await fetchCommitRange({
      username,
      token,
      startDay,
      endDay: middleDay,
    });
    const secondHalf = await fetchCommitRange({
      username,
      token,
      startDay: middleDay + 1,
      endDay,
    });

    return {
      commits: [...firstHalf.commits, ...secondHalf.commits],
      incomplete: firstHalf.incomplete || secondHalf.incomplete,
      truncated: firstHalf.truncated || secondHalf.truncated,
    };
  }

  const commits = [...firstPage.items];
  const pageCount = Math.min(
    Math.ceil(firstPage.total_count / SEARCH_PAGE_SIZE),
    SEARCH_RESULT_LIMIT / SEARCH_PAGE_SIZE,
  );

  for (let page = 2; page <= pageCount; page += 1) {
    const result = await githubRequest(
      buildSearchPath(username, startDate, endDate, page),
      token,
    );
    commits.push(...result.items);
  }

  return {
    commits,
    incomplete: firstPage.incomplete_results,
    truncated:
      firstPage.total_count > SEARCH_RESULT_LIMIT && startDay === endDay,
  };
}

export async function fetchRecentCommits({
  username = DEFAULT_USERNAME,
  token,
  now = new Date(),
  timeZone = TIME_ZONE,
} = {}) {
  const window = getWindow(now, timeZone);
  const result = await fetchCommitRange({
    username,
    token,
    startDay: window.startDay,
    endDay: window.endDay,
  });

  if (result.incomplete || result.truncated) {
    throw new Error(
      "A busca de commits retornou dados incompletos; o SVG anterior foi preservado.",
    );
  }

  return result.commits;
}

export async function generateCommitPulse({
  username = process.env.GITHUB_USERNAME ?? DEFAULT_USERNAME,
  token = process.env.GITHUB_TOKEN,
  outputPath = DEFAULT_OUTPUT_PATH,
  now = new Date(),
} = {}) {
  const commits = await fetchRecentCommits({ username, token, now });
  const summary = summarizeCommitPulse({ commits, now, username });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderCommitPulse(summary), "utf8");

  return summary;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  generateCommitPulse()
    .then((summary) => {
      console.log(
        `Commit Pulse gerado: ${summary.totalCommits} commits públicos em ${summary.activeDays} dias ativos.`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
