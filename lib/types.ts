export type Priority = "required" | "optional";

export interface RoutineRevision {
  id: string;
  routineId: string;
  content: string;
  priority: Priority;
  daysOfWeek: number[];
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Routine {
  id: string;
  content: string;
  priority: Priority;
  daysOfWeek: number[];
  startDate: string;
  endDate?: string;
  isActive: boolean;
  revisions: RoutineRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineLog {
  id: string;
  routineId: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export type RoutineLogs = Record<string, RoutineLog>;

export interface RoutineWithStatus {
  routine: Routine;
  completed: boolean;
}

export interface DailyRoutines {
  required: RoutineWithStatus[];
  optional: RoutineWithStatus[];
}

export type CalendarStatus = "complete" | "partial" | "empty" | "none";
