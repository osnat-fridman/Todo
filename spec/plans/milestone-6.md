# תוכנית – Milestone 6: התאמה חזותית, PWA ובדיקת מוצר מלאה

**מקורות:** `MILESTONES.md` (Milestone 6), `PRD.md` (5.א PWA, FR-10, Edge Cases – אין חיבור, UI Texts – "אין חיבור לאינטרנט..."), `DESIGN.md` (1.1–1.6, 2.1–2.5), `ARCHITECTURE.md` (2.7, 2.8, 2.9, 2.10, ADR-4, ADR-10, ADR-11, ADR-14, ADR-17), `wireframes.png`, `style-guide.png`, `mockups1.png`, `mockups2.png` (השראה בלבד).

**נקודת מוצא בקוד:** כל הפונקציונליות של Milestones 1–5 קיימת ונבדקה. העיצוב כבר משתמש ב-Tokens של `DESIGN.md` (`src/styles/tokens.css`), כולל פריסה דו-עמודתית/חד-עמודתית, שדות של `16px`, כפתורי Primary/Secondary/Danger ו-Modal-ים. **חסרים:** תיקיית `public/`, Manifest, אייקונים, תגיות Apple, `viewport-fit=cover` ו-Safe Areas; אין הודעת "אין חיבור לאינטרנט" ואין הבחנה בין כשל רשת לכשל שרת (כרגע כשל רשת מציג את ההודעה הכללית של הפעולה); אין בדיקות E2E ל-PWA, ל-Offline ולמראה. אין צורך ב-Migration, בשינוי API או בתלויות חדשות.

## 1. ליטוש חזותי (Design Audit)

### 1.1 שיטה
1. הרצת האתר (`npm start`, מול Dev עם נתוני ה-seed) וצילום מסך של כל ששת מצבי ה-Wireframes: דף הבית בלי בחירה, משימה נבחרת, Modal הוספה, אישור מחיקה, אודות, מובייל – ב-1280px וב-390px (וגם 360px לבדיקת רוחב צר במיוחד).
2. השוואה לכל מצב מול `wireframes.png` (מבנה ותוכן) ומול `style-guide.png` (צבעים, טיפוגרפיה, רכיבים); רשימת פערים ותיקון ב-`global.css` (ובמידת הצורך ב-`icons.tsx` ובמבנה ה-JSX, בלי לשנות התנהגות).
3. צילום חוזר לאחר התיקון לאישור.

### 1.2 נקודות לבדיקה ולתיקון (לפי המקורות)
- **ניווט:** שני קישורים בלבד, פריט פעיל בכחול על רקע עדין (Style Guide), תואם בשני הדפים; במובייל הקישורים גלויים, בלי המבורגר.
- **כותרת הדף ו"הוסף משימה":** H1 "רשימת המשימות" מימין, כפתור Primary עם אייקון `+` משמאל; מצב Disabled לפי ה-Style Guide (אפור-בהיר) עם הודעת הרשימה המלאה לצדו.
- **אזורי רשימה ופרטים:** כרטיסים לבנים עם כותרת אזור ("רשימת משימות", "פרטי משימה") בפס נפרד, גבול בהיר, רדיוס `16px`, צל רך; מרווח קבוע ביניהם.
- **שורת משימה:** סדר RTL – טקסט מימין, Checkbox, ידית גרירה בקצה השמאלי (כמו ב-Wireframe); קו הפרדה דק או מרווח עקבי בין שורות; שורה נבחרת ברקע תכלת עדין; טקסט בשורה אחת עם "..."; משימה שהושלמה – Checkbox כחול וטקסט חצוי. **אין** להוסיף תאריך, תיאור משני, פסי צבע או תפריט ⋮ שמופיעים ב-Mockups.
- **Checkbox:** ריבוע מעוגל מעט, סימון כחול (`primary`), שטח מגע של לפחות 44px סביבו בלי להגדיל את הריבוע עצמו.
- **שדות:** תווית מעל השדה, רקע לבן, גבול אפור, פינות מעוגלות, Placeholder אפור, מסגרת אדומה בשגיאה והודעה ב-`error-dark` מתחתיו; Focus בכחול.
- **תיבות שגיאה:** רקע אדום בהיר וטקסט `error-dark`, אפשר אייקון שגיאה קטן כמו ב-Style Guide (דקורטיבי בלבד, **בלי** כפתור X לסגירה – זו התנהגות חדשה).
- **Modal-ים:** כותרת מימין ו-X משמאל, Overlay כהה שקוף, כפתורים ברוחב שווה ("הוסף משימה" Primary, "סגור" Secondary; "אישור" Danger, "ביטול" Secondary – ADR-16).
- **אזור פרטים ריק:** ההודעה "בחר משימה מהרשימה כדי לצפות בפרטיה" ממורכזת בגוון משני. בלי איור הלוח מה-Mockups (רכיב נוסף).
- **אודות:** כרטיס ממורכז עם כותרת H1 ופסקה, תפריט עם "אודות" פעיל.
- **טיפוגרפיה ו-RTL:** גדלים 32/24/18/16/14 לפי 2.2; תאריכים ומספרים בסדר תווים תקין (כולל הנוסח "1,000").
- **מגע במובייל:** כל כפתור, קישור, Checkbox וידית – אזור לחיצה של 44px לפחות; כפתורי הפרטים וה-Modal ברוחב מלא; ה-Modal לא חורג מהמסך ונגלל בתוכו כשהמקלדת פתוחה.

