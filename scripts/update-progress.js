import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TIME_ZONE = "America/Sao_Paulo";
const COURSE_START_DATE = "2024-06-30";
const GRADUATION_DATE = "2026-12-30";
const BAR_WIDTH = 308;
const DAY_IN_MILLISECONDS = 86_400_000;
const SVG_FILE_URL = new URL("../assets/hero.svg", import.meta.url);

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

export function calculateCourseProgress({
  currentDate,
  startDate = COURSE_START_DATE,
  graduationDate = GRADUATION_DATE,
} = {}) {
  const resolvedCurrentDate =
    currentDate ?? getCivilDateInTimeZone(new Date());
  const startDay = civilDateToEpochDay(startDate);
  const graduationDay = civilDateToEpochDay(graduationDate);
  const currentDay = civilDateToEpochDay(resolvedCurrentDate);
  const totalDays = graduationDay - startDay;

  if (totalDays <= 0) {
    throw new Error("A data de formação deve ser posterior à data inicial.");
  }

  const elapsedDays = clamp(currentDay - startDay, 0, totalDays);
  const remainingDays = clamp(graduationDay - currentDay, 0, totalDays);
  const ratio = elapsedDays / totalDays;

  return {
    currentDate: resolvedCurrentDate,
    totalDays,
    elapsedDays,
    remainingDays,
    percentage: ratio * 100,
    barWidth: BAR_WIDTH * ratio,
  };
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Marcador obrigatório não encontrado: ${label}`);
  }

  return source.replace(pattern, replacement);
}

export function renderCourseProgress(svg, progress) {
  const daysLabel =
    progress.remainingDays === 1
      ? "1 DAY LEFT"
      : `${progress.remainingDays} DAYS LEFT`;
  const percentageLabel = `${progress.percentage.toFixed(1)}% COMPLETE`;
  const barWidth = progress.barWidth.toFixed(2);

  let updatedSvg = replaceRequired(
    svg,
    /<!-- ADS_DAYS -->[\s\S]*?<!-- \/ADS_DAYS -->/,
    `<!-- ADS_DAYS -->
      <text x="346" y="234" text-anchor="end" fill="#94A3B8" font-size="10">${daysLabel}</text>
      <!-- /ADS_DAYS -->`,
    "ADS_DAYS",
  );

  updatedSvg = replaceRequired(
    updatedSvg,
    /<!-- ADS_PERCENT -->[\s\S]*?<!-- \/ADS_PERCENT -->/,
    `<!-- ADS_PERCENT -->
      <text x="346" y="264" text-anchor="end" fill="#64748B" font-size="9">${percentageLabel}</text>
      <!-- /ADS_PERCENT -->`,
    "ADS_PERCENT",
  );

  return replaceRequired(
    updatedSvg,
    /(<rect id="adsProgress"[^>]*\bwidth=")[^"]+("[^>]*\/>)/,
    `$1${barWidth}$2`,
    "adsProgress",
  );
}

export async function updateCourseProgress({
  now = new Date(),
  svgFileUrl = SVG_FILE_URL,
} = {}) {
  const currentDate = getCivilDateInTimeZone(now);
  const progress = calculateCourseProgress({ currentDate });
  const currentSvg = await readFile(svgFileUrl, "utf8");
  const updatedSvg = renderCourseProgress(currentSvg, progress);

  if (updatedSvg !== currentSvg) {
    await writeFile(svgFileUrl, updatedSvg, "utf8");
  }

  return {
    ...progress,
    changed: updatedSvg !== currentSvg,
    file: path.relative(process.cwd(), fileURLToPath(svgFileUrl)),
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  updateCourseProgress()
    .then(({ file, remainingDays, percentage, barWidth, changed }) => {
      console.log(
        `${file}: ${remainingDays} dias restantes, ${percentage.toFixed(1)}% concluído, barra ${barWidth.toFixed(2)}px${changed ? "" : " (sem mudança)"}.`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
