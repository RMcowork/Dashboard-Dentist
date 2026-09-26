# Airtable

## The demo base
- **Name:** Dental Clinic Demo
- **Workspace:** Dashboard
- **Base ID:** `appTRu3aSv38OmmGV`

The base was created with the schema below and is already filled with the generated demo data (874 records).

## Schema
Defined in code in `server/schema.js`, which is the source of truth. `scripts/seed-airtable.js` creates any table or field that is missing.

### Dentists
| Field | Type | Key |
|---|---|---|
| Name (primary) | single line text | `name` |
| Specialty | single line text | `specialty` |
| Chair | number (0 dp) | `chair` |
| Active | checkbox | `active` |

### Treatments
| Field | Type | Key |
|---|---|---|
| Name (primary) | single line text | `name.en` |
| Name (Hebrew) | single line text | `name.he` |
| Name (Arabic) | single line text | `name.ar` |
| Category | single select: Preventive, Restorative, Endodontics, Orthodontics, Cosmetic, Surgery | `category` |
| Price | currency ₪ (0 dp) | `price` |
| Duration (min) | number | `duration` |

### Patients
| Field | Type | Key |
|---|---|---|
| Name (primary) | single line text | `name` |
| Phone | phone | `phone` |
| Birth date | date (ISO) | `birthDate` |
| Gender | single select: Female, Male | `gender` |
| City | single line text | `city` |
| Language | single select: English, Hebrew, Arabic | `language` |
| First visit | date | `firstVisit` |
| Last visit | date | `lastVisit` |

### Appointments
| Field | Type | Key |
|---|---|---|
| Appointment (primary) | single line text, e.g. `2026-09-24 09:15 · Chair 1` | — |
| Date | date (ISO) | `date` |
| Start | single line text `HH:MM` (24h) | `start` |
| Duration (min) | number | `duration` |
| Patient | link → Patients | `patientId` |
| Dentist | link → Dentists | `dentistId` |
| Treatment | link → Treatments | `treatmentId` |
| Chair | number | `chair` |
| Status | single select: Scheduled, Checked in, In chair, Completed, No-show, Cancelled | `status` |
| Fee | currency ₪ | `fee` |
| Paid | currency ₪ | `paid` |
| Payment method | single select: Card, Cash, Insurance, Bit | `paymentMethod` |
| Source | single select: New, Returning, Referral | `source` |

Two design choices here:
- `Date` and `Start` are separate plain fields, not one date-time field. That avoids time-zone shifts between Airtable, the server and the browser.
- Payments live on the appointment to stay under the 1,000-record free-plan limit.

## Reading the base
The demo base is already seeded, so you only need a **read-only** token:
1. Create a personal access token at <https://airtable.com/create/tokens>.
   - **Scope:** `data.records:read`
   - **Access:** only *Dental Clinic Demo*
2. Put it in `.env` (the base ID is already there):
   ```
   AIRTABLE_TOKEN=pat…
   AIRTABLE_BASE_ID=appTRu3aSv38OmmGV
   ```
3. Restart the server. With `DATA_SOURCE=auto` it switches to Airtable, and the badge reads **Airtable · live**.

The seeded data is anchored to **2026-09-26** (appointments from 2026-08-02 to 2026-10-09). Days pass but the Airtable data doesn't move. Re-seed when you want a fresh "today" (below).

## Connecting from GitHub Pages (browser mode)
The published site (<https://rmcowork.github.io/Dashboard-Dentist/>) has no server, so it reads Airtable directly from the browser:
1. Open the site and click **Connect Airtable** (in the demo banner, or the source badge in the top bar).
2. The Base ID is prefilled with the demo base. Paste a read-only token (`data.records:read`, only this base) and click **Connect**.
3. The dashboard checks the token by reading the base, then switches to **Airtable · live**. Click the badge again to disconnect.

Same sync rules as the server (full load every 30 min, delta syncs in between, at most one sync per 15 s), but the API calls are counted per open browser tab, not per server. The token is kept only in that browser's localStorage. See PRACTICE → Secrets for what that means.

## Re-seeding (optional)
Needs a token with `data.records:read`, `data.records:write`, `schema.bases:read` and `schema.bases:write`. Consider a separate token that you delete afterwards.
```bash
npm run generate
npm run seed -- --reset
```
- `--reset` deletes the existing records first.
- The upload takes about 90 write requests and about 25 s, because of the 5 requests/second limit.

## Sync & limits (free plan)
- **1,000 records per base.** The demo uses 874.
- **About 1,000 API calls per month per workspace.** This is why the adapter does not simply reload everything on every refresh:
  - **Full load** on the first request and every `AIRTABLE_FULL_SYNC_MINUTES` (default 30): every table at 100 records per call, about 11 calls.
  - **Delta sync** in between: only Patients and Appointments records created or modified since the last sync (`LAST_MODIFIED_TIME()` / `CREATED_TIME()` filter, 5 s skew), merged by record id. That is usually 2 calls.
  - **Coalescing:** concurrent browser requests share one in-flight sync, and syncs closer than `AIRTABLE_MIN_INTERVAL_SECONDS` (default 15) return the cached result.
  - **Stale fallback:** if Airtable fails after a good sync, the last data is served, and the UI shows *Offline* with a warning toast.
  - The browser pauses refreshing while its tab is hidden.
  - Rough budget at the default 1-minute refresh: ~2 calls/min, or ~120 calls per open hour. On the free plan, choose 5 or 15 minutes for screens that stay open all day. The badge tooltip shows calls used since server start.
- **5 requests per second per base.** Both the adapter and the seed script are sequential.

## Connecting a real clinic base
Pick whichever of these fits:
1. **Same schema.** Point `AIRTABLE_BASE_ID` at the new base. A read-only token (`data.records:read`) is enough.
2. **Different names.** In `server/adapters/airtable.js`, fill in `TABLE_NAMES` and `FIELD_NAMES`. For example:
   ```js
   TABLE_NAMES.patients = 'Clients';
   FIELD_NAMES.appointments = { status: 'Visit status', fee: 'Price' };
   ```
   Select options must use the labels above. Otherwise, extend `LABELS` in `server/schema.js`.
3. **Different structure**, such as a separate Payments table or a date-time start field. Write a new adapter that returns the normalized shape, following PRACTICE → Adapters.
