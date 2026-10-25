# תוכנית – Milestone 5: סטטוס ביצוע וסדר ידני

**מקורות:** `MILESTONES.md` (Milestone 5), `PRD.md` (זרימות 4–5, FR-05, FR-06, FR-07, Edge Cases, UI Texts), `DESIGN.md` (1.1, 1.6, 2.3), `ARCHITECTURE.md` (2.2, 2.4–2.6, 2.10, ADR-7, ADR-9, ADR-11, ADR-15, ADR-16), `wireframes.png` (שורות עם Checkbox וידית גרירה), `style-guide.png` (Checkbox כחול, טקסט חצוי, ידית נקודות).

**נקודת מוצא בקוד:** ב-`TaskRow` ה-Checkbox מושבת (`disabled`, לקריאה בלבד) והידית דקורטיבית. `HomePage` מחזיק את הרשימה ואת `selectedId`; `TaskEditor` מקבל `key` לפי מזהה המשימה, כך שעדכון `completed`/`position` לא מאפס את הטיוטה (ADR-16). קיימים `lockTaskList`, `inTransaction`, `TaskNotFoundError`, `isUuid`, ו-`readJsonBody` עם מגבלת גודל ניתנת להגדרה. אין צורך ב-Migration.

## 1. שרת (API)

### 1.1 `api/tasks/[id]/status.ts` (חדש, ADR-9)
- `createHandler(getRepository)` כמו בשאר ה-Handlers, לבדיקות Unit עם Repository מדומה.
- `allowMethods(["PATCH"])`; `id` לא UUID ← `400 INVALID_REQUEST`.
- `readJsonBody` (16KB); `completed` חייב להיות `boolean` (חסר או מסוג אחר ← `400 INVALID_REQUEST`). שדות אחרים מתעלמים מהם.
- `repository.setTaskCompleted(id, completed)` ← `200` עם המשימה; `TaskNotFoundError` ← `404 TASK_NOT_FOUND` (אותו נוסח כמו ב-`[id]/index.ts` – הפונקציה `sendNotFound` תועבר ל-`server/http.ts` לשימוש משותף); תקלת DB ← `503`.

### 1.2 `api/tasks/order.ts` (חדש, ADR-9)
- `allowMethods(["PUT"])`; `readJsonBody(req, res, 64 * 1024)`.
- `orderedIds` חייב להיות מערך של עד 1,000 מחרוזות UUID; אחרת ← `400 INVALID_REQUEST`.
- `repository.reorderTasks(orderedIds)` ← `200` עם הרשימה בסדרה החדש; `OrderConflictError` ← `409 ORDER_CONFLICT` עם ההודעה "הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב."; תקלת DB ← `503`.
- נתיב סטטי, ולכן Vercel מעדיף אותו על `[id]` (יש לוודא ב-`vercel dev` שגם `PATCH /api/tasks/order` לא מגיע בטעות ל-Handler של משימה בודדת).

### 1.3 `server/tasksRepository.ts`
- **`setTaskCompleted(id, completed)`**: שאילתה אחת `update public.tasks set completed = $2, updated_at = now() where id = $1 returning ...`, **בלי** ה-Advisory Lock ובלי לגעת ב-`position` או בשדות הפרטים. אין שורה ← `TaskNotFoundError`.
- **`reorderTasks(orderedIds)`**: Transaction ← `lockTaskList(client)` ← `select id from public.tasks` ← השוואה: אותו מספר, בלי כפילויות, וכל מזהה קיים (התאמה אחד-לאחד); אחרת `OrderConflictError` (ROLLBACK, שום דבר לא משתנה) ← עדכון בשאילתה אחת:
  `update public.tasks t set position = o.ord - 1 from unnest($1::uuid[]) with ordinality as o(id, ord) where t.id = o.id and t.position <> o.ord - 1`
  ← קריאת הרשימה המלאה בסדר החדש באותו Client ← commit. התוצאה היא מיקומים רציפים 0..N-1.
- שגיאה חדשה: `OrderConflictError`.

## 2. לקוח

### 2.1 תלויות
- התקנת `@dnd-kit/core`, `@dnd-kit/sortable` ו-`@dnd-kit/utilities` (לפי טבלת ה-Stack ב-`ARCHITECTURE.md`; `utilities` נדרשת להמרת ה-Transform ל-CSS). אין תלויות נוספות.

