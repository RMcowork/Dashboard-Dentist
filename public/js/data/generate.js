// Deterministic demo-data generator for a 3-dentist clinic.
// Same seed + same `today` => identical output. All names and phone numbers are fictional.

import {
  addDays, CLINIC_HOURS, diffDays, eachDay, isOpen, minToTime, timeToMin, weekday,
} from '../dates.js';

export const DEFAULTS = {
  seed: 20260926,
  weeksBack: 8,
  weeksAhead: 2,
  patients: 160,
  newPatients: 18,
  fill: 0.32, // chance a free slot gets booked (past days)
};

// ---- Seeded RNG (mulberry32) ----
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const weighted = (items, weightOf) => {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    let r = next() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return items.at(-1);
  };
  return { next, int, pick, weighted };
}

// ---- Reference data ----
export const DENTISTS = [
  { id: 'den1', name: 'Dr. Noa Levi-Adler', specialty: 'General dentistry', chair: 1, active: true, days: [0, 1, 2, 3, 4],
    bias: { preventive: 1.3, restorative: 1.3, endo: 0.3, ortho: 0, cosmetic: 0.3, surgery: 0.2 } },
  { id: 'den2', name: 'Dr. Samir Khalil', specialty: 'Endodontics & oral surgery', chair: 2, active: true, days: [0, 1, 3, 4, 5],
    bias: { preventive: 0.5, restorative: 0.7, endo: 4, ortho: 0, cosmetic: 0, surgery: 4 } },
  { id: 'den3', name: 'Dr. Rachel Stern', specialty: 'Orthodontics & cosmetic', chair: 3, active: true, days: [1, 2, 3, 4],
    bias: { preventive: 0.8, restorative: 0.4, endo: 0, ortho: 8, cosmetic: 5, surgery: 0 } },
];

// [id, en, he, ar, category, price ₪, duration min, frequency weight]
const TREATMENT_ROWS = [
  ['trt01', 'Checkup & exam', 'בדיקה תקופתית', 'فحص دوري', 'preventive', 250, 30, 20],
  ['trt02', 'Cleaning & scaling', 'ניקוי אבנית', 'تنظيف الجير', 'preventive', 350, 45, 22],
  ['trt03', 'Panoramic X-ray', 'צילום פנורמי', 'صورة بانورامية', 'preventive', 200, 15, 8],
  ['trt04', 'Fluoride treatment', 'טיפול פלואוריד', 'علاج بالفلورايد', 'preventive', 150, 15, 3],
  ['trt05', 'Filling – 1 surface', 'סתימה – משטח אחד', 'حشوة – سطح واحد', 'restorative', 450, 45, 12],
  ['trt06', 'Filling – 2+ surfaces', 'סתימה – 2 משטחים ומעלה', 'حشوة – سطحان أو أكثر', 'restorative', 650, 60, 7],
  ['trt07', 'Porcelain crown', 'כתר חרסינה', 'تاج خزفي', 'restorative', 3200, 90, 3],
  ['trt08', 'Bridge unit', 'יחידת גשר', 'وحدة جسر', 'restorative', 3000, 90, 1],
  ['trt09', 'Root canal – front tooth', 'טיפול שורש – שן קדמית', 'علاج عصب – سن أمامي', 'endo', 1800, 60, 2],
  ['trt10', 'Root canal – molar', 'טיפול שורש – טוחנת', 'علاج عصب – ضرس', 'endo', 2800, 90, 2],
  ['trt11', 'Orthodontic consult', 'ייעוץ אורתודונטי', 'استشارة تقويم', 'ortho', 300, 30, 2],
  ['trt12', 'Aligner check-up', 'ביקורת קשתיות שקופות', 'متابعة التقويم الشفاف', 'ortho', 400, 30, 3],
  ['trt13', 'Teeth whitening', 'הלבנת שיניים', 'تبييض الأسنان', 'cosmetic', 1500, 60, 2],
  ['trt14', 'Veneer', 'ציפוי למינייט', 'قشرة تجميلية', 'cosmetic', 2500, 90, 1],
  ['trt15', 'Simple extraction', 'עקירה פשוטה', 'خلع بسيط', 'surgery', 500, 30, 4],
  ['trt16', 'Wisdom tooth extraction', 'עקירת שן בינה', 'خلع ضرس العقل', 'surgery', 1400, 60, 2],
  ['trt17', 'Dental implant', 'שתל דנטלי', 'زراعة سن', 'surgery', 5500, 90, 2],
  ['trt18', 'Bone graft', 'השתלת עצם', 'ترقيع عظمي', 'surgery', 2500, 60, 1],
];

