import "./styles.css";

import {
  ArrowRight,
  CarFront,
  ChartNoAxesCombined,
  Check,
  CircleDollarSign,
  createIcons,
  Download,
  Gem,
  GraduationCap,
  House,
  Landmark,
  Lightbulb,
  LockKeyhole,
  Pencil,
  ReceiptText,
  Shapes,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  WandSparkles,
} from "lucide";

import {
  calculateLoanPlan,
  compareExtraPayment,
  estimateMoratorium,
  monthlyPayment,
  projectLoan,
  validatePlanInputs,
} from "./finance.js";
import { translator } from "./i18n.js";

const STORAGE_KEY = "loanlens:v2:profile";
const VISITOR_KEY = "loanlens:anonymous-visitor";
const PAYMENT_TYPES = ["regular", "extra", "partInterest", "fee"];
const LOAN_TYPES = ["home", "vehicle", "education", "personal", "other"];
const app = document.querySelector("#app");
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);
const tomorrowISO = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
const ICONS = {
  ArrowRight, CarFront, ChartNoAxesCombined, Check, CircleDollarSign, Download,
  Gem, GraduationCap, House, Landmark, Lightbulb, LockKeyhole, Pencil,
  ReceiptText, Shapes, ShieldCheck, Sparkles, Target, Trash2, TriangleAlert,
  Upload, UserRound, UsersRound, WalletCards, WandSparkles,
};

