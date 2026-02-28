const fileInput = document.getElementById("fileInput");
const replaceFileInput = document.getElementById("replaceFileInput");
const uploadMessage = document.getElementById("uploadMessage");
const uploadPanel = document.getElementById("uploadPanel");
const dashboard = document.getElementById("dashboard");
const loadedFileName = document.getElementById("loadedFileName");
const themeToggle = document.getElementById("themeToggle");
const tabOverviewBtn = document.getElementById("tabOverviewBtn");
const tabCliBtn = document.getElementById("tabCliBtn");
const overviewTabPanel = document.getElementById("overviewTabPanel");
const trendsTabPanel = document.getElementById("trendsTabPanel");
const cliTabPanel = document.getElementById("cliTabPanel");

const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const minReviewedInput = document.getElementById("minReviewed");

const kpiElements = {
  intensityReview: {
    block: document.getElementById("kpiIntensityReview"),
    copilot: document.getElementById("intensityReviewShareCopilot"),
    human: document.getElementById("intensityReviewShareHuman"),
    delta: document.getElementById("intensityReviewShareDelta"),
  },
  intensityAuthored: {
    block: document.getElementById("kpiIntensityAuthored"),
    copilot: document.getElementById("intensityAuthoredShareCopilot"),
    human: document.getElementById("intensityAuthoredShareHuman"),
    delta: document.getElementById("intensityAuthoredShareDelta"),
  },
  effSuggestion: {
    block: document.getElementById("kpiEffSuggestion"),
    copilot: document.getElementById("effSuggestionAcceptanceCopilot"),
    human: document.getElementById("effSuggestionAcceptanceHuman"),
    delta: document.getElementById("effSuggestionAcceptanceDelta"),
  },
  effMergeSuccess: {
    block: document.getElementById("kpiEffMergeSuccess"),
    copilot: document.getElementById("effMergeSuccessCopilot"),
    human: document.getElementById("effMergeSuccessHuman"),
    delta: document.getElementById("effMergeSuccessDelta"),
  },
  mergeLeadTime: {
    block: document.getElementById("kpiMergeLeadTime"),
    copilot: document.getElementById("mergeLeadTimeCopilot"),
    human: document.getElementById("mergeLeadTimeHuman"),
    delta: document.getElementById("mergeLeadTimeDelta"),
  },
};

const cliKpiElements = {
  dailyActiveUsers: document.getElementById("cliDailyActiveUsersValue"),
  sessionCount: document.getElementById("cliSessionCountValue"),
  requestCount: document.getElementById("cliRequestCountValue"),
  avgTokensPerRequest: document.getElementById("cliAvgTokensPerRequestValue"),
};

const chartElements = {
  review: document.getElementById("chartReview"),
  throughput: document.getElementById("chartThroughput"),
  suggestions: document.getElementById("chartSuggestions"),
  merge: document.getElementById("chartMerge"),
  intensityTrend: document.getElementById("chartIntensityTrend"),
  efficiencyTrend: document.getElementById("chartEfficiencyTrend"),
  cumulativeTrend: document.getElementById("chartCumulativeTrend"),
  cliUsers: document.getElementById("chartCliUsers"),
  cliActivity: document.getElementById("chartCliActivity"),
  cliTokens: document.getElementById("chartCliTokens"),
};

const state = {
  rows: [],
  filteredRows: [],
  chartInstances: [],
};

const THEME_STORAGE_KEY = "copilot-pr-theme";

fileInput?.addEventListener("change", handleFileSelection);
replaceFileInput?.addEventListener("change", handleFileSelection);
tabOverviewBtn?.addEventListener("click", () => setActiveTab("pr"));
tabCliBtn?.addEventListener("click", () => setActiveTab("cli"));
themeToggle?.addEventListener("click", toggleTheme);

initializeTheme();

[startDateInput, endDateInput, minReviewedInput].forEach((el) => {
  el?.addEventListener("input", applyFiltersAndRender);
  el?.addEventListener("change", applyFiltersAndRender);
});

async function handleFileSelection(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  uploadMessage.textContent = "Parsing uploaded JSON...";

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const reports = normalizeReports(payload);
    const rows = buildPrTimeseries(reports);

    if (!rows.length) {
      throw new Error("No pull request data found in uploaded file.");
    }

    state.rows = rows;
    setupDateFilters(rows);

    loadedFileName.textContent = file.name;
    uploadPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
    setActiveTab("pr");

    uploadMessage.textContent = "";
    applyFiltersAndRender();
  } catch (error) {
    uploadMessage.textContent = error instanceof Error ? error.message : "Failed to parse file.";
  } finally {
    event.target.value = "";
  }
}

