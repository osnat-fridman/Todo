import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "../../shared/types";
import { MESSAGES, TASK_LIMIT } from "../../shared/validation";
import {
  fetchTasks,
  LOAD_FAILED_MESSAGE,
  saveTaskOrder,
  setTaskCompleted,
  TASK_GONE_MESSAGE,
} from "../api/tasksClient";
import CreateTaskModal from "../components/CreateTaskModal";
import { PlusIcon } from "../components/icons";
import TaskDetails from "../components/TaskDetails";
import TaskList, { type ListNotice, type LoadState } from "../components/TaskList";
import { orderGroup, productToday, sortTasks } from "../lib/taskOrder";

const MOBILE_QUERY = "(max-width: 767px)";

export default function HomePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<ListNotice | null>(null);
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(new Set());
  const [ordering, setOrdering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  /**
   * Removes a task from the list; if it is the selected one, clears the selection (and its draft)
   * and shows the message in the details area, otherwise at the top of the list (ADR-17).
   */
  function removeTask(id: string, message: string | null) {
    updateTasks((tasks) => tasks.filter((task) => task.id !== id));
    // A ref, because a save or delete may finish after the visitor already chose another task.
    if (selectedIdRef.current !== id) {
      if (message) setListNotice({ message });
      return;
    }
    setSelectedId(null);
    setNotice(message);
    focusDetailsPending.current = true;
  }

  function setPending(id: string, pending: boolean) {
    setPendingStatusIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Shows the new status at once and saves it; on failure only this task's status goes back (ADR-9). */
  async function handleToggle(id: string, completed: boolean) {
    updateTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, completed } : task)));
    setPending(id, true);
    const result = await setTaskCompleted(id, completed);
    setPending(id, false);

    if (result.ok) {
      setListNotice(null);
    } else if (result.notFound) {
      removeTask(id, TASK_GONE_MESSAGE);
    } else {
      updateTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, completed: !completed } : task)));
      setListNotice({ message: result.message });
    }
  }

  /**
   * Shows the new order at once and saves the whole list; on failure only the order goes back (ADR-9).
   * A task can only move among tasks of its own date group (PRD FR-07, ADR-19).
   */
  async function handleReorder(activeId: string, overId: string) {
    if (state.status !== "ready" || ordering) return;
    const shownIds = displayedTasks.map((task) => task.id);
    const from = shownIds.indexOf(activeId);
    const to = shownIds.indexOf(overId);
    if (from < 0 || to < 0) return;
    if (orderGroup(displayedTasks[from], today) !== orderGroup(displayedTasks[to], today)) {
      setListNotice({ message: MESSAGES.dragOutsideDateGroup });
      return;
    }
    const orderedIds = arrayMove(shownIds, from, to);
    const previousPositions = new Map(state.tasks.map((task) => [task.id, task.position]));
    const newPositions = new Map(orderedIds.map((id, index) => [id, index]));

    updateTasks((tasks) => tasks.map((task) => ({ ...task, position: newPositions.get(task.id) ?? task.position })));
    setOrdering(true);
    const result = await saveTaskOrder(orderedIds);
    setOrdering(false);

    if (result.ok) {
      // Only positions come from the answer, so a status still being saved is not overwritten.
      const positions = new Map(result.tasks.map((task) => [task.id, task.position]));
      updateTasks((tasks) => tasks.map((task) => ({ ...task, position: positions.get(task.id) ?? task.position })));
      setListNotice(null);
    } else {
      // Back to the previous order; tasks added meanwhile keep the position the server gave them.
      updateTasks((tasks) =>
        tasks.map((task) => ({ ...task, position: previousPositions.get(task.id) ?? task.position })),
      );
      setListNotice({ message: result.message, canRefresh: "conflict" in result });
    }
  }

  /** Reloads the list without the loading state, so the selection and its draft survive if the task still exists. */
  async function handleRefresh() {
    setRefreshing(true);
    try {
      const tasks = await fetchTasks();
      setState({ status: "ready", tasks });
      setListNotice(null);
      if (selectedIdRef.current && !tasks.some((task) => task.id === selectedIdRef.current)) {
        setSelectedId(null);
      }
    } catch {
      setListNotice({ message: LOAD_FAILED_MESSAGE });
    } finally {
      setRefreshing(false);
    }
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

  // "Today" is read on every render, so a date that passed shows up with the next change or a refresh (PRD FR-11).
  const today = productToday();
  const tasks = state.status === "ready" ? state.tasks : null;
  const displayedTasks = useMemo(() => (tasks ? sortTasks(tasks, today) : []), [tasks, today]);
  const listState: LoadState = state.status === "ready" ? { status: "ready", tasks: displayedTasks } : state;

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
              setListNotice(null);
              setCreating(true);
            }}
          >
            <PlusIcon />
            הוסף משימה
          </button>
        </div>
      </div>
      <div className="workspace">
        <TaskList
          state={listState}
          today={today}
          selectedId={selectedId}
          notice={listNotice}
          pendingStatusIds={pendingStatusIds}
          ordering={ordering}
          refreshing={refreshing}
          onSelect={handleSelect}
          onToggle={handleToggle}
          onReorder={handleReorder}
          onRefresh={handleRefresh}
        />
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