function icon(name, className = "") {
  return `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
}

function hydrateIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { "stroke-width": "1.8" } });
}

function defaultState() {
  return {
    language: "en",
    country: "US",
    plan: {
      loanType: "home",
      totalCost: 450000,
      downPayment: 90000,
      annualRate: 6.5,
      termYears: 30,
      financedFees: 0,
      upfrontFees: 0,
      monthlyIncome: 10000,
      existingMonthlyDebt: 1200,
      compare: false,
      offerBRate: 6.15,
      offerBTermYears: 30,
      offerBFinancedFees: 3500,
    },
    track: {
      loanType: "education",
      method: "monthly",
      rateType: "fixed",
      originalAmount: 50000,
      disbursementDate: "2024-08-15",
      currentBalance: 46500,
      balanceAsOf: todayISO,
      annualRate: 7.5,
      monthlyPayment: 650,
      paymentDay: 5,
      termMonths: 120,
      moratoriumMonths: 0,
      partInterestAmount: 0,
      dayCountBasis: 365,
    },
    payments: [],
    rateHistory: [],
    whatIf: {
      extraPayment: 5000,
      extraPaymentDate: tomorrowISO,
      monthlyExtra: 100,
      targetYears: 5,
    },
  };
}

function objectOr(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeState(value) {
  const defaults = defaultState();
  const source = objectOr(value, {});
  const candidate = {
    ...defaults,
    language: source.language === "es" ? "es" : "en",
    country: source.country === "IN" ? "IN" : "US",
    plan: { ...defaults.plan, ...objectOr(source.plan, {}) },
    track: { ...defaults.track, ...objectOr(source.track, {}) },
    whatIf: { ...defaults.whatIf, ...objectOr(source.whatIf, {}) },
    payments: Array.isArray(source.payments) ? source.payments : [],
    rateHistory: Array.isArray(source.rateHistory) ? source.rateHistory : [],
  };
  if (!LOAN_TYPES.includes(candidate.plan.loanType)) candidate.plan.loanType = "other";
  if (!LOAN_TYPES.includes(candidate.track.loanType)) candidate.track.loanType = "other";
  if (!["monthly", "daily"].includes(candidate.track.method)) candidate.track.method = "monthly";
  if (!["fixed", "variable"].includes(candidate.track.rateType)) candidate.track.rateType = "fixed";
  candidate.payments = candidate.payments.filter((payment) => (
    payment &&
    typeof payment.id === "string" &&
    Number(payment.amount) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate) &&
    PAYMENT_TYPES.includes(payment.type)
  )).map((payment) => ({
    id: payment.id,
    amount: Number(payment.amount),
    paymentDate: payment.paymentDate,
    creditedDate: /^\d{4}-\d{2}-\d{2}$/.test(payment.creditedDate || "") ? payment.creditedDate : "",
    type: payment.type,
  }));
  candidate.rateHistory = candidate.rateHistory.filter((rate) => (
    rate && /^\d{4}-\d{2}-\d{2}$/.test(rate.effectiveDate || "") && Number(rate.annualRate) >= 0
  )).map((rate) => ({ effectiveDate: rate.effectiveDate, annualRate: Number(rate.annualRate) }));
  return candidate;
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return defaultState();
  }
}

let state = loadState();
let ui = { view: "plan", editingPaymentId: null, notice: "" };
let visitor = { count: null, unavailable: false };

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Calculations still work if storage is unavailable or full.
  }
}

function t(key, values) {
  return translator(state.language)(key, values);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currency(value, maximumFractionDigits = 0) {
  const locale = state.language === "es" ? "es-US" : state.country === "IN" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: state.country === "IN" ? "INR" : "USD",
    maximumFractionDigits,
  }).format(Number(value) || 0);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateLabel(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(state.language === "es" ? "es-US" : "en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function duration(months) {
  if (months === null || months === undefined) return t("notReached");
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (!years) return `${remainder} ${t("months")}`;
  if (!remainder) return `${years} ${t("years")}`;
  return t("yearsMonths", { years, months: remainder });
}

function loanTypeLabel(type) {
  return t(LOAN_TYPES.includes(type) ? type : "other");
}

function paymentTypeLabel(type) {
  return t({ regular: "emi", extra: "extra", partInterest: "partInterestType", fee: "fees" }[type] || "emi");
}

function costLabel(type) {
  return t({ home: "homeCost", vehicle: "vehicleCost", education: "educationCost", personal: "personalCost", other: "otherCost" }[type]);
}

function loanTypeIcon(type) {
  return { home: "house", vehicle: "car-front", education: "graduation-cap", personal: "user-round", other: "shapes" }[type] || "shapes";
}

function inputShell({ name, value, prefix = "", suffix = "", min = 0, max = "", step = "any", path = "plan", type = "number" }) {
  const suffixClass = suffix ? " suffix" : "";
  const minAttribute = type === "date" && min === 0 ? "" : `min="${min}"`;
  return `<span class="input-shell${suffixClass}">
    ${prefix ? `<b>${escapeHtml(prefix)}</b>` : ""}
    <input data-bind="${path}.${name}" data-value-type="${type === "number" ? "number" : "string"}" type="${type}" ${minAttribute} ${max !== "" ? `max="${max}"` : ""} step="${step}" value="${escapeHtml(value)}" />
    ${suffix ? `<b>${escapeHtml(suffix)}</b>` : ""}
  </span>`;
}

function navButton(view, labelKey, iconName) {
  return `<button class="journey ${ui.view === view ? "active" : ""}" type="button" data-action="navigate" data-view="${view}" ${ui.view === view ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${t(labelKey)}</span></button>`;
}

function paintShell() {
  document.documentElement.lang = state.language;
  document.title = state.language === "es" ? "LoanLens — Planea y entiende tu préstamo" : "LoanLens — Plan and understand your loan";
  app.innerHTML = `
    <a class="skip-link" href="#main">${t("skip")}</a>
    <header class="topbar">
      <button class="brand" type="button" data-action="navigate" data-view="plan" aria-label="LoanLens"><span class="brand-mark">${icon("gem")}</span><span>LoanLens</span><small>${t("brandPromise")}</small></button>
      <div class="top-actions">
        <span class="privacy-pill">${icon("shield-check", "shield")}${t("privacy")}</span>
        <div class="visitor-pill" title="${escapeHtml(t("privacyCopy"))}">${icon("users-round")}<span id="visitor-count">${t("counterUnavailable")}</span></div>
        <label class="language-control"><span class="sr-only">${t("region")}</span><select data-action="country-global" aria-label="${t("region")}"><option value="US" ${state.country === "US" ? "selected" : ""}>US · USD</option><option value="IN" ${state.country === "IN" ? "selected" : ""}>IN · INR</option></select></label>
        <label class="language-control"><span class="sr-only">${t("language")}</span><select data-action="language" aria-label="${t("language")}"><option value="en" ${state.language === "en" ? "selected" : ""}>English</option><option value="es" ${state.language === "es" ? "selected" : ""}>Español</option></select></label>
      </div>
    </header>
    <nav class="journey-nav" aria-label="LoanLens">${navButton("plan", "plan", "landmark")}${navButton("track", "track", "chart-no-axes-combined")}${navButton("payments", "payments", "receipt-text")}${navButton("whatif", "whatIf", "wand-sparkles")}</nav>
    <div class="mobile-community"><span class="pulse" aria-hidden="true"></span><span id="visitor-count-mobile">${t("counterUnavailable")}</span></div>
    ${ui.notice ? `<div class="toast" role="status">${escapeHtml(ui.notice)}</div>` : ""}
    <main id="main" class="workspace">${renderView()}</main>
    ${renderFooter()}
    <input class="sr-only" id="csv-import" type="file" accept=".csv,text/csv" />
    <input class="sr-only" id="backup-import" type="file" accept=".json,application/json" />
  `;
  hydrateIcons();
  updateVisitorDom();
}

function renderShell({ animate = true } = {}) {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (animate && document.startViewTransition && !reducedMotion) {
    document.startViewTransition(() => paintShell());
  } else {
    paintShell();
  }
}

function renderView() {
  if (ui.view === "track") return renderTrack();
  if (ui.view === "payments") return renderPayments();
  if (ui.view === "whatif") return renderWhatIf();
  return renderPlan();
}

function intro(eyebrow, title, lede) {
  return `<section class="intro-row"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lede">${lede}</p></div></section>`;
}

function renderPlan() {
  const plan = state.plan;
  return `
    ${intro(t("countries").toUpperCase(), t("planTitle"), t("planLede"))}
    <section class="calculator-grid" aria-label="${t("plan")}">
      <form class="panel form-panel" id="planner-form">
        <div class="panel-heading split-heading"><div><span class="step">01</span><h2>${t("buildEstimate")}</h2></div><div class="segmented" aria-label="Country"><button class="segment ${state.country === "US" ? "active" : ""}" type="button" data-action="country" data-country="US">${t("us")}</button><button class="segment ${state.country === "IN" ? "active" : ""}" type="button" data-action="country" data-country="IN">${t("india")}</button></div></div>
        <div class="loan-types" aria-label="${t("loanType")}">${LOAN_TYPES.map((type) => `<button class="loan-type ${plan.loanType === type ? "active" : ""}" type="button" data-action="plan-loan-type" data-loan-type="${type}">${icon(loanTypeIcon(type))}<span>${loanTypeLabel(type)}</span></button>`).join("")}</div>
        <div class="fields">
          <label><span>${costLabel(plan.loanType)}</span>${inputShell({ name: "totalCost", value: plan.totalCost, prefix: state.country === "IN" ? "₹" : "$" })}</label>
          <label><span>${t("downPayment")}</span>${inputShell({ name: "downPayment", value: plan.downPayment, prefix: state.country === "IN" ? "₹" : "$" })}</label>
          <label><span>${t("annualRate")}</span>${inputShell({ name: "annualRate", value: plan.annualRate, suffix: "%", max: 100, step: .01 })}</label>
          <label><span>${t("termYears")}</span>${inputShell({ name: "termYears", value: plan.termYears, suffix: t("years"), min: 1, max: 100, step: 1 })}</label>
          <label><span>${t("financedFees")}</span>${inputShell({ name: "financedFees", value: plan.financedFees, prefix: state.country === "IN" ? "₹" : "$" })}</label>
        </div>
        <details class="optional-block"><summary>${t("optionalDetails")}</summary><div class="fields compact-fields">
          <label><span>${t("monthlyIncome")}</span>${inputShell({ name: "monthlyIncome", value: plan.monthlyIncome, prefix: state.country === "IN" ? "₹" : "$" })}</label>
          <label><span>${t("existingDebt")}</span>${inputShell({ name: "existingMonthlyDebt", value: plan.existingMonthlyDebt, prefix: state.country === "IN" ? "₹" : "$" })}</label>
          <label><span>${t("upfrontFees")}</span>${inputShell({ name: "upfrontFees", value: plan.upfrontFees, prefix: state.country === "IN" ? "₹" : "$" })}</label>
        </div></details>
      </form>
      <aside class="panel result-panel" id="plan-results" aria-live="polite">${renderPlanResults()}</aside>
    </section>
    <div class="below-actions"><button class="button secondary" type="button" data-action="toggle-compare">${icon("sparkles")}${plan.compare ? t("hideComparison") : t("compareOffer")}</button><button class="button primary" type="button" data-action="use-plan">${t("moveToTracker")}${icon("arrow-right")}</button></div>
    ${plan.compare ? renderOfferComparison() : ""}
  `;
}

function planParameters(overrides = {}) {
  const plan = { ...state.plan, ...overrides };
  return {
    totalCost: numberValue(plan.totalCost), downPayment: numberValue(plan.downPayment), annualRate: numberValue(plan.annualRate), termMonths: numberValue(plan.termYears) * 12,
    financedFees: numberValue(plan.financedFees), upfrontFees: numberValue(plan.upfrontFees), monthlyIncome: numberValue(plan.monthlyIncome), existingMonthlyDebt: numberValue(plan.existingMonthlyDebt),
  };
}

function renderPlanResults() {
  const error = validatePlanInputs(planParameters());
  if (error) return `<div class="empty-result">${icon("triangle-alert")}<p>${t("invalidInputs")}</p></div>`;
  const result = calculateLoanPlan(planParameters());
  const principalPercent = result.totalLoanPayments ? result.principal / result.totalLoanPayments * 100 : 100;
  const incomeCopy = result.paymentToIncomePercent === null ? "" : `<p>${t("incomeInsight", { percent: result.paymentToIncomePercent.toFixed(1) })}</p>`;
  return `
    <div class="panel-heading"><div><span class="step light">02</span><h2>${t("yourEstimate")}</h2></div></div>
    <p class="result-label">${t("monthlyPI")}</p><p class="hero-number">${currency(result.monthlyPayment)}</p>
    <div class="cost-bar" aria-hidden="true"><svg viewBox="0 0 100 8" preserveAspectRatio="none"><rect width="100" height="8" fill="#d4ae61"></rect><rect width="${Math.max(0, Math.min(100, principalPercent))}" height="8" fill="#6c8de3"></rect></svg></div>
    <div class="bar-legend"><span><i class="principal-dot"></i>${t("amountFinanced")}</span><span><i class="interest-dot"></i>${t("totalInterest")}</span></div>
    <div class="result-list"><div><span>${t("amountFinanced")}</span><strong>${currency(result.principal)}</strong></div><div><span>${t("totalInterest")}</span><strong>${currency(result.totalInterest)}</strong></div><div><span>${t("totalPayments")}</span><strong>${currency(result.totalLoanPayments)}</strong></div><div><span>${t("totalCashCost")}</span><strong>${currency(result.totalCashCost)}</strong></div></div>
    <div class="insight">${icon("lightbulb")}<div><p>${t("downInsight", { percent: result.downPaymentPercent.toFixed(0), amount: currency(state.plan.downPayment) })}</p>${incomeCopy}<p>${t("costExclusion")}</p></div></div>
  `;
}

function renderOfferComparison() {
  let offerA;
  let offerB;
  try {
    offerA = calculateLoanPlan(planParameters());
    offerB = calculateLoanPlan(planParameters({ annualRate: state.plan.offerBRate, termYears: state.plan.offerBTermYears, financedFees: state.plan.offerBFinancedFees }));
  } catch { return `<section class="panel comparison-panel"><p>${t("invalidInputs")}</p></section>`; }
  const monthlyWinner = offerA.monthlyPayment <= offerB.monthlyPayment ? "A" : "B";
  const totalWinner = offerA.totalCashCost <= offerB.totalCashCost ? "A" : "B";
  return `<section class="panel comparison-panel"><div class="section-heading"><div><span class="step">03</span><h2>${t("compareOffer")}</h2></div></div><div class="comparison-inputs fields">
    <label><span>${t("offerBRate")}</span>${inputShell({ name: "offerBRate", value: state.plan.offerBRate, suffix: "%", max: 100, step: .01 })}</label>
    <label><span>${t("offerBTerm")}</span>${inputShell({ name: "offerBTermYears", value: state.plan.offerBTermYears, suffix: t("years"), min: 1, max: 100, step: 1 })}</label>
    <label><span>${t("offerBFees")}</span>${inputShell({ name: "offerBFinancedFees", value: state.plan.offerBFinancedFees, prefix: state.country === "IN" ? "₹" : "$" })}</label>
    </div><div class="offer-grid">${offerCard("A", offerA, monthlyWinner, totalWinner)}${offerCard("B", offerB, monthlyWinner, totalWinner)}</div></section>`;
}

function offerCard(letter, result, monthlyWinner, totalWinner) {
  const badge = letter === monthlyWinner && letter === totalWinner ? `${t("lowerMonthly")} · ${t("lowerLifetime")}` : letter === monthlyWinner ? t("lowerMonthly") : letter === totalWinner ? t("lowerLifetime") : "";
  return `<article class="offer-card"><div class="offer-title"><strong>${t(`offer${letter}`)}</strong>${badge ? `<span>${badge}</span>` : ""}</div><dl><div><dt>${t("monthlyPI")}</dt><dd>${currency(result.monthlyPayment)}</dd></div><div><dt>${t("totalInterest")}</dt><dd>${currency(result.totalInterest)}</dd></div><div><dt>${t("totalCashCost")}</dt><dd>${currency(result.totalCashCost)}</dd></div></dl></article>`;
}

function projectionForTrack(overrides = {}) {
  const track = state.track;
  return projectLoan({ startingBalance: numberValue(track.currentBalance), asOfDate: track.balanceAsOf, annualRate: numberValue(track.annualRate), monthlyPayment: numberValue(track.monthlyPayment), paymentDay: numberValue(track.paymentDay), method: track.method, dayCountBasis: numberValue(track.dayCountBasis), ...overrides });
}

function renderTrack() {
  const track = state.track;
  let projection = null;
  try { projection = projectionForTrack(); } catch { projection = null; }
  const totalRecorded = state.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const principalReduction = Math.max(0, numberValue(track.originalAmount) - numberValue(track.currentBalance));
  const estimatedInterestPaid = Math.max(0, totalRecorded - principalReduction);
  const payoff = projection?.payoffDate ? dateLabel(projection.payoffDate) : t("notReached");
  const metricData = [[t("originalAmount"), currency(track.originalAmount)], [t("currentBalance"), currency(track.currentBalance)], [t("recordedPayments"), currency(totalRecorded)], [t("principalReduction"), currency(principalReduction)], [t("interestPaid"), currency(estimatedInterestPaid)], [t("currentRate"), `${numberValue(track.annualRate).toFixed(2)}%`], [t("monthlyPayment"), currency(track.monthlyPayment)], [t("payoffEstimate"), payoff]];
  return `
    ${intro(t("track").toUpperCase(), t("trackTitle"), t("trackLede"))}
    <section class="panel form-panel track-form-panel"><div class="section-heading"><div><span class="step">01</span><h2>${t("loanSetup")}</h2></div><span class="saved-note">${icon("check")} ${t("savedAutomatically")}</span></div><form id="track-form"><div class="fields three-fields">
      <label><span>${t("loanType")}</span><select class="select-input" data-bind="track.loanType">${LOAN_TYPES.map((type) => `<option value="${type}" ${track.loanType === type ? "selected" : ""}>${loanTypeLabel(type)}</option>`).join("")}</select></label>
      <label><span>${t("calculationMethod")}</span><select class="select-input" data-bind="track.method"><option value="monthly" ${track.method === "monthly" ? "selected" : ""}>${t("monthlyMethod")}</option><option value="daily" ${track.method === "daily" ? "selected" : ""}>${t("dailyMethod")}</option></select></label>
      <label><span>${t("rateType")}</span><select class="select-input" data-bind="track.rateType"><option value="fixed" ${track.rateType === "fixed" ? "selected" : ""}>${t("fixed")}</option><option value="variable" ${track.rateType === "variable" ? "selected" : ""}>${t("variable")}</option></select></label>
      <label><span>${t("originalAmount")}</span>${inputShell({ path: "track", name: "originalAmount", value: track.originalAmount, prefix: state.country === "IN" ? "₹" : "$" })}</label>
      <label><span>${t("disbursementDate")}</span>${inputShell({ path: "track", name: "disbursementDate", value: track.disbursementDate, type: "date" })}</label>
      <label><span>${t("originalTerm")}</span>${inputShell({ path: "track", name: "termMonths", value: track.termMonths, suffix: t("months"), min: 1, max: 1200, step: 1 })}</label>
      <label><span>${t("currentBalance")}</span>${inputShell({ path: "track", name: "currentBalance", value: track.currentBalance, prefix: state.country === "IN" ? "₹" : "$" })}</label>
      <label><span>${t("balanceAsOf")}</span>${inputShell({ path: "track", name: "balanceAsOf", value: track.balanceAsOf, type: "date" })}</label>
      <label><span>${t("currentRate")}</span>${inputShell({ path: "track", name: "annualRate", value: track.annualRate, suffix: "%", max: 100, step: .01 })}</label>
      <label><span>${t("monthlyPayment")}</span>${inputShell({ path: "track", name: "monthlyPayment", value: track.monthlyPayment, prefix: state.country === "IN" ? "₹" : "$" })}</label>
      <label><span>${t("paymentDay")}</span>${inputShell({ path: "track", name: "paymentDay", value: track.paymentDay, min: 1, max: 28, step: 1 })}</label>
      ${track.method === "daily" ? `<label><span>${t("dayCount")}</span><select class="select-input" data-bind="track.dayCountBasis"><option value="365" ${Number(track.dayCountBasis) === 365 ? "selected" : ""}>365</option><option value="360" ${Number(track.dayCountBasis) === 360 ? "selected" : ""}>360</option><option value="366" ${Number(track.dayCountBasis) === 366 ? "selected" : ""}>366</option></select></label>` : ""}
    </div><details class="optional-block" ${track.moratoriumMonths > 0 ? "open" : ""}><summary>${t("moratoriumDetails")}</summary><div class="fields compact-fields"><label><span>${t("moratoriumMonths")}</span>${inputShell({ path: "track", name: "moratoriumMonths", value: track.moratoriumMonths, suffix: t("months"), max: 240, step: 1 })}</label><label><span>${t("partInterest")}</span>${inputShell({ path: "track", name: "partInterestAmount", value: track.partInterestAmount, prefix: state.country === "IN" ? "₹" : "$" })}</label></div></details></form></section>
    ${projection?.negativeAmortization ? `<div class="warning-callout">${icon("triangle-alert")}<p>${t("negativeWarning")}</p></div>` : ""}
    ${renderMoratoriumCheck()}
    ${renderLoanHealth(projection)}
    <section class="dashboard-section"><div class="section-heading"><div><span class="step">02</span><h2>${t("dashboard")}</h2></div><span class="estimate-tag">${t("approximate")}</span></div><div class="metrics-grid">${metricData.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join("")}</div><div class="panel chart-panel"><div class="chart-heading"><h3>${t("balanceTrend")}</h3>${projection ? `<span>${t("futureInterest")}: <strong>${currency(projection.totalInterest)}</strong></span>` : ""}</div>${projection ? renderChart([{ label: t("baseline"), schedule: projection.schedule, color: "#2667ff", swatch: "blue" }]) : `<p class="empty-copy">${t("chartEmpty")}</p>`}</div></section>
    ${renderRateHistory()}
  `;
}

function renderMoratoriumCheck() {
  const track = state.track;
  if (Number(track.moratoriumMonths) <= 0) return "";
  try {
    const result = estimateMoratorium({ originalAmount: track.originalAmount, disbursementDate: track.disbursementDate, annualRate: track.annualRate, moratoriumMonths: track.moratoriumMonths, monthlyPartInterest: track.partInterestAmount, paymentDay: track.paymentDay, dayCountBasis: track.dayCountBasis });
    const grew = result.endingBalance > Number(track.originalAmount) + .01;
    return `<div class="${grew ? "warning-callout" : "success-callout"}">${icon(grew ? "triangle-alert" : "check")}<div><b>${t("moratoriumEstimate")}</b><p>${grew ? t("moratoriumGrowth", { start: currency(track.originalAmount), end: currency(result.endingBalance) }) : t("moratoriumNoGrowth")}</p><small>${t("estimateWarning")}</small></div></div>`;
  } catch { return ""; }
}

function renderLoanHealth(projection) {
  const track = state.track;
  const balance = numberValue(track.currentBalance);
  const payment = numberValue(track.monthlyPayment);
  const interest = balance * numberValue(track.annualRate) / 100 / 12;
  const principal = Math.max(0, payment - interest);
  const gap = Math.max(0, interest - payment);
  const coverage = interest > 0 ? payment / interest * 100 : 100;
  const growing = payment + .01 < interest;
  const stalled = !growing && balance > 0 && principal / balance < .001;
  const title = growing ? t("healthGrowing") : stalled ? t("healthStalled") : t("healthReducing");
  const copy = growing
    ? t("healthGrowingCopy", { interest: currency(interest), gap: currency(gap) })
    : stalled
      ? t("healthStalledCopy")
      : t("healthReducingCopy", { principal: currency(principal), date: projection?.payoffDate ? dateLabel(projection.payoffDate) : t("notReached") });
  return `<section class="health-story health-${growing ? "growing" : stalled ? "stalled" : "reducing"}">
    <div class="health-story-copy"><span class="health-icon">${icon(growing ? "triangle-alert" : stalled ? "circle-dollar-sign" : "chart-no-axes-combined")}</span><div><p class="eyebrow">${t("healthStory").toUpperCase()}</p><h2>${title}</h2><p>${copy}</p></div></div>
    <dl class="health-facts"><div><dt>${t("interestCoverage")}</dt><dd>${Number.isFinite(coverage) ? `${coverage.toFixed(0)}%` : "—"}</dd></div><div><dt>${t("monthlyInterestEstimate")}</dt><dd>${currency(interest)}</dd></div><div><dt>${t("nextPrincipalEstimate")}</dt><dd>${currency(principal)}</dd></div></dl>
  </section>`;
}

function renderRateHistory() {
  const rates = [...state.rateHistory].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return `<section class="panel data-panel"><div class="section-heading"><div><span class="step">03</span><div><h2>${t("rateHistory")}</h2><p>${t("rateHistoryHelp")}</p></div></div></div><form class="inline-form" id="rate-form"><label><span>${t("effectiveDate")}</span><input class="plain-input" name="effectiveDate" type="date" required value="${todayISO}" /></label><label><span>${t("annualRate")}</span><span class="input-shell suffix"><input name="annualRate" type="number" min="0" max="100" step=".01" required value="${state.track.annualRate}" /><b>%</b></span></label><button class="button primary" type="submit">${t("addRate")}</button></form>${rates.length ? `<div class="data-list">${rates.map((rate) => `<div class="data-row"><div><strong>${dateLabel(rate.effectiveDate)}</strong><span>${Number(rate.annualRate).toFixed(2)}%</span></div><button class="text-button danger" type="button" data-action="delete-rate" data-date="${rate.effectiveDate}">${t("remove")}</button></div>`).join("")}</div>` : `<p class="empty-copy">${t("noRates")}</p>`}</section>`;
}

function renderPayments() {
  const editing = state.payments.find((payment) => payment.id === ui.editingPaymentId);
  const model = editing || { amount: "", paymentDate: todayISO, creditedDate: "", type: "regular" };
  const payments = [...state.payments].sort((a, b) => (b.creditedDate || b.paymentDate).localeCompare(a.creditedDate || a.paymentDate));
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  return `
    ${intro(t("payments").toUpperCase(), t("paymentsTitle"), t("paymentsLede"))}
    <section class="payment-layout"><form class="panel form-panel sticky-form" id="payment-form"><div class="section-heading"><div><span class="step">01</span><h2>${editing ? t("editPayment") : t("addPayment")}</h2></div></div><div class="stacked-fields">
      <label><span>${t("amount")}</span><span class="input-shell"><b>${state.country === "IN" ? "₹" : "$"}</b><input name="amount" type="number" min=".01" step=".01" required value="${escapeHtml(model.amount)}" /></span></label>
      <label><span>${t("paymentDate")}</span><input class="plain-input" name="paymentDate" type="date" required value="${model.paymentDate}" /></label>
      <label><span>${t("creditedDate")}</span><input class="plain-input" name="creditedDate" type="date" value="${model.creditedDate}" /></label>
      <label><span>${t("paymentType")}</span><select class="select-input" name="type">${PAYMENT_TYPES.map((type) => `<option value="${type}" ${model.type === type ? "selected" : ""}>${paymentTypeLabel(type)}</option>`).join("")}</select></label>
    </div><div class="form-actions"><button class="button primary" type="submit">${editing ? t("updatePayment") : t("savePayment")}</button>${editing ? `<button class="button secondary" type="button" data-action="cancel-payment">${t("cancel")}</button>` : ""}</div></form>
    <section class="panel data-panel payments-panel"><div class="section-heading"><div><span class="step">02</span><div><h2>${t("paymentHistory")}</h2><p>${t("recordedPayments")}: <strong>${currency(total)}</strong></p></div></div><div class="file-actions"><button class="text-button" type="button" data-action="export-csv">${icon("download")}${t("exportCsv")}</button><button class="text-button" type="button" data-action="import-csv">${icon("upload")}${t("importCsv")}</button></div></div>${payments.length ? `<div class="payment-list">${payments.map((payment) => `<article class="payment-row"><div class="payment-amount"><span>${paymentTypeLabel(payment.type)}</span><strong>${currency(payment.amount, 2)}</strong></div><div class="payment-date"><strong>${dateLabel(payment.paymentDate)}</strong>${payment.creditedDate ? `<span>${t("creditedOn", { date: dateLabel(payment.creditedDate) })}</span>` : ""}</div><div class="row-actions"><button class="text-button" type="button" data-action="edit-payment" data-id="${escapeHtml(payment.id)}">${icon("pencil")}${t("edit")}</button><button class="text-button danger" type="button" data-action="delete-payment" data-id="${escapeHtml(payment.id)}">${icon("trash-2")}${t("delete")}</button></div></article>`).join("")}</div>` : `<div class="empty-state">${icon("receipt-text")}<p>${t("noPayments")}</p></div>`}</section></section>
  `;
}

function renderWhatIf() {
  const scenarioInputs = { extraPayment: numberValue(state.whatIf.extraPayment), extraPaymentDate: state.whatIf.extraPaymentDate, monthlyExtra: numberValue(state.whatIf.monthlyExtra) };
  let result = null;
  try { result = compareExtraPayment({ startingBalance: state.track.currentBalance, asOfDate: state.track.balanceAsOf, annualRate: state.track.annualRate, monthlyPayment: state.track.monthlyPayment, paymentDay: state.track.paymentDay, method: state.track.method, dayCountBasis: state.track.dayCountBasis, ...scenarioInputs }); } catch { result = null; }
  const hasChange = scenarioInputs.extraPayment > 0 || scenarioInputs.monthlyExtra > 0;
  return `
    ${intro(t("whatIf").toUpperCase(), t("whatIfTitle"), t("whatIfLede"))}
    <section class="calculator-grid whatif-grid"><form class="panel form-panel" id="whatif-form"><div class="section-heading"><div><span class="step">01</span><h2>${t("scenario")}</h2></div></div><div class="stacked-fields">
      <label><span>${t("oneTimeExtra")}</span>${inputShell({ path: "whatIf", name: "extraPayment", value: state.whatIf.extraPayment, prefix: state.country === "IN" ? "₹" : "$" })}</label>
      <label><span>${t("extraDate")}</span>${inputShell({ path: "whatIf", name: "extraPaymentDate", value: state.whatIf.extraPaymentDate, type: "date", min: tomorrowAfter(state.track.balanceAsOf) })}</label>
      <label><span>${t("monthlyExtra")}</span>${inputShell({ path: "whatIf", name: "monthlyExtra", value: state.whatIf.monthlyExtra, prefix: state.country === "IN" ? "₹" : "$" })}</label>
    </div><div class="current-plan-strip"><span>${t("currentBalance")}</span><strong>${currency(state.track.currentBalance)}</strong><span>${t("monthlyPayment")}</span><strong>${currency(state.track.monthlyPayment)}</strong><span>${t("currentRate")}</span><strong>${numberValue(state.track.annualRate).toFixed(2)}%</strong></div></form><aside class="panel result-panel" aria-live="polite">${renderWhatIfResults(result, hasChange)}</aside></section>
    ${renderFreedomTarget()}
    ${result ? `<section class="panel chart-panel comparison-chart"><div class="chart-heading"><h3>${t("comparisonTrend")}</h3></div>${renderChart([{ label: t("baseline"), schedule: result.baseline.schedule, color: "#7892a6", swatch: "muted" }, { label: t("newPlan"), schedule: result.scenario.schedule, color: "#c9a760", swatch: "gold" }])}</section>` : ""}
  `;
}

function renderFreedomTarget() {
  const years = Math.max(1, Math.min(50, Math.round(numberValue(state.whatIf.targetYears) || 5)));
  let targetPayment = 0;
  try { targetPayment = monthlyPayment(numberValue(state.track.currentBalance), numberValue(state.track.annualRate), years * 12); } catch { targetPayment = 0; }
  const increase = Math.max(0, targetPayment - numberValue(state.track.monthlyPayment));
  return `<section class="freedom-card"><div class="freedom-copy"><span class="freedom-icon">${icon("target")}</span><div><p class="eyebrow">${t("freedomTarget").toUpperCase()}</p><h2>${t("freedomTarget")}</h2><p>${t("freedomIntro")}</p></div></div><label><span>${t("targetYears")}</span>${inputShell({ path: "whatIf", name: "targetYears", value: years, suffix: t("years"), min: 1, max: 50, step: 1 })}</label><div class="freedom-result"><span>${t("targetPayment")}</span><strong>${currency(targetPayment)}</strong><small>${increase > 0 ? `${t("monthlyIncreaseNeeded")}: ${currency(increase)}` : t("alreadyOnTrack")}</small></div></section>`;
}

function tomorrowAfter(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return tomorrowISO;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function renderWhatIfResults(result, hasChange) {
  if (!result) return `<div class="empty-result light-empty">${icon("triangle-alert")}<p>${t("invalidInputs")}</p></div>`;
  if (!hasChange) return `<div class="empty-result light-empty">${icon("wand-sparkles")}<p>${t("noSavings")}</p></div>`;
  const interestSavings = result.interestSaved === null ? "—" : currency(result.interestSaved);
  const timeSavings = result.monthsSaved === null ? "—" : duration(result.monthsSaved);
  return `<div class="panel-heading"><div><span class="step light">02</span><h2>${t("newPlan")}</h2></div></div><p class="result-label">${t("interestSaved")}</p><p class="hero-number">${interestSavings}</p><div class="result-list whatif-results"><div><span>${t("balanceAfterExtra")}</span><strong>${currency(result.balanceAfterExtra)}</strong></div><div><span>${t("monthsSaved")}</span><strong>${timeSavings}</strong></div><div><span>${t("currentPayoff")}</span><strong>${result.baseline.payoffDate ? dateLabel(result.baseline.payoffDate) : t("notReached")}</strong></div><div><span>${t("newPayoff")}</span><strong>${result.scenario.payoffDate ? dateLabel(result.scenario.payoffDate) : t("notReached")}</strong></div></div>${result.baseline.negativeAmortization ? `<div class="insight warning-dark">${icon("triangle-alert")}<p>${t("payoffNeeded")}</p></div>` : `<div class="insight">${icon("lightbulb")}<p>${t("costExclusion")}</p></div>`}`;
}

function renderChart(series) {
  const populated = series.filter((item) => item.schedule?.length);
  if (!populated.length) return `<p class="empty-copy">${t("chartEmpty")}</p>`;
  const all = populated.flatMap((item) => item.schedule);
  const minDate = Math.min(...all.map((item) => new Date(`${item.date}T00:00:00Z`).getTime()));
  const maxDate = Math.max(...all.map((item) => new Date(`${item.date}T00:00:00Z`).getTime()));
  const maxBalance = Math.max(1, ...all.map((item) => item.closingBalance));
  const width = 760, height = 260, left = 62, right = 18, top = 18, bottom = 42;
  const innerWidth = width - left - right, innerHeight = height - top - bottom;
  const x = (date) => left + ((new Date(`${date}T00:00:00Z`).getTime() - minDate) / Math.max(1, maxDate - minDate)) * innerWidth;
  const y = (balance) => top + (1 - balance / maxBalance) * innerHeight;
  const paths = populated.map((item) => { const stride = Math.max(1, Math.ceil(item.schedule.length / 80)); const points = item.schedule.filter((_, index) => index % stride === 0 || index === item.schedule.length - 1); return `<path d="${points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.closingBalance).toFixed(1)}`).join(" ")}" fill="none" stroke="${item.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`; }).join("");
  const grid = [0, .5, 1].map((ratio) => `<g><line x1="${left}" x2="${width - right}" y1="${top + ratio * innerHeight}" y2="${top + ratio * innerHeight}" stroke="#dbe4ea" stroke-dasharray="4 5" /><text x="${left - 10}" y="${top + ratio * innerHeight + 4}" text-anchor="end">${currency(maxBalance * (1 - ratio))}</text></g>`).join("");
  return `<div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("balanceTrend"))}"><title>${escapeHtml(t("balanceTrend"))}</title>${grid}${paths}<text x="${left}" y="${height - 10}">${dateLabel(new Date(minDate).toISOString().slice(0, 10))}</text><text x="${width - right}" y="${height - 10}" text-anchor="end">${dateLabel(new Date(maxDate).toISOString().slice(0, 10))}</text></svg><div class="chart-legend">${populated.map((item) => `<span><i class="swatch-${escapeHtml(item.swatch || "blue")}"></i>${item.label}</span>`).join("")}</div></div>`;
}

function renderFooter() {
  return `<footer class="site-footer"><div class="footer-grid"><section><h2>${t("disclaimerTitle")}</h2><p>${t("disclaimer")}</p></section><section><h2>${t("privacyTitle")}</h2><p>${t("privacyCopy")}</p></section></div><div class="footer-actions"><button class="footer-button" type="button" data-action="export-backup">${t("exportProfile")}</button><button class="footer-button" type="button" data-action="import-backup">${t("importProfile")}</button><button class="footer-button danger" type="button" data-action="reset-data">${t("resetData")}</button></div><p class="footer-brand">LoanLens · ${new Date().getFullYear()}</p></footer>`;
}

function setAtPath(path, value) {
  const [group, key] = path.split(".");
  if (!state[group] || !key) return;
  state[group][key] = value;
}

function updatePlanResultDom() {
  const result = document.querySelector("#plan-results");
  if (result) { result.innerHTML = renderPlanResults(); hydrateIcons(result); }
}

function showNotice(message) {
  ui.notice = message;
  renderShell();
  window.setTimeout(() => { if (ui.notice === message) { ui.notice = ""; document.querySelector(".toast")?.remove(); } }, 3200);
}

app.addEventListener("input", (event) => {
  const element = event.target.closest("[data-bind]");
  if (!element) return;
  const value = element.dataset.valueType === "number" || element.type === "number" ? numberValue(element.value) : element.value;
  setAtPath(element.dataset.bind, value);
  saveState();
  if (element.dataset.bind.startsWith("plan.")) updatePlanResultDom();
});

app.addEventListener("change", async (event) => {
  if (event.target.matches('[data-action="language"]')) { state.language = event.target.value === "es" ? "es" : "en"; saveState(); renderShell(); return; }
  if (event.target.matches('[data-action="country-global"]')) { state.country = event.target.value === "IN" ? "IN" : "US"; saveState(); renderShell(); return; }
  const element = event.target.closest("[data-bind]");
  if (element) {
    const value = element.dataset.valueType === "number" || element.type === "number" || element.dataset.bind === "track.dayCountBasis" ? numberValue(element.value) : element.value;
    setAtPath(element.dataset.bind, value);
    if (element.dataset.bind === "track.balanceAsOf" && state.whatIf.extraPaymentDate <= state.track.balanceAsOf) state.whatIf.extraPaymentDate = tomorrowAfter(state.track.balanceAsOf);
    saveState();
    if (!element.dataset.bind.startsWith("plan.") || state.plan.compare) renderShell();
  }
  if (event.target.id === "csv-import") await importPaymentsCsv(event.target.files?.[0]);
  if (event.target.id === "backup-import") await importBackup(event.target.files?.[0]);
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "rate-form") addRate(new FormData(event.target));
  if (event.target.id === "payment-form") savePayment(new FormData(event.target));
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "navigate") { ui.view = button.dataset.view; ui.notice = ""; renderShell(); document.querySelector("#main")?.focus({ preventScroll: true }); }
  if (action === "country") { state.country = button.dataset.country === "IN" ? "IN" : "US"; saveState(); renderShell(); }
  if (action === "plan-loan-type") { state.plan.loanType = LOAN_TYPES.includes(button.dataset.loanType) ? button.dataset.loanType : "other"; saveState(); renderShell(); }
  if (action === "toggle-compare") { state.plan.compare = !state.plan.compare; saveState(); renderShell(); }
  if (action === "use-plan") usePlanInTracker();
  if (action === "delete-rate") { state.rateHistory = state.rateHistory.filter((rate) => rate.effectiveDate !== button.dataset.date); saveState(); renderShell(); }
  if (action === "edit-payment") { ui.editingPaymentId = button.dataset.id; renderShell(); }
  if (action === "delete-payment") deletePayment(button.dataset.id);
  if (action === "cancel-payment") { ui.editingPaymentId = null; renderShell(); }
  if (action === "export-csv") exportPaymentsCsv();
  if (action === "import-csv") document.querySelector("#csv-import")?.click();
  if (action === "export-backup") downloadFile("loanlens-backup.json", JSON.stringify({ version: 2, ...state }, null, 2), "application/json");
  if (action === "import-backup") document.querySelector("#backup-import")?.click();
  if (action === "reset-data") resetData();
});

