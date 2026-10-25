import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Task } from "../../shared/types";
import { localToday } from "../../shared/validation";
import { createTask } from "../api/tasksClient";
import { CloseIcon } from "./icons";
import TaskFormFields, { validateDraft, type FieldErrors, type TaskDraft } from "./TaskFormFields";
import { useModalBehavior } from "./useModalBehavior";

type Props = {
  onClose: () => void;
  onCreated: (task: Task) => void;
};

// Rendered only while open, so every opening starts from the default values.
export default function CreateTaskModal({ onClose, onCreated }: Props) {
  const [today] = useState(() => localToday());
  const [draft, setDraft] = useState<TaskDraft>({ title: "", description: "", dueDate: today });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const id = useId();

  useModalBehavior(onClose, saving);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    const { value, errors: found } = validateDraft(draft, { today, dueDateInput: dueDateRef.current });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    savingRef.current = true;
    setSaving(true);
    const result = await createTask(value);
    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      onCreated(result.task);
    } else if (result.field) {
      setErrors({ [result.field]: result.message });
    } else {
      setFormError(result.message);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-heading`}>
        <div className="modal-header">
          <h2 id={`${id}-heading`} className="modal-title">
            הוספת משימה
          </h2>
          <button type="button" className="icon-button" aria-label="סגור" onClick={onClose} disabled={saving}>
            <CloseIcon />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          <TaskFormFields
            idPrefix={id}
            draft={draft}
            onChange={setDraft}
            errors={errors}
            today={today}
            descriptionRows={4}
            titleRef={titleRef}
            dueDateRef={dueDateRef}
          />

          {formError && (
            <p className="error-box form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="modal-actions">
            <button type="submit" className="button button-primary" disabled={saving}>
              הוסף משימה
            </button>
            <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
              סגור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
