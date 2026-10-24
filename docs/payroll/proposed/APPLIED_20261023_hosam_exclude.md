# APPLIED — 20261023_hosam_exclude_from_payroll

Applied to production (`fghdumrgimoeqsafdhhh`) on 23/10/2026 by `apply_migration`
name `hosam_exclude_from_payroll_20261023`, with Hosam's explicit approval.
Script: `20261023_hosam_exclude_from_payroll.sql` — rollback: `..._rollback.sql`.

| | before | after |
|---|---|---|
| September draft entries | 34 | 33 |
| September net total | 4698.90 | 4698.90 |
| md5 of the 33 other entries | 2bb1c9f6… | 2bb1c9f6… (identical) |
| hosam `payroll_excluded` | false | true |
| hosam `payroll_access.can_finalize` | true | true (unchanged) |
| zero-salary entries in September | 1 | 0 |
| `employee_salary_settings` md5 | e5b6d8aa… | e5b6d8aa… |
| backup tables | 0 | 2 (RLS on, no anon/authenticated grants) |

Chrome check on /payroll (logged in as hosam ayoub): the
"1 موظف بلا راتب أساسي" warning is gone; the approve button stays disabled only
because of "الحسبة الحالية قديمة (البدلات عُدِّلت بعد آخر حسبة)".
Next: press "⚡ تشغيل الدورة" for September, review totals, then approve.
