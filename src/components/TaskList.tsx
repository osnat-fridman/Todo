import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task } from "../../shared/types";
import { taskLabel } from "../lib/taskLabel";
import { isOverdue } from "../lib/taskOrder";
import TaskRow from "./TaskRow";

export type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tasks: Task[] };

/** A message shown at the top of the list, e.g. after a failed status change or reorder. */
export type ListNotice = { message: string; canRefresh?: boolean };

type Props = {
  /** Tasks already in display order (PRD FR-11). */
  state: LoadState;
  /** Today as YYYY-MM-DD in Israel time, to mark overdue tasks. */
  today: string;
  selectedId: string | null;
  notice: ListNotice | null;
  pendingStatusIds: ReadonlySet<string>;
  /** True while a reorder is being saved; another drag waits until it finishes (ADR-9). */
  ordering: boolean;
  refreshing: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRefresh: () => void;
};

const screenReaderInstructions = {
  draggable:
    "כדי להזיז משימה, לחץ על רווח או Enter. השתמש בחיצים למעלה ולמטה כדי לבחור מיקום, ולחץ שוב על רווח או Enter כדי להניח אותה. Escape מבטל. אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד.",
};

function hebrewAnnouncements(tasks: Task[]): Announcements {
  const position = (id: UniqueIdentifier) => tasks.findIndex((task) => task.id === id) + 1;
  const label = (id: UniqueIdentifier) => {
    const task = tasks.find((t) => t.id === id);
    return task ? taskLabel(task) : "";
  };
  return {
    onDragStart: ({ active }) => `הרמת את המשימה ${label(active.id)}, במיקום ${position(active.id)} מתוך ${tasks.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `המשימה ${label(active.id)} מעל מיקום ${position(over.id)} מתוך ${tasks.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `המשימה ${label(active.id)} הונחה במיקום ${position(over.id)} מתוך ${tasks.length}.` : undefined,
    onDragCancel: ({ active }) => `הגרירה בוטלה. המשימה ${label(active.id)} חזרה למקומה.`,
  };
}

export default function TaskList({
  state,
  today,
  selectedId,
  notice,
  pendingStatusIds,
  ordering,
  refreshing,
  onSelect,
  onToggle,
  onReorder,
  onRefresh,
}: Props) {
  const sensors = useSensors(
    // A small movement starts a drag, so a tap on the handle does nothing (ADR-17).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  return (
    <section className="card task-list-card" aria-labelledby="task-list-title">
      <h2 id="task-list-title" className="card-title">
        רשימת משימות
      </h2>

      {notice && (
        <div className="error-box list-notice" role="alert">
          <p>{notice.message}</p>
          {notice.canRefresh && (
            <button type="button" className="button button-secondary" disabled={refreshing} onClick={onRefresh}>
              רענן את הרשימה
            </button>
          )}
        </div>
      )}

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: hebrewAnnouncements(state.tasks), screenReaderInstructions }}
        >
          <SortableContext items={state.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            <ul className="task-list">
              {state.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedId}
                  overdue={isOverdue(task, today)}
                  statusPending={pendingStatusIds.has(task.id)}
                  dragDisabled={ordering}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
