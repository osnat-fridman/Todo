# Plan – Milestone 7: סידור אוטומטי לפי תאריך יעד ומשימות באיחור

מקורות: `PRD.md` (FR-03, FR-04, FR-06, FR-07, **FR-11**, Edge Cases, UI Texts), `DESIGN.md` 1.1 ו-2.1, `MILESTONES.md` Milestone 7.

## 1. הגישה

**הסידור מחושב בדפדפן בלבד. השרת ומסד הנתונים לא משתנים.**

- `position` במסד נשאר "הסדר הידני" (כמו היום) ומשמש רק כשובר שוויון בתוך אותה קבוצת תאריך.
- סדר התצוגה = מיון יציב לפי מפתח: `(bucket, dueDate, position, id)`:
  - `bucket 0` – באיחור: `!completed && dueDate < today` (מיון לפי `dueDate` עולה).
  - `bucket 1` – כל השאר עם תאריך (כולל משימות שהושלמו עם תאריך שעבר), `dueDate` עולה.
  - `bucket 2` – ללא תאריך.
- `today` = `todayInTimeZone(PRODUCT_TIME_ZONE)` (שעון ישראל, כמו כלל ה-Validation – ADR-5). מחושב בכל רינדור, כך שהמצב מתעדכן בפעולה הבאה או ב-Refresh; אין טיימר.
- "קבוצת גרירה" = `bucket` + `dueDate`. גרירה מותרת רק כשלמשימה הנגררת ולמשימת היעד יש אותה קבוצה.
- ההחלטה תתועד כ-**ADR-19** ב-`ARCHITECTURE.md` (סידור בצד הלקוח, `position` כסדר ידני בתוך תאריך, ללא Migration), ובסעיף 2.5 (זרימות) תתווסף שורה קצרה על זה.

למה כך: זה הפתרון הפשוט ביותר. אין Migration, אין שינוי ב-API, וכל מנגנוני הבטיחות של שמירת סדר (Advisory Lock, `409`, נרמול) נשארים כמו שהם.

## 2. קבצים

### חדש: `src/lib/taskOrder.ts` (+ `taskOrder.test.ts`)
- `isOverdue(task, today): boolean`
- `orderGroup(task, today): string` – מפתח הקבוצה (`"0:2026-10-20"`, `"1:2026-11-01"`, `"2:"`).
- `sortTasks(tasks, today): Task[]` – מחזיר מערך חדש ממוין (לא משנה את המקור).
- `formatDueDate("2026-10-20") → "20/10/2026"` (פירוק מחרוזת, בלי `Date`, כדי לא להיפגע מאזורי זמן).
- בדיקות Unit: סדר שלוש הקבוצות; שובר שוויון לפי `position`; משימה שהושלמה ותאריכה עבר אינה באיחור ונמצאת ב-bucket 1; תאריך היום אינו באיחור; גבול חצות לפי שעון ישראל (`now` מוזרק); פורמט התאריך.

### `src/pages/HomePage.tsx`
- `today` מחושב פעם ברינדור; `const displayed = sortTasks(state.tasks, today)` (ב-`useMemo`) מועבר ל-`TaskList` במקום `state.tasks`.
- `handleCreated` – בלי שינוי לוגי (המשימה נכנסת ל-state; המיון שם אותה במקומה, ו-`position` שהשרת נתן בקצה הרשימה הופך אותה לאחרונה בתאריך שלה). הגלילה לשורה החדשה כבר מתבססת על `data-task-id`, ולכן תמשיך לעבוד.
- `handleSaved` / `handleToggle` – בלי שינוי: עדכון השדות ב-state, והמיון מזיז את השורה.
- `handleReorder(activeId, overId)`:
  1. עובד על `displayed` (לא על `state.tasks`).
  2. אם `orderGroup` של השתיים שונה → לא שומר, `setListNotice({ message: MESSAGES.dragOutsideDateGroup })` ויוצא (dnd-kit מחזיר את השורה למקומה בעצמו).
  3. אחרת: `arrayMove` על הסדר המוצג, ושמירה אופטימית: `position = index` לכל משימה ב-state, ושליחת כל המזהים בסדר המוצג החדש ל-`PUT /api/tasks/order` (חוזה זהה ל-Milestone 5).
  4. הצלחה – כמו היום (positions מהתשובה). כישלון – החזרת ה-`position` הקודמים מתוך Map שנשמר לפני הגרירה (במקום מיון לפי `previousIds`); משימות שנוספו בינתיים נשארות עם ה-position שלהן.

### `src/components/TaskList.tsx`
- מקבל `today` (או `isOverdue` מחושב) ומעביר לכל `TaskRow` `overdue`.
- ה-Announcements לקורא מסך ממשיכים לעבוד על הרשימה המוצגת (כבר מקבלים את `tasks` שמועבר).
- ה-`screenReaderInstructions` מקבלים משפט נוסף: "אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד."

