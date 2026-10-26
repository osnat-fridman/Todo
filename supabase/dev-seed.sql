-- Sample data for the Dev project ONLY. Never run this against Production.
-- Re-runnable: replaces the whole task list with the sample tasks below.

begin;

delete from public.tasks;

insert into public.tasks (title, description, due_date, completed, position) values
  ('לקנות מצרכים', 'חלב, לחם, ביצים ופירות לשבוע.', current_date + 2, false, 0),
  ('לתכנן חופשה', E'לבדוק יעדים, מחירים ולסגור טיסות.\nלהשוות בין שתי אפשרויות מלון.', current_date + 14, false, 1),
  ('לסיים דוח שנתי', 'לשלוח לצוות לאישור.', current_date - 3, true, 2),
  (null, 'לפנות למוסך ולקבוע תור לטיפול שנתי', null, false, 3),
  (null, E'לבדוק אפשרויות ביטוח לרכב לפני חידוש הפוליסה בחודש הבא,\nכולל השוואה בין לפחות שלוש חברות ביטוח שונות ובדיקת כיסוי לשמשות וגרירה.', current_date + 30, false, 4),
  ('כותרת ארוכה מאוד לבדיקה שהטקסט בשורת המשימה נקטע בצורה נכונה ומסתיים בשלוש נקודות גם במסך רחב', null, null, false, 5),
  ('להחזיר ספרים לספרייה', null, current_date - 2, false, 6),
  ('לשלם חשבון חשמל', null, current_date + 2, false, 7);

commit;
