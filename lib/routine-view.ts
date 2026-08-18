import { getDayOfWeek } from "@/lib/date";
import type { DailyRoutines, Routine, RoutineLogs, RoutineWithStatus } from "@/lib/types";

export function revisionForDate(routine: Routine, date: string) {
  return [...routine.revisions]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .find((revision) => date >= revision.startDate && (!revision.endDate || date <= revision.endDate));
}

export function getDailyRoutinesForDate(routines: Routine[], logs: RoutineLogs, date: string): DailyRoutines {
  const dayOfWeek = getDayOfWeek(date);
  const scheduled = routines.flatMap((routine): RoutineWithStatus[] => {
    const revision = revisionForDate(routine, date);
    if (!revision || !revision.isActive || !revision.daysOfWeek.includes(dayOfWeek)) return [];
    const routineForDate: Routine = {
      ...routine,
      content: revision.content,
      priority: revision.priority,
      daysOfWeek: revision.daysOfWeek,
      startDate: revision.startDate,
      endDate: revision.endDate,
      isActive: revision.isActive,
    };
    return [{ routine: routineForDate, completed: Boolean(logs[`${routine.id}__${date}`]) }];
  });
  return {
    required: scheduled.filter(({ routine }) => routine.priority === "required"),
    optional: scheduled.filter(({ routine }) => routine.priority === "optional"),
  };
}