function addRate(form) {
  const effectiveDate = String(form.get("effectiveDate") || ""), annualRate = Number(form.get("annualRate"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) return;
  state.rateHistory = state.rateHistory.filter((rate) => rate.effectiveDate !== effectiveDate);
  state.rateHistory.push({ effectiveDate, annualRate });
  saveState(); renderShell();
}

function savePayment(form) {
  const amount = Number(form.get("amount")), paymentDate = String(form.get("paymentDate") || ""), creditedDate = String(form.get("creditedDate") || ""), type = String(form.get("type") || "regular");
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !PAYMENT_TYPES.includes(type)) return;
  if (creditedDate && creditedDate < paymentDate) { showNotice(t("creditedError")); return; }
  const payment = { id: ui.editingPaymentId || crypto.randomUUID(), amount, paymentDate, creditedDate, type };
  state.payments = state.payments.filter((item) => item.id !== payment.id);
  state.payments.push(payment);
  ui.editingPaymentId = null;
  saveState(); showNotice(t("paymentSaved"));
}

function deletePayment(id) {
  state.payments = state.payments.filter((payment) => payment.id !== id);
  if (ui.editingPaymentId === id) ui.editingPaymentId = null;
  saveState(); showNotice(t("paymentDeleted"));
}

function usePlanInTracker() {
  try {
    const result = calculateLoanPlan(planParameters());
    state.track = { ...state.track, loanType: state.plan.loanType, originalAmount: Number(result.principal.toFixed(2)), currentBalance: Number(result.principal.toFixed(2)), annualRate: state.plan.annualRate, monthlyPayment: Number(result.monthlyPayment.toFixed(2)), termMonths: Math.round(state.plan.termYears * 12), disbursementDate: todayISO, balanceAsOf: todayISO };
    state.whatIf.extraPaymentDate = tomorrowISO;
    ui.view = "track";
    saveState(); renderShell();
  } catch { showNotice(t("invalidInputs")); }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportPaymentsCsv() {
  const header = "payment_id,payment_date,credited_date,amount,payment_type";
  const rows = state.payments.map((payment) => [payment.id, payment.paymentDate, payment.creditedDate, Number(payment.amount).toFixed(2), payment.type].map(csvCell).join(","));
  downloadFile("loanlens-payments.csv", [header, ...rows].join("\n"), "text/csv;charset=utf-8");
}

function parseCsvLine(line) {
  const cells = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value); value = ""; }
    else value += char;
  }
  cells.push(value);
  return cells;
}

