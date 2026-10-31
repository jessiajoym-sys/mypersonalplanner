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
