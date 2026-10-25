import type pg from "pg";
import type { Task } from "../shared/types.js";
import { TASK_LIMIT, type TaskInput } from "../shared/validation.js";
import { lockTaskList } from "./listLock.js";

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

/** Thrown when a task cannot be created because the list already holds TASK_LIMIT tasks. */
export class TaskLimitError extends Error {
  constructor() {
    super("The task list is full.");
    this.name = "TaskLimitError";
  }
}

export type TasksRepository = {
  listTasks(): Promise<Task[]>;
  /** Adds a validated task at the end of the list, under the shared list lock. */
  createTask(input: TaskInput): Promise<Task>;
};

export function createTasksRepository(db: pg.Pool): TasksRepository {
  return {
    async listTasks() {
      const { rows } = await db.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks order by position asc, id asc`,
      );
      return rows.map(toTask);
    },

    async createTask({ title, description, dueDate }) {
      const client = await db.connect();
      try {
        await client.query("begin");
        await lockTaskList(client);
        const { rows: countRows } = await client.query<{ count: number }>(
          "select count(*)::int as count from public.tasks",
        );
        if (countRows[0].count >= TASK_LIMIT) {
          throw new TaskLimitError();
        }
        const { rows } = await client.query<TaskRow>(
          `insert into public.tasks (title, description, due_date, position)
           select $1, $2, $3::date, coalesce(max(position) + 1, 0) from public.tasks
           returning ${TASK_COLUMNS}`,
          [title, description, dueDate],
        );
        await client.query("commit");
        return toTask(rows[0]);
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
