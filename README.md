# LoanLens

LoanLens is a privacy-first browser app for planning and understanding loans in India and the United States. It supports home, vehicle, education, personal, and custom loans in English and Spanish.

The app has no login, bank connection, advertising tracker, or cloud database for financial data. Loan details stay in the visitor's browser unless they choose to export a backup.

## What it includes

- **Plan a loan:** purchase/cost amount, down payment, estimated rate, term, financed fees, monthly payment, lifetime interest, total cash cost, optional income ratios, and side-by-side offer comparison.
- **My loan:** current lender balance, fixed or variable rate, monthly-reducing or daily-simple-interest estimate, payoff date, future interest, balance trend, rate history, optional moratorium or part-interest analysis, and a plain-language Loan Health Story.
- **Payments:** amount, payment date, optional lender credited date, payment type, edit/delete, and CSV import/export.
- **What if:** one-time extra payments and higher monthly payments with estimated balance, payoff date, months saved, interest saved, comparison chart, and a Freedom Target that estimates the payment needed to become debt-free by a chosen year.
- **International and accessible:** USD/INR formatting, India/U.S. terminology, English/Spanish copy, responsive layouts, keyboard-visible focus, semantic controls, and reduced-motion support.
- **Premium visual system:** a restrained royal navy, antique-gold, and ivory interface with polished transitions, clear icons, and mobile-friendly controls.
- **Private traffic counter:** a Netlify Function stores one random anonymous browser key and displays an approximate community count. It does not receive loan inputs, names, email addresses, or account details.

## Run locally

Node.js 20 or newer is recommended.

```bash
npm install
npm run dev
```

Open the local address printed by Vite. The visitor counter intentionally shows as unavailable outside a Netlify environment; every loan feature still works locally.

## Test and build

```bash
npm run check
```

This runs the financial-engine and translation tests, then creates the production website in `dist/`.

## Deploy on Netlify

Connect the GitHub repository to Netlify. The committed `netlify.toml` supplies the settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Netlify automatically provisions the visitor counter's site-wide Blob store when the function first runs. No Supabase project or secret is needed.

## Calculation model

The independent engine lives in `src/finance.js`; the interface does not contain loan formulas.

1. Proposed-loan payments use the conventional fixed-payment amortization formula with a monthly periodic rate (`annual rate / 12`). Zero-interest loans divide principal evenly across the term.
2. The tracker offers two estimate methods:
   - **Monthly reducing balance:** interest is estimated monthly on the opening balance, then the payment is applied to interest and principal.
   - **Daily simple interest:** interest accrues each day using a selectable 360, 365, or 366-day basis; payments apply on their effective date.
3. Payments are applied to accrued interest before principal. A lender credited date takes priority over the date the borrower initiated a payment.
4. If a payment is below accrued interest, unpaid interest remains in the balance. This can produce negative amortization—a rising balance despite payments.
5. The lender-reported current balance is authoritative for future projections. Recorded payments are not used to overwrite it because a partial history cannot reproduce a lender statement exactly.
6. Future projections hold the current rate constant. The app does not predict rate changes, approval, refinancing terms, taxes, insurance, or lender fees.

See [validation notes](docs/VALIDATION.md) for representative test coverage and known limits.

## Data and privacy

- Loan, rate, and payment data is stored in browser `localStorage` only.
- Visitors can export/import a complete JSON backup and payment CSV.
- The anonymous traffic counter stores a random browser UUID only. Clearing browser storage creates a new key, so the displayed number is an approximate browser count—not audited unique people.
- The Content Security Policy limits the app to same-origin scripts, styles, and network requests.
- Real lender documents, financial exports, PDFs, spreadsheets, environment files, and secrets are excluded from Git.

The private Credila schedules used during initial product discovery were reference material only. They are not included in this repository; tests use generic altered values.

## Important disclaimer

LoanLens provides **educational planning estimates only**. It is not financial, legal, or tax advice; a lender statement; a loan offer; or a promise of approval or savings. Actual results may differ because lenders can use different compounding and day-count methods, posting dates, rate changes, capitalization, rounding, fees, taxes, insurance, penalties, business-day rules, and prepayment terms. Always compare important results with the latest lender statement and confirm material decisions with the lender or a qualified professional.

## Project structure

```text
index.html                    Website entry point and metadata
src/app.js                    Bilingual interface and local data workflows
src/finance.js                UI-independent loan calculation engine
src/i18n.js                   English and Spanish copy
src/styles.css                Responsive visual system
netlify/functions/visits.mjs  Anonymous community counter
tests/                        Financial and translation tests
netlify.toml                  Netlify build, routing, and security headers
```