export const TREATMENTS = TREATMENT_ROWS.map(([id, en, he, ar, category, price, duration, weight]) => ({
  id, name: { en, he, ar }, category, price, duration, weight,
}));

const NAMES = {
  he: {
    female: ['Noa', 'Tamar', 'Yael', 'Maya', 'Shira', 'Michal', 'Ronit', 'Adi', 'Hila', 'Orly', 'Einat', 'Liat'],
    male: ['Yossi', 'Daniel', 'Eitan', 'Omer', 'Avi', 'Itai', 'Guy', 'Amir', 'Ron', 'Moshe', 'Yonatan', 'Tal'],
    last: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Friedman', 'Shapiro', 'Avraham', 'Katz', 'Dahan', 'Ben-David', 'Azoulay'],
    cities: ['Haifa', 'Haifa', 'Kiryat Motzkin', 'Karmiel', 'Nahariya', 'Tel Aviv'],
  },
  ar: {
    female: ['Lina', 'Rania', 'Maryam', 'Nour', 'Yasmin', 'Hiba', 'Salma', 'Aya', 'Dana', 'Rana', 'Amal', 'Reem'],
    male: ['Ahmad', 'Mohammad', 'Omar', 'Khaled', 'Yousef', 'Sami', 'Karim', 'Rami', 'Fadi', 'Tarek', 'Majd', 'Wasim'],
    last: ['Haddad', 'Khoury', 'Nasser', 'Mansour', 'Saleh', 'Abbas', 'Zoabi', 'Jabareen', 'Masarwa', 'Awad', 'Suleiman', 'Hamdan'],
    cities: ['Nazareth', 'Nazareth', 'Shefa-Amr', 'Haifa', 'Akko', 'Umm al-Fahm'],
  },
  en: {
    female: ['Emily', 'Sarah', 'Rachel', 'Hannah', 'Olivia', 'Grace'],
    male: ['David', 'Michael', 'James', 'Benjamin', 'Samuel', 'Jonathan'],
    last: ['Smith', 'Miller', 'Goldberg', 'Brown', 'Adler', 'Green'],
    cities: ['Haifa', 'Tel Aviv', "Ra'anana", 'Jerusalem'],
  },
};

const pad = (n, w) => String(n).padStart(w, '0');

