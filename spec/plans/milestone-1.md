# תוכנית – Milestone 1: יסודות המערכת וצפייה ברשימה משותפת (מקומית, מול Dev)

**מקורות:** `MILESTONES.md` (Milestone 1), `PRD.md`, `ARCHITECTURE.md` (כולל ADR-1 עד ADR-11), `DESIGN.md`, `wireframes.png`, `style-guide.png`.
**מצב נוכחי:** אין קוד בפרויקט – רק `spec/`, `CLAUDE.md` ו-`.gitignore`. Node 24 ו-npm 11 מותקנים במחשב.

**היקף:** אתר שרץ מקומית ב-`vercel dev`, עם שני דפים, שקורא את רשימת המשימות מ-PostgreSQL בפרויקט ה-Dev ב-Supabase ומציג פרטי משימה נבחרת. **ללא** יצירה, עריכה, מחיקה, סימון השלמה או גרירה (Milestones 3–5), **ללא** פריסה (Milestone 2) ו**ללא** PWA/Offline (Milestone 6).

---

## 1. צעדים שהמשתמש מבצע בעצמו (בהדרכה צעד אחר צעד)

לפי `CLAUDE.md`, חשבונות, סיסמאות וחיבור שירותים – באחריות המשתמש. Claude עוצר בנקודות האלה ומדריך בשפה פשוטה. הסדר חשוב:

1. **פרויקט Supabase Dev:** פתיחת חשבון Supabase (אם אין) ויצירת פרויקט בשם ברור (למשל `todo-dev`), באזור קרוב (למשל Frankfurt). בעת היצירה – **לכבות את ה-Data API** (ADR-2). שמירת סיסמת ה-Database של הפרויקט.
2. **יצירת המשתמש `app_backend`** ב-SQL Editor של פרויקט ה-Dev, **לפני** ה-Migration הראשונה (ADR-2):
   `create role app_backend with login password '<סיסמה חזקה שהמשתמש בוחר>';`
3. **תעודת ה-CA:** הורדת התעודה מלוח הבקרה (Database Settings → SSL Configuration) ושמירתה בפרויקט כ-`certs/supabase-ca.crt` (ADR-3). התעודה אינה סוד ונשמרת ב-Git.
4. **מילוי `.env`:** Claude יוצר את `.env.example` ומעתיק אותו פעם אחת ל-`.env`; המשתמש ממלא את הערכים (ראו סעיף 4). Claude לא קורא את `.env`.
5. **Supabase CLI:** המשתמש מריץ `npx supabase login` (נפתח דפדפן לאישור) ומוסר ל-Claude את ה-Project Ref של פרויקט ה-Dev (אינו סוד). Claude מריץ `npx supabase link --project-ref <ref>` – **ל-Dev בלבד** (ADR-1).
6. **Vercel CLI:** `vercel dev` דורש חשבון Vercel ופרויקט מקושר. המשתמש פותח חשבון Vercel (Hobby, חינמי), מריץ `npx vercel login` ואז `npx vercel link` (יוצר פרויקט Vercel ריק בחשבון). **בשלב הזה לא מחברים את Vercel ל-GitHub ולא מגדירים בו משתני סביבה** – זה שייך ל-Milestone 2.

---

## 2. מבנה הקבצים שייווצרו

