import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/types";
import { MESSAGES, TASK_LIMIT } from "../../shared/validation";
import { fetchTasks } from "../api/tasksClient";
import CreateTaskModal from "../components/CreateTaskModal";
import { PlusIcon } from "../components/icons";
import TaskDetails from "../components/TaskDetails";
import TaskList, { type LoadState } from "../components/TaskList";

const MOBILE_QUERY = "(max-width: 767px)";

export default function HomePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const detailsRef = useRef<HTMLElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // What to bring into view after the next selection: just the details (mobile), or also the new row.
  const scrollPending = useRef<"details" | "new-task" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTasks()
      .then((tasks) => {
        if (!cancelled) setState({ status: "ready", tasks });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // On mobile the details area sits below the list, so scroll to it after a selection.
  // On desktop the details stay in view (sticky), so a new task only needs its row scrolled into view.
  useEffect(() => {
    const target = scrollPending.current;
    if (!target || !selectedId) return;
    scrollPending.current = null;
    if (window.matchMedia?.(MOBILE_QUERY).matches) {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (target === "new-task") {
      document
        .querySelector(`[data-task-id="${selectedId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId, state]);

  function handleSelect(id: string) {
    scrollPending.current = "details";
    setSelectedId(id);
  }

  const closeModal = useCallback(() => {
    setCreating(false);
    addButtonRef.current?.focus({ preventScroll: true });
  }, []);

  function handleCreated(task: Task) {
    setState((current) =>
      current.status === "ready" ? { status: "ready", tasks: [...current.tasks, task] } : current,
    );
    scrollPending.current = "new-task";
    setSelectedId(task.id);
    closeModal();
  }

  const selectedTask =
    state.status === "ready" ? (state.tasks.find((task) => task.id === selectedId) ?? null) : null;
  const listFull = state.status === "ready" && state.tasks.length >= TASK_LIMIT;

  return (
    <>
      <div className="page-heading">
        <h1>רשימת המשימות</h1>
        <div className="add-task">
          {listFull && <p className="add-task-full">{MESSAGES.taskLimitReached}</p>}
          <button
            ref={addButtonRef}
            type="button"
            className="button button-primary"
            disabled={state.status !== "ready" || listFull}
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
            הוסף משימה
          </button>
        </div>
      </div>
      <div className="workspace">
        <TaskList state={state} selectedId={selectedId} onSelect={handleSelect} />
        <TaskDetails ref={detailsRef} task={selectedTask} />
      </div>
      {creating && <CreateTaskModal onClose={closeModal} onCreated={handleCreated} />}
    </>
  );
}