## 2. PWA (ADR-10, `ARCHITECTURE.md` 2.8)

### 2.1 אייקונים – `public/icons/` ו-`scripts/generate-icons.mjs` (חדשים)
- שני מקורות SVG ב-`public/icons/`: `icon.svg` (אייקון רגיל) ו-`icon-maskable.svg` (אותו ציור עם שוליים בטוחים של ~20% לכל צד, רקע מלא).
- עיצוב פשוט לפי ה-Style Guide: ריבוע מעוגל ברקע `primary-dark` (`#1C6DD0`) ועליו סמל רשימה לבן – Checkbox מסומן ושני קווים. ללא טקסט.
- הסקריפט פותח את Chromium של Playwright (מותקן ממילא, `PLAYWRIGHT_BROWSERS_PATH=0`), מציג כל SVG בגודל המבוקש ושומר PNG: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180×180, **ללא שקיפות**), ו-`favicon-32.png`.
- סקריפט npm חדש: `"icons": "PLAYWRIGHT_BROWSERS_PATH=0 node scripts/generate-icons.mjs"`. ה-PNG שנוצרו נכנסים ל-Git (ה-Build ב-Vercel לא מריץ את הסקריפט, כי אין שם דפדפן – ADR-14).

### 2.2 `public/manifest.webmanifest` (חדש)
- `name: "רשימת המשימות"`, `short_name: "משימות"`, `lang: "he"`, `dir: "rtl"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color: "#EAF6FF"`, `theme_color: "#EAF6FF"` (כמו ה-`theme-color` הקיים), `icons`: 192, 512, ו-512 עם `purpose: "maskable"`.

### 2.3 `index.html`
- `viewport`: `width=device-width, initial-scale=1, viewport-fit=cover` (בלי לחסום Zoom ידני – הגנת ה-Zoom ב-iPhone מגיעה מהגופן `16px` בשדות).
- `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="icon" href="/icons/favicon-32.png">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`.
- `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="משימות">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">` (פס סטטוס בהיר מעל התוכן, כך שהתוכן לא נכנס מתחתיו).

### 2.4 Safe Areas – `global.css`
- `.site-header`: ריפוד עליון `env(safe-area-inset-top)` וריפוד צד `max(var(--space-2), env(safe-area-inset-left/right))`.
- `.page`: ריפוד צד באותה דרך וריפוד תחתון `calc(var(--space-3) + env(safe-area-inset-bottom))`, כדי שכפתורי הפרטים לא יוסתרו על ידי פס הבית.
- `.modal-overlay`: ריפוד הכולל את ארבעת ה-Insets.
- בלי השפעה בדפדפן רגיל (הערכים הם 0).

### 2.5 ללא Service Worker
- אין רישום Service Worker ואין Cache של `/api/*` (ADR-10). `fetchTasks` כבר משתמש ב-`cache: "no-store"`.
- `vercel.json` נשאר כמות שהוא: ה-Rewrite הוא ל-`/about` בלבד, ולכן `/manifest.webmanifest` ו-`/icons/*` מוגשים כקבצים סטטיים. לוודא ב-`vercel dev` וב-`npm run build` (התיקייה `public/` מועתקת ל-`dist`).

## 3. מצב ללא חיבור (PRD FR-10, UI Texts; ADR-10)

### 3.1 `src/lib/useOnline.ts` (חדש)
- Hook שמחזיר את `navigator.onLine` ומתעדכן באירועי `online`/`offline` של `window`.