```text
package.json                 # scripts, dependencies, engines: node 24.x, "type": "module"
package-lock.json
tsconfig.json                # references ל-app ול-node
tsconfig.app.json            # src/ + shared/ (דפדפן)
tsconfig.node.json           # api/ + server/ + scripts/ + test-support/ + קובצי config (NodeNext)
vite.config.ts               # React plugin + הגדרות Vitest (jsdom ל-src)
vercel.json                  # devCommand, SPA fallback, includeFiles לתעודה
playwright.config.ts
index.html                   # lang="he" dir="rtl", viewport, כותרת
.env.example                 # שמות משתנים בלבד
certs/supabase-ca.crt        # מהמשתמש (שלב 1.3)

shared/
  types.ts                   # Task (טיפוס משותף ללקוח ולשרת)

server/                      # קוד צד-שרת בלבד; לעולם לא מיובא מ-src/
  db.ts                      # pg.Pool ברמת מודול, SSL עם CA, max: 1, timeouts
  tasksRepository.ts         # listTasks() – SQL פרמטרי
  http.ts                    # עזרי JSON: sendJson, sendError, בדיקת Method

api/
  tasks/index.ts             # GET /api/tasks  (Methods אחרים → 405)

src/
  main.tsx                   # BrowserRouter + ייבוא גופן ו-CSS
  App.tsx                    # Routes: "/", "/about", "*" → Navigate("/")
  api/tasksClient.ts         # fetchTasks() – fetch יחסי ל-/api/tasks, cache: "no-store"
  lib/taskLabel.ts           # טקסט השורה: כותרת, או תיאור עם ירידות שורה → רווח
  components/
    NavBar.tsx               # "דף הבית", "אודות" עם NavLink (מצב פעיל)
    TaskList.tsx             # מצבי טעינה/שגיאה/ריק + שורות
    TaskRow.tsx              # ידית (קישוטית), Checkbox (לקריאה בלבד), טקסט מקוצר
    TaskDetails.tsx          # הודעת בחירה / שדות לקריאה בלבד
  pages/
    HomePage.tsx             # טעינה, state של בחירה, גלילה לפרטים במובייל
    AboutPage.tsx
  styles/
    tokens.css               # Design Tokens מ-DESIGN.md (צבעים, רדיוסים, צל, מרווחים)
    global.css               # RTL, טיפוגרפיה, פריסה Responsive

supabase/
  config.toml                # נוצר ע"י `npx supabase init`
  migrations/<timestamp>_create_tasks.sql
  dev-seed.sql               # נתוני בדיקה ל-Dev בלבד, ניתן להרצה חוזרת

scripts/
  db-push.mjs                # מריץ `supabase db push` עם משתני .env (בלי להדפיס אותם)
  db-seed.mjs                # מריץ את dev-seed.sql דרך pg + CA
  install-browser.mjs        # postinstall: Chromium + WebKit לתוך node_modules (ADR-11)

test-support/
  devSnapshot.ts             # שמירה ושחזור של טבלת tasks ב-Dev (ADR-7, ADR-11)

tests (ליד הקוד):
  src/lib/taskLabel.test.ts
  src/components/*.test.tsx
  api/tasks/index.test.ts    # Handler עם Repository מדומה
  server/db.integration.test.ts
  server/tasksRepository.integration.test.ts
e2e/
  home.spec.ts
  navigation.spec.ts
```

הערות מבנה:
- `server/` ו-`api/` משתמשים ב-ESM עם סיומת `.js` ב-imports יחסיים (דרישה של Node ESM ב-Vercel Functions).
- `src/` לא מייבא דבר מ-`server/`; רק מ-`shared/`.
- `shared/validation.ts` (ADR-6) **לא** נוצר עכשיו – הוא נדרש רק מ-Milestone 3.
- תוספות ל-`.gitignore` רק אם יידרשו (למשל `supabase/.branches/`); `.env` נשאר בו.

---

## 3. Dependencies

גרסאות Major עדכניות ויציבות בזמן היצירה, עם Lockfile (ARCHITECTURE 2.9):
- **dependencies:** `react`, `react-dom`, `react-router` (או `react-router-dom` לפי הגרסה), `pg`, `@fontsource-variable/inter`.
- **devDependencies:** `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/pg`, `@types/node`, `@vercel/node` (טיפוסים ל-Handler), `vercel`, `supabase` (ADR-4), `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@playwright/test` (ADR-11).
- **לא** בשלב הזה: `@dnd-kit/*` (Milestone 5).

