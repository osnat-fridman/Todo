import { forwardRef } from "react";
import type { Task } from "../../shared/types";

type Props = {
  task: Task | null;
};

// Fields are read-only in Milestone 1; editing and saving arrive in Milestone 4.
const TaskDetails = forwardRef<HTMLElement, Props>(function TaskDetails({ task }, ref) {
  return (
    <section
      ref={ref}
      className="card task-details-card"
      aria-labelledby="task-details-title"
      data-testid="task-details"
    >
      <h2 id="task-details-title" className="card-title">
        פרטי משימה
      </h2>

      {task === null ? (
        <p className="details-empty">בחר משימה מהרשימה כדי לצפות בפרטיה</p>
      ) : (
        <div className="details-form" key={task.id}>
          <label className="field">
            <span className="field-label">כותרת</span>
            <input
              className="input"
              type="text"
              value={task.title ?? ""}
              placeholder="הזן כותרת (לא חובה)"
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">תיאור</span>
            <textarea
              className="input textarea"
              value={task.description ?? ""}
              placeholder="הזן תיאור (לא חובה)"
              rows={5}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">תאריך יעד</span>
            <input className="input" type="date" value={task.dueDate ?? ""} readOnly />
          </label>
        </div>
      )}
    </section>
  );
});

export default TaskDetails;
