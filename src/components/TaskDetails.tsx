import { forwardRef, useId, useRef, useState, type FormEvent } from "react";
import type { Task } from "../../shared/types";
import { localToday } from "../../shared/validation";
import { updateTask } from "../api/tasksClient";
import DeleteTaskModal from "./DeleteTaskModal";
import TaskFormFields, { validateDraft, type FieldErrors, type TaskDraft } from "./TaskFormFields";

type Handlers = {
  /** A save succeeded; the task holds the saved values. */
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
  /** The server answered 404: another visitor already deleted the task. */
  onGone: (id: string) => void;
};

type Props = Handlers & {
  task: Task | null;
  /** Message shown above the empty state, e.g. after the selected task turned out to be deleted. */
  notice: string | null;
};

function toDraft(task: Task): TaskDraft {
  return { title: task.title ?? "", description: task.description ?? "", dueDate: task.dueDate ?? "" };
}

const TaskDetails = forwardRef<HTMLElement, Props>(function TaskDetails({ task, notice, ...handlers }, ref) {
  return (
    <section
      ref={ref}
      className="card task-details-card"
      aria-labelledby="task-details-title"
      data-testid="task-details"
    >
      <h2 id="task-details-title" className="card-title" tabIndex={-1}>
        פרטי משימה
      </h2>

      {task === null ? (
        <>
          {notice && (
            <p className="error-box details-notice" role="alert">
              {notice}
            </p>
          )}
          <p className="details-empty">בחר משימה מהרשימה כדי לצפות בפרטיה</p>
        </>
      ) : (
        // Keyed by task, so choosing another task starts a fresh draft and drops unsaved changes.
        <TaskEditor key={task.id} task={task} {...handlers} />
      )}
    </section>
  );
});

export default TaskDetails;

/**
 * Inline editing of the selected task. The draft lives only in memory and is set once from the
 * task; later changes to the task object (e.g. its status) do not reset or save it.
 */
function TaskEditor({ task, onSaved, onDeleted, onGone }: Handlers & { task: Task }) {
  const [today] = useState(() => localToday());
  const [draft, setDraft] = useState(() => toDraft(task));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const id = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    // An unchanged saved date may already be in the past (FR-02).
    const { value, errors: found } = validateDraft(draft, {
      today,
      storedDueDate: task.dueDate,
      dueDateInput: dueDateRef.current,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    savingRef.current = true;
    setSaving(true);
    const result = await updateTask(task.id, value);
    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      setDraft(toDraft(result.task));
      onSaved(result.task);
    } else if (result.notFound) {
      onGone(task.id);
    } else if (result.field) {
      setErrors({ [result.field]: result.message });
    } else {
      setFormError(result.message);
    }
  }

  function closeDeleteModal() {
    setConfirmingDelete(false);
    deleteButtonRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <form className="details-form" onSubmit={handleSubmit} noValidate>
        <TaskFormFields
          idPrefix={id}
          draft={draft}
          onChange={setDraft}
          errors={errors}
          today={today}
          descriptionRows={5}
          dueDateRef={dueDateRef}
        />

        {formError && (
          <p className="error-box form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="details-actions">
          <button type="submit" className="button button-primary" disabled={saving}>
            שמור שינויים
          </button>
          <button
            ref={deleteButtonRef}
            type="button"
            className="button button-danger"
            disabled={saving}
            onClick={() => setConfirmingDelete(true)}
          >
            מחק משימה
          </button>
        </div>
      </form>

      {confirmingDelete && (
        <DeleteTaskModal taskId={task.id} onCancel={closeDeleteModal} onDeleted={onDeleted} onGone={onGone} />
      )}
    </>
  );
}
