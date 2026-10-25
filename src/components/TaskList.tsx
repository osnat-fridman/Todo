import type { Task } from "../../shared/types";
import TaskRow from "./TaskRow";

export type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tasks: Task[] };

type Props = {
  state: LoadState;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function TaskList({ state, selectedId, onSelect }: Props) {
  return (
    <section className="card task-list-card" aria-labelledby="task-list-title">
      <h2 id="task-list-title" className="card-title">
        רשימת משימות
      </h2>

      {state.status === "loading" && (
        <p className="list-message" role="status">
          טוען משימות...
        </p>
      )}

      {state.status === "error" && (
        <p className="list-message error-box" role="alert">
          לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב.
        </p>
      )}

      {state.status === "ready" && state.tasks.length === 0 && (
        <p className="list-message">
          אין עדיין משימות ברשימה. לחץ על "הוסף משימה" כדי להוסיף את הראשונה.
        </p>
      )}

      {state.status === "ready" && state.tasks.length > 0 && (
        <ul className="task-list">
          {state.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={task.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