### 2.2 `src/api/tasksClient.ts`
- `setTaskCompleted(id, completed)` ← `PATCH /api/tasks/:id/status`; `saveTaskOrder(orderedIds)` ← `PUT /api/tasks/order`. שתיהן אינן זורקות שגיאה, כמו הפונקציות הקיימות.
- נוסחים חדשים: `STATUS_FAILED_MESSAGE` ("שינוי הסטטוס נכשל. נסה שוב."), `ORDER_FAILED_MESSAGE` ("שמירת הסדר נכשלה, והסדר הקודם הוחזר."), `ORDER_CONFLICT_MESSAGE` ("הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.").
- `toFailure` יבחין בין שני סוגי `409` לפי `error.code`: `TASK_LIMIT_REACHED` (יצירה, כמו היום) ו-`ORDER_CONFLICT` (תוצאה עם `conflict: true`). `404` ← `notFound`; `429` ← "יותר מדי בקשות..."; כל השאר ובעיית רשת ← ההודעה הכללית של הפעולה.

### 2.3 `src/components/TaskRow.tsx`
- **Checkbox פעיל:** `onChange` שולח את הערך המפורש החדש (`!task.completed`). מושבת רק בזמן שבקשת הסטטוס של אותה שורה עדיין רצה (ADR-9). ה-Checkbox נשאר מחוץ לכפתור הבחירה, ולכן לחיצה עליו לא בוחרת משימה.
- **Sortable:** `useSortable({ id, disabled })`. ה-`setNodeRef`, ה-`transform` וה-`transition` על ה-`<li>`; ה-`listeners`/`attributes` ו-`setActivatorNodeRef` **רק** על הידית.
- **הידית** הופכת ל-`<button type="button">` עם `aria-label` בעברית ("גרור כדי לשנות את מיקום המשימה: <טקסט השורה>"), גודל מגע של 44px לפחות, ו-CSS: `touch-action: none`, `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`, `cursor: grab`.
- שורה בזמן גרירה מקבלת מחלקה `is-dragging` (צל רך והרמה קלה לפי ה-Style Guide).

### 2.4 `src/components/TaskList.tsx`
- עוטף את השורות ב-`DndContext` + `SortableContext` (`verticalListSortingStrategy`), עם:
  - `PointerSensor` עם `activationConstraint: { distance: 4 }` – מגע ועכבר, וכך נגיעה קצרה בידית אינה גרירה.
  - `KeyboardSensor` עם `sortableKeyboardCoordinates` (נגישות).
  - `accessibility`: הוראות והודעות קורא מסך בעברית (התחלת גרירה, מעבר מעל מיקום, שחרור, ביטול).
- `onDragEnd` ← אם המיקום השתנה, `onReorder(fromId, toId)`.
- הגרירה מושבתת (`disabled` לכל השורות) בזמן ששמירת סדר קודמת עדיין רצה (ADR-9).
- **תיבת הודעה ברשימה** (חדש): `listMessage` מוצג בראש אזור "רשימת משימות", מתחת לכותרת, בתיבת שגיאה (`role="alert"`). כשההודעה היא על `409` מופיע בתוכה כפתור Secondary **"רענן את הרשימה"**.

### 2.5 `src/pages/HomePage.tsx`
- **סטטוס (אופטימי):** `handleToggle(id, completed)` ← עדכון מיידי של `completed` ב-State, סימון השורה כ-"בהמתנה" (`pendingStatusIds`), `setTaskCompleted`.
  - הצלחה ← רק הסרת ה"בהמתנה".
  - כישלון ← החזרת **רק** `completed` של אותה משימה לערך הקודם (אם היא עדיין ברשימה) והודעה "שינוי הסטטוס נכשל. נסה שוב." בתיבת ההודעה של הרשימה.
  - `404` ← `removeTask(id, TASK_GONE_MESSAGE)` הקיים. אם המשימה לא הייתה נבחרת, ההודעה "המשימה כבר לא קיימת..." מוצגת בתיבת ההודעה של הרשימה (כי אזור הפרטים לא קשור אליה).
- **סדר (אופטימי):** `handleReorder(fromId, toId)` ← `arrayMove` ועדכון State מיידי, שמירת סדר המזהים הקודם, `ordering = true`, `saveTaskOrder` עם **כל** המזהים בסדר החדש.
  - הצלחה ← עדכון `position` בלבד מתשובת השרת (לא דריסת `completed` שאולי עדיין נשמר).
  - כישלון (כולל `409`) ← סידור מחדש של הרשימה **הנוכחית** לפי סדר המזהים הקודם (משימות אחרות לא נמחקות ולא מוחזרות), והודעה מתאימה; ב-`409` עם כפתור "רענן את הרשימה".
