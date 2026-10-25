import type { Task } from "../../shared/types";
import { taskLabel } from "../lib/taskLabel";
import { DragHandleIcon } from "./icons";

type Props = {
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
};

export default function TaskRow({ task, selected, onSelect }: Props) {
  const label = taskLabel(task);
  const classes = ["task-row", selected && "is-selected", task.completed && "is-completed"]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes} data-testid="task-row" data-task-id={task.id}>
      <button
        type="button"
        className="task-row-select"
        aria-pressed={selected}
        onClick={() => onSelect(task.id)}
      >
        <span className="task-row-text">{label}</span>
      </button>
      {/* Status changes arrive in Milestone 5; for now the checkbox only reflects the saved status. */}
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.completed}
        disabled
        readOnly
        aria-label={task.completed ? `הושלמה: ${label}` : `לביצוע: ${label}`}
      />
      {/* Drag & drop arrives in Milestone 5; the handle is decorative for now. */}
      <span className="drag-handle" aria-hidden="true">
        <DragHandleIcon />
      </span>
    </li>
  );
}
