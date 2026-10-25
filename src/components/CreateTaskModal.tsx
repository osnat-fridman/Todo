import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Task } from "../../shared/types";
import {
  localToday,
  MESSAGES,
  validateTaskInput,
  type FieldError,
  type TaskField,
} from "../../shared/validation";
import { createTask } from "../api/tasksClient";
import { CloseIcon } from "./icons";

type Props = {
  onClose: () => void;
  onCreated: (task: Task) => void;
};

type FieldErrors = Partial<Record<TaskField, string>>;

function toFieldErrors(errors: FieldError[]): FieldErrors {
  const result: FieldErrors = {};
  for (const { field, message } of errors) result[field] ??= message;
  return result;
}

// Rendered only while open, so every opening starts from the default values.
export default function CreateTaskModal({ onClose, onCreated }: Props) {
  const [today] = useState(() => localToday());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const id = useId();

  useEffect(() => {
    titleRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    const { value, errors: found } = validateTaskInput({ title, description, dueDate }, { today });
    // A partly typed date reads as "" but is not a cleared field.
    if (dueDateRef.current?.validity.badInput) {
      found.push({ field: "dueDate", message: MESSAGES.dueDateInvalid });
    }
    setErrors(toFieldErrors(found));
    if (found.length > 0) return;

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

  // The "title or description" message sits under the title but marks both fields.
  const bothMissing = errors.title === MESSAGES.titleOrDescription;
  // Error text sits outside the <label> so it does not become part of the field's name.
  const fieldProps = (field: TaskField, invalid = Boolean(errors[field])) => ({
    id: `${id}-${field}`,
    "aria-invalid": invalid,
    "aria-describedby": errors[field]
      ? `${id}-${field}-error`
      : field === "description" && bothMissing
        ? `${id}-title-error`
        : undefined,
    className: `input${field === "description" ? " textarea" : ""}${invalid ? " is-invalid" : ""}`,
  });
  const errorText = (field: TaskField) =>
    errors[field] && (
      <span id={`${id}-${field}-error`} className="field-error">
        {errors[field]}
      </span>
    );

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
          <div className="field">
            <label htmlFor={`${id}-title`} className="field-label">
              כותרת
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder="הזן כותרת (לא חובה)"
              onChange={(e) => setTitle(e.target.value)}
              {...fieldProps("title")}
            />
            {errorText("title")}
          </div>
          <div className="field">
            <label htmlFor={`${id}-description`} className="field-label">
              תיאור
            </label>
            <textarea
              value={description}
              placeholder="הזן תיאור (לא חובה)"
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              {...fieldProps("description", Boolean(errors.description) || bothMissing)}
            />
            {errorText("description")}
          </div>
          <div className="field">
            <label htmlFor={`${id}-dueDate`} className="field-label">
              תאריך יעד
            </label>
            <input
              ref={dueDateRef}
              type="date"
              value={dueDate}
              min={today}
              onChange={(e) => setDueDate(e.target.value)}
              {...fieldProps("dueDate")}
            />
            {errorText("dueDate")}
          </div>

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
