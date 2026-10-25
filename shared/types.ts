// Task as returned by the API. Shared by the browser and the server.
export type Task = {
  id: string;
  title: string | null;
  description: string | null;
  /** Calendar date as YYYY-MM-DD, or null when there is no due date. */
  dueDate: string | null;
  completed: boolean;
  position: number;
};

export type ApiError = {
  error: { code: string; message: string; field?: string };
};