function setActiveTab(tabName) {
  const isPr = tabName === "pr";
  const isCli = tabName === "cli";
  tabOverviewBtn.classList.toggle("active", isPr);
  tabCliBtn.classList.toggle("active", isCli);
  overviewTabPanel.classList.toggle("hidden", !isPr);
  trendsTabPanel.classList.toggle("hidden", !isPr);
  cliTabPanel.classList.toggle("hidden", !isCli);
}

function initializeTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const initialTheme = stored === "light" || stored === "dark" ? stored : "dark";
  setTheme(initialTheme, false);
}

function setTheme(theme, persist = true) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", normalizedTheme);

  if (themeToggle) {
    const nextTheme = normalizedTheme === "dark" ? "light" : "dark";
    themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    themeToggle.setAttribute("title", `Switch to ${nextTheme} theme`);
  }

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  }

  if (state.filteredRows.length) {
    renderCharts(state.filteredRows);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

function normalizeReports(payload) {
  if (payload && typeof payload === "object" && Array.isArray(payload.reports)) {
    return payload.reports;
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.day_totals)) {
    return [payload];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  throw new Error(
    "Unsupported JSON shape. Expected either { reports: [...] }, a single report with day_totals, or an array of reports."
  );
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function mergeCliTotals(target, value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      mergeCliTotals(target, item);
    }
    return;
  }

  if (hasOwn(value, "session_count") || hasOwn(value, "request_count") || hasOwn(value, "token_usage")) {
    target.session_count += toNumber(value.session_count);
    target.request_count += toNumber(value.request_count);
    target.prompt_tokens_sum += toNumber(value?.token_usage?.prompt_tokens_sum);
    target.output_tokens_sum += toNumber(value?.token_usage?.output_tokens_sum);
    return;
  }

  for (const nested of Object.values(value)) {
    mergeCliTotals(target, nested);
  }
}

function extractCliTotals(dayTotal) {
  const totals = {
    session_count: 0,
    request_count: 0,
    prompt_tokens_sum: 0,
    output_tokens_sum: 0,
  };
  mergeCliTotals(totals, dayTotal?.totals_by_cli);
  return totals;
}