---

## 4. משתני סביבה (`.env.example`)

```text
# Dev only. app_backend via Supabase Transaction Pooler (port 6543), without sslmode
DATABASE_URL=
# Dev postgres password – used only by the Supabase CLI for migrations
SUPABASE_DB_PASSWORD=
```

- `DATABASE_URL` בתבנית: `postgresql://app_backend.<project-ref>:<password>@<pooler-host>:6543/postgres` – **בלי** `sslmode` במחרוזת, כדי שהגדרת ה-SSL בקוד (CA + `rejectUnauthorized: true`) תהיה היחידה. `server/db.ts` גם מסיר פרמטר `sslmode` אם נוסף בטעות.
- אין משתני `VITE_*`. `vercel dev` טוען את `.env` לבד לפונקציות.
- הסקריפטים ב-`scripts/` טוענים את `.env` דרך `process.loadEnvFile()` של Node, בלי להדפיס ערכים.

---

## 5. מסד נתונים

### 5.1 Migration: `supabase/migrations/<timestamp>_create_tasks.sql`
לפי ARCHITECTURE 2.3 ו-ADR-2, כתובה כך שהרצה חוזרת לא תיכשל (`if not exists`, `drop policy if exists`):
- `create table if not exists public.tasks` עם העמודות: `id uuid primary key default gen_random_uuid()`, `title varchar(100) null`, `description varchar(2000) null`, `due_date date null`, `completed boolean not null default false`, `position integer not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Constraints:
  - `tasks_title_or_description` – `(title ~ '\S') or (description ~ '\S')` (רווחים בלבד אינם תוכן; `NULL` נכשל בבדיקה).
  - `tasks_position_nonnegative` – `position >= 0`. **בלי** `UNIQUE` על `position`.
- אינדקס `tasks_position_id_idx on (position, id)`.
- אבטחה (ADR-2): `alter table public.tasks enable row level security`; `revoke all on public.tasks from anon, authenticated`; `grant usage on schema public to app_backend`; `grant select, insert, update, delete on public.tasks to app_backend`; Policy `tasks_app_backend_all` – `for all to app_backend using (true) with check (true)`.
- הרשאות הכתיבה מוענקות כבר עכשיו כי הן חלק מהגדרת הטבלה, וגם כדי ש-`dev-seed.sql` ובדיקות ה-Integration ירוצו כ-`app_backend`.

**החלה על Dev:** `npm run db:push` (← `npx supabase db push`, CLI מקושר ל-Dev בלבד). אימות: הרצה שנייה מדווחת שאין Migrations חדשות.

### 5.2 נתוני בדיקה: `supabase/dev-seed.sql`
- מוחק את כל השורות ב-`tasks` ומכניס כ-6 משימות במיקומים 0..5, כולל: משימה עם כותרת בלבד; משימה בלי כותרת עם תיאור קצר; משימה בלי כותרת עם תיאור ארוך מרובה שורות (לבדיקת קיצור וירידות שורה); משימה עם כותרת ארוכה מאוד; משימה שהושלמה (`completed = true`); משימות עם תאריך יעד ובלי תאריך יעד.
- ההרצה: `npm run db:seed` (← `scripts/db-seed.mjs`, מתחבר עם `DATABASE_URL` ו-CA). מיועד ל-**Dev בלבד**; בראש הקובץ הערה מפורשת על כך.

---

## 6. Backend

### 6.1 `server/db.ts`
- `pg.Pool` אחד ברמת המודול (שימוש חוזר בין קריאות): `connectionString` מ-`DATABASE_URL`, `max: 1`, `connectionTimeoutMillis` ו-`idleTimeoutMillis` קצרים, `statement_timeout`/`query_timeout` סבירים.
- `ssl: { ca: <תוכן certs/supabase-ca.crt>, rejectUnauthorized: true }`. הקובץ נקרא מ-`process.cwd()`; ב-`vercel.json` מוגדר `includeFiles: "certs/**"` לפונקציות.
- פונקציית `createPool(options)` מיוצאת כדי שבדיקה תוכל להעביר CA אחר.
- בשגיאת תעודה (`SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` וכד') – רישום בלוג השרת שהבעיה היא בתעודת ה-CA (ADR-3), בלי פרטי חיבור.
- אם `DATABASE_URL` חסר – שגיאה ברורה בלוג השרת.

### 6.2 `server/tasksRepository.ts`
- `listTasks()`: `select id, title, description, due_date, completed, position from public.tasks order by position asc, id asc`.
- המרה ל-`Task` (camelCase): `dueDate` כמחרוזת `YYYY-MM-DD` או `null` – באמצעות `to_char(due_date, 'YYYY-MM-DD')` ב-SQL, כדי לא לעבור דרך `Date` ואזורי זמן. `created_at`/`updated_at` אינם מוחזרים.

### 6.3 `shared/types.ts`
`Task = { id: string; title: string | null; description: string | null; dueDate: string | null; completed: boolean; position: number }`.

### 6.4 `api/tasks/index.ts` – `GET /api/tasks`
- `GET` → `200`, מערך משימות (גם `[]`), כותרת `Cache-Control: no-store`.
- Method אחר → `405` עם `Allow: GET` (הנתיבים POST וכו' יתווספו ב-Milestones הבאים).
- כשל מסד → `503` (תקלה זמנית) עם `{error: {code: "DB_UNAVAILABLE", message: "<עברית>"}}`; שגיאה לא צפויה → `500` באותו מבנה. ללא חשיפת SQL, פרטי חיבור או תוכן משימות בלוג.
- `server/http.ts` מרכז את מבנה התשובות, לשימוש חוזר בנתיבים הבאים.

### 6.5 `vercel.json`
- `devCommand: "vite --port $PORT"` (כדי ש-`vercel dev` לא יריץ את עצמו דרך `npm run dev`).
- `rewrites: [{ "source": "/((?!api/).*)", "destination": "/index.html" }]` – SPA fallback ל-`/about`. Vercel מגיש קבצים סטטיים לפני ה-rewrites, ולכן הם לא נפגעים; `/api/*` מוחרג במפורש.
- `functions: { "api/**/*.ts": { "includeFiles": "certs/**" } }`.

---

## 7. Frontend

### 7.1 בסיס
- `index.html`: `<html lang="he" dir="rtl">`, `viewport` רגיל (`viewport-fit=cover` ותגיות Apple – Milestone 6), כותרת לשונית "רשימת המשימות".
- `main.tsx`: ייבוא `@fontsource-variable/inter`, `tokens.css`, `global.css`; `BrowserRouter`.
- `App.tsx`: `NavBar` משותף + Routes: `/` → `HomePage`, `/about` → `AboutPage`, כל נתיב אחר → הפניה ל-`/` (כדי שלא יוצג דף שלישי).

### 7.2 עיצוב בסיסי (Milestone 1 – לא ליטוש מלא)
- `tokens.css`: כל ה-Tokens מטבלת DESIGN 2.1 (כולל `primary-dark`, `error-dark`), רדיוס 8–16px, צל `0 2px 8px rgba(0,0,0,0.08)`, מרווחים 8/16/24/32.
- גופנים (ADR-4): `font-family: "Inter Variable", "Segoe UI", Roboto, "Noto Sans Hebrew", Arial, sans-serif`. גדלים: H1 32 Bold, H2 24 Bold, H3 18 Semibold, טקסט 16/14/12.
- רקע `background`, כרטיסים לבנים (`surface`) עם גבול וצל רך.
- **פריסה:** דסקטופ (≥768px) – Grid של שתי עמודות: רשימה בימין, פרטים בשמאל (טבעי ב-RTL). מובייל (<768px) – עמודה אחת, רשימה מעל פרטים.
- שורת משימה: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`; משימה שהושלמה – Checkbox מסומן וטקסט חצוי (`line-through`) בצבע משני. שורה נבחרת – רקע תכלת עדין.

### 7.3 רכיבים
- **NavBar:** שני `NavLink` – "דף הבית" (`/`, `end`) ו"אודות" (`/about`); מצב פעיל בטקסט `primary-dark` ורקע עדין. בלי המבורגר (DESIGN 1.6).
- **HomePage:**
  - כותרת H1 "רשימת המשימות".
  - כפתור "הוסף משימה" **אינו מוצג** במילסטון זה (אין עדיין יצירה, ואסור להציג פעולת כתיבה כאילו היא עובדת). מתווסף ב-Milestone 3.
  - טעינה: `fetchTasks()` ב-`useEffect`; מצבים `loading` / `error` / `ready`. שגיאה **אינה** מוצגת כרשימה ריקה.
  - State של `selectedId` – בתחילה `null`.
  - בחירה במובייל: אחרי עדכון הבחירה, אם `matchMedia("(max-width: 767px)")` תואם – `detailsRef.scrollIntoView({ behavior: "smooth", block: "start" })`.
- **TaskList:** כותרת אזור H2 "רשימת משימות"; טקסטים בנוסחי ה-PRD:
  - טעינה: "טוען משימות..."
  - שגיאה: "לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב."
  - ריקה: "אין עדיין משימות ברשימה. לחץ על "הוסף משימה" כדי להוסיף את הראשונה." (הנוסח מה-PRD; הכפתור עצמו יגיע ב-Milestone 3)
- **TaskRow:** שורה כ-`<li>` עם כפתור בחירה שמכיל את הטקסט (נגיש למקלדת, `aria-pressed`/`aria-current` לבחירה). לצדו:
  - ידית גרירה כאייקון קישוטי בלבד (`aria-hidden`, בלי התנהגות) – כדי שהמבנה יתאים ל-Wireframe; הגרירה עצמה ב-Milestone 5.
  - Checkbox שמשקף את `completed` במצב לקריאה בלבד (`disabled`, עם `aria-label`), כך שלא נראה כאילו לחיצה שומרת משהו; ההפעלה ב-Milestone 5.
  - הטקסט מ-`taskLabel(task)`: כותרת אם יש בה תוכן; אחרת התיאור, כשכל רצף whitespace/ירידות שורה מוחלף ברווח אחד. הקיצור עצמו נעשה ב-CSS (רוחב השורה, PRD – הנחות יישום).
- **TaskDetails:** כותרת אזור H2 "פרטי משימה".
  - ללא בחירה: "בחר משימה מהרשימה כדי לצפות בפרטיה".
  - עם בחירה: תוויות "כותרת", "תיאור", "תאריך יעד" ושדות `input` / `textarea` / `input type="date"` עם ערכי המשימה, במצב `readOnly` (גודל גופן ≥16px). **בלי** כפתורי "שמור שינויים" ו"מחק משימה" – יתווספו ב-Milestone 4 יחד עם הפעולות שלהם.
- **AboutPage:** H1 "אודות" והפסקה בנוסח ה-PRD, בכרטיס מרכזי.
- **tasksClient.fetchTasks:** `fetch("/api/tasks", { cache: "no-store" })`; זורק שגיאה בכל תשובה שאינה `2xx` או בכשל רשת. אין Local Storage, אין Cache.

> כל שלושת ההחלטות "מה לא להציג עדיין" (כפתור הוסף, כפתורי שמירה/מחיקה, Checkbox פעיל) נובעות מההנחיה ב-MILESTONES: "אין עדיין להציג פעולות כתיבה כאילו הן עובדות".

---

## 8. Scripts ב-`package.json`

| Script | פקודה | שימוש |
|---|---|---|
| `dev` | `vercel dev --listen 3000` | הרצה מקומית (Frontend + API) מול Dev |
| `build` | `tsc -b && vite build` | בדיקת טיפוסים ו-Build |
| `test` | `vitest run` (ללא `*.integration.test.ts`) | Unit + רכיבים |
| `test:integration` | `vitest run` על `*.integration.test.ts` בלבד | מול Dev (ADR-7) |
| `test:e2e` | `playwright test` | E2E מול `vercel dev` (ADR-11) |
| `db:push` | `node scripts/db-push.mjs` | החלת Migrations על Dev |
| `db:seed` | `node scripts/db-seed.mjs` | טעינת נתוני הבדיקה ל-Dev |
| `postinstall` | `node scripts/install-browser.mjs` | Chromium + WebKit לתוך `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`) |

בסיום הבנייה יעודכן החלק "פקודות הרצה" ב-`CLAUDE.md`: הרצה – `npm run dev`; בדיקות – `npm test`, `npm run test:integration`, `npm run test:e2e`.

---

## 9. בדיקות

### 9.1 Unit ורכיבים (`npm test`, Vitest + React Testing Library)
- `taskLabel`: כותרת קיימת; כותרת `null` → תיאור; כותרת של רווחים בלבד → תיאור; ירידות שורה → רווח.
- `api/tasks/index.ts` עם Repository מדומה: `GET` → `200` + `Cache-Control: no-store` + מערך; מערך ריק → `[]`; `POST` → `405`; כשל מסד → `503` במבנה השגיאה, בלי פרטי SQL.
- `HomePage` עם `fetch` מדומה: מצב טעינה; שגיאה מציגה את הודעת השגיאה ולא את הודעת הרשימה הריקה; רשימה ריקה; אין בחירה בהתחלה; לחיצה על שורה מציגה את ערכיה בפרטים; משימה שהושלמה מקבלת את מחלקת הסימון.
- `NavBar`: קישור פעיל מסומן.

### 9.2 Integration מול Dev (`npm run test:integration`, ADR-7)
- `test-support/devSnapshot.ts`: לפני הבדיקות שומר עותק של כל השורות ב-`tasks`, ובסיום מוחק ומחזיר אותן בדיוק (כולל `id`, `position`, תאריכים).
- `listTasks`: מכניס משימות במיקומים מעורבבים ומוודא סדר `position, id`; טבלה ריקה → `[]`; `dueDate` חוזר כ-`YYYY-MM-DD`.
- `db.integration.test.ts`: חיבור עם CA הנכון מצליח (`select 1`); חיבור עם CA שגוי (`tls.rootCertificates` של Node, שאינם כוללים את ה-CA של Supabase) **נכשל** בשגיאת תעודה.
- Constraint: הכנסה עם כותרת ותיאור של רווחים בלבד נדחית במסד.

### 9.3 E2E (`npm run test:e2e`, Playwright מול `vercel dev`, ADR-11)
פרויקטים: Desktop Chrome, Mobile Chrome (Pixel 7), Mobile Safari (iPhone/WebKit). ה-DoD מחייב Chrome; WebKit רץ כבר עכשיו כי התשתית זהה. נתונים: Snapshot לפני ושחזור אחרי, ובכל תרחיש הכנסה של נתונים ידועים.
- **טעינה:** הרשימה מוצגת בסדר השמור; משימה בלי כותרת מציגה את תחילת התיאור בשורה אחת; משימה שהושלמה מסומנת; אין משימה נבחרת והודעת הבחירה מוצגת.
- **בחירה:** לחיצה מציגה כותרת/תיאור/תאריך בפרטים; השורה מודגשת. במובייל – אזור הפרטים נכנס ל-Viewport לאחר הבחירה.
- **שגיאה מול ריק:** `page.route` שמחזיר `500` → הודעת השגיאה, בלי הודעת "אין עדיין משימות"; טבלה ריקה → הודעת הרשימה הריקה.
- **Refresh:** שינוי ישיר במסד (דרך `pg`) ואז `reload` → הרשימה המעודכנת; `localStorage` ריק מנתוני משימות.
- **ניווט:** מעבר דף הבית ↔ אודות בתפריט; `reload` ב-`/about` מציג את דף האודות (SPA fallback); `GET /api/tasks` עדיין מחזיר JSON ולא את `index.html`.

### 9.4 בדיקות ידניות של Claude
- `npm run build` עובר.
- `grep` על `dist/` ועל הקבצים שב-Git: אין `DATABASE_URL`, סיסמאות או Connection String; `.env` אינו ב-`git status`.
- צילום מסך בדפדפן המובנה (דסקטופ ומובייל) והשוואה ל-Wireframes: מבנה, צבעי בסיס וגופנים.

בסיום – סגירת `vercel dev` שהופעל לבדיקות.

---

## 10. ADRs צפויים
ככל שיתקבלו במהלך הבנייה החלטות טכניות משמעותיות שלא מכוסות ב-ADRs הקיימים, הן יתועדו ב-`ARCHITECTURE.md` כ-ADR-12 ואילך. מועמד סביר: **קישור Vercel CLI כבר ב-Milestone 1** (נדרש ל-`vercel dev`), כולל הבהרה שהחיבור ל-GitHub ומשתני Production נשארים ל-Milestone 2.

---

## 11. מיפוי ל-Definition of Done

| תנאי DoD | איך מתקיים | איך נבדק |
|---|---|---|
| `GET /api/tasks` בסדר קבוע; ריק → `[]` | 6.2, 6.4 | 9.1, 9.2 |
| כותרת או תיאור מקוצר; השלמה מובחנת | 7.2, 7.3 | 9.1, 9.3 |
| אין בחירה בכניסה; בחירה מציגה פרטים; גלילה במובייל; שגיאה ≠ ריק | 7.3 | 9.1, 9.3 |
| ניווט ו-Refresh ב-`/about` | 6.5, 7.1 | 9.3 |
| מבנה תואם Wireframes בדסקטופ ובמובייל, צבעים וגופנים | 7.2 | 9.4 (צילומי מסך) |
| Refresh מחזיר נתונים עדכניים; אין Local Storage | 6.4 (`no-store`), 7.3 | 9.3 |
| אין חשיפת פרטי DB; אימות תעודה ונכשל מול שגויה; Migrations מתועדות, הוחלו על Dev וניתנות להרצה חוזרת | 4, 5.1, 6.1 | 9.2, 9.4, הרצה חוזרת של `db:push` |
| רץ מקומית מול Dev; בדיקות טעינה וניווט עוברות ב-Chrome | 8 | 9.3 |

---

## 12. סדר הבנייה
1. אתחול הפרויקט (Vite + React + TS), `package.json`, tsconfig-ים, `vercel.json`, `.env.example` → העתקה ל-`.env`.
2. **עצירה להדרכת המשתמש** בשלבים 1.1–1.6 (Supabase Dev, `app_backend`, תעודה, `.env`, login ל-Supabase ול-Vercel).
3. `npx supabase init` + `link` ל-Dev, כתיבת ה-Migration, `npm run db:push`, `dev-seed.sql`, `npm run db:seed`.
4. `server/` + `api/tasks/index.ts`; בדיקה ידנית של `/api/tasks` ב-`vercel dev`.
5. Frontend: ניווט, דפים, רשימה, פרטים, עיצוב בסיסי ו-Responsive.
6. בדיקות Unit, Integration ו-E2E; תיקונים עד שהכול עובר.
7. בדיקות ידניות (9.4), עדכון "פקודות הרצה" ב-`CLAUDE.md`, סימון 🟡 ב-`MILESTONES.md`, סגירת השרת. **בלי commit.**
