# Planner update setup

This project update adds a collapsible English navigation, project and business dashboards, project task tracking, daily/weekly/monthly Daily Log views, a Journal, a Travel Content Studio, business-tagged transactions and summaries, manually tracked investments, an Excel-friendly monthly CSV export, and a Loans & Installments page.

## Before using the new features

1. In Supabase, open **SQL Editor** and run `lib/planner-upgrade.sql`. The script only adds columns and a new owner-protected loans table; it does not delete or rewrite existing financial records.
2. Deploy this project source to your existing GitHub repository.
3. Open the deployed app and try adding one sample project idea, loan, and business-tagged transaction before importing real statements.

The content review is a small checklist that runs in the browser. It does not send scripts to an AI provider and cannot predict whether content will go viral. Investment tracking is manual and does not connect to Bibit/IPOT or fetch live prices. PDF passwords are not used by these additions.

## Report export

In Financial Planner, select **Reports** and choose **Export for Excel (CSV)**. Excel can open the downloaded CSV. It includes the selected month’s transactions, categories, account, business, currency, and amount.

## Notes

Existing rows remain in place. Historical transactions are not automatically assigned to businesses; choose a business on new transactions or edit/import historical data separately. Statement imports also remain review-first so transactions can be checked before saving.

---

# Upgrade 2 (tasks + smart calendar + Daily Log)

1. **Supabase → SQL Editor → run `lib/planner-upgrade-2.sql` once.** (Before deploying.) It only adds columns, copies your old dashboard tasks and weekly-schedule tasks into the one shared task table, and back-fills the Daily Log. Nothing is deleted. Dates in the back-fill use Asia/Shanghai time.
2. Deploy the code as usual (GitHub → Vercel).
3. Open the app and allow browser notifications when asked (needed for alert banners).

What changed: all tasks/errands now live in one table (`todos`). Main Dashboard, Tasks & To-Do, Calendar, Schedule, Master's Degree and Daily Log all read/write it, so adding, ticking or editing in one place updates the rest. Ticking a task keeps it visible (✓) and logs it in Daily Log; un-ticking removes the log entry.

---

# Upgrade 3 (fixes, cycle tracker, phone install)

1. Supabase → SQL Editor → run `lib/planner-upgrade-3.sql` once (fixes the `end_date` error, adds the private cycle tracker).
2. Deploy as usual.
3. **Install on your phone (iPhone):** open the site in **Safari** → Share button → **Add to Home Screen** → Add. It opens full-screen like an app, with its own icon.
   **Android:** Chrome → ⋮ menu → **Install app**.

---

# Upgrade 4 (Daily Habits + Project Management)

1. Supabase → SQL Editor → run `lib/planner-upgrade-4.sql` once.
2. Deploy as usual.

New: Daily Habits (separate Habits / Medicine / Vitamins with times of day, stats for 7 days → year, Progress Goals such as Bible pericopes). Projects Dashboard + a page per project (overview & health check, tasks, milestones, budget, risks & review, activity). Milestones show on the Calendar.

## Upgrade 5 — Finance
1. Run `lib/planner-upgrade-5.sql` in Supabase > SQL Editor (choose "Run and enable RLS" if asked).
2. Upload the new files to GitHub; Vercel redeploys.
What's new: fixed transaction totals on Dashboard/Schedule/Projects, Excel-like Transactions sheet (inline edit, filters, bulk tags, CSV),
Budget planner (total → categories → daily caps, shown on Dashboard), Overview + Reports merged, bills ticked off automatically and shown in the Calendar,
e-statement attachments on Loans and Investments.

## Upgrade 6 — Business
1. Run `lib/planner-upgrade-6.sql` in Supabase > SQL Editor (choose "Run and enable RLS" if asked).
2. Upload the new files to GitHub. IMPORTANT: delete the old folders `app/business/sambal`, `polar`, `chishee`, `homemate`, `jastip` (they are replaced by one page that works for every business).
What's new: per-business workspace (Overview, Ledger, Sales & Ads, Receivable/Payable, Inventory, Reports, Plans, Marketing, Tasks & Projects, Settings)
and a combined Business Dashboard.

## Upgrade 7 — Growth & Reflection
1. Run `lib/planner-upgrade-7.sql` in Supabase > SQL Editor (choose "Run and enable RLS" if asked).
2. Upload the new files to GitHub (new folder `app/diary`, new `components/growth`).
What's new: Resolutions (pace check, auto progress from projects/businesses, vision board), Odyssey Plan (pictures, compare, make tasks),
Mood in Pixels (tags, energy, insights), Journal (guided prompts) and Diary (private, optional PIN), plus a Growth card on the Dashboard.
