# Milestone 3 – יצירת משימה באמצעות Modal – תוכנית

**מקורות:** `MILESTONES.md` (Milestone 3), `PRD.md` (זרימה 2, FR-02, FR-03, Edge Cases, UI Texts), `DESIGN.md` (1.1, 1.3, 1.6, 2.3), `ARCHITECTURE.md` (2.3, 2.4, 2.5, 2.6, ADR-5, ADR-6, ADR-7, ADR-11), `wireframes.png` (מסך "הוספת משימה").
**עיקרון:** Slice מלא אחד – כפתור ← Modal ← Validation משותף ← `POST /api/tasks` ← מסד Dev ← עדכון הרשימה ובחירת המשימה. אין Migration חדשה. כל הבדיקות מול Dev בלבד; מול Production אין כתיבה.

## מצב פתיחה (נבדק בקוד)

- `api/tasks/index.ts` מטפל רק ב-`GET` (דרך `createHandler(getRepository)` לבדיקות); `server/http.ts` מספק `sendJson`, `sendError`, `allowMethods`, `sendDatabaseError`.
- `server/tasksRepository.ts` כולל רק `listTasks`; `toTask` ו-`TASK_COLUMNS` (עם `to_char` לתאריך) קיימים לשימוש חוזר.
- `shared/` כולל רק `types.ts` (`Task`, `ApiError`). הקובץ `shared/validation.ts` שמוזכר ב-ADR-5/ADR-6 **עדיין לא קיים** – נוצר ב-Milestone הזה.
- `HomePage.tsx` מחזיק `LoadState` ו-`selectedId`, וגולל לאזור הפרטים במובייל (`MOBILE_QUERY`). אין עדיין כפתור "הוסף משימה" ב-`.page-heading`.
- ב-CSS יש כבר `.input`, `.textarea`, `.field`, `.error-box` וטוקנים לכל הצבעים; אין עדיין סגנון כפתורים או Modal.
- הטבלה (Migration קיימת) כבר אוכפת 100/2000 תווים, "כותרת או תיאור" ו-`position >= 0`. אין UNIQUE על `position`.
- תשתית בדיקות: Vitest (unit/integration), Playwright בשלושה מצבים מול `vercel dev` עם Snapshot של Dev (`test-support/devSnapshot.ts`, `replaceTasks`).

## חלק א' – כללי Validation משותפים (`shared/validation.ts`, ADR-5, ADR-6)

1. קבועים: `PRODUCT_TIME_ZONE = "Asia/Jerusalem"`, `TITLE_MAX = 100`, `DESCRIPTION_MAX = 2000`, `TASK_LIMIT = 1000`.
2. הודעות בנוסח ה-PRD (UI Texts): "יש להזין כותרת או תיאור למשימה", "הכותרת יכולה להכיל עד 100 תווים", "התיאור יכול להכיל עד 2,000 תווים", "תאריך היעד לא יכול להיות בעבר", "תאריך היעד אינו תקין".
3. פונקציות טהורות, בטוחות לדפדפן:
   - `normalizeText(value)` – `trim`; מחרוזת ריקה ← `null`.
   - `textLength(value)` – אורך ב-Code Points (`[...value].length`), כמו `varchar`.
   - `isValidDateString(value)` – תבנית `YYYY-MM-DD` ותאריך קלנדרי אמיתי (לא `2026-02-30`).
   - `todayInTimeZone(timeZone, now?)` – תאריך היום כ-`YYYY-MM-DD` באמצעות `Intl.DateTimeFormat` (לשרת).
   - `localToday(now?)` – התאריך המקומי של המכשיר כ-`YYYY-MM-DD` (לטופס; לא `toISOString()`).
   - `validateTaskInput({title, description, dueDate}, {today, storedDueDate?})` – מחזיר את הערכים המנורמלים ורשימת שגיאות `{field: "title" | "description" | "dueDate", message}`. שגיאת "כותרת או תיאור" משויכת ל-`title` ומסמנת גם את `description`. בדיקת "בעבר" מדלגת כש-`dueDate === storedDueDate` (מוכן ל-Milestone 4; ביצירה אין `storedDueDate`).
4. הכותרת והתיאור נשמרים אחרי `trim`, והאורך נמדד אחרי `trim`.

## חלק ב' – שרת

