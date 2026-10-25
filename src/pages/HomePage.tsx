import { useEffect, useRef, useState } from "react";
import { fetchTasks } from "../api/tasksClient";
import TaskDetails from "../components/TaskDetails";
import TaskList, { type LoadState } from "../components/TaskList";

const MOBILE_QUERY = "(max-width: 767px)";

export default function HomePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const scrollPending = useRef(false);

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
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    if (window.matchMedia?.(MOBILE_QUERY).matches) {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

  function handleSelect(id: string) {
    scrollPending.current = true;
    setSelectedId(id);
  }

  const selectedTask =
    state.status === "ready" ? (state.tasks.find((task) => task.id === selectedId) ?? null) : null;

  return (
    <>
      <div className="page-heading">
        <h1>רשימת המשימות</h1>
      </div>
      <div className="workspace">
        <TaskList state={state} selectedId={selectedId} onSelect={handleSelect} />
        <TaskDetails ref={detailsRef} task={selectedTask} />
      </div>
    </>
  );
}