### 3.2 `src/components/OfflineNotice.tsx` (חדש)
- כש-`useOnline()` הוא `false`: תיבה קבועה מתחת לתפריט, בשני הדפים (ב-`App.tsx`), עם הנוסח "אין חיבור לאינטרנט. לא ניתן לצפות במשימות או לשנות אותן עד שהחיבור יחזור." (`role="status"`, עיצוב תיבת שגיאה). נעלמת כשהחיבור חוזר. אין טעינה אוטומטית מחדש של הרשימה (אין רענון אוטומטי – FR-01); המשתמש מרענן בעצמו.

### 3.3 `src/api/tasksClient.ts`
- נוסח חדש: `OFFLINE_ACTION_MESSAGE` = "אין חיבור לאינטרנט. הפעולה לא בוצעה."
- ב-`toFailure`: כש-`response` הוא `null` (כשל רשת) **ו-** `navigator.onLine === false` ← ההודעה החדשה; כשל רשת כשהדפדפן מדווח על חיבור ← ההודעה הכללית של הפעולה, כמו היום. כל יתר הזרימה (החזרת Checkbox/סדר, השארת הטופס והערכים) נשארת זהה, כך שאין שום שינוי שנשמר במכשיר.
- טעינת הרשימה בלי חיבור: נשארת ההודעה "לא ניתן לטעון את המשימות..." (בנוסף להודעה הקבועה), ולא מוצגת רשימה ריקה או ישנה.

### 3.4 ADR-18 (חדש ב-`ARCHITECTURE.md`)
- זיהוי Offline לפי `navigator.onLine` + כשל `fetch`; נוסח הודעה לפי סוג הכשל; שם האפליקציה והאייקונים; `status-bar-style: default`; אייקונים כ-PNG ב-Git שנוצרים בסקריפט.

## 4. בדיקות

### 4.1 Unit (Vitest)
- `tasksClient`: כשל רשת בזמן `navigator.onLine = false` מחזיר "אין חיבור לאינטרנט. הפעולה לא בוצעה."; בזמן חיבור – ההודעה הכללית.
- `OfflineNotice`/`App`: ההודעה מופיעה באירוע `offline` ונעלמת ב-`online`, בדף הבית ובאודות.
- כל הבדיקות הקיימות ממשיכות לעבור.

### 4.2 E2E (Playwright, שלושת הפרויקטים: Desktop Chrome, Pixel 7, iPhone 15) – קבצים חדשים
- **`e2e/pwa.spec.ts`:**
  - `/manifest.webmanifest` מוחזר ב-200 עם JSON תקין: `name`, `short_name`, `start_url`, `scope`, `display: standalone`, `lang`, `dir`, ואייקוני 192/512/maskable שכל אחד מהם נטען ב-200 ובגודל הנכון.
  - ב-`index.html`: `link[rel=manifest]`, `apple-touch-icon` (180×180, נטען), תגיות `apple-mobile-web-app-*`, ו-`viewport-fit=cover`.
  - אין Service Worker רשום (`navigator.serviceWorker.getRegistrations()` ריק) ואין שימוש ב-Local Storage/IndexedDB למשימות.
  - `/about` ו-`/api/tasks` עדיין עובדים (ה-Fallback לא פוגע בקבצים החדשים).
- **`e2e/offline.spec.ts`:**
  - `context.setOffline(true)` ← ההודעה הקבועה מופיעה בדף הבית ובאודות; `setOffline(false)` ← נעלמת.
  - בלי חיבור: יצירה ← ה-Modal והערכים נשארים עם "אין חיבור לאינטרנט. הפעולה לא בוצעה."; שמירת עריכה ← הטיוטה נשארת; Checkbox ← חוזר למצבו; גרירה ← הסדר חוזר; מחיקה ← המשימה נשארת. אחרי חזרת החיבור ו-Refresh – הנתונים במסד ללא שינוי.
  - Refresh בלי חיבור לא מציג רשימה שמורה (דף השגיאה של הדפדפן או הודעת שגיאה, לא משימות).
- **`e2e/layout.spec.ts`:**
  - בכל השדות (`input`, `textarea`) `font-size` מחושב ≥ 16px (מונע Zoom ב-iPhone).
  - אין גלילה אופקית בדף ב-360px וב-390px, ב-Modal-ים ובדף אודות.
  - כפתורים, Checkbox (שטח המגע) וידיות בגודל 44px לפחות במובייל.
  - בדף הבית ובאודות יש רק שני קישורי ניווט ואין רכיבים נוספים מה-Mockups (תאריך בשורה, תפריט ⋮, המבורגר).
- **רגרסיה מלאה:** `npm test`, `npm run test:integration`, `npm run test:e2e` (כל הקבצים, שלושת הפרויקטים), `npm run build`.