// ---- Generator ----
// opts.today: 'YYYY-MM-DD' (the "current" day); opts.nowMin: minutes since midnight, drives today's statuses.
export function generate(opts) {
  const o = { ...DEFAULTS, ...opts };
  const { today, nowMin } = o;
  const rng = makeRng(o.seed);
  const firstDay = addDays(today, -o.weeksBack * 7);
  const lastDay = addDays(today, o.weeksAhead * 7);

  // Patients (existing ones first; the last `newPatients` are introduced during the window)
  const patients = [];
  for (let i = 1; i <= o.patients; i++) {
    const r = rng.next();
    const language = r < 0.55 ? 'he' : r < 0.85 ? 'ar' : 'en';
    const gender = rng.next() < 0.52 ? 'female' : 'male';
    const n = NAMES[language];
    const isNew = i > o.patients - o.newPatients;
    patients.push({
      id: `pat${pad(i, 3)}`,
      name: `${rng.pick(n[gender])} ${rng.pick(n.last)}`,
      phone: `05${rng.pick([0, 2, 3, 4, 8])}-555-${pad(rng.int(0, 9999), 4)}`,
      birthDate: addDays(today, -rng.int(4 * 365, 85 * 365)),
      gender,
      city: rng.pick(n.cities),
      language,
      firstVisit: isNew ? null : addDays(firstDay, -rng.int(120, 8 * 365)),
      lastVisit: isNew ? null : addDays(firstDay, -rng.int(1, 420)),
      // Internal: how often this patient books. ~35% of existing patients are dormant.
      _weight: isNew ? 0 : rng.next() < 0.35 ? 0 : 0.2 + rng.next() ** 2,
      _isNew: isNew,
    });
  }
  // Keep lastVisit >= firstVisit
  for (const p of patients) if (p.firstVisit && p.lastVisit < p.firstVisit) p.lastVisit = p.firstVisit;

  const active = patients.filter((p) => p._weight > 0);
  const newQueue = patients.filter((p) => p._isNew);

  // Appointments: walk each dentist's working days slot by slot
  const appointments = [];
  const horizon = o.weeksAhead * 7 || 1;
  for (const date of eachDay(firstDay, lastDay)) {
    if (!isOpen(date)) continue;
    const dow = weekday(date);
    const [open, close] = CLINIC_HOURS[dow].map(timeToMin);
    const daysAhead = diffDays(today, date);
    const fill = daysAhead > 0 ? o.fill * 1.1 * (1 - 0.55 * (daysAhead / horizon)) : o.fill;

    for (const den of DENTISTS) {
      if (!den.days.includes(dow)) continue;
      let t = open;
      while (t < close) {
        if (rng.next() >= fill) {
          t += 30;
          continue;
        }
        const trt = rng.weighted(TREATMENTS, (x) => x.weight * den.bias[x.category]);
        if (t + trt.duration > close) break;
        appointments.push({ date, startMin: t, duration: trt.duration, dentist: den, treatment: trt, r: [rng.next(), rng.next(), rng.next(), rng.next()] });
        t += trt.duration;
      }
    }
  }
  appointments.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.dentist.chair - b.dentist.chair);

  // Spread new patients across the window: every k-th eligible appointment becomes a new patient's first visit
  const newSlots = new Set();
  const step = Math.floor(appointments.length / (newQueue.length + 1));
  for (let i = 1; i <= newQueue.length; i++) newSlots.add(i * step);

  const out = appointments.map((a, idx) => {
    const [rStatus, rPay, rMethod, rSource] = a.r;
    const status = statusFor(a, today, nowMin, rStatus);
    let patient;
    let source = 'returning';
    if (newSlots.has(idx) && status !== 'cancelled' && status !== 'no_show' && newQueue.length) {
      patient = newQueue.shift();
      source = rSource < 0.7 ? 'new' : 'referral';
      patient._weight = 0.6; // new patients can come back later in the window
      active.push(patient);
      if (status === 'completed') patient.firstVisit = a.date;
    } else {
      patient = rng.weighted(active, (p) => p._weight);
    }

    let paid = 0;
    let paymentMethod = null;
    if (status === 'completed') {
      const fee = a.treatment.price;
      paid = rPay < 0.82 ? fee : rPay < 0.92 ? Math.round(fee / 2 / 50) * 50 : 0;
      if (paid > 0) paymentMethod = rMethod < 0.55 ? 'card' : rMethod < 0.65 ? 'cash' : rMethod < 0.9 ? 'insurance' : 'bit';
    }
    if (status === 'completed' && (!patient.lastVisit || a.date > patient.lastVisit)) patient.lastVisit = a.date;
    if (status === 'completed' && !patient.firstVisit) patient.firstVisit = a.date;

    return {
      id: `apt${pad(idx + 1, 4)}`,
      date: a.date,
      start: minToTime(a.startMin),
      duration: a.duration,
      patientId: patient.id,
      dentistId: a.dentist.id,
      treatmentId: a.treatment.id,
      chair: a.dentist.chair,
      status,
      fee: a.treatment.price,
      paid,
      paymentMethod,
      source,
    };
  });

  return {
    dentists: DENTISTS.map(({ days, bias, ...d }) => d),
    treatments: TREATMENTS.map(({ weight, ...t }) => t),
    patients: patients.map(({ _weight, _isNew, ...p }) => p),
    appointments: out,
  };
}

function statusFor(a, today, nowMin, r) {
  const end = a.startMin + a.duration;
  const past = a.date < today || (a.date === today && end <= nowMin);
  if (past) return r < 0.08 ? 'no_show' : r < 0.13 ? 'cancelled' : 'completed';
  if (a.date === today && a.startMin <= nowMin) return 'in_chair';
  if (a.date === today && a.startMin - nowMin <= 20) return r < 0.6 ? 'checked_in' : 'scheduled';
  return r < 0.03 ? 'cancelled' : 'scheduled';
}
