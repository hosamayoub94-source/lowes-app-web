# جرد التعرض الأمني — جداول مفتوحة لـ anon/authenticated (إنتاج، قراءة فقط، 24 تشرين الأول 2026)

المصدر: `pg_policies` + `has_table_privilege` + سجلات `edge_logs` (12 يوماً: 12–23 أكتوبر) + `pg_stat_user_tables`. الأرقام (صفوف/KB) من الإنتاج مباشرة.
**قراءة الجدول:** الأحرف R=قراءة I=إضافة U=تعديل D=حذف. «anon قبل» = ما يستطيعه أي زائر بلا تسجيل دخول فعلياً (امتياز + سياسة RLS مفتوحة). «طلبات anon فعلية» = العمليات التي شوهدت فعلاً في سجلات الـAPI بدون JWT.

| الأولوية | الجدول | صفوف | KB | بيانات حساسة | anon قبل | authenticated قبل | طلبات anon فعلية | الإجراء | anon بعد | authenticated بعد |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | `user_sessions` | 430 | 240 | SESSION TOKENS | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P0 | `profiles` | 50 | 312 | salary, email, address, password, pin(col), role, permissions | I | DI | RU | columns reduced | R + U(self-service cols) | DI |
| P0 | `employees` | 39 | 88 | PIN | DIU | DIU | — | CLOSED (anon + authenticated) | — | — |
| P0 | `monthly_payroll` | 37 | 48 | base salary, commission, overtime | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P0 | `system_settings` | 36 | 64 | ADMIN/MANAGER PASSWORDS + PINs (key names only checked) | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P0 | `audit_log` | 22 | 104 | IP, change history | DIRU | DIRU | — | CLOSED to anon | — | R (admin/payroll only, RLS) |
| P0 | `otp_codes` | 0 | 24 | one-time codes | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P0 | `salary_deductions` | 0 | 24 | salary deductions | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `orders` | 36461 | 36384 | customer name/phone/address, amounts | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P1 | `customer_stats` | 29949 | 0 | phone, totals (view) | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `campaign_sends` | 4392 | 1528 | customer names/phones | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `activity_logs` | 2273 | 1464 | IP addresses, user actions | IR | IR | RI | unchanged (app needs it) | IR | IR |
| P1 | `chat_messages` | 1356 | 352 | private chat | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `report_ad_results` | 1205 | 536 | amounts | DIRU | DIRU | RIUD | unchanged (app needs it) | DIRU | DIRU |
| P1 | `accounting_entries` | 923 | 464 | accounting amounts | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `daily_reports` | 882 | 424 | customer amounts | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P1 | `customer_notes` | 428 | 304 | customer phone keys, notes | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `product_economics` | 121 | 80 | cost, ad cost, price | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `expenses` | 75 | 32 | expense amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `messages` | 69 | 64 | private messages | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `report_other_sales` | 69 | 48 | amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `push_subscriptions` | 67 | 232 | push endpoints | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `commissions` | 46 | 48 | commission totals | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `lozy_chats` | 46 | 528 | AI chat history | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `report_source_results` | 46 | 64 | amounts | DIRU | DIRU | RIUD | unchanged (app needs it) | DIRU | DIRU |
| P1 | `income` | 42 | 32 | income amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `products` | 39 | 88 | cost price, margins | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `finance_ledger_migrated_20260607` | 37 | 96 | ledger amounts, salary deductions | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `employee_requests` | 32 | 160 | advance amounts, leave | IRU | IRU | — | CLOSED to anon | — | IRU |
| P1 | `referral_codes` | 18 | 96 | referral codes, phones | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `leads` | 4 | 80 | contact email/phone | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `leave_balances` | 3 | 56 | leave days | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `commission_rules` | 2 | 32 | commission rates | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `bonus_settings` | 1 | 32 | bonus amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `commission_config` | 1 | 32 | commission settings | I | I | — | CLOSED to anon | — | I |
| P1 | `crm_visits` | 1 | 64 | client code, order amount | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P1 | `ad_results` | 0 | 32 | revenue | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `advance_requests` | 0 | 56 | salary advance amounts | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `bonuses` | 0 | 32 | bonus amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `customer_contacts` | 0 | 24 | email, phone | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `customers` | 0 | 88 | address, revenue | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `daily_sales_ad_results` | 0 | 40 | amounts | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `daily_sales_reports` | 0 | 48 | sales totals | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P1 | `delivery_results` | 0 | 24 | amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `invoices` | 0 | 32 | client phone, totals | — | DIU | — | authenticated only | — | DIU |
| P1 | `mlm_join_requests` | 0 | 64 | phone | I | RU | I | unchanged (app needs it) | I | RU |
| P1 | `monthly_sales_records` | 0 | 40 | amounts | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P1 | `purchase_orders` | 0 | 24 | supplier contact, totals | I | I | — | CLOSED to anon | — | I |
| P1 | `sales_orders` | 0 | 24 | customer contact, totals | I | I | — | CLOSED to anon | — | I |
| P1 | `shipments` | 0 | 24 | address, phone | I | I | — | CLOSED to anon | — | I |
| P2 | `order_status_history` | 18395 | 3496 | order history | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `notifications` | 11824 | 12040 | notifications | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `wh_movements` | 10609 | 2984 | stock movements | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `attendance` | 9867 | 2184 | attendance history | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `inventory_daily_log` | 1480 | 448 | - | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `chat_room_members` | 1283 | 504 | - | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `quiz_questions` | 1231 | 2864 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `task_points` | 840 | 424 | points | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `quiz_responses` | 439 | 192 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `tasks` | 260 | 360 | - | DIRU | DIRU | RIUD | unchanged (app needs it) | DIRU | DIRU |
| P2 | `campaign_ads` | 239 | 160 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `product_name_map` | 230 | 136 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `chat_last_read` | 225 | 104 | - | DIRU | DIRU | RIU | anon REDUCED | IRU | DIRU |
| P2 | `wh_stock` | 155 | 112 | stock | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `campaigns` | 76 | 160 | campaign cost | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `partnerships` | 69 | 120 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `alerts` | 61 | 96 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `chat_rooms` | 55 | 64 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `chat_reactions` | 36 | 32 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `shift_partners` | 30 | 112 | - | DIRU | DIRU | RU | anon REDUCED | RU | DIRU |
| P2 | `accounting_channels` | 22 | 32 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `app_guides` | 21 | 88 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `accounting_categories` | 20 | 32 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `channels` | 17 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `quiz_certifications` | 16 | 48 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `chat_join_requests` | 14 | 48 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `exchange_rates` | 13 | 48 | exchange rates | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `social_posts` | 13 | 80 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `requests` | 10 | 64 | amounts | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `backup_log` | 9 | 1088 | backup log | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P2 | `project_members` | 9 | 40 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `deals` | 7 | 80 | customer id | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `lozy_knowledge` | 7 | 32 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `performance_reviews` | 7 | 112 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `pipeline_stages` | 6 | 64 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `wh_warehouses` | 6 | 32 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `departments` | 5 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `sales_channels` | 5 | 32 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `performance` | 4 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `sales_value_summary` | 4 | 0 | sales totals (view) | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `alert_rules` | 3 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `report_source_platforms` | 3 | 32 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `projects` | 2 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `announcements` | 1 | 80 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P2 | `app_settings` | 1 | 24 | settings | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P2 | `categories` | 1 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `pipelines` | 1 | 32 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `sales_targets` | 1 | 48 | sales targets | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P2 | `warehouses` | 1 | 48 | address | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `task_activity` | 813 | 448 | - | IR | IR | RIU | unchanged (app needs it) | IR | IR |
| P3 | `analytics_snapshots` | 87 | 112 | - | IR | IR | — | CLOSED to anon | — | IR |
| P3 | `network_audit` | 49 | 96 | network audit | R | R | — | CLOSED to anon | — | R |
| P3 | `task_comments` | 10 | 64 | - | IR | IR | R | anon REDUCED | R | IR |
| P3 | `shifts` | 9 | 32 | - | R | R | — | CLOSED to anon | — | R |
| P3 | `attendance_events` | 5 | 48 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `mlm_rank_rules` | 5 | 32 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `rep_level_rules` | 4 | 32 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `ad_daily_logs` | 0 | 96 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `attachments` | 0 | 24 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `break_sessions` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `challenge_progress` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `challenges` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `chat_pinned` | 0 | 16 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P3 | `clients` | 0 | 40 | phone | — | I | — | authenticated only | — | I |
| P3 | `consignments` | 0 | 32 | unit price | — | DIU | — | authenticated only | — | DIU |
| P3 | `daily_report_campaigns` | 0 | 8 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `daily_sales_channel_results` | 0 | 16 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `dashboard_widgets` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `deal_activities` | 0 | 32 | customer id | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `employee_badges` | 0 | 32 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `employee_kpis` | 0 | 24 | performance | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `employee_partnerships` | 0 | 40 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `file_folders` | 0 | 32 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `followups` | 0 | 32 | customer id | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `inventory_adjustments` | 0 | 16 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `leave_requests` | 0 | 48 | leave | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P3 | `mlm_groups` | 0 | 32 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `monthly_commission_adjustments` | 0 | 24 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `mystery_shopper` | 0 | 16 | prices | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `partnership_requests` | 0 | 48 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `performance_scores` | 0 | 24 | performance | DIRU | DIRU | — | CLOSED (anon + authenticated) | — | — |
| P3 | `price_violations` | 0 | 24 | prices | I | I | — | CLOSED (anon + authenticated) | — | — |
| P3 | `product_variants` | 0 | 24 | cost, barcode | I | I | — | CLOSED to anon | — | I |
| P3 | `purchase_order_items` | 0 | 16 | unit costs | I | I | — | CLOSED to anon | — | I |
| P3 | `report_exports` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `sales_notes` | 0 | 32 | customer notes | I | I | — | CLOSED to anon | — | I |
| P3 | `sales_order_items` | 0 | 16 | prices | I | I | — | CLOSED to anon | — | I |
| P3 | `saved_reports` | 0 | 24 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `seller_badges` | 0 | 64 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `shift_groups` | 0 | 48 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P3 | `shift_schedule` | 0 | 56 | - | DIRU | DIRU | R | anon REDUCED | R | DIRU |
| P3 | `stock_levels` | 0 | 32 | - | I | I | — | CLOSED to anon | — | I |
| P3 | `stock_movements` | 0 | 32 | unit cost | I | I | — | CLOSED to anon | — | I |
| P3 | `task_subtasks` | 0 | 24 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `task_timeline` | 0 | 24 | - | DIRU | DIRU | — | CLOSED to anon | — | DIRU |
| P3 | `territories` | 0 | 32 | - | I | I | — | CLOSED to anon | — | I |

**الإحصاء:** 146 كائناً مكشوفاً (جداول + 2 views) — P0: 8 · P1: 42 · P2: 49 · P3: 47.
