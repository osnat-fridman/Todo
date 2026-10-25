# Milestone 2 – פריסה לאתר חי (Vercel ו-Production) – תוכנית

**מקורות:** `MILESTONES.md` (Milestone 2), `ARCHITECTURE.md` סעיפים 2.7, 2.9 ו-ADR-1, ADR-2, ADR-3, ADR-13.
**עיקרון:** אין שינוי פונקציונלי באתר. Claude מכין קבצים ובודק מקומית מול Dev; פתיחת פרויקט ה-Production, יצירת המשתמש, חיבור השירותים ומשתני הסביבה – המשתמש מבצע בעצמו, בהדרכה צעד אחר צעד. Claude לעולם אינו מתחבר ל-Production, אינו מריץ עליו פקודות ואינו רואה את הסיסמאות.

## מצב פתיחה (נבדק בקוד)

- Milestone 1 כבר נדחף: `main` מסונכרן עם `origin` (`https://github.com/osnat-fridman/Todo.git`).
- פרויקט Vercel כבר נוצר ומקושר מקומית (`.vercel/`, ADR-13), עדיין **לא** מחובר ל-GitHub ואין בו משתני סביבה.
- ה-Supabase CLI מקושר לפרויקט ה-Dev (`supabase/.temp/project-ref`); ה-Dev נמצא ב-`eu-central-1` (פרנקפורט).
- `vercel.json`: framework `vite`, `outputDirectory: dist`, Rewrite של `/about` בלבד, `includeFiles: certs/**` ל-Functions.
- `supabase/config.toml` אינו מצהיר על Edge Functions או Storage Buckets, ואין `[remotes]`; לכן ה-GitHub Integration יחיל על Production **רק Migrations** (לפי תיעוד Supabase: הגדרות API/Auth וקובצי Seed אינם מוחלים כברירת מחדל). `dev-seed.sql` אינו בשם `seed.sql` ולכן אינו נטען אוטומטית.
- ה-Migration היחידה (`20261025120000_create_tasks.sql`) תואמת-לאחור, לא הרסנית וניתנת להרצה חוזרת, ודורשת את `app_backend` מראש.
- `postinstall` מתקין את דפדפני Playwright (מעל 150MB) – ב-Build של Vercel זה מיותר ומאט/עלול להכשיל את ה-Build.

## חלק א' – שינויים בקוד (Claude)

1. **`scripts/install-browser.mjs`** – לדלג על התקנת הדפדפנים כאשר `process.env.VERCEL` מוגדר (Vercel מגדיר אותו בזמן Build), בנוסף ל-`SKIP_BROWSER_INSTALL` הקיים.
2. **`vercel.json`** – להוסיף `"regions": ["fra1"]` כדי שה-Functions ירוצו בפרנקפורט, ליד Supabase (`eu-central-1`), לפי ההמלצה בסעיף 2.9. בתוכנית Hobby אפשר אזור אחד – מספיק.
3. **ARCHITECTURE.md** – להוסיף ADR-14 ("Build ב-Vercel ואזור ה-Functions"): דילוג על דפדפני Playwright ב-Vercel, אזור `fra1`, ופרויקט Production באותו אזור כמו Dev. (ADRs מותרים בלי לשאול; שאר המסמך לא משתנה.)
4. **`.env.example`** – ללא שינוי (הוא ל-Dev בלבד ואומר זאת במפורש). אין משתנה סביבה חדש.
5. **אין** קובץ GitHub Actions: לפי ADR-1 משתמשים ב-Supabase GitHub Integration. Actions הם חלופה רק אם יתברר שהאינטגרציה אינה זמינה – במקרה כזה עוצרים ומדווחים למשתמש לפני מימוש.

## חלק ב' – בדיקות מקומיות (Claude, מול Dev בלבד)

- `npm run build` עובר (זהו ה-Build ש-Vercel מריץ: `tsc -b && vite build`).
- הרצת ה-postinstall עם `VERCEL=1` מדלגת על הדפדפנים; בלי המשתנה – ההתנהגות כמו קודם.
- `npm start` (`vercel dev`): `GET /api/tasks` מחזיר JSON עם `Cache-Control: no-store`; `/about` ישירות מחזיר את ה-HTML של האתר; `/` נטען; קובץ סטטי (למשל קובץ JS מתוך ה-Build/Vite) אינו מוחלף ב-`index.html`; נתיב API לא קיים אינו מחזיר את ה-HTML של האתר.
- רגרסיה: `npm test`, `npm run test:integration`, `npm run test:e2e` (מול Dev, לא בזמן הרצה ידנית).
- `npx vercel env ls` – מוצגים רק שמות והיקפים (ללא ערכים); לוודא ש-`DATABASE_URL` מוגדר **רק** ל-Production ולא ל-Development/Preview, כדי ש-`vercel dev` לעולם לא יקבל את פרטי Production. (נבדק אחרי שהמשתמש מגדיר את המשתנה.)
- אחרי שהמשתמש ימסור את **מזהה פרויקט ה-Production** (ה-Project Ref – אינו סוד): לוודא שהוא שונה מ-`supabase/.temp/project-ref` (ה-CLI מקושר ל-Dev), ושאינו מופיע באף קובץ ב-Git (`git grep`).
- סגירת כל הרצה מקומית בסיום.

## חלק ג' – צעדי המשתמש (הדרכה צעד אחר צעד, בסדר הזה)

הסדר חשוב: המשתמש `app_backend` ומשתנה הסביבה ב-Vercel חייבים להתקיים **לפני** שהדחיפה הראשונה מפעילה את ה-Migration ואת ה-Deployment.