function buildPrTimeseries(reports) {
  const byDay = {};

  for (const report of reports) {
    const dayTotals = Array.isArray(report?.day_totals) ? report.day_totals : [];

    for (const dayTotal of dayTotals) {
      const day = dayTotal?.day;
      if (!day) {
        continue;
      }

      const pullRequests = dayTotal?.pull_requests || {};

      if (!byDay[day]) {
        byDay[day] = {
          total_reviewed: 0,
          total_reviewed_by_copilot: 0,
          total_created: 0,
          total_created_by_copilot: 0,
          total_merged: 0,
          total_merged_created_by_copilot: 0,
          total_suggestions: 0,
          total_applied_suggestions: 0,
          total_copilot_suggestions: 0,
          total_copilot_applied_suggestions: 0,
          median_minutes_to_merge_weighted_sum: 0,
          median_minutes_to_merge_count: 0,
          median_minutes_to_merge_copilot_authored_weighted_sum: 0,
          median_minutes_to_merge_copilot_authored_count: 0,
          daily_active_users: 0,
          daily_active_cli_users: 0,
          cli_session_count: 0,
          cli_request_count: 0,
          cli_prompt_tokens_sum: 0,
          cli_output_tokens_sum: 0,
          has_full_detail: false,
        };
      }

      const entry = byDay[day];
      const cliTotals = extractCliTotals(dayTotal);

      entry.total_reviewed += toNumber(pullRequests.total_reviewed);
      entry.total_reviewed_by_copilot += toNumber(pullRequests.total_reviewed_by_copilot);
      entry.total_created += toNumber(pullRequests.total_created);
      entry.total_created_by_copilot += toNumber(pullRequests.total_created_by_copilot);
      entry.total_merged += toNumber(pullRequests.total_merged);
      entry.total_merged_created_by_copilot += toNumber(pullRequests.total_merged_created_by_copilot);
      entry.total_suggestions += toNumber(pullRequests.total_suggestions);
      entry.total_applied_suggestions += toNumber(pullRequests.total_applied_suggestions);
      entry.total_copilot_suggestions += toNumber(pullRequests.total_copilot_suggestions);
      entry.total_copilot_applied_suggestions += toNumber(pullRequests.total_copilot_applied_suggestions);
      entry.daily_active_users += toNumber(dayTotal.daily_active_users);
      entry.daily_active_cli_users += toNumber(dayTotal.daily_active_cli_users);
      entry.cli_session_count += cliTotals.session_count;
      entry.cli_request_count += cliTotals.request_count;
      entry.cli_prompt_tokens_sum += cliTotals.prompt_tokens_sum;
      entry.cli_output_tokens_sum += cliTotals.output_tokens_sum;

      const mergeCount = toNumber(pullRequests.total_merged);
      const medianMinutes = pullRequests.median_minutes_to_merge;
      if (medianMinutes !== null && medianMinutes !== undefined && mergeCount > 0) {
        entry.median_minutes_to_merge_weighted_sum += toNumber(medianMinutes) * mergeCount;
        entry.median_minutes_to_merge_count += mergeCount;
      }

      const copilotMergeCount = toNumber(pullRequests.total_merged_created_by_copilot);
      const medianMinutesCopilot = pullRequests.median_minutes_to_merge_copilot_authored;
      if (medianMinutesCopilot !== null && medianMinutesCopilot !== undefined && copilotMergeCount > 0) {
        entry.median_minutes_to_merge_copilot_authored_weighted_sum +=
          toNumber(medianMinutesCopilot) * copilotMergeCount;
        entry.median_minutes_to_merge_copilot_authored_count += copilotMergeCount;
      }

      const fullDetailFields = [
        "total_merged",
        "total_merged_created_by_copilot",
        "total_suggestions",
        "total_applied_suggestions",
        "total_copilot_suggestions",
        "total_copilot_applied_suggestions",
        "median_minutes_to_merge",
        "median_minutes_to_merge_copilot_authored",
      ];

      const hasAllFullDetailFields = fullDetailFields.every((field) => hasOwn(pullRequests, field));
      entry.has_full_detail = entry.has_full_detail || hasAllFullDetailFields;
    }
  }

  return Object.keys(byDay)
    .sort()
    .map((day) => {
      const entry = byDay[day];
      return {
        day,
        total_reviewed: entry.total_reviewed,
        total_reviewed_by_copilot: entry.total_reviewed_by_copilot,
        total_created: entry.total_created,
        total_created_by_copilot: entry.total_created_by_copilot,
        total_merged: entry.total_merged,
        total_merged_created_by_copilot: entry.total_merged_created_by_copilot,
        total_suggestions: entry.total_suggestions,
        total_applied_suggestions: entry.total_applied_suggestions,
        total_copilot_suggestions: entry.total_copilot_suggestions,
        total_copilot_applied_suggestions: entry.total_copilot_applied_suggestions,
        daily_active_users: entry.daily_active_users,
        daily_active_cli_users: entry.daily_active_cli_users,
        cli_session_count: entry.cli_session_count,
        cli_request_count: entry.cli_request_count,
        cli_prompt_tokens_sum: entry.cli_prompt_tokens_sum,
        cli_output_tokens_sum: entry.cli_output_tokens_sum,
        median_minutes_to_merge:
          entry.median_minutes_to_merge_count > 0
            ? entry.median_minutes_to_merge_weighted_sum / entry.median_minutes_to_merge_count
            : 0,
        median_minutes_to_merge_copilot_authored:
          entry.median_minutes_to_merge_copilot_authored_count > 0
            ? entry.median_minutes_to_merge_copilot_authored_weighted_sum /
              entry.median_minutes_to_merge_copilot_authored_count
            : 0,
        has_full_detail: entry.has_full_detail,
      };
    });
}

function setupDateFilters(rows) {
  const firstDay = rows[0]?.day;
  const lastDay = rows[rows.length - 1]?.day;

  startDateInput.min = firstDay;
  startDateInput.max = lastDay;
  endDateInput.min = firstDay;
  endDateInput.max = lastDay;

  startDateInput.value = firstDay;
  endDateInput.value = lastDay;
  minReviewedInput.value = "0";
}

function applyFiltersAndRender() {
  if (!state.rows.length) {
    return;
  }

  const startDay = startDateInput.value;
  const endDay = endDateInput.value;
  const minReviewed = Math.max(0, parseInt(minReviewedInput.value || "0", 10) || 0);

  state.filteredRows = state.rows.filter((row) => {
    if (startDay && row.day < startDay) {
      return false;
    }
    if (endDay && row.day > endDay) {
      return false;
    }
    if (row.total_reviewed < minReviewed) {
      return false;
    }
    return true;
  });

  renderTiles(state.filteredRows);
  renderCliTiles(state.filteredRows);
  renderCharts(state.filteredRows);
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return null;
  }
  return numerator / denominator;
}