### 4.3 בדיקות ידניות במכשירים (ADR-11 – לא ניתנות לאוטומציה)
- יוכנו למשתמש הוראות צעד-אחר-צעד, בשפה פשוטה, לביצוע **לאחר הדחיפה** באתר החי:
  - **Android (Chrome):** התקנה ("הוספה למסך הבית"/"התקנת אפליקציה"), פתיחה במסך מלא, אייקון ושם; גרירה במגע; בקר התאריך.
  - **iPhone (Safari):** "שתף" ← "הוסף למסך הבית"; פתיחה במסך מלא עם האייקון והשם; התפריט והכפתורים לא מוסתרים על ידי ה-Notch/פס הבית; נגיעה בשדה לא מגדילה את הדף; בבקר התאריך אפשר לבחור תאריך **ולנקות אותו**; גרירה במגע.
- **סיכון ידוע – ניקוי תאריך ב-iPhone:** אם יתברר שבקר התאריך של Safari אינו מאפשר לנקות את התאריך, אעצור ואציג אפשרויות לפני הוספת כפתור כלשהו (זו תוספת לממשק שאינה מופיעה ב-Wireframes).

## 5. Production והפרדת סביבות
- לפני הדחיפה: לוודא ש-`npm run build` עובר, שאין פרטי חיבור בקוד או ב-`dist` (חיפוש מחרוזות כמו `postgres://`, `DATABASE_URL`), ושבדיקות ה-Integration/E2E רצות מול Dev בלבד (מנגנון ה-Snapshot הקיים, ADR-7/ADR-11). אין Migration חדשה, ולכן הדחיפה לא משנה את מבנה מסד ה-Production.
- לאחר הדחיפה (סעיפי "לאחר הדחיפה" ב-DoD): בדיקה שה-Deployment ב-Vercel הצליח; **בדיקות קריאה בלבד** מול האתר החי – דף הבית, אודות, Refresh ב-`/about`, `/manifest.webmanifest` והאייקונים ב-200 וב-HTTPS; ואז הדרכת המשתמש בבדיקות המכשירים (4.3).

## 6. קבצים

| קובץ | פעולה |
|---|---|
| `src/styles/global.css` | ליטוש חזותי (סעיף 1), Safe Areas (2.4), עיצוב `OfflineNotice` |
| `src/components/*.tsx`, `src/components/icons.tsx` | התאמות מבנה/אייקונים לפי ה-Audit בלבד, בלי שינוי התנהגות |
| `index.html` | Viewport, Manifest, אייקונים ותגיות Apple |
| `public/manifest.webmanifest`, `public/icons/*` | חדשים |
| `scripts/generate-icons.mjs`, `package.json` (`icons`) | חדשים |
| `src/lib/useOnline.ts`, `src/components/OfflineNotice.tsx`, `src/App.tsx` | הודעת אין חיבור |
| `src/api/tasksClient.ts` | `OFFLINE_ACTION_MESSAGE` |
| בדיקות Unit חדשות/מעודכנות | סעיף 4.1 |
| `e2e/pwa.spec.ts`, `e2e/offline.spec.ts`, `e2e/layout.spec.ts` | חדשים |
| `spec/ARCHITECTURE.md` | ADR-18 |
| `spec/MILESTONES.md` | 🟡 בסיום הבנייה |
| `CLAUDE.md` (פקודות הרצה) | הוספת `npm run icons` |

## 7. סדר עבודה
1. Audit חזותי וליטוש (1), כולל צילומים לפני/אחרי.
2. אייקונים, Manifest, `index.html` ו-Safe Areas (2).
3. הודעת אין חיבור והבחנת כשל רשת (3).
4. בדיקות Unit ו-E2E חדשות, ואז רגרסיה מלאה ו-Build (4).
5. בדיקות אבטחה/הפרדת סביבות לפני הדחיפה (5), ADR-18, עדכון `CLAUDE.md`, סימון 🟡.
6. הדגמה למשתמש: צילומי מסך של כל המצבים בדסקטופ ובמובייל ותוצאות הבדיקות מול ה-DoD. בדיקות המכשירים והאתר החי – לאחר הדחיפה.

## 8. מחוץ לטווח
- Service Worker, Cache, Offline Sync, כפתור התקנה, Prompt התקנה יזום.
- כל רכיב מה-Mockups שאינו ב-PRD: תאריך/תיאור בשורה, פסי צבע, תפריט ⋮, המבורגר, "הגדרות", "ערוך משימה", "נוצר בתאריך", הודעת "נשמר בהצלחה", איור לאזור הפרטים הריק.