1. **פרויקט Supabase Production** – ב-Supabase, באותו ארגון: New project, שם ברור (למשל `todo-production`), אזור **Central EU (Frankfurt)** כמו ה-Dev, סיסמת מסד חזקה חדשה (לשמור במנהל סיסמאות). בעת היצירה – **לבטל את ה-Data API**.
2. **יצירת `app_backend` ב-Production** – ב-SQL Editor של פרויקט ה-Production בלבד: `create user app_backend with password '<סיסמה חדשה, שונה מזו של Dev>';`. הסיסמה לא נכתבת בשום קובץ ולא נשלחת ל-Claude.
3. **הורדת תעודת ה-CA – לא נדרשת**: אותה תעודה משמשת את Dev ו-Production (ADR-3), והיא כבר ב-`certs/supabase-ca.crt`.
4. **הכנת כתובת החיבור של Production** – ב-Connect → Transaction pooler (פורט 6543): להעתיק, להחליף את שם המשתמש ל-`app_backend.<project-ref של Production>` ואת הסיסמה לסיסמת `app_backend`. **לא** להכניס ל-`.env` המקומי ולא להדביק בצ'אט.
5. **משתנה סביבה ב-Vercel** – בפרויקט הקיים: Settings → Environment Variables → `DATABASE_URL` עם הכתובת מצעד 4, ולסמן **רק Production** (לבטל Preview ו-Development).
6. **חיבור Vercel ל-GitHub** – Settings → Git → Connect Git Repository → `osnat-fridman/Todo`; Production Branch = `main`. (אם Vercel מבצע Deployment מיד עם החיבור – הוא כבר יקבל את המשתנה מצעד 5; ה-Migration עדיין לא הוחלה, לכן דף הבית עשוי להציג שגיאת טעינה עד הדחיפה – זה צפוי.)
7. **חיבור Supabase Production ל-GitHub** – בפרויקט ה-**Production** בלבד: Project Settings → Integrations → GitHub → Authorize ובחירה ב-Repository `Todo` בלבד; Working directory = `.`; Production branch = `main`; להפעיל **Deploy to production**; **לא** להפעיל Automatic branching. פרויקט ה-Dev לא מחובר ל-GitHub. אם המסך דורש להפעיל Branching בתשלום או שהאפשרות אינה קיימת – לעצור ולספר ל-Claude (חלופת GitHub Actions לפי ADR-1).
8. **אישור בצ'אט** – המשתמש כותב ש-1–7 בוצעו ומוסר את ה-Project Ref של Production (לצורך הבדיקה בחלק ב'). זה תנאי ה-DoD "המשתמש אישר".

## חלק ד' – דחיפה (רק כשהמשתמש מבקש "דחוף")

- לפני ה-✅ ולפני ה-push: להסביר בשפה פשוטה שה-Migration תיצור ב-Production את טבלת המשימות (ריקה), תנעל אותה מגישה ציבורית ותיתן הרשאה רק ל-`app_backend`; שום נתון לא נמחק. מאחר שה-push מחיל אותה אוטומטית – לבצע push **רק אחרי אישור מפורש** לשינוי הזה.
- `git add` (כולל `spec/plans/milestone-2.md`, השינויים מחלק א' וה-✅ ב-MILESTONES.md) → commit → push ל-`main`.

## חלק ה' – בדיקות "לאחר הדחיפה" (Claude, קריאה בלבד מול Production)

- `npx vercel ls --prod` / `npx vercel inspect` – ה-Deployment במצב Ready; כתובת ה-HTTPS הציבורית.
- `curl` לכתובת החיה: `GET /api/tasks` מחזיר `200` ו-`[]` עם `no-store` (מוכיח שה-Migration הוחלה ושההרשאות ל-`app_backend` תקינות, בלי פעולה ידנית); `/about` מחזיר `200` HTML.
- המשתמש מאשר (או Claude בודק בלוח הבקרה של GitHub/Supabase דרך הסטטוס של ה-Commit) שה-Migration רצה ב-Supabase Integration בהצלחה.
- דפדפן (Chrome / הדפדפן המובנה): דף הבית מציג את מצב הרשימה הריקה ("אין עדיין משימות ברשימה...") ולא את הודעת שגיאת הטעינה, מעבר לאודות ובחזרה, Refresh ב-`/about`. **אין** שום פעולת כתיבה מול Production.
- סעיף שנכשל → מדווחים, ה-Milestone חוזר ל-🟡, ומתקנים במסגרתו.

## Definition of Done – איך כל סעיף נבדק

| סעיף | בדיקה |
|---|---|
| Build של Production עובר מקומית; SPA fallback ונתיבי API נבדקו ב-`vercel dev` | חלק ב' |
| המשתמש אישר: `app_backend` ב-Production, GitHub Integration, משתני סביבה ב-Vercel | חלק ג' צעד 8 + `vercel env ls` |
| פרטי Production לא בקוד/Git/`.env`; Production לא משמש לפיתוח | `git grep` ל-Project Ref, ה-CLI מקושר ל-Dev, `DATABASE_URL` ב-Vercel רק ב-Production |
| Deployment תקין, HTTPS ציבורי | חלק ה' |
| Migrations הוחלו אוטומטית | `GET /api/tasks` → `[]` + סטטוס האינטגרציה |
| דף הבית נטען מ-Production, ניווט ו-Refresh ב-`/about`, קריאה בלבד | חלק ה', בדפדפן |

## מחוץ לתחום

אין שינויי UI, API או Schema; אין Custom Domain, Preview Deployments, CI, Rate Limiting בתשלום או PWA (Milestone 6).
