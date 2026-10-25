import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteTask } from "../api/tasksClient";
import { useModalBehavior } from "./useModalBehavior";

type Props = {
  taskId: string;
  onCancel: () => void;
  onDeleted: (id: string) => void;
  onGone: (id: string) => void;
};

// Confirmation before deleting (DESIGN.md 1.4). The task leaves the list only after the server confirms.
export default function DeleteTaskModal({ taskId, onCancel, onDeleted, onGone }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deletingRef = useRef(false);
  const id = useId();

  useModalBehavior(onCancel, deleting);

  // Focus starts on "cancel" so an accidental Enter does not delete.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  async function handleConfirm() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    const result = await deleteTask(taskId);
    deletingRef.current = false;
    setDeleting(false);

    if (result.ok) onDeleted(taskId);
    else if (result.notFound) onGone(taskId);
    else setError(result.message);
  }

  // Portaled to <body> so the sticky details card does not trap the overlay in its stacking context.
  return createPortal(
    <div className="modal-overlay">
      <div
        className="modal modal-small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        aria-describedby={`${id}-question`}
      >
        <div className="modal-header">
          <h2 id={`${id}-heading`} className="modal-title">
            מחיקת משימה
          </h2>
        </div>
        <div className="modal-form">
          <p id={`${id}-question`}>האם אתה בטוח שברצונך למחוק את המשימה הזו?</p>
          {error && (
            <p className="error-box form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button button-danger" onClick={handleConfirm} disabled={deleting}>
              אישור
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="button button-secondary"
              onClick={onCancel}
              disabled={deleting}
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