1. **נעילה משותפת** – קובץ `server/listLock.ts` עם מפתח קבוע אחד ל-`pg_advisory_xact_lock` ופונקציה `lockTaskList(client)`. ישמש גם את המחיקה (Milestone 4) ואת שינוי הסדר (Milestone 5), לפי 2.6.
2. **Repository** – `createTask({title, description, dueDate})` ב-`server/tasksRepository.ts`:
   - `pool.connect()` ← `begin` ← `lockTaskList` ← `select count(*)`; אם 1,000 ומעלה ← `rollback` וזריקת `TaskLimitError`.
   - `insert ... position = (select coalesce(max(position) + 1, 0) from public.tasks)`, `completed` לפי ברירת המחדל (`false`), `returning` עם `TASK_COLUMNS` ← `commit`. כל השלבים על אותו `client`; `rollback` בכל שגיאה ו-`release` ב-`finally`.
   - SQL פרמטרי בלבד.
3. **Handler** – `api/tasks/index.ts` מקבל `GET` ו-`POST` (`Allow: GET, POST`):
   - `Content-Type` חייב להיות JSON וגוף עד 16KB (לפי `content-length`/גודל הגוף) – אחרת `400 INVALID_REQUEST`.
   - כל אחד מ-`title`, `description`, `dueDate` חייב להיות מחרוזת או `null` (שדה חסר = `null`); שדות אחרים (למשל `completed`, `position`) – מתעלמים מהם.
   - `validateTaskInput` עם `today = todayInTimeZone(PRODUCT_TIME_ZONE)`; שגיאה ← `400 VALIDATION_ERROR` עם `message` ו-`field` של השגיאה הראשונה.
   - הצלחה ← `201` והמשימה. `TaskLimitError` ← `409 TASK_LIMIT_REACHED` עם נוסח ה-PRD. תקלת מסד ← `503` הקיים (`sendDatabaseError`), בלי לרשום ביומן את תוכן המשימה.

## חלק ג' – לקוח

1. **`src/api/tasksClient.ts`** – `createTask(input)` שמחזיר תוצאה מסוגים: הצלחה (`task`), שגיאת שדה (`field` + `message` מהשרת), שגיאה כללית עם הודעה: `409` ← נוסח "הרשימה מלאה...", `429` ← "יותר מדי בקשות...", כל השאר וגם כשל רשת ← "השמירה נכשלה. נסה שוב.". (הודעת Offline הקבועה שייכת ל-Milestone 6.)
2. **`src/components/CreateTaskModal.tsx`** (חדש), לפי ה-Wireframe ו-DESIGN 1.3:
   - Overlay אפור שקוף-למחצה; חלון לבן ממורכז, פינות מעוגלות, `role="dialog"`, `aria-modal`, כותרת "הוספת משימה", כפתור X ("סגור") בפינה.
   - שדות "כותרת" (Placeholder "הזן כותרת (לא חובה)"), "תיאור" (textarea, "הזן תיאור (לא חובה)"), "תאריך יעד" (`type="date"`, ערך פתיחה `localToday()`, `min` = אותו תאריך, ניתן לנקות, ללא שעה).
   - הטופס `noValidate` (כדי שהודעות הדפדפן לא יחליפו את נוסחי ה-PRD), ובלי `maxLength` (כדי שהודעת האורך תוצג ולא שההקלדה תיחסם בשקט).
   - בלחיצה על "הוסף משימה": `validateTaskInput` בלקוח; שגיאות מוצגות מתחת לשדה הרלוונטי ב-`error-dark`, השדה במסגרת אדומה (`aria-invalid`, `aria-describedby`); בשגיאת "כותרת או תיאור" שני השדות מסומנים. תאריך שהוקלד חלקית (`validity.badInput`) ← "תאריך היעד אינו תקין" ולא נחשב כריק.
   - בזמן שליחה: כפתורי השמירה והסגירה מושבתים (מונע שליחה כפולה ← רשומה אחת בלבד).
   - שגיאת שדה מהשרת (למשל תאריך שהוא "עבר" לפי שעון ישראל) ← מתחת לשדה; שגיאה כללית ← תיבת `error-box` אחת מעל הכפתורים. הערכים נשארים, וניתן לנסות שוב.
   - כפתורים: "הוסף משימה" (Primary) ו-"סגור" (Secondary). סגירה ב-X, ב-"סגור" או ב-Esc – ללא התראה. לחיצה על ה-Overlay **אינה** סוגרת (כדי לא לאבד הקלדה בטעות; ה-PRD וה-DESIGN לא מחייבים זאת).
   - בפתיחה המיקוד עובר לשדה הכותרת; בסגירה הוא חוזר לכפתור "הוסף משימה"; גלילת הדף שמאחור נעצרת בזמן שה-Modal פתוח.
   - ה-Modal מוצג רק כשהוא פתוח (Render מותנה), ולכן כל פתיחה מתחילה מטופס ריק עם תאריך היום – איפוס אוטומטי.
