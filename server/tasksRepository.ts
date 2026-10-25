import type pg from "pg";
import type { Task } from "../shared/types.js";

type TaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
};

// due_date is formatted in SQL so it never passes through a JS Date and time zones.
const TASK_COLUMNS =
  "id, title, description, to_char(due_date, 'YYYY-MM-DD') as due_date, completed, position";

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    completed: row.completed,
    position: row.position,
  };
}

export type TasksRepository = {
  listTasks(): Promise<Task[]>;
};

export function createTasksRepository(db: pg.Pool): TasksRepository {
  return {
    async listTasks() {
      const { rows } = await db.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks order by position asc, id asc`,
      );
      return rows.map(toTask);
    },
  };
}