function formatPercent(value) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMinutes(value) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} min`;
}

function formatCount(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatDelta(copilotValue, humanValue) {
  if (copilotValue === null || humanValue === null || Number.isNaN(copilotValue) || Number.isNaN(humanValue)) {
    return "—";
  }

  const diffPp = (copilotValue - humanValue) * 100;
  if (Math.abs(diffPp) < 0.05) {
    return "≈ same as human";
  }

  const symbol = diffPp > 0 ? "▲" : "▼";
  const sign = diffPp > 0 ? "+" : "";
  return `${symbol} ${sign}${diffPp.toFixed(1)}pp vs human`;
}

function formatDurationDelta(copilotValue, humanValue) {
  if (copilotValue === null || humanValue === null || Number.isNaN(copilotValue) || Number.isNaN(humanValue)) {
    return "—";
  }

  const diffMin = copilotValue - humanValue;
  if (Math.abs(diffMin) < 0.05) {
    return "≈ same as human";
  }

  const symbol = diffMin < 0 ? "▲" : "▼";
  const sign = diffMin > 0 ? "+" : "";
  return `${symbol} ${sign}${diffMin.toFixed(1)} min vs human`;
}

function applyKpiState(block, copilotValue, humanValue) {
  block.classList.remove("kpi-above", "kpi-below", "kpi-equal");

  if (copilotValue === null || humanValue === null || Number.isNaN(copilotValue) || Number.isNaN(humanValue)) {
    return;
  }

  const diff = copilotValue - humanValue;
  if (Math.abs(diff) < 0.0005) {
    block.classList.add("kpi-equal");
    return;
  }

  block.classList.add(diff > 0 ? "kpi-above" : "kpi-below");
}

function applyDurationKpiState(block, copilotValue, humanValue) {
  block.classList.remove("kpi-above", "kpi-below", "kpi-equal");

  if (copilotValue === null || humanValue === null || Number.isNaN(copilotValue) || Number.isNaN(humanValue)) {
    return;
  }

  const diff = copilotValue - humanValue;
  if (Math.abs(diff) < 0.05) {
    block.classList.add("kpi-equal");
    return;
  }

  block.classList.add(diff < 0 ? "kpi-above" : "kpi-below");
}

function renderComparedKpi(elements, copilotValue, humanValue, copilotLabel = "Copilot") {
  elements.copilot.textContent = `${copilotLabel} ${formatPercent(copilotValue)}`;
  elements.human.textContent = formatPercent(humanValue);
  elements.delta.textContent = formatDelta(copilotValue, humanValue);
  applyKpiState(elements.block, copilotValue, humanValue);
}

function renderComparedDurationKpi(elements, copilotValue, humanValue, copilotLabel = "Copilot") {
  elements.copilot.textContent = `${copilotLabel} ${formatMinutes(copilotValue)}`;
  elements.human.textContent = formatMinutes(humanValue);
  elements.delta.textContent = formatDurationDelta(copilotValue, humanValue);
  applyDurationKpiState(elements.block, copilotValue, humanValue);
}

function renderTiles(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalReviewed += row.total_reviewed;
      acc.totalReviewedByCopilot += row.total_reviewed_by_copilot;
      acc.totalCreated += row.total_created;
      acc.totalCreatedByCopilot += row.total_created_by_copilot;
      acc.totalMerged += row.total_merged;
      acc.overallMergeMedianWeightedSum += row.median_minutes_to_merge * row.total_merged;
      acc.totalSuggestions += row.total_suggestions;
      acc.totalCopilotSuggestions += row.total_copilot_suggestions;
      acc.totalCopilotApplied += row.total_copilot_applied_suggestions;
      acc.totalMergedByCopilot += row.total_merged_created_by_copilot;
      acc.copilotMergeMedianWeightedSum +=
        row.median_minutes_to_merge_copilot_authored * row.total_merged_created_by_copilot;
      acc.totalApplied += row.total_applied_suggestions;
      return acc;
    },
    {
      totalReviewed: 0,
      totalReviewedByCopilot: 0,
      totalCreated: 0,
      totalCreatedByCopilot: 0,
      totalMerged: 0,
      overallMergeMedianWeightedSum: 0,
      totalSuggestions: 0,
      totalCopilotSuggestions: 0,
      totalCopilotApplied: 0,
      totalMergedByCopilot: 0,
      copilotMergeMedianWeightedSum: 0,
      totalApplied: 0,
    }
  );

  const totalReviewedHuman = Math.max(totals.totalReviewed - totals.totalReviewedByCopilot, 0);
  const totalCreatedHuman = Math.max(totals.totalCreated - totals.totalCreatedByCopilot, 0);
  const totalSuggestionsHuman = Math.max(totals.totalSuggestions - totals.totalCopilotSuggestions, 0);
  const totalAppliedHuman = Math.max(totals.totalApplied - totals.totalCopilotApplied, 0);
  const totalMergedHuman = Math.max(totals.totalMerged - totals.totalMergedByCopilot, 0);

  const mergeMedianCopilot = ratio(totals.copilotMergeMedianWeightedSum, totals.totalMergedByCopilot);
  const humanMergeMedianWeightedSum =
    totals.overallMergeMedianWeightedSum - totals.copilotMergeMedianWeightedSum;
  const mergeMedianHuman = ratio(humanMergeMedianWeightedSum, totalMergedHuman);

  const reviewShareCopilot = ratio(totals.totalReviewedByCopilot, totals.totalReviewed);
  const reviewShareHuman = ratio(totalReviewedHuman, totals.totalReviewed);

  const authoredShareCopilot = ratio(totals.totalCreatedByCopilot, totals.totalCreated);
  const authoredShareHuman = ratio(totalCreatedHuman, totals.totalCreated);

  const suggestionAcceptanceCopilot = ratio(totals.totalCopilotApplied, totals.totalCopilotSuggestions);
  const suggestionAcceptanceHuman = ratio(totalAppliedHuman, totalSuggestionsHuman);

  const mergeSuccessCopilot = ratio(totals.totalMergedByCopilot, totals.totalCreatedByCopilot);
  const mergeSuccessHuman = ratio(totalMergedHuman, totalCreatedHuman);

  renderComparedKpi(kpiElements.intensityReview, reviewShareCopilot, reviewShareHuman, "CCR");
  renderComparedKpi(kpiElements.intensityAuthored, authoredShareCopilot, authoredShareHuman, "CCA");
  renderComparedKpi(
    kpiElements.effSuggestion,
    suggestionAcceptanceCopilot,
    suggestionAcceptanceHuman,
    "CCR"
  );
  renderComparedKpi(kpiElements.effMergeSuccess, mergeSuccessCopilot, mergeSuccessHuman, "CCA");
  renderComparedDurationKpi(kpiElements.mergeLeadTime, mergeMedianCopilot, mergeMedianHuman, "CCA");
}

function renderCliTiles(rows) {
  if (!rows.length) {
    cliKpiElements.dailyActiveUsers.textContent = "—";
    cliKpiElements.sessionCount.textContent = "—";
    cliKpiElements.requestCount.textContent = "—";
    cliKpiElements.avgTokensPerRequest.textContent = "—";
    return;
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.dailyActiveCliUsers += row.daily_active_cli_users;
      acc.sessionCount += row.cli_session_count;
      acc.requestCount += row.cli_request_count;
      acc.promptTokens += row.cli_prompt_tokens_sum;
      acc.outputTokens += row.cli_output_tokens_sum;
      return acc;
    },
    {
      dailyActiveCliUsers: 0,
      sessionCount: 0,
      requestCount: 0,
      promptTokens: 0,
      outputTokens: 0,
    }
  );

  const avgDailyActiveCliUsers = ratio(totals.dailyActiveCliUsers, rows.length);
  const avgTokensPerRequest = ratio(totals.promptTokens + totals.outputTokens, totals.requestCount);

  cliKpiElements.dailyActiveUsers.textContent = formatCount(avgDailyActiveCliUsers, 1);
  cliKpiElements.sessionCount.textContent = formatCount(totals.sessionCount);
  cliKpiElements.requestCount.textContent = formatCount(totals.requestCount);
  cliKpiElements.avgTokensPerRequest.textContent = formatCount(avgTokensPerRequest, 2);
}

function destroyCharts() {
  for (const chart of state.chartInstances) {
    chart.destroy();
  }
  state.chartInstances = [];
}

function buildBaseOptions() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const textColor = isLight ? "#1b2740" : "#e8ecff";
  const mutedColor = isLight ? "#51658f" : "#9fb0d7";
  const gridColor = isLight ? "rgba(81, 101, 143, 0.18)" : "rgba(159, 176, 215, 0.12)";
  const tooltipBg = isLight ? "rgba(250, 252, 255, 0.98)" : "rgba(11, 17, 29, 0.95)";
  const tooltipBorder = isLight ? "rgba(100, 126, 188, 0.26)" : "rgba(153, 176, 255, 0.25)";

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: textColor,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        titleColor: textColor,
        bodyColor: textColor,
      },
    },
    scales: {
      x: {
        ticks: { color: mutedColor },
        grid: { color: gridColor },
      },
      y: {
        beginAtZero: true,
        ticks: { color: mutedColor },
        grid: { color: gridColor },
      },
    },
  };
}

function renderCharts(rows) {
  destroyCharts();

  const labels = rows.map((row) => row.day);

  const reviewByCopilot = rows.map((row) => row.total_reviewed_by_copilot);
  const reviewByHuman = rows.map((row) => Math.max(row.total_reviewed - row.total_reviewed_by_copilot, 0));

  const createdByCopilot = rows.map((row) => row.total_created_by_copilot);
  const createdByHuman = rows.map((row) => Math.max(row.total_created - row.total_created_by_copilot, 0));
  const mergedByCopilot = rows.map((row) => row.total_merged_created_by_copilot);
  const mergedByHuman = rows.map((row) => Math.max(row.total_merged - row.total_merged_created_by_copilot, 0));

  const copilotSuggestions = rows.map((row) => row.total_copilot_suggestions);
  const humanSuggestions = rows.map((row) =>
    Math.max(row.total_suggestions - row.total_copilot_suggestions, 0)
  );
  const humanAcceptancePct = rows.map((row) => {
    const humanSuggestionsCount = Math.max(row.total_suggestions - row.total_copilot_suggestions, 0);
    const humanAppliedSuggestions = Math.max(
      row.total_applied_suggestions - row.total_copilot_applied_suggestions,
      0
    );
    return humanSuggestionsCount ? (humanAppliedSuggestions / humanSuggestionsCount) * 100 : 0;
  });
  const copilotAcceptancePct = rows.map((row) =>
    row.total_copilot_suggestions
      ? (row.total_copilot_applied_suggestions / row.total_copilot_suggestions) * 100
      : 0
  );

  const mergeCca = rows.map((row) => row.median_minutes_to_merge_copilot_authored);
  const mergeHuman = rows.map((row) => {
    const humanMerged = Math.max(row.total_merged - row.total_merged_created_by_copilot, 0);
    if (!humanMerged) {
      return 0;
    }

    const totalWeighted = row.median_minutes_to_merge * row.total_merged;
    const ccaWeighted =
      row.median_minutes_to_merge_copilot_authored * row.total_merged_created_by_copilot;
    const humanWeighted = totalWeighted - ccaWeighted;
    return humanWeighted / humanMerged;
  });

  const intensityReviewCopilotPct = rows.map((row) =>
    row.total_reviewed ? (row.total_reviewed_by_copilot / row.total_reviewed) * 100 : null
  );
  const intensityReviewHumanPct = rows.map((row) =>
    row.total_reviewed
      ? (Math.max(row.total_reviewed - row.total_reviewed_by_copilot, 0) / row.total_reviewed) * 100
      : null
  );
  const intensityAuthoredCopilotPct = rows.map((row) =>
    row.total_created ? (row.total_created_by_copilot / row.total_created) * 100 : null
  );
  const intensityAuthoredHumanPct = rows.map((row) =>
    row.total_created
      ? (Math.max(row.total_created - row.total_created_by_copilot, 0) / row.total_created) * 100
      : null
  );

  const efficiencySuggestionCopilotPct = rows.map((row) =>
    row.total_copilot_suggestions
      ? (row.total_copilot_applied_suggestions / row.total_copilot_suggestions) * 100
      : null
  );
  const efficiencySuggestionHumanPct = rows.map((row) => {
    const humanSuggestions = Math.max(row.total_suggestions - row.total_copilot_suggestions, 0);
    const humanApplied = Math.max(
      row.total_applied_suggestions - row.total_copilot_applied_suggestions,
      0
    );
    return humanSuggestions ? (humanApplied / humanSuggestions) * 100 : null;
  });
  const efficiencyMergeCopilotPct = rows.map((row) =>
    row.total_created_by_copilot
      ? (row.total_merged_created_by_copilot / row.total_created_by_copilot) * 100
      : null
  );
  const efficiencyMergeHumanPct = rows.map((row) => {
    const humanCreated = Math.max(row.total_created - row.total_created_by_copilot, 0);
    const humanMerged = Math.max(row.total_merged - row.total_merged_created_by_copilot, 0);
    return humanCreated ? (humanMerged / humanCreated) * 100 : null;
  });

  const cumulativeCopilotSuggestions = [];
  const cumulativeCopilotAppliedSuggestions = [];
  let runningCopilotSuggestions = 0;
  let runningCopilotApplied = 0;
  for (const row of rows) {
    runningCopilotSuggestions += row.total_copilot_suggestions;
    runningCopilotApplied += row.total_copilot_applied_suggestions;
    cumulativeCopilotSuggestions.push(runningCopilotSuggestions);
    cumulativeCopilotAppliedSuggestions.push(runningCopilotApplied);
  }

  const cliDailyActiveUsers = rows.map((row) => row.daily_active_cli_users);
  const allDailyActiveUsers = rows.map((row) => row.daily_active_users);
  const cliSessionCount = rows.map((row) => row.cli_session_count);
  const cliRequestCount = rows.map((row) => row.cli_request_count);
  const cliPromptTokens = rows.map((row) => row.cli_prompt_tokens_sum);
  const cliOutputTokens = rows.map((row) => row.cli_output_tokens_sum);
  const cliAvgTokensPerRequest = rows.map((row) =>
    row.cli_request_count
      ? (row.cli_prompt_tokens_sum + row.cli_output_tokens_sum) / row.cli_request_count
      : 0
  );

  const reviewChart = new Chart(chartElements.review, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Reviewed by CCR",
          data: reviewByCopilot,
          backgroundColor: "rgba(126, 166, 255, 0.75)",
        },
        {
          label: "Reviewed by Human",
          data: reviewByHuman,
          backgroundColor: "rgba(121, 240, 215, 0.65)",
        },
      ],
    },
    options: buildBaseOptions(),
  });

  const throughputChart = new Chart(chartElements.throughput, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Created by CCA",
          data: createdByCopilot,
          backgroundColor: "rgba(126, 166, 255, 0.85)",
        },
        {
          label: "Created by Human",
          data: createdByHuman,
          backgroundColor: "rgba(126, 166, 255, 0.32)",
        },
        {
          label: "CCA PRs merged",
          data: mergedByCopilot,
          backgroundColor: "rgba(184, 157, 255, 0.85)",
        },
        {
          label: "Human PRs merged",
          data: mergedByHuman,
          backgroundColor: "rgba(184, 157, 255, 0.32)",
        },
      ],
    },
    options: buildBaseOptions(),
  });

  const suggestionsOptions = buildBaseOptions();
  suggestionsOptions.scales.y1 = {
    beginAtZero: true,
    position: "right",
    max: 100,
    ticks: {
      color: "#9fb0d7",
      callback: (value) => `${value}%`,
    },
    grid: {
      drawOnChartArea: false,
    },
  };

  const suggestionsChart = new Chart(chartElements.suggestions, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Human suggestions",
          data: humanSuggestions,
          backgroundColor: "rgba(246, 216, 154, 0.72)",
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "CCR suggestions",
          data: copilotSuggestions,
          backgroundColor: "rgba(121, 240, 215, 0.68)",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Human acceptance %",
          data: humanAcceptancePct,
          borderColor: "rgba(246, 216, 154, 0.95)",
          backgroundColor: "rgba(246, 216, 154, 0.95)",
          yAxisID: "y1",
          tension: 0.28,
        },
        {
          type: "line",
          label: "CCR acceptance %",
          data: copilotAcceptancePct,
          borderColor: "rgba(184, 157, 255, 1)",
          backgroundColor: "rgba(184, 157, 255, 1)",
          yAxisID: "y1",
          tension: 0.28,
        },
      ],
    },
    options: suggestionsOptions,
  });

  const mergeChart = new Chart(chartElements.merge, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Human",
          data: mergeHuman,
          borderColor: "rgba(121, 240, 215, 0.95)",
          backgroundColor: "rgba(121, 240, 215, 0.95)",
          tension: 0.32,
        },
        {
          label: "CCA",
          data: mergeCca,
          borderColor: "rgba(126, 166, 255, 0.98)",
          backgroundColor: "rgba(126, 166, 255, 0.98)",
          tension: 0.32,
        },
      ],
    },
    options: buildBaseOptions(),
  });

  const trendPercentOptions = buildBaseOptions();
  trendPercentOptions.scales.y.max = 100;
  trendPercentOptions.scales.y.ticks.callback = (value) => `${value}%`;

  const intensityTrendChart = new Chart(chartElements.intensityTrend, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "CCR review share",
          data: intensityReviewCopilotPct,
          borderColor: "rgba(126, 166, 255, 0.98)",
          backgroundColor: "rgba(126, 166, 255, 0.98)",
          tension: 0.3,
        },
        {
          label: "Human review share",
          data: intensityReviewHumanPct,
          borderColor: "rgba(121, 240, 215, 0.9)",
          backgroundColor: "rgba(121, 240, 215, 0.9)",
          tension: 0.3,
        },
        {
          label: "CCA authored share",
          data: intensityAuthoredCopilotPct,
          borderColor: "rgba(184, 157, 255, 0.98)",
          backgroundColor: "rgba(184, 157, 255, 0.98)",
          tension: 0.3,
        },
        {
          label: "Human authored share",
          data: intensityAuthoredHumanPct,
          borderColor: "rgba(246, 216, 154, 0.96)",
          backgroundColor: "rgba(246, 216, 154, 0.96)",
          tension: 0.3,
        },
      ],
    },
    options: trendPercentOptions,
  });

  const efficiencyTrendOptions = buildBaseOptions();
  efficiencyTrendOptions.scales.y.max = 100;
  efficiencyTrendOptions.scales.y.ticks.callback = (value) => `${value}%`;

  const efficiencyTrendChart = new Chart(chartElements.efficiencyTrend, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "CCR suggestion acceptance",
          data: efficiencySuggestionCopilotPct,
          borderColor: "rgba(126, 166, 255, 0.98)",
          backgroundColor: "rgba(126, 166, 255, 0.98)",
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "Human suggestion acceptance",
          data: efficiencySuggestionHumanPct,
          borderColor: "rgba(121, 240, 215, 0.9)",
          backgroundColor: "rgba(121, 240, 215, 0.9)",
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "CCA merge success",
          data: efficiencyMergeCopilotPct,
          borderColor: "rgba(184, 157, 255, 0.98)",
          backgroundColor: "rgba(184, 157, 255, 0.98)",
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "Human merge success",
          data: efficiencyMergeHumanPct,
          borderColor: "rgba(246, 216, 154, 0.96)",
          backgroundColor: "rgba(246, 216, 154, 0.96)",
          yAxisID: "y",
          tension: 0.3,
        },
      ],
    },
    options: efficiencyTrendOptions,
  });

  const cumulativeTrendOptions = buildBaseOptions();

  const cumulativeTrendChart = new Chart(chartElements.cumulativeTrend, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cumulative CCR suggestions",
          data: cumulativeCopilotSuggestions,
          borderColor: "rgba(79, 116, 216, 0.9)",
          backgroundColor: "rgba(79, 116, 216, 0.9)",
          tension: 0.2,
        },
        {
          label: "Cumulative CCR applied comments",
          data: cumulativeCopilotAppliedSuggestions,
          borderColor: "rgba(31, 143, 132, 0.9)",
          backgroundColor: "rgba(31, 143, 132, 0.9)",
          tension: 0.3,
        },
      ],
    },
    options: cumulativeTrendOptions,
  });

  const cliUsersChart = new Chart(chartElements.cliUsers, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Daily active CLI users",
          data: cliDailyActiveUsers,
          borderColor: "rgba(126, 166, 255, 0.98)",
          backgroundColor: "rgba(126, 166, 255, 0.98)",
          tension: 0.25,
        },
        {
          label: "Daily active users (all)",
          data: allDailyActiveUsers,
          borderColor: "rgba(121, 240, 215, 0.85)",
          backgroundColor: "rgba(121, 240, 215, 0.85)",
          tension: 0.25,
        },
      ],
    },
    options: buildBaseOptions(),
  });

  const cliActivityOptions = buildBaseOptions();
  cliActivityOptions.scales.y1 = {
    beginAtZero: true,
    position: "right",
    ticks: { color: "#9fb0d7" },
    grid: { drawOnChartArea: false },
  };

  const cliActivityChart = new Chart(chartElements.cliActivity, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "CLI sessions",
          data: cliSessionCount,
          backgroundColor: "rgba(184, 157, 255, 0.82)",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "CLI requests",
          data: cliRequestCount,
          borderColor: "rgba(246, 216, 154, 0.95)",
          backgroundColor: "rgba(246, 216, 154, 0.95)",
          yAxisID: "y1",
          tension: 0.25,
        },
      ],
    },
    options: cliActivityOptions,
  });

  const cliTokenOptions = buildBaseOptions();
  cliTokenOptions.scales.y1 = {
    beginAtZero: true,
    position: "right",
    ticks: { color: "#9fb0d7" },
    grid: { drawOnChartArea: false },
  };

  const cliTokenChart = new Chart(chartElements.cliTokens, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Prompt tokens",
          data: cliPromptTokens,
          backgroundColor: "rgba(121, 240, 215, 0.65)",
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "Output tokens",
          data: cliOutputTokens,
          backgroundColor: "rgba(126, 166, 255, 0.72)",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Avg tokens/request",
          data: cliAvgTokensPerRequest,
          borderColor: "rgba(246, 216, 154, 0.95)",
          backgroundColor: "rgba(246, 216, 154, 0.95)",
          yAxisID: "y1",
          tension: 0.25,
        },
      ],
    },
    options: cliTokenOptions,
  });

  state.chartInstances.push(
    reviewChart,
    throughputChart,
    suggestionsChart,
    mergeChart,
    intensityTrendChart,
    efficiencyTrendChart,
    cumulativeTrendChart,
    cliUsersChart,
    cliActivityChart,
    cliTokenChart
  );
}
