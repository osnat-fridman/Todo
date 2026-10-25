# תוכנית – Milestone 4: עריכת פרטים ומחיקת משימה

**מקורות:** `MILESTONES.md` (Milestone 4), `PRD.md` (זרימות 3 ו-6, FR-02, FR-05, FR-08, FR-10, Edge Cases, UI Texts), `DESIGN.md` (1.2, 1.4, 2.3), `ARCHITECTURE.md` (2.4–2.6, ADR-6, ADR-8, ADR-9, ADR-15), `wireframes.png` ("דף הבית – משימה נבחרת", "אישור מחיקה").

**נקודת מוצא בקוד:** `TaskDetails` מציג את שלושת השדות לקריאה בלבד; `HomePage` מחזיק את הרשימה ואת `selectedId`; קיימים `GET`/`POST /api/tasks`, `lockTaskList` ו-`validateTaskInput` עם `storedDueDate` (כבר נבדק ב-`shared/validation.test.ts`). אין צורך ב-Migration.

## 1. שרת (API)

### 1.1 `api/tasks/[id]/index.ts` (חדש, לפי ADR-9)
- `createHandler(getRepository, now)` בדומה ל-`api/tasks/index.ts`, כדי לאפשר בדיקות Unit עם Repository מדומה.
- `allowMethods(["PATCH", "DELETE"])`; אחרת `405`.
- `id` מתוך `req.query.id`; אם אינו UUID תקין ← `400 INVALID_REQUEST`.
- **PATCH:**
  - `readJsonBody` (16KB). קריאת שלושת השדות במצב "חובה": אם אחד מ-`title`/`description`/`dueDate` חסר, או שאינו מחרוזת/`null` ← `400 INVALID_REQUEST` (ADR-8). שדות אחרים (`completed`, `position` וכד') מתעלמים מהם.
  - `repository.updateTaskDetails(id, input, today)` כאשר `today = todayInTimeZone(PRODUCT_TIME_ZONE, now())`.
  - תוצאה: `200` עם המשימה המעודכנת; `TaskNotFoundError` ← `404 TASK_NOT_FOUND`; `TaskValidationError` ← `400 VALIDATION_ERROR` עם `field` והודעה (השגיאה הראשונה, כמו ב-POST); תקלת DB ← `503`.
- **DELETE:** `repository.deleteTask(id)` ← `204` בלי Body (עם `Cache-Control: no-store`); `TaskNotFoundError` ← `404`; תקלת DB ← `503`.

### 1.2 `server/taskInput.ts` (חדש)
- העברת `readTaskInput` מ-`api/tasks/index.ts` לקובץ משותף, עם אפשרות `{ requireAll: true }` עבור PATCH. ה-POST ממשיך להתנהג בדיוק כמו היום (שדה חסר = `null`).
- `isUuid(value)` – בדיקת פורמט UUID לפני פנייה למסד.

### 1.3 `server/tasksRepository.ts`
- שגיאות חדשות: `TaskNotFoundError`, `TaskValidationError` (מחזיקה את רשימת `FieldError`).
- **`updateTaskDetails(id, input, today)`** (ADR-8): Transaction על Client אחד ← `select to_char(due_date,'YYYY-MM-DD') ... where id = $1 for update` ← אם אין שורה: `TaskNotFoundError` ← `validateTaskInput(input, { today, storedDueDate })`; אם יש שגיאות: `TaskValidationError` ← `update public.tasks set title=$2, description=$3, due_date=$4::date, updated_at=now() where id=$1 returning ...` ← commit. **לא** נוגע ב-`completed` וב-`position`, ו**אינו** לוקח את ה-Advisory Lock של הרשימה.
- **`deleteTask(id)`**: Transaction ← `lockTaskList(client)` ← `delete ... where id=$1 returning id`; אם לא נמחק דבר: `TaskNotFoundError` ← נרמול `position` ל-0..N-1 בשאילתה אחת (`row_number() over (order by position, id) - 1`, ומעדכנים רק שורות שהמיקום שלהן השתנה) ← commit.

## 2. לקוח

### 2.1 `src/api/tasksClient.ts`
- `updateTask(id, input)` ו-`deleteTask(id)`, שאינן זורקות שגיאה (כמו `createTask`). תוצאה אחידה:
  `{ ok: true, task? }` | `{ ok: false, notFound: true }` | `{ ok: false, field, message }` | `{ ok: false, message }`.
- מיפוי: `404` ← `notFound`; `429` ← "יותר מדי בקשות. המתן מעט ונסה שוב."; `400` עם `field` ← שגיאת שדה; כל השאר ובעיית רשת ← "השמירה נכשלה. נסה שוב." (עדכון) או "המחיקה נכשלה. נסה שוב." (מחיקה).
- קבועים חדשים לנוסחים: `DELETE_FAILED_MESSAGE`, `TASK_GONE_MESSAGE` ("המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.").

### 2.2 `src/components/TaskFormFields.tsx` (חדש, משותף)
- הוצאת שלושת השדות מ-`CreateTaskModal` לרכיב משותף: תוויות, Placeholders, `aria-describedby`, מסגרת אדומה, הודעה מתחת לשדה, וסימון שני השדות בהודעת "כותרת או תיאור".
- `CreateTaskModal` עובר להשתמש בו בלי שינוי בהתנהגות (בדיקות ה-Milestone הקודם חייבות לעבור כמו שהן). כך אזור הפרטים וה-Modal נראים ומתנהגים אותו דבר.

### 2.3 `src/components/TaskDetails.tsx` – עריכה ושמירה
- נשאר עטוף ב-`key={task.id}` מתוך `HomePage`, כך שמעבר למשימה אחרת יוצר טיוטה חדשה מהערכים השמורים (ביטול שינויים ללא התראה). מעבר לאודות או Refresh מוחקים את הטיוטה ממילא, כי היא רק בזיכרון.
- הטיוטה (`title`, `description`, `dueDate`) נטענת פעם אחת מהמשימה, ו**אינה** מתעדכנת כשאובייקט המשימה ברשימה משתנה – הכנה ל-Milestone 5 (Checkbox/גרירה לא ידרסו טיוטה).
- **"שמור שינויים"** (Primary) ← Validation בלקוח עם `storedDueDate` = התאריך השמור, וכן בדיקת `validity.badInput` כמו ב-Modal ← `updateTask`. בזמן שמירה שני הכפתורים מושבתים ויש הגנה משליחה כפולה.
  - הצלחה ← הטיוטה מתעדכנת לערכים המנורמלים שחזרו מהשרת (למשל אחרי `trim`), ו-`onSaved(task)` מעדכן את הרשימה.
  - שגיאת שדה ← מתחת לשדה; שגיאה כללית ← תיבת שגיאה אחת מעל הכפתורים. הערכים לא משתנים.
  - `404` ← `onGone(id)`.
- `min` בשדה התאריך הוא היום המקומי; תאריך שמור שכבר עבר עדיין מוצג ונשמר כל עוד לא שונה.
- **"מחק משימה"** (סגנון Danger: מסגרת וטקסט `error-dark`) ← פותח את `DeleteTaskModal`.

### 2.4 `src/components/DeleteTaskModal.tsx` (חדש)
- לפי `DESIGN.md` 1.4 וה-Wireframe: Overlay, חלון קטן ממורכז, כותרת "מחיקת משימה", השאלה "האם אתה בטוח שברצונך למחוק את המשימה הזו?", כפתורי "אישור" ו"ביטול".
- "ביטול", Esc ← סגירה בלי בקשה לשרת. לחיצה על ה-Overlay לא סוגרת (כמו ב-ADR-15). הפוקוס ההתחלתי על "ביטול", כדי שלחיצת Enter מקרית לא תמחק.
- "אישור" ← `deleteTask`; בזמן הבקשה שני הכפתורים מושבתים.
  - הצלחה ← `onDeleted(id)`: המשימה יוצאת מהרשימה ואזור הפרטים חוזר להודעת הבחירה.
  - כישלון ← החלון נשאר פתוח עם "המחיקה נכשלה. נסה שוב." מעל הכפתורים; המשימה נשארת ברשימה ובפרטים.
  - `404` ← החלון נסגר ו-`onGone(id)`.
- ההתנהגות המשותפת לשני ה-Modal-ים (נעילת גלילת הדף, Esc) תוצא ל-Hook קטן `useModalBehavior` ב-`src/components/`.

### 2.5 `src/pages/HomePage.tsx`
- `handleSaved(task)` – ממזג לרשימה **רק** את `title`, `description`, `dueDate` (ADR-9), כך שטקסט השורה מתעדכן מיד.
- `handleDeleted(id)` – הסרה מהרשימה ו-`selectedId = null`.
- `handleGone(id)` – הסרה מהרשימה; אם היא עדיין הנבחרת, `selectedId = null`; והצגת ההודעה "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר." בתיבת שגיאה (`role="alert"`) בראש אזור הפרטים, מעל הודעת הבחירה. ההודעה נעלמת בבחירת משימה או בפתיחת ה-Modal.
- אחרי מחיקה (מוצלחת או "כבר לא קיימת") הפוקוס עובר לכותרת "פרטי משימה", כדי שלא יאבד.

### 2.6 `src/styles/global.css`
- `.button-danger` (רקע לבן, טקסט ומסגרת `error-dark`, Hover עדין) לפי ה-Style Guide.
- `.details-actions` – שורת הכפתורים באזור הפרטים ("שמור שינויים" מימין, "מחק משימה" לצדו), מתפרסת לרוחב במובייל.
- `.modal-small` לחלון אישור המחיקה; `.details-notice` להודעת "כבר לא קיימת".

## 3. החלטות לתיעוד כ-ADR-16 (בזמן הבנייה)
אלה פרטים שה-spec לא קובע במדויק, והבחירה בהם פשוטה:
1. הודעת "המשימה כבר לא קיימת" מוצגת בראש אזור הפרטים, ונעלמת בבחירה הבאה.
2. כישלון מחיקה משאיר את חלון האישור פתוח עם ההודעה, לניסיון חוזר.
3. כפתור "אישור" במחיקה מעוצב כ-Danger (פעולת מחיקה לפי `DESIGN.md` 2.3); ב-Wireframe הוא מודגש, וה-Style Guide קובע את הסגנון. הפוקוס ההתחלתי על "ביטול".
4. אין הודעת "נשמר בהצלחה": ה-PRD אינו מגדיר נוסח כזה. המשוב הוא עדכון השורה ברשימה וסיום מצב השמירה של הכפתור.

## 4. בדיקות

**Unit (`npm test`):**
- `api/tasks/[id]/index.test.ts`: PATCH – `200` עם ערכים מנורמלים; שדה חסר או מסוג שגוי ← `400`; `id` לא UUID ← `400`; `404`; שגיאת Validation ← `400` עם `field`; התעלמות מ-`completed`/`position`; DELETE ← `204`/`404`; Method אחר ← `405`; תקלת DB ← `503` בלי פרטים.
- `api/tasks/index.test.ts` ממשיך לעבור אחרי העברת `readTaskInput`.
- `src/components/TaskDetails.test.tsx`: שדות ניתנים לעריכה; שמירה שולחת את שלושת השדות; Validation מתחת לשדה וערכים נשמרים; תאריך שמור בעבר נשמר בלי שינוי, ושינוי לתאריך עבר אחר נחסם; כישלון שרת ← תיבת שגיאה וניסיון חוזר; מעבר למשימה אחרת וחזרה מבטל טיוטה; `404` ← הסרה, איפוס והודעה.
- `src/components/DeleteTaskModal.test.tsx`: ביטול/Esc לא שולחים בקשה; אישור מוחק ומאפס; כישלון משאיר את המשימה ומציג הודעה; `404`.
- `CreateTaskModal.test.tsx` ו-`HomePage.test.tsx` הקיימים עוברים ללא שינוי.

**Integration מול Dev (`npm run test:integration`, ADR-7):**
- עדכון משנה רק את שלושת השדות ולא את `completed`/`position`; תאריך שמור בעבר מותר כשלא שונה ונדחה כשהוא שונה לעבר אחר; `404` למזהה שלא קיים.
- שתי שמירות מקבילות לאותה משימה (שני Pools) ← השמירה שבוצעה אחרונה היא שנשארת, והסטטוס והמיקום לא נפגעו.
- מחיקה מנרמלת מיקומים ל-0..N-1; מחיקה כפולה ← `404`; מחיקה במקביל ליצירה ← מיקומים רציפים בלי כפילויות.

**E2E (`npm run test:e2e`, Desktop Chrome / Pixel 7 / iPhone WebKit) – `e2e/edit-delete.spec.ts`:**
- עריכה ושמירה ← הערכים נשמרים במסד ונראים אחרי Refresh.
- משימה עם תאריך שמור בעבר נשמרת בלי לשנות תאריך; שינוי לתאריך עבר אחר נחסם עם הודעה.
- שינוי ללא שמירה ← מעבר למשימה אחרת / לאודות / Refresh ← הערכים המקוריים חוזרים.
- כשל שרת מדומה (`page.route`) ← הודעה, הערכים נשארים, ניסיון חוזר מצליח.
- מחיקה: ביטול משאיר; אישור מוחק (גם מהמסד) ומאפס את הפרטים; כשל מדומה משאיר את המשימה.
- משימה שנמחקה ישירות במסד ← שמירה או מחיקה מסירות אותה, מאפסות את הפרטים ומציגות "המשימה כבר לא קיימת".
- כל בדיקות ה-E2E הקודמות (צפייה, ניווט, יצירה) עוברות.

**בדיקה עצמית לפני סימון 🟡:** `npm run build`, שלוש קבוצות הבדיקות, והרצה ב-`npm start` עם בדיקה בדפדפן (דסקטופ ומובייל) של מראה השדות, הכפתורים וחלון המחיקה מול ה-Wireframe וה-Style Guide; סגירת ההרצה בסיום.

## 5. מיפוי ל-Definition of Done

| תנאי | מכוסה על ידי |
|---|---|
| עריכה ושמירה נשמרות ונראות אחרי Refresh | 1.1, 1.3, 2.3; E2E |
| תאריך שמור שעבר נשמר; שינוי לעבר אחר נחסם | `storedDueDate` בלקוח ובשרת; Unit, Integration, E2E |
| מעבר משימה/אודות/Refresh מבטל טיוטה | `key={task.id}`, טיוטה בזיכרון בלבד; Unit, E2E |
| כישלון שמירה/Validation – שגיאה וערכים נשארים | 2.3; Unit, E2E |
| מחיקה עם אישור; ביטול משאיר; אישור מוחק רק אחרי הצלחה | 2.4; Unit, E2E |
| אחרי מחיקה – איפוס; כישלון לא מסיר | 2.4, 2.5; Unit, E2E |
| `404` בשמירה/מחיקה – הסרה, איפוס והודעה | 1.1, 2.1, 2.5; Unit, E2E |
| שמירות מקבילות – האחרונה קובעת, בלי דריסת סטטוס/סדר | `for update`, UPDATE של שלושה שדות בלבד; Integration |
| מראה לפי `DESIGN.md`; בדיקות קודמות עוברות | 2.2, 2.6, ADR-16; כל הבדיקות + בדיקה חזותית |

## 6. מחוץ לטווח
Checkbox פעיל, גרירה ו-`PUT /api/tasks/order` (Milestone 5); ליטוש חזותי מלא, PWA והודעת Offline (Milestone 6).
