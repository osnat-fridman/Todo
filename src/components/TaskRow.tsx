import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../../shared/types";
import { taskLabel } from "../lib/taskLabel";
import { formatDueDate } from "../lib/taskOrder";
import { DragHandleIcon } from "./icons";

type Props = {
  task: Task;
  selected: boolean;
  /** Open and due before today: a light red row with a "באיחור" label (PRD FR-11). */
  overdue: boolean;
  /** True while this task's status is being saved; the checkbox waits for the answer (ADR-9). */
  statusPending: boolean;
  /** True while dragging is not allowed, e.g. while the previous order is still being saved. */
  dragDisabled: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
};

export default function TaskRow({ task, selected, overdue, statusPending, dragDisabled, onSelect, onToggle }: Props) {
  const label = taskLabel(task);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: dragDisabled });
  const classes = [
    "task-row",
    selected && "is-selected",
    overdue && "is-overdue",
    task.completed && "is-completed",
    isDragging && "is-dragging",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      ref={setNodeRef}
      className={classes}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="task-row"
      data-task-id={task.id}
    >
      <button
        type="button"
        className="task-row-select"
        aria-pressed={selected}
        onClick={() => onSelect(task.id)}
      >
        <span className="task-row-text">{label}</span>
        {overdue && task.dueDate && <span className="task-row-overdue">באיחור: {formatDueDate(task.dueDate)}</span>}
      </button>
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.completed}
        disabled={statusPending}
        onChange={() => onToggle(task.id, !task.completed)}
        aria-label={task.completed ? `הושלמה: ${label}` : `לביצוע: ${label}`}
      />
      {/* Dragging starts only from this handle, so it never clashes with selecting, the checkbox or page scrolling. */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`גרור כדי לשנות את מיקום המשימה: ${label}`}
        aria-roledescription="ידית גרירה"
      >
        <DragHandleIcon />
      </button>
    </li>
  );
}