3. **`HomePage.tsx`**:
   - כפתור "הוסף משימה" (Primary, עם אייקון "+") בצד השמאלי של `.page-heading`, כמו ב-Wireframe; במובייל ברוחב מלא מתחת לכותרת.
   - הכפתור זמין רק כשהרשימה נטענה (`ready`). כשיש בה 1,000 משימות – `disabled` במראה ה-Disabled, ולידו ההודעה "הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת.".
   - הצלחה: הוספת המשימה לסוף הרשימה ב-State, סגירת ה-Modal, בחירת המשימה החדשה. אחר כך גלילה: בדסקטופ השורה החדשה נגללת לתצוגה (`scrollIntoView({block: "nearest"})`); במובייל – לאזור הפרטים, כמו בכל בחירה (הקוד הקיים).
   - כדי שבדסקטופ גם השורה החדשה **וגם** פרטיה יהיו גלויים ברשימה ארוכה, אזור הפרטים יהיה `position: sticky` (נשאר בראש המסך בזמן גלילה). במובייל אין שינוי.
4. **`src/components/icons.tsx`** – אייקוני קו `PlusIcon` ו-`CloseIcon` (DESIGN 2.3).
5. **CSS (`global.css`)** – בסיס בלבד, לפי DESIGN 2.3 (הליטוש המלא ב-Milestone 6): `.button`, `.button-primary` (`primary-dark`, Hover `primary-dark-hover`, טקסט לבן), `.button-secondary` (לבן, מסגרת וטקסט `primary-dark`), מצב Disabled, Focus; `.modal-overlay`, `.modal`, `.modal-header`, `.modal-actions`; `.input.is-invalid` (מסגרת `error`), `.field-error` (טקסט `error-dark`, Body Small/Medium); הודעת הרשימה המלאה; התאמות מובייל (Modal ברוחב המסך פחות שוליים, גלילה פנימית אם גבוה מה-Viewport). גודל גופן בשדות נשאר 16px.

## חלק ד' – מסמכים

- **ARCHITECTURE.md** – ADR-15 קצר: "Modal יצירה ונראות המשימה החדשה" (Render מותנה לאיפוס, אין סגירה בלחיצה על ה-Overlay, אזור פרטים Sticky בדסקטופ, מפתח Advisory Lock קבוע ב-`server/listLock.ts`). שאר המסמכים ללא שינוי.
- **MILESTONES.md** – סימון 🟡 ליד Milestone 3 בסיום הבנייה.
- `.env.example` ו-`CLAUDE.md` – ללא שינוי (אין משתנה או פקודה חדשים).

## חלק ה' – בדיקות (מול Dev בלבד; לא בזמן הרצה לבדיקה ידנית)

