# Airtable

## The demo base
- **Name:** Dental Clinic Demo
- **Workspace:** Dashboard
- **Base ID:** `appTRu3aSv38OmmGV`

The base was created with the schema below. `npm run seed` fills it with the generated demo data.

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

## Seeding
1. Create a personal access token at <https://airtable.com/create/tokens>.
   - **Scopes:** `data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write`
   - **Access:** only *Dental Clinic Demo*
2. Put the token and base ID in `.env`:
   ```
   AIRTABLE_TOKEN=pat…
   AIRTABLE_BASE_ID=appTRu3aSv38OmmGV
   ```
3. Generate and upload:
   ```bash
   npm run generate
   npm run seed
   ```
   - The upload takes about 90 write requests and about 25 s, because of the 5 requests/second limit.
   - Use `npm run seed -- --reset` to delete the existing records and re-seed, for example to move the demo's "today" forward.
4. Set `DATA_SOURCE=airtable` in `.env` and restart the server. The badge should read **Airtable**.

The demo data is anchored to the day you ran `generate`. After that, days pass but the Airtable data doesn't move. Re-seed with `--reset` when you want a fresh "today".

## Limits (free plan)
- **1,000 records per base.** The demo uses about 875 records.
- **About 1,000 API calls per month per workspace.**
  - One dashboard refresh reads every table at 100 records per call, so about 11 calls.
  - The server caches for `AIRTABLE_CACHE_MINUTES` (default 15). That works out to about 44 calls per hour while someone has the dashboard open.
  - Raise the cache time for long-running screens.
  - A seed costs about 100 calls.
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
