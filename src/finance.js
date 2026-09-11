const MONEY_EPSILON = 0.005;
const MAX_PROJECTION_MONTHS = 1200;

function finiteNumber(value, label, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

export function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new TypeError("Date must use YYYY-MM-DD format.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new RangeError("Date is not valid.");
  }
  return result;
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMonths(date, months, preferredDay = date.getUTCDate()) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(preferredDay, lastDay));
  return result;
}

function isBefore(left, right) {
  return left.getTime() < right.getTime();
}

function isSameOrBefore(left, right) {
  return left.getTime() <= right.getTime();
}

function monthsBetweenCeil(start, end) {
  const raw = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.max(0, raw + (end.getUTCDate() > start.getUTCDate() ? 1 : 0));
}

function nextPaymentDate(asOf, paymentDay) {
  const candidate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), paymentDay));
  return isBefore(asOf, candidate) ? candidate : addMonths(candidate, 1, paymentDay);
}

export function monthlyPayment(principalValue, annualRateValue, termMonthsValue) {
  const principal = finiteNumber(principalValue, "Principal");
  const annualRate = finiteNumber(annualRateValue, "Annual rate", { max: 100 });
  const termMonths = finiteNumber(termMonthsValue, "Term", { min: 1, max: MAX_PROJECTION_MONTHS });
  if (principal === 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / termMonths;
  const growth = (1 + monthlyRate) ** termMonths;
  return principal * monthlyRate * growth / (growth - 1);
}

export function calculateLoanPlan({
  totalCost: totalCostValue,
  downPayment: downPaymentValue = 0,
  annualRate: annualRateValue,
  termMonths: termMonthsValue,
  financedFees: financedFeesValue = 0,
  upfrontFees: upfrontFeesValue = 0,
  monthlyIncome: monthlyIncomeValue = 0,
  existingMonthlyDebt: existingMonthlyDebtValue = 0,
}) {
  const totalCost = finiteNumber(totalCostValue, "Total cost");
  const downPayment = finiteNumber(downPaymentValue, "Down payment");
  const financedFees = finiteNumber(financedFeesValue, "Financed fees");
  const upfrontFees = finiteNumber(upfrontFeesValue, "Upfront fees");
  const annualRate = finiteNumber(annualRateValue, "Annual rate", { max: 100 });
  const termMonths = finiteNumber(termMonthsValue, "Term", { min: 1, max: MAX_PROJECTION_MONTHS });
  const monthlyIncome = finiteNumber(monthlyIncomeValue, "Monthly income");
  const existingMonthlyDebt = finiteNumber(existingMonthlyDebtValue, "Existing monthly debt");
  if (downPayment > totalCost) throw new RangeError("Down payment cannot exceed total cost.");

  const principal = totalCost - downPayment + financedFees;
  const payment = monthlyPayment(principal, annualRate, termMonths);
  const loanPayments = payment * termMonths;
  const interest = Math.max(0, loanPayments - principal);
  const cashAndPayments = downPayment + upfrontFees + loanPayments;
  const downPaymentPercent = totalCost === 0 ? 0 : downPayment / totalCost * 100;
  const paymentToIncomePercent = monthlyIncome === 0 ? null : payment / monthlyIncome * 100;
  const debtToIncomePercent = monthlyIncome === 0
    ? null
    : (payment + existingMonthlyDebt) / monthlyIncome * 100;

  return {
    principal,
    monthlyPayment: payment,
    totalInterest: interest,
    totalLoanPayments: loanPayments,
    totalCashCost: cashAndPayments,
    downPaymentPercent,
    paymentToIncomePercent,
    debtToIncomePercent,
  };
}

export function rateOn(date, rateHistory = [], fallbackRate = 0) {
  let rate = finiteNumber(fallbackRate, "Fallback rate", { max: 100 });
  const sorted = [...rateHistory].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const dateKey = toISODate(date);
  for (const change of sorted) {
    if (change.effectiveDate > dateKey) break;
    rate = finiteNumber(change.annualRate, "Annual rate", { max: 100 });
  }
  return rate;
}

export function dailyInterest(balanceValue, annualRateValue, dayCountBasis = 365) {
  const balance = finiteNumber(balanceValue, "Balance");
  const annualRate = finiteNumber(annualRateValue, "Annual rate", { max: 100 });
  const basis = finiteNumber(dayCountBasis, "Day-count basis", { min: 1, max: 366 });
  return balance * annualRate / 100 / basis;
}

export function simulateDailyHistory({
  openingPrincipal: openingPrincipalValue,
  startDate,
  endDate,
  annualRate: annualRateValue,
  rateHistory = [],
  payments = [],
  dayCountBasis = 365,
}) {
  let principal = finiteNumber(openingPrincipalValue, "Opening principal");
  const annualRate = finiteNumber(annualRateValue, "Annual rate", { max: 100 });
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (isBefore(end, start)) throw new RangeError("End date cannot be before start date.");

  const paymentMap = new Map();
  payments.forEach((payment) => {
    const amount = finiteNumber(payment.amount, "Payment amount", { min: Number.EPSILON });
    const key = payment.creditedDate || payment.paymentDate;
    parseISODate(key);
    paymentMap.set(key, (paymentMap.get(key) || 0) + amount);
  });

  let unpaidInterest = 0;
  let totalInterestAccrued = 0;
  let totalInterestPaid = 0;
  let totalPrincipalPaid = 0;
  const entries = [];

  for (let day = new Date(start); isSameOrBefore(day, end); day = addDays(day, 1)) {
    const openingBalance = principal + unpaidInterest;
    const currentRate = rateOn(day, rateHistory, annualRate);
    const interestAccrued = dailyInterest(openingBalance, currentRate, dayCountBasis);
    unpaidInterest += interestAccrued;
    totalInterestAccrued += interestAccrued;
    const requestedPayment = paymentMap.get(toISODate(day)) || 0;
    const appliedPayment = Math.min(requestedPayment, principal + unpaidInterest);
    const interestPaid = Math.min(appliedPayment, unpaidInterest);
    unpaidInterest -= interestPaid;
    const principalPaid = Math.min(appliedPayment - interestPaid, principal);
    principal -= principalPaid;
    totalInterestPaid += interestPaid;
    totalPrincipalPaid += principalPaid;
    const closingBalance = Math.max(0, principal + unpaidInterest);

    if (requestedPayment > 0 || day.getUTCDate() === 1 || day.getTime() === end.getTime()) {
      entries.push({
        date: toISODate(day),
        openingBalance,
        annualRate: currentRate,
        interestAccrued,
        paymentAmount: appliedPayment,
        interestPaid,
        principalPaid,
        closingBalance,
      });
    }
    if (closingBalance <= MONEY_EPSILON) break;
  }

  return {
    entries,
    endingBalance: Math.max(0, principal + unpaidInterest),
    totalInterestAccrued,
    totalInterestPaid,
    totalPrincipalPaid,
  };
}

function projectMonthly({
  startingBalance,
  asOf,
  annualRate,
  paymentAmount,
  paymentDay,
  extraPayment,
  extraPaymentDate,
  monthlyExtra,
  maxMonths,
}) {
  let balance = startingBalance;
  let dueDate = nextPaymentDate(asOf, paymentDay);
  const extraDate = extraPayment > 0 ? parseISODate(extraPaymentDate) : null;
  let extraApplied = false;
  let totalInterest = 0;
  let totalPayments = 0;
  const schedule = [];
  let payoffDate = null;

  for (let month = 1; month <= maxMonths; month += 1) {
    let appliedExtra = 0;
    if (extraDate && !extraApplied && isSameOrBefore(extraDate, dueDate)) {
      appliedExtra = Math.min(extraPayment, balance);
      balance -= appliedExtra;
      totalPayments += appliedExtra;
      extraApplied = true;
      if (balance <= MONEY_EPSILON) {
        payoffDate = extraDate;
        schedule.push({ date: toISODate(extraDate), openingBalance: balance + appliedExtra, interest: 0, payment: appliedExtra, principal: appliedExtra, closingBalance: 0 });
        break;
      }
    }

    const openingBalance = balance;
    const interest = balance * annualRate / 100 / 12;
    const requestedPayment = paymentAmount + monthlyExtra;
    const appliedPayment = Math.min(requestedPayment, balance + interest);
    const principalPaid = Math.max(0, appliedPayment - interest);
    balance = Math.max(0, balance + interest - appliedPayment);
    totalInterest += interest;
    totalPayments += appliedPayment;
    schedule.push({
      date: toISODate(dueDate),
      openingBalance,
      interest,
      payment: appliedPayment + appliedExtra,
      principal: principalPaid + appliedExtra,
      closingBalance: balance,
    });
    if (balance <= MONEY_EPSILON) {
      payoffDate = dueDate;
      break;
    }
    dueDate = addMonths(dueDate, 1, paymentDay);
  }

  return { schedule, balance, payoffDate, totalInterest, totalPayments };
}

function projectDaily({
  startingBalance,
  asOf,
  annualRate,
  paymentAmount,
  paymentDay,
  extraPayment,
  extraPaymentDate,
  monthlyExtra,
  dayCountBasis,
  maxMonths,
}) {
  let balance = startingBalance;
  let totalInterest = 0;
  let totalPayments = 0;
  const schedule = [];
  let payoffDate = null;
  const extraDate = extraPayment > 0 ? parseISODate(extraPaymentDate) : null;
  const endDate = addMonths(asOf, maxMonths);

  for (let day = addDays(asOf, 1); isSameOrBefore(day, endDate); day = addDays(day, 1)) {
    const openingBalance = balance;
    const interest = dailyInterest(balance, annualRate, dayCountBasis);
    balance += interest;
    totalInterest += interest;
    let requestedPayment = 0;
    if (day.getUTCDate() === paymentDay) requestedPayment += paymentAmount + monthlyExtra;
    if (extraDate && day.getTime() === extraDate.getTime()) requestedPayment += extraPayment;
    const appliedPayment = Math.min(requestedPayment, balance);
    balance = Math.max(0, balance - appliedPayment);
    totalPayments += appliedPayment;

    if (requestedPayment > 0 || day.getUTCDate() === 1 || balance <= MONEY_EPSILON) {
      schedule.push({
        date: toISODate(day),
        openingBalance,
        interest,
        payment: appliedPayment,
        principal: Math.max(0, appliedPayment - interest),
        closingBalance: balance,
      });
    }
    if (balance <= MONEY_EPSILON) {
      payoffDate = day;
      break;
    }
  }

  return { schedule, balance, payoffDate, totalInterest, totalPayments };
}

export function projectLoan({
  startingBalance: startingBalanceValue,
  asOfDate,
  annualRate: annualRateValue,
  monthlyPayment: monthlyPaymentValue,
  paymentDay: paymentDayValue,
  method = "monthly",
  extraPayment: extraPaymentValue = 0,
  extraPaymentDate,
  monthlyExtra: monthlyExtraValue = 0,
  dayCountBasis = 365,
  maxMonths = MAX_PROJECTION_MONTHS,
}) {
  const startingBalance = finiteNumber(startingBalanceValue, "Starting balance");
  const annualRate = finiteNumber(annualRateValue, "Annual rate", { max: 100 });
  const paymentAmount = finiteNumber(monthlyPaymentValue, "Monthly payment");
  const paymentDay = finiteNumber(paymentDayValue, "Payment day", { min: 1, max: 28 });
  const extraPayment = finiteNumber(extraPaymentValue, "Extra payment");
  const monthlyExtra = finiteNumber(monthlyExtraValue, "Monthly extra");
  finiteNumber(maxMonths, "Maximum months", { min: 1, max: MAX_PROJECTION_MONTHS });
  if (!['monthly', 'daily'].includes(method)) throw new RangeError("Method must be monthly or daily.");
  const asOf = parseISODate(asOfDate);
  const effectiveExtraDate = extraPaymentDate || toISODate(addDays(asOf, 1));
  if (extraPayment > 0 && isSameOrBefore(parseISODate(effectiveExtraDate), asOf)) {
    throw new RangeError("Extra payment date must be after the balance date.");
  }
  if (startingBalance <= MONEY_EPSILON) {
    return { schedule: [], endingBalance: 0, payoffDate: asOfDate, monthsToPayoff: 0, totalInterest: 0, totalPayments: 0, negativeAmortization: false };
  }

  const parameters = {
    startingBalance,
    asOf,
    annualRate,
    paymentAmount,
    paymentDay,
    extraPayment,
    extraPaymentDate: effectiveExtraDate,
    monthlyExtra,
    dayCountBasis,
    maxMonths,
  };
  const result = method === "daily" ? projectDaily(parameters) : projectMonthly(parameters);
  const firstMonthInterest = startingBalance * annualRate / 100 / 12;
  return {
    schedule: result.schedule,
    endingBalance: result.balance,
    payoffDate: result.payoffDate ? toISODate(result.payoffDate) : null,
    monthsToPayoff: result.payoffDate ? monthsBetweenCeil(asOf, result.payoffDate) : null,
    totalInterest: result.totalInterest,
    totalPayments: result.totalPayments,
    negativeAmortization: paymentAmount + monthlyExtra <= firstMonthInterest && annualRate > 0,
  };
}

export function compareExtraPayment(params) {
  const baseline = projectLoan({ ...params, extraPayment: 0, monthlyExtra: 0 });
  const scenario = projectLoan(params);
  const comparable = baseline.payoffDate && scenario.payoffDate;
  return {
    baseline,
    scenario,
    balanceAfterExtra: Math.max(0, Number(params.startingBalance) - Number(params.extraPayment || 0)),
    monthsSaved: comparable ? Math.max(0, baseline.monthsToPayoff - scenario.monthsToPayoff) : null,
    interestSaved: comparable ? Math.max(0, baseline.totalInterest - scenario.totalInterest) : null,
  };
}

export function estimateMoratorium({
  originalAmount,
  disbursementDate,
  annualRate,
  moratoriumMonths,
  monthlyPartInterest = 0,
  paymentDay = 1,
  dayCountBasis = 365,
}) {
  const start = parseISODate(disbursementDate);
  const months = finiteNumber(moratoriumMonths, "Moratorium months", { max: 240 });
  if (months === 0) return { endingBalance: Number(originalAmount), totalInterestAccrued: 0, totalInterestPaid: 0, totalPrincipalPaid: 0, entries: [] };
  const end = addMonths(start, months);
  const payments = [];
  for (let due = nextPaymentDate(start, paymentDay); isBefore(due, end); due = addMonths(due, 1, paymentDay)) {
    if (monthlyPartInterest > 0) payments.push({ amount: monthlyPartInterest, paymentDate: toISODate(due) });
  }
  return simulateDailyHistory({
    openingPrincipal: originalAmount,
    startDate: disbursementDate,
    endDate: toISODate(end),
    annualRate,
    payments,
    dayCountBasis,
  });
}

export function validatePlanInputs(plan) {
  try {
    calculateLoanPlan(plan);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid loan inputs.";
  }
}
