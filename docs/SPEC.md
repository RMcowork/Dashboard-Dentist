# Dental Clinic Dashboard — Product Spec

Status: v0.1 (demo data + Airtable) · Last updated 2026-09-26

## 1. Problem & goals
A small private dental clinic (3 dentists, 3 chairs) keeps its schedule and billing in spreadsheets or a practice-management system. Nobody gets a quick answer to two questions:
- *Owner:* "Are we doing well, and where are we leaking money or time?"
- *Front desk:* "What's happening today, and whom do I need to call?"

**Goals**
1. The owner sees the business health for any period in under 10 seconds, compared with the previous period.
2. The front desk runs the day from one screen: schedule, live statuses, and call lists.
3. The team works in its own language: English, Hebrew or Arabic, with correct RTL.
4. The dashboard starts on realistic demo data and later switches to real data without UI changes.

**Non-goals (v0.1)**
- Editing data in the dashboard. It is read-only; the system of record is Airtable or the clinic's software.
- Clinical records, charts, X-rays or treatment plans.
- Authentication and multi-clinic support (see §9).

## 2. Users
| User | Needs | Tab |
|---|---|---|
| Clinic owner / manager | Revenue, collection, utilization, no-shows, dentist performance, trends | Overview |
| Front-desk staff | Today's chairs and statuses, next-day confirmations, balances to collect, recalls to book | Front desk |

## 3. Screens

### 3.1 Header (both tabs)
- Title and subtitle
- A **data source badge**: *Demo data* or *Airtable*
- A **language selector**: English / עברית / العربية. The choice is remembered per browser.
- Tabs: Overview · Front desk. `#today` in the URL opens Front desk.

### 3.2 Overview
- **Period selector**: last 7 days · last 28 days (default) · this month · last month · last 90 days · custom from/to. Every KPI compares with the **previous period of equal length**, ending the day before the period starts.
- **KPI cards (8)**, each with a change arrow and good/bad colouring. A text arrow is always shown, so colour is never the only signal:
  - Revenue
  - Collected (with collection rate)
  - Completed visits
  - New patients
  - No-show rate
  - Chair utilization
  - Average revenue per visit
  - Outstanding balance
- **Charts**. Each has a *Table* toggle that shows the same numbers as an accessible table.
  - Revenue over time: billed vs collected, two lines. Daily for ranges up to 31 days (closed days skipped), weekly otherwise.
  - Revenue by treatment category: sorted horizontal bars.
  - Revenue by dentist: horizontal bars in each dentist's identity colour.
  - No-show rate over time.
- **Dentist performance table**: visits, revenue, average per visit, no-shows, no-show rate.

### 3.3 Front desk
- **Day navigation**: previous / date picker / next / Today.
- **Counters**: booked, arrived, in chair, done, no-show.
- **Schedule grid**:
  - Columns = chairs, each headed by its dentist. Rows = 15-minute slots within opening hours.
  - Each appointment shows its time, status chip (icon + label), patient, and treatment (if tall enough).
  - The left edge is coloured by dentist. A red line marks "now" when viewing today.
  - Closed days show a message.
- **Unpaid balances**: patients with fee − paid > 0 on completed visits up to the selected day, highest first. Phone numbers are `tel:` links.
- **Recalls due**: patients whose last completed visit was more than 6 months ago and who have nothing booked, most overdue first.
- **Next day to confirm**: scheduled appointments on the next open day, with phone numbers.

## 4. KPI definitions
Implemented in `public/js/metrics.js` and tested in `test/metrics.test.js`. The period is `[from, to]`, inclusive, on appointment `date`.

| KPI | Formula |
|---|---|
| Revenue (billed) | Σ `fee` of **completed** appointments in period |
| Collected | Σ `paid` of completed appointments in period |
| Collection rate | Collected ÷ Revenue |
| Completed visits | count of completed appointments in period |
| New patients | count of patients whose `firstVisit` ∈ period |
| No-show rate | no-shows ÷ (completed + no-shows) in period. Cancellations are excluded. |
| Chair utilization | booked minutes ÷ available chair minutes (see below) |
| Avg revenue / visit | Revenue ÷ Completed visits |
| Outstanding balance | Σ max(0, `fee` − `paid`) over **all** completed appointments up to period end (a stock, not a flow) |

- **Booked minutes** = Σ `duration` of appointments in the period with status scheduled, checked in, in chair or completed.
- **Available chair minutes** = number of active chairs × Σ opening minutes of each day in the period.

