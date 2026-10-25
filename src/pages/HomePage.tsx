import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/types";
import { MESSAGES, TASK_LIMIT } from "../../shared/validation";
import { fetchTasks, TASK_GONE_MESSAGE } from "../api/tasksClient";
import CreateTaskModal from "../components/CreateTaskModal";
import { PlusIcon } from "../components/icons";
import TaskDetails from "../components/TaskDetails";
import TaskList, { type LoadState } from "../components/TaskList";

const MOBILE_QUERY = "(max-width: 767px)";

export default function HomePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // What to bring into view after the next selection: just the details (mobile), or also the new row.
  const scrollPending = useRef<"details" | "new-task" | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  // After the selected task is removed, focus moves to the details heading so it is not lost.
  const focusDetailsPending = useRef(false);

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

  useEffect(() => {
    if (selectedId !== null || !focusDetailsPending.current) return;
    focusDetailsPending.current = false;
    document.getElementById("task-details-title")?.focus({ preventScroll: true });
  }, [selectedId]);

  function handleSelect(id: string) {
    scrollPending.current = "details";
    setNotice(null);
    setSelectedId(id);
  }

  function updateTasks(change: (tasks: Task[]) => Task[]) {
    setState((current) => (current.status === "ready" ? { status: "ready", tasks: change(current.tasks) } : current));
  }

  // Only the detail fields come from the save response, so a status change is never overwritten (ADR-9).
  function handleSaved(saved: Task) {
    updateTasks((tasks) =>
      tasks.map((task) =>
        task.id === saved.id
          ? { ...task, title: saved.title, description: saved.description, dueDate: saved.dueDate }
          : task,
      ),
    );
  }

  /** Removes a task from the list; if it is the selected one, clears the selection (and its draft). */
  function removeTask(id: string, message: string | null) {
    updateTasks((tasks) => tasks.filter((task) => task.id !== id));
    // A ref, because a save or delete may finish after the visitor already chose another task.
    if (selectedIdRef.current !== id) return;
    setSelectedId(null);
    setNotice(message);
    focusDetailsPending.current = true;
  }

  const closeModal = useCallback(() => {
    setCreating(false);
    addButtonRef.current?.focus({ preventScroll: true });
  }, []);

  function handleCreated(task: Task) {
    updateTasks((tasks) => [...tasks, task]);
    setNotice(null);
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
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            <PlusIcon />
            הוסף משימה
          </button>
        </div>
      </div>
      <div className="workspace">
        <TaskList state={state} selectedId={selectedId} onSelect={handleSelect} />
        <TaskDetails
          ref={detailsRef}
          task={selectedTask}
          notice={notice}
          onSaved={handleSaved}
          onDeleted={(id) => removeTask(id, null)}
          onGone={(id) => removeTask(id, TASK_GONE_MESSAGE)}
        />
      </div>
      {creating && <CreateTaskModal onClose={closeModal} onCreated={handleCreated} />}
    </>
  );
}
