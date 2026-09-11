import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateLoanPlan,
  compareExtraPayment,
  dailyInterest,
  estimateMoratorium,
  monthlyPayment,
  projectLoan,
  rateOn,
  simulateDailyHistory,
} from "../src/finance.js";

describe("loan planning", () => {
  it("calculates a known fixed-rate mortgage payment", () => {
    assert.ok(Math.abs(monthlyPayment(360000, 6.5, 360) - 2275.44) < 0.01);
  });

  it("supports zero-interest loans", () => {
    assert.equal(monthlyPayment(12000, 0, 12), 1000);
  });

  it("includes financed fees and affordability ratios", () => {
    const plan = calculateLoanPlan({
      totalCost: 30000,
      downPayment: 5000,
      financedFees: 1000,
      upfrontFees: 500,
      annualRate: 6,
      termMonths: 60,
      monthlyIncome: 6000,
      existingMonthlyDebt: 500,
    });
    assert.equal(plan.principal, 26000);
    assert.ok(plan.totalCashCost > 31500);
    assert.ok(plan.debtToIncomePercent > plan.paymentToIncomePercent);
  });
});

describe("tracking and payoff projections", () => {
  const base = {
    startingBalance: 250000,
    asOfDate: "2026-01-15",
    annualRate: 6.25,
    monthlyPayment: 1900,
    paymentDay: 1,
    method: "monthly",
  };

  it("projects payoff and applies payments interest first", () => {
    const result = projectLoan(base);
    assert.notEqual(result.payoffDate, null);
    assert.ok(result.endingBalance < 0.005);
    assert.ok(result.totalInterest > 0);
    assert.ok(Math.abs(result.schedule[0].principal - 597.92) < 0.1);
  });

  it("flags a payment that does not cover estimated monthly interest", () => {
    const result = projectLoan({ ...base, monthlyPayment: 500 });
    assert.equal(result.negativeAmortization, true);
    assert.equal(result.payoffDate, null);
    assert.ok(result.endingBalance > base.startingBalance);
  });

  it("shows that extra payments reduce interest and payoff time", () => {
    const result = compareExtraPayment({
      ...base,
      extraPayment: 10000,
      extraPaymentDate: "2026-02-01",
      monthlyExtra: 100,
    });
    assert.ok(result.monthsSaved > 0);
    assert.ok(result.interestSaved > 0);
    assert.ok(result.scenario.totalInterest < result.baseline.totalInterest);
  });

  it("supports daily-interest payoff estimates", () => {
    const result = projectLoan({ ...base, method: "daily", dayCountBasis: 365 });
    assert.notEqual(result.payoffDate, null);
    assert.ok(result.schedule.length > 100);
  });
});

describe("daily history and variable rates", () => {
  it("uses the latest effective rate", () => {
    const history = [
      { effectiveDate: "2025-01-01", annualRate: 8 },
      { effectiveDate: "2026-01-01", annualRate: 9.5 },
    ];
    assert.equal(rateOn(new Date("2025-06-01T00:00:00Z"), history, 7), 8);
    assert.equal(rateOn(new Date("2026-02-01T00:00:00Z"), history, 7), 9.5);
  });

  it("uses credited date when calculating a payment event", () => {
    const result = simulateDailyHistory({
      openingPrincipal: 10000,
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      annualRate: 10,
      payments: [{ amount: 1000, paymentDate: "2026-01-05", creditedDate: "2026-01-08" }],
    });
    const entry = result.entries.find((item) => item.paymentAmount > 0);
    assert.equal(entry.date, "2026-01-08");
  });

  it("matches part-interest behavior: unpaid interest increases balance", () => {
    const result = estimateMoratorium({
      originalAmount: 2500000,
      disbursementDate: "2025-01-01",
      annualRate: 12,
      moratoriumMonths: 6,
      monthlyPartInterest: 3000,
      paymentDay: 1,
    });
    assert.ok(result.totalInterestPaid > 0);
    assert.equal(result.totalPrincipalPaid, 0);
    assert.ok(result.endingBalance > 2500000);
  });

  it("calculates one day of simple interest without early rounding", () => {
    assert.ok(Math.abs(dailyInterest(100000, 12, 365) - 32.8767) < 0.0001);
  });
});
