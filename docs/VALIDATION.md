# Financial-engine validation

LoanLens uses transparent estimates and treats the lender-reported current balance as the source of truth. The automated test suite covers both conventional amortization and the behavior observed in anonymized education-loan schedules. No personal schedule, account identifier, borrower name, or exact payment history is included.

## Representative checks

| Behavior | Engine rule | Automated coverage |
|---|---|---|
| Standard fixed loan | Monthly payment uses the conventional amortization formula | Known $360,000, 6.5%, 30-year payment case |
| Zero interest | Principal divides evenly over the term | $12,000 over 12 months |
| Fees and affordability | Financed fees increase principal; income ratios remain separate | Financed/upfront fee and income-ratio case |
| Payment allocation | Accrued interest is covered before principal | First-period principal assertion |
| Negative amortization | Balance grows when payment is below estimated interest | Low-payment 100-year projection case |
| Extra-payment impact | Compare the same loan with a lump sum and monthly extra | Payoff time and interest both decrease |
| Daily interest | Interest uses balance × annual rate ÷ day-count basis | One-day precision case and daily payoff path |
| Rate history | Latest rate effective on a date wins | Two-rate timeline case |
| Credited date | Lender credited date takes priority | Delayed-credit payment case |
| Part-interest period | Unpaid interest remains in total balance | Generic large-loan, small-payment moratorium case |
| Language completeness | English and Spanish keys remain aligned | Translation parity test |

## Important limitations

- Loan products differ. Monthly reducing balance and daily simple interest are selectable approximations, not automatic lender detection.
- Proposed home-loan results show principal and interest. Property tax, homeowners insurance, mortgage insurance, HOA charges, closing costs, maintenance, and adjustable-rate changes require separate consideration.
- Proposed vehicle-loan results do not automatically include sales tax, registration, dealer products, insurance, or depreciation.
- Education-loan deferment, subsidy, capitalization, grace periods, and part-interest programs vary by contract and country.
- Business-day shifts, holidays, late fees, prepayment penalties, allocation instructions, rate resets, and lender-specific rounding are not predicted.
- Daily calculations retain precision internally and round only for display; a lender may round at each posting event.
- The visitor count is an approximate count of browser identifiers, not audited users or page views.

For these reasons, every result is presented as an estimate and the interface carries a persistent disclaimer.
