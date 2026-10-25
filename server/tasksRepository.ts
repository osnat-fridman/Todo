import type pg from "pg";
import type { Task } from "../shared/types.js";
import { TASK_LIMIT, validateTaskInput, type FieldError, type TaskInput } from "../shared/validation.js";
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

/** Thrown when the task does not exist (never did, or was deleted by another visitor). */
export class TaskNotFoundError extends Error {
  constructor() {
    super("The task does not exist.");
    this.name = "TaskNotFoundError";
  }
}

/** Thrown when task details fail validation against the stored task. */
export class TaskValidationError extends Error {
  constructor(readonly errors: FieldError[]) {
    super("The task details are not valid.");
    this.name = "TaskValidationError";
  }
}

export type TasksRepository = {
  listTasks(): Promise<Task[]>;
  /** Adds a validated task at the end of the list, under the shared list lock. */
  createTask(input: TaskInput): Promise<Task>;
  /**
   * Validates and saves title/description/dueDate only (ADR-8). The row is locked so the
   * "not in the past" check compares against the value being replaced; the last save wins.
   */
  updateTaskDetails(id: string, input: TaskInput, today: string): Promise<Task>;
  /** Deletes a task and renumbers positions to 0..N-1, under the shared list lock. */
  deleteTask(id: string): Promise<void>;
};

async function inTransaction<T>(db: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createTasksRepository(db: pg.Pool): TasksRepository {
  return {
    async listTasks() {
      const { rows } = await db.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks order by position asc, id asc`,
      );
      return rows.map(toTask);
    },

    createTask({ title, description, dueDate }) {
      return inTransaction(db, async (client) => {
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
        return toTask(rows[0]);
      });
    },

    updateTaskDetails(id, input, today) {
      return inTransaction(db, async (client) => {
        const { rows: stored } = await client.query<{ due_date: string | null }>(
          "select to_char(due_date, 'YYYY-MM-DD') as due_date from public.tasks where id = $1 for update",
          [id],
        );
        if (stored.length === 0) throw new TaskNotFoundError();
        const { value, errors } = validateTaskInput(input, { today, storedDueDate: stored[0].due_date });
        if (errors.length > 0) throw new TaskValidationError(errors);
        const { rows } = await client.query<TaskRow>(
          `update public.tasks
              set title = $2, description = $3, due_date = $4::date, updated_at = now()
            where id = $1
          returning ${TASK_COLUMNS}`,
          [id, value.title, value.description, value.dueDate],
        );
        return toTask(rows[0]);
      });
    },

    deleteTask(id) {
      return inTransaction(db, async (client) => {
        await lockTaskList(client);
        const { rowCount } = await client.query("delete from public.tasks where id = $1", [id]);
        if (rowCount === 0) throw new TaskNotFoundError();
        await client.query(
          `update public.tasks t
              set position = ordered.new_position
             from (select id, (row_number() over (order by position, id) - 1)::int as new_position
                     from public.tasks) ordered
            where t.id = ordered.id and t.position <> ordered.new_position`,
        );
      });
    },
  };
}