Other rules:
- A ratio with a zero denominator is `null` and displays as "—", never NaN or 0%.
- Changes are shown in % for money and counts, and in percentage points ("pts") for rates.
- A lower value is good for no-show rate and outstanding balance.

**Opening hours** (`public/js/dates.js`):
| Days | Hours |
|---|---|
| Sun–Thu | 08:00–18:00 |
| Fri | 08:00–13:00 |
| Sat | closed |

The week starts on Sunday.

## 5. Data model
There are four tables, described in `server/schema.js`; see `docs/AIRTABLE.md` for field types.
- **Dentists**: name, specialty, chair, active
- **Treatments**: name in en/he/ar, category, price ₪, duration in minutes
- **Patients**: name, phone, birth date, gender, city, preferred language, first visit, last visit
- **Appointments**: date, start `HH:MM`, duration, links to patient / dentist / treatment, chair, status, fee ₪, paid ₪, payment method, source (new / returning / referral)

Payments are folded into appointments (`paid`, `paymentMethod`) to stay under the Airtable free-plan limit of 1,000 records per base. Partial payments over several visits would need a separate Payments table; see §9.

## 6. Data sources
| `DATA_SOURCE` | Behaviour |
|---|---|
| `auto` (default) | `airtable` when `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` are set, otherwise `demo`. |
| `demo` | Generated in memory by `server/demo/generate.js`, anchored to the real current date and time, so the Front desk tab always looks live. Deterministic for a given day. |
| `airtable` | Reads the four tables through the REST API on the server: a full load every `AIRTABLE_FULL_SYNC_MINUTES` (30), delta syncs of changed records in between, and at most one sync per `AIRTABLE_MIN_INTERVAL_SECONDS` (15). The token never reaches the browser. |
| *future* | CSV import, or a practice-management system export. Add an adapter that returns the same shape. |

Demo volume, sized for the free plan:
- 3 dentists
- 18 treatments
- 160 patients
- about 700 appointments: 8 weeks back and 2 weeks ahead

That comes to about 875 records, with about 8% no-shows, 5% cancellations, 18% of visits not fully paid, and about 40 patients due for recall.

### Live refresh
- The browser polls `/api/data` at a user-chosen interval: Off, 15 s, 30 s, **1 min (default)**, 2, 5 or 15 min. The choice is saved in localStorage.
- Every refresh visibly loads for at least 900 ms: a top progress bar, shimmer on cards, and a spinning sync ring.
- After loading, KPI values count up, cards whose value changed glow, changed appointments flash, and a toast reports *Data refreshed* with the number of changes.
- The sync pill shows *Live / Syncing / Offline / Paused*, "Updated X ago", and a ring counting down to the next refresh. ↻ forces a refresh (`?force=1`).
- Refreshing pauses while the browser tab is hidden and catches up when it's visible again.

## 7. Internationalisation
- The language changes `<html lang dir>`, all strings (`public/i18n/*.json`), Intl number/date/currency formats, treatment names (per-language fields), and chart direction:
  - Line charts run right to left.
  - Horizontal bars grow from the right.
- Locales:
  - `en-IL`
  - `he-IL`
  - `ar-IL-u-nu-latn` (Arabic with Latin digits, the convention in Israel)
- Patient and dentist names are shown as stored.

## 8. Quality bar
- Works at a 375 px width with no horizontal page scroll (the schedule scrolls inside its card), and in light and dark mode.
- Keyboard: tabs, selects and buttons are reachable, with a visible focus ring.
- Accessibility: every chart has a table twin, statuses are icon + text, and changes are arrow + text.
- Unit tests cover every KPI formula, the generator's determinism and record budget, and the Airtable mapping round-trip.

## 9. Roadmap
| Phase | Scope |
|---|---|
| **v0.1** (this) | Demo + Airtable read, two tabs, three languages |
| v0.2 | Real clinic base: field-name mapping, data-quality warnings (missing links, unknown statuses) |
| v0.3 | Auth (at least a shared password or SSO in front of the server), audit of who viewed patient data |
| v0.4 | Payments table (installments, insurance claims), per-dentist targets, CSV adapter |
| later | Write actions (mark arrived, confirm), SMS/WhatsApp reminders, multi-clinic |

## 10. Open questions
- Which real system will the data come from: Airtable maintained by staff, or an export from existing clinic software?
- Should revenue be recognised on visit date (current) or payment date?
- Should hygienist chairs or rooms count toward utilization separately from dentists?
