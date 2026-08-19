import { getDayOfWeek } from "@/lib/date";
import type { DailyRoutines, Routine, RoutineLogs, RoutineWithStatus } from "@/lib/types";

export function revisionForDate(routine: Routine, date: string) {
  return [...routine.revisions]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .find((revision) => date >= revision.startDate && (!revision.endDate || date <= revision.endDate));
}

export function routineForDate(routine: Routine, date: string): Routine | null {
  const revision = revisionForDate(routine, date);
  if (!revision || !revision.isActive || !revision.daysOfWeek.includes(getDayOfWeek(date))) return null;
  return {
    ...routine,
    content: revision.content,
    priority: revision.priority,
    daysOfWeek: revision.daysOfWeek,
    startDate: revision.startDate,
    endDate: revision.endDate,
    isActive: revision.isActive,
  };
}

export function getDailyRoutinesForDate(routines: Routine[], logs: RoutineLogs, date: string): DailyRoutines {
  const scheduled = routines.flatMap((routine): RoutineWithStatus[] => {
    const scheduledRoutine = routineForDate(routine, date);
    if (!scheduledRoutine) return [];
    return [{ routine: scheduledRoutine, completed: Boolean(logs[`${routine.id}__${date}`]) }];
  });
  return {
    required: scheduled.filter(({ routine }) => routine.priority === "required"),
    optional: scheduled.filter(({ routine }) => routine.priority === "optional"),
  };
}