**Unit (`npm test`):**
- `shared/validation.test.ts`: `trim` ורווחים בלבד (כולל ירידות שורה), כותרת בלבד/תיאור בלבד/שניהם, 100/101 ו-2000/2001 תווים (כולל אימוג'י – ספירה ב-Code Points), תאריך היום/מחר/אתמול, `null`, תבנית שגויה ותאריך לא קיים, `todayInTimeZone` סביב חצות (שעון ישראל מול UTC), `storedDueDate`.
- `api/tasks/index.test.ts`: `POST` תקין ← `201`; Validation ← `400` עם `field`; `Content-Type` שגוי וגוף גדול ← `400`; `TaskLimitError` ← `409 TASK_LIMIT_REACHED`; תקלת מסד ← `503` בלי פרטים; `Allow: GET, POST`; שדות `completed`/`position` בגוף מתעלמים מהם. בדיקות ה-`GET` הקיימות ממשיכות לעבור.
- `src/components/CreateTaskModal.test.tsx` + הרחבת `HomePage.test.tsx`: ערכי פתיחה, נוסחי Placeholder, הודעות מתחת לשדות וסימון שני השדות, `badInput`, שליחה כפולה חסומה, שגיאת שרת שמשאירה ערכים, סגירה ופתיחה מאפסות, Esc, הכפתור וההודעה ב-1,000 משימות, הוספה לסוף ובחירה אוטומטית.

**Integration (`npm run test:integration`, ADR-7):**
- `createTask` מוסיף בסוף (`position` = המקסימום + 1, גם כשהמיקומים אינם רציפים), `completed = false`, ערכים אחרי `trim`, תאריך `YYYY-MM-DD`.
- ב-1,000 משימות ← `TaskLimitError` ולא נוספה רשומה.
- ב-999 משימות, שתי יצירות מקבילות משני Pools נפרדים ← בדיוק אחת מצליחה ואחת `TaskLimitError`; בסוף 1,000 בדיוק.
- שתי יצירות מקבילות ברשימה רגילה ← מיקומים שונים ורציפים, בלי כפילות.

**E2E (`npm run test:e2e`, שלושת המצבים) – `e2e/create-task.spec.ts` חדש:**
- יצירה עם כותרת בלבד, תיאור בלבד ושניהם; בלי תאריך ועם תאריך.
- הודעות Validation: ריק/רווחים, 101 תווים, 2001 תווים, תאריך אתמול – מתחת לשדה, בנוסח ה-PRD, בלי שליחה לשרת.
- ערך פתיחה של התאריך הוא היום, ניקוי השדה עובד, השדה ללא שעה.
- אחרי שמירה: רשומה אחת במסד, `completed = false`, אחרונה בסדר; ה-Modal נסגר, המשימה נבחרת, והשורה ופרטיה גלויים ברשימה של כ-40 משימות (בדסקטופ: שניהם ב-Viewport; במובייל: אזור הפרטים ב-Viewport).
- 1,000 משימות ב-Dev (`replaceTasks`) ← הכפתור `disabled` וההודעה מוצגת; `POST` ישיר (`request`) ← `409` ואין רשומה חדשה; שתי בקשות `POST` מקבילות ב-999 ← אחת `201`, אחת `409`.
- סגירה (X / "סגור") ופתיחה מחדש ← טופס ריק ותאריך היום; שגיאת `503` מדומה (`page.route`) ← ה-Modal נשאר עם הערכים וההודעה "השמירה נכשלה. נסה שוב.", וניסיון חוזר מצליח.
- Refresh מציג את המשימה; `context` נוסף (חלון אחר) רואה אותה.
- רגרסיה: `home.spec.ts` ו-`navigation.spec.ts` הקיימים עוברים.

**בדיקה ידנית שלי (Claude) ב-Chrome:** פתיחת ה-Modal בדסקטופ ובמובייל, מראה מול ה-Wireframe וה-Style Guide (צבעים, כפתורים, מסגרת אדומה), ובדיקת `npm run build`. סגירת כל ההרצות בסיום.

## Definition of Done – איך כל סעיף נבדק

| סעיף | בדיקה |
|---|---|
| יצירה עם כותרת בלבד / תיאור בלבד / שניהם; תאריך אופציונלי | E2E + Unit |
| ריק/רווחים, אורך חורג ותאריך בעבר נחסמים עם הודעה מתחת לשדה בנוסח ה-PRD | Unit (validation, Modal) + E2E |
| תאריך פתיחה היום, ניתן לניקוי, ללא שעה | Unit + E2E |
| רשומה אחת, "לביצוע", בסוף; מוצגת, Modal נסגר, נבחרת וגלויה עם פרטיה גם ברשימה ארוכה ובמובייל | Integration + E2E (בדיקת מסד ו-Viewport) |
| ב-1,000: כפתור לא זמין והודעה; `POST` ישיר ← `409` בלי רשומה, גם בשתי בקשות מקבילות | Integration (שני Pools) + E2E + Unit |
| סגירה ופתיחה מאפסות; שגיאת שרת משאירה Modal וערכים ומאפשרת ניסיון חוזר | Unit + E2E |
| הנתונים נשמרים אחרי Refresh ונראים בחלון אחר; בדיקות קודמות עוברות | E2E + רגרסיה מלאה (`npm test`, Integration, E2E, Build) |

## מחוץ לתחום

עריכה ומחיקה (Milestone 4); Checkbox פעיל וגרירה (Milestone 5); הודעת Offline קבועה, PWA וליטוש חזותי מלא (Milestone 6); Rate Limiting; שדה סטטוס ביצירה.