async function importPaymentsCsv(file) {
  if (!file) return;
  try {
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines.shift() || "");
    const required = ["payment_id", "payment_date", "credited_date", "amount", "payment_type"];
    if (!required.every((header) => headers.includes(header))) throw new Error("headers");
    const imported = lines.map((line) => {
      const values = parseCsvLine(line), row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      const payment = { id: row.payment_id || crypto.randomUUID(), paymentDate: row.payment_date, creditedDate: row.credited_date, amount: Number(row.amount), type: row.payment_type };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate) || (payment.creditedDate && payment.creditedDate < payment.paymentDate) || !Number.isFinite(payment.amount) || payment.amount <= 0 || !PAYMENT_TYPES.includes(payment.type)) throw new Error("row");
      return payment;
    });
    const byId = new Map(state.payments.map((payment) => [payment.id, payment]));
    imported.forEach((payment) => byId.set(payment.id, payment));
    state.payments = [...byId.values()];
    saveState(); showNotice(t("importSuccess"));
  } catch { showNotice(t("invalidFile")); }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const candidate = JSON.parse(await file.text());
    if (candidate.version !== 2) throw new Error("version");
    state = normalizeState(candidate);
    saveState(); showNotice(t("backupImported"));
  } catch { showNotice(t("invalidFile")); }
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function resetData() {
  if (!window.confirm(t("resetConfirm"))) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  ui = { view: "plan", editingPaymentId: null, notice: t("dataReset") };
  renderShell();
}

