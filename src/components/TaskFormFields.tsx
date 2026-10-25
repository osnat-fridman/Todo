import type { Ref, RefObject } from "react";
import {
  MESSAGES,
  validateTaskInput,
  type FieldError,
  type TaskField,
  type TaskInput,
} from "../../shared/validation";

export type TaskDraft = { title: string; description: string; dueDate: string };
export type FieldErrors = Partial<Record<TaskField, string>>;

export function toFieldErrors(errors: FieldError[]): FieldErrors {
  const result: FieldErrors = {};
  for (const { field, message } of errors) result[field] ??= message;
  return result;
}

/**
 * Validates a draft the way the server will. Returns the normalized value, or the errors to show.
 * storedDueDate exempts an unchanged saved date from the "not in the past" rule (editing only).
 */
export function validateDraft(
  draft: TaskDraft,
  options: { today: string; storedDueDate?: string | null; dueDateInput: HTMLInputElement | null },
): { value: TaskInput; errors: FieldErrors } {
  const { value, errors } = validateTaskInput(draft, options);
  // A partly typed date reads as "" but is not a cleared field.
  if (options.dueDateInput?.validity.badInput) {
    errors.push({ field: "dueDate", message: MESSAGES.dueDateInvalid });
  }
  return { value, errors: toFieldErrors(errors) };
}

type Props = {
  idPrefix: string;
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  errors: FieldErrors;
  today: string;
  descriptionRows: number;
  titleRef?: Ref<HTMLInputElement>;
  dueDateRef: RefObject<HTMLInputElement | null>;
};

// Title, description and due date with their messages; shared by the create modal and the details area.
export default function TaskFormFields({
  idPrefix,
  draft,
  onChange,
  errors,
  today,
  descriptionRows,
  titleRef,
  dueDateRef,
}: Props) {
  // The "title or description" message sits under the title but marks both fields.
  const bothMissing = errors.title === MESSAGES.titleOrDescription;
  // Error text sits outside the <label> so it does not become part of the field's name.
  const fieldProps = (field: TaskField, invalid = Boolean(errors[field])) => ({
    id: `${idPrefix}-${field}`,
    "aria-invalid": invalid,
    "aria-describedby": errors[field]
      ? `${idPrefix}-${field}-error`
      : field === "description" && bothMissing
        ? `${idPrefix}-title-error`
        : undefined,
    className: `input${field === "description" ? " textarea" : ""}${invalid ? " is-invalid" : ""}`,
  });
  const errorText = (field: TaskField) =>
    errors[field] && (
      <span id={`${idPrefix}-${field}-error`} className="field-error">
        {errors[field]}
      </span>
    );

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-title`} className="field-label">
          כותרת
        </label>
        <input
          ref={titleRef}
          type="text"
          value={draft.title}
          placeholder="הזן כותרת (לא חובה)"
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          {...fieldProps("title")}
        />
        {errorText("title")}
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-description`} className="field-label">
          תיאור
        </label>
        <textarea
          value={draft.description}
          placeholder="הזן תיאור (לא חובה)"
          rows={descriptionRows}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          {...fieldProps("description", Boolean(errors.description) || bothMissing)}
        />
        {errorText("description")}
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-dueDate`} className="field-label">
          תאריך יעד
        </label>
        <input
          ref={dueDateRef}
          type="date"
          value={draft.dueDate}
          min={today}
          onChange={(e) => onChange({ ...draft, dueDate: e.target.value })}
          {...fieldProps("dueDate")}
        />
        {errorText("dueDate")}
      </div>
    </>
  );
}