### `src/components/TaskRow.tsx`
- Prop חדש `overdue: boolean` → class `is-overdue`, ואחרי `task-row-text` (בתוך כפתור הבחירה) `<span className="task-row-overdue">באיחור: {formatDueDate(task.dueDate)}</span>`.
- ה-`aria-label` של ה-Checkbox נשאר; התווית גלויה ונקראת כחלק מכפתור הבחירה.

### `src/styles/global.css` / `tokens.css`
- `.task-row.is-overdue { background: var(--color-error-background); }`, ו-`.task-row.is-overdue.is-selected` → רקע הבחירה גובר (סדר כללים).
- `.task-row-overdue`: `flex: none`, `white-space: nowrap`, צבע `--color-error-dark`, גודל הטקסט המשני; `task-row-text` ממשיך להיקטע ב-"...".
- בזמן גרירה (`is-dragging`) הרקע הלבן הקיים נשאר.
- לבדוק במובייל (375px) שהתווית + טקסט מקוצר + Checkbox + ידית נכנסים בשורה אחת.

### `shared/validation.ts`
- הוספת `MESSAGES.dragOutsideDateGroup = "אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד."` (שם שאר נוסחי ה-UI).

### `supabase/dev-seed.sql`
- הוספת משימה באיחור שלא הושלמה (`current_date - 2, false`) ושתי משימות עם אותו תאריך (למשל `current_date + 2`) כדי שיהיה מה לגרור. לשים לב: `current_date` במסד הוא UTC – בגבול חצות זה עלול להיות יום שונה משעון ישראל; ההפרשים (‎-2, ‎+2) גדולים מספיק.
- אחרי השינוי: `npm run db:seed` (Dev בלבד).

### בדיקות קיימות שצריך לעדכן
- `e2e/home.spec.ts` – סדר השורות לפי הנתונים החדשים (בדיקה שהסדר תואם FR-11, ולא סדר ה-position).
- `e2e/create-task.spec.ts:122-128` – "המשימה החדשה אחרונה" → המשימה החדשה במקום של התאריך שלה (היום ← אחרי משימות באיחור ולפני תאריכים עתידיים).
- `e2e/status-order.spec.ts` – בדיקות הגרירה צריכות לגרור בין משימות עם אותו תאריך; בדיקת ה-Checkbox ("kept in place") תיבחר על משימה שאינה באיחור.
- `src/components/CreateTaskModal.test.tsx:81` ו-`src/pages/HomePage*.test.tsx` – עדכון ההנחה "בסוף הרשימה".
- `test-support/apiHandlers.ts` – לוודא שה-Mock מחזיר נתונים שמאפשרים לבדוק את המקרים.

### בדיקות חדשות
- **Component** (`HomePage.statusOrder.test.tsx`): גרירה מחוץ לקבוצה לא קוראת ל-`saveTaskOrder` ומציגה את ההודעה; גרירה בתוך קבוצה שולחת את הסדר המלא הנכון; סימון משימה באיחור כהושלמה מזיז אותה ומוריד את `is-overdue`; שמירת תאריך חדש מזיזה את השורה והבחירה נשארת; כישלון שמירת סדר מחזיר את הסדר הקודם.
- **E2E** (`e2e/date-order.spec.ts`, מול Dev): סדר הרשימה אחרי Refresh; יצירת משימה עם תאריך עתידי רחוק / בלי תאריך ומיקומה; שורה באיחור – רקע ותווית; גרירה בתוך אותו תאריך נשמרת אחרי Refresh; גרירה לתאריך אחר חוזרת ומציגה הודעה; גרירה במגע (פרויקט Mobile Safari/Android הקיים).
- **Integration:** אין שינוי בשרת, ולכן רק הרצה חוזרת של הקיימות לווידוא.

## 3. סדר העבודה
1. `taskOrder.ts` + בדיקות Unit.
2. חיבור ב-`HomePage` ו-`TaskList` (מיון תצוגה), ואז `handleReorder` החדש + ההודעה.
3. `TaskRow` + CSS לשורה באיחור; בדיקה ויזואלית בדסקטופ ובמובייל.
4. עדכון ה-Seed והרצתו מול Dev.
5. עדכון בדיקות קיימות + בדיקות חדשות; `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`.
6. ADR-19 ושורה ב-ARCHITECTURE 2.5; סימון 🟡 ב-MILESTONES.

## 4. מחוץ לתוכנית
- אין שינוי ב-API, במסד או ב-Migrations.
- אין כותרות קבוצה ("היום", "השבוע") ואין הצגת תאריך בשורות שאינן באיחור.
- אין טיימר שמעדכן את הרשימה בחצות.
- אין מתג "סדר ידני / אוטומטי".