- **"רענן את הרשימה":** `GET /api/tasks` ברקע, בלי לעבור למצב "טוען" (כדי לא לאבד את הטיוטה באזור הפרטים). הצלחה ← החלפת הרשימה וניקוי ההודעה; אם המשימה הנבחרת כבר לא קיימת, הבחירה מתאפסת. כישלון ← ההודעה "לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב." בתיבת ההודעה.
- תיבת ההודעה של הרשימה מתנקה בפעולת סטטוס או גרירה מוצלחת הבאה, ובפתיחת Modal היצירה.
- סימון או גרירה של המשימה הנבחרת לא נוגעים ב-`selectedId` ולא בטיוטה (כבר מובטח ע"י `key={task.id}`); אין גלילה אוטומטית אחרי גרירה.
- אין Polling ואין עדכוני רקע: שינויים של מבקרים אחרים נטענים רק ב-Refresh, בכניסה מחדש לדף הבית, או בכפתור "רענן את הרשימה" אחרי `409`.

### 2.6 `src/styles/global.css`
- הסרת הכלל `.task-checkbox:disabled` שהשאיר את ה-Checkbox "לקריאה בלבד"; `cursor: pointer` ל-Checkbox, ומצב מושבת עדין בזמן בקשה.
- `.drag-handle` ככפתור (רקע שקוף, בלי מסגרת, Focus כחול, `cursor: grab`/`grabbing`) עם הגדרות המגע מסעיף 2.3.
- `.task-row.is-dragging` – רקע לבן, צל `0 2px 8px rgba(0,0,0,0.08)`, `z-index` מעל שאר השורות.
- `.list-notice` – תיבת השגיאה בראש הרשימה, עם מקום לכפתור הרענון.

## 3. החלטות לתיעוד כ-ADR-17 (בזמן הבנייה)
פרטים שה-spec לא קובע במדויק, והבחירה בהם פשוטה:
1. **מקום ההודעות:** שגיאות סטטוס וסדר, `409` עם כפתור "רענן את הרשימה", ו"המשימה כבר לא קיימת" עבור משימה **שאינה** נבחרת – בתיבת שגיאה אחת בראש אזור הרשימה. עבור משימה נבחרת נשאר המקום הקיים (ראש אזור הפרטים, ADR-16).
2. **"רענן את הרשימה"** טוען מחדש מהשרת בלי מסך "טוען", ושומר בחירה וטיוטה אם המשימה עדיין קיימת.
3. **הפעלת גרירה:** תזוזה של 4px מהידית, ללא השהיה (Delay), כי הידית היא `touch-action: none` ולכן אינה מתנגשת בגלילת הדף; גלילה במובייל נעשית מכל מקום אחר בשורה.
4. **התלות `@dnd-kit/utilities`** נוספת לצד `core` ו-`sortable`.

## 4. בדיקות

**Unit (`npm test`):**
- `api/tasks/[id]/status.test.ts`: `200`; `completed` חסר/לא Boolean ← `400`; `id` לא UUID ← `400`; `404`; Method אחר ← `405`; תקלת DB ← `503` בלי פרטים.
- `api/tasks/order.test.ts`: `200` עם הרשימה; לא מערך / מזהה לא UUID / יותר מ-1,000 / Body גדול מ-64KB ← `400`; `OrderConflictError` ← `409 ORDER_CONFLICT`; Method אחר ← `405`; `503`.
- `src/pages/HomePage.test.tsx` (fetch מדומה): Checkbox מסמן ומבטל, נשלח הערך המפורש, המיקום לא משתנה; כישלון ← ה-Checkbox חוזר והודעה; `404` ← הסרה והודעה (נבחרת ולא נבחרת); Checkbox מושבת בזמן בקשה; סימון המשימה הנבחרת משאיר טיוטה שלא נשמרה כפי שהיא. סדר: גרירה במקלדת (KeyboardSensor) שולחת את כל המזהים בסדר החדש; כישלון ← הסדר הקודם חוזר והודעה; `409` ← הודעה וכפתור "רענן את הרשימה" שטוען מחדש; גרירת המשימה הנבחרת משאירה את הטיוטה.
- כל בדיקות ה-Unit הקיימות עוברות (כולל `api/tasks/[id]/index.test.ts` אחרי העברת `sendNotFound`).

**Integration מול Dev (`npm run test:integration`, ADR-7):**
- `setTaskCompleted` משנה רק את `completed` (גם חזרה ל"לביצוע"), לא את הפרטים או `position`; `404` למזהה שלא קיים.
- `reorderTasks` שומר סדר מדויק ומיקומים 0..N-1; קבוצת מזהים חסרה / עודפת / עם כפילות / עם מזהה שלא קיים ← `OrderConflictError` ושום דבר לא השתנה.
- שתי גרירות מקבילות (שני Pools) ← אחת מהן נשמרת במלואה (האחרונה קובעת), בלי ערבוב ובלי כפילויות.
- יצירה במקביל לגרירה ← או שהגרירה נדחתה ב-`409` והיצירה נשמרה, או שהגרירה נשמרה והמשימה החדשה בסוף; בכל מקרה מיקומים רציפים בלי אובדן משימה. אותו דבר למחיקה במקביל לגרירה.
- שינוי סטטוס במקביל לגרירה ← שניהם נשמרים.

**E2E (`npm run test:e2e`, Desktop Chrome / Pixel 7 / iPhone WebKit) – `e2e/status-order.spec.ts` (חדש):**
- Checkbox מסמן ומבטל; הערך נשמר במסד ונשאר אחרי Refresh; המיקום לא השתנה; טקסט חצוי למשימה שהושלמה.
- סימון Checkbox של המשימה הנבחרת בזמן עריכה שלא נשמרה ← הטיוטה נשארת.
- גרירה בעכבר מהידית ← הסדר החדש מוצג, נשמר במסד במיקומים רציפים ונשאר אחרי Refresh; משימה שהושלמה ניתנת לגרירה; הגרירה לא סימנה Checkbox ולא בחרה משימה.
- גרירת המשימה הנבחרת בזמן עריכה ← הטיוטה נשארת.
- מגע: ב-Mobile Chrome גרירה באירועי Touch אמיתיים (CDP `Input.dispatchTouchEvent`); ב-Mobile Safari (WebKit) גרירה באירועי Pointer. הבדיקה במגע אמיתי ב-Android וב-iPhone נעשית ידנית (ADR-11).
- כשל שרת מדומה (`page.route`) ← ה-Checkbox/הסדר חוזרים והודעה; משימה שנוספה במסד בינתיים ← גרירה ← `409`, הסדר לא השתנה, "רענן את הרשימה" מציג את המשימה החדשה; משימה שנמחקה במסד ← Checkbox ← הוסרה עם "המשימה כבר לא קיימת".
- כל בדיקות ה-E2E הקודמות (צפייה, ניווט, יצירה, עריכה ומחיקה) עוברות.

**בדיקה עצמית לפני סימון 🟡:** `npm run build`, שלוש קבוצות הבדיקות, והרצה ב-`npm start` עם בדיקה בדפדפן (דסקטופ ומובייל) של ה-Checkbox, הידית ומראה שורה בזמן גרירה מול ה-Wireframe וה-Style Guide; סגירת ההרצה בסיום. סעיף ה-DoD על מגע **אמיתי** ב-Android וב-iPhone יסומן כבדיקה שנשארה לך לבצע ידנית בטלפון.

## 5. מיפוי ל-Definition of Done

| תנאי | מכוסה על ידי |
|---|---|
| Checkbox מסמן/מבטל, נשמר מיד, המיקום לא משתנה | 1.1, 1.3, 2.3, 2.5; Unit, Integration, E2E |
| משימות שהושלמו באותה רשימה וניתנות לגרירה | 2.3, 2.4; E2E |
| Checkbox/גרירה של המשימה הנבחרת משאירים את הטיוטה | `key={task.id}`, 2.5; Unit, E2E |
| גרירה בעכבר ובמגע בלי הפעלה בטעות של Checkbox/בחירה/בחירת טקסט/תפריט | ידית נפרדת עם CSS מגע, `distance: 4`; E2E + בדיקה ידנית בטלפונים |
| אחרי גרירה ו-Refresh – סדר מדויק, רציף, בלי כפילויות | 1.2, 1.3; Integration, E2E |
| Integration: Transaction אטומית ביצירה/מחיקה בזמן גרירה ובשתי גרירות מקבילות | 1.3; Integration |
| קבוצת מזהים השתנתה ← `409`, בלי אובדן או סדר חלקי | 1.2, 1.3, 2.5; Unit, Integration, E2E |
| תקלה ← חזרה למצב השמור והודעה; `404` ב-Checkbox ← הסרה והודעה | 2.2, 2.5; Unit, E2E |
| שינויים של מבקר אחר רק אחרי Refresh; יכולות קודמות עובדות | אין Polling; כל הבדיקות הקודמות |

## 6. מחוץ לטווח
ליטוש חזותי מלא, PWA, הודעת Offline קבועה ונוסח "אין חיבור לאינטרנט. הפעולה לא בוצעה." (Milestone 6). בינתיים בעיית רשת בסטטוס או בסדר מציגה את הודעת הכישלון הכללית של אותה פעולה.