function updateVisitorDom() {
  const label = visitor.count !== null ? `${new Intl.NumberFormat(state.language === "es" ? "es-US" : "en-US").format(visitor.count)} ${t("community")}` : t("counterUnavailable");
  ["#visitor-count", "#visitor-count-mobile"].forEach((selector) => { const element = document.querySelector(selector); if (element) element.textContent = label; });
}

async function registerAnonymousVisit() {
  try {
    let visitorId = localStorage.getItem(VISITOR_KEY);
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, visitorId); }
    const response = await fetch("/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId }) });
    if (!response.ok) throw new Error("counter");
    const payload = await response.json();
    const count = Number(payload.count);
    if (!Number.isFinite(count) || count < 0) throw new Error("counter");
    visitor = { count, unavailable: false };
  } catch { visitor = { count: null, unavailable: true }; }
  updateVisitorDom();
}

function registerWebMcpTool() {
  if (!document.modelContext?.registerTool) return;
  try {
    document.modelContext.registerTool({
      name: "calculate_loan_plan", title: "Calculate loan plan", description: "Calculate a monthly payment and lifetime cost estimate for a proposed loan without saving financial data.",
      inputSchema: { type: "object", properties: { totalCost: { type: "number", minimum: 0 }, downPayment: { type: "number", minimum: 0 }, annualRate: { type: "number", minimum: 0, maximum: 100 }, termMonths: { type: "integer", minimum: 1, maximum: 1200 }, financedFees: { type: "number", minimum: 0 } }, required: ["totalCost", "downPayment", "annualRate", "termMonths"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false }, execute(input) { return calculateLoanPlan(input); },
    });
  } catch { /* Experimental API support is optional. */ }
}

renderShell({ animate: false });
registerAnonymousVisit();
registerWebMcpTool();
