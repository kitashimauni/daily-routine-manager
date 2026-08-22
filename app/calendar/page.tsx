"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { addMonths, daysInMonth, formatDateLong, formatMonth, getDayOfWeek, getTodayDate, monthStart, parseDateKey, toDateKey, WEEKDAYS } from "@/lib/date";
import { routineForDate } from "@/lib/routine-view";
import { useRoutines } from "@/lib/routine-context";
import type { CalendarStatus, Routine, RoutineLogs } from "@/lib/types";

function statusFor(required: { completed: boolean }[]): CalendarStatus {
  if (required.length === 0) return "none";
  const completed = required.filter((item) => item.completed).length;
  if (completed === required.length) return "complete";
  if (completed > 0) return "partial";
  return "empty";
}

type RoutineCalendarStatus = "complete" | "scheduled" | "none";

function routineStatusFor(routine: Routine, date: string, logs: RoutineLogs): RoutineCalendarStatus {
  if (!routineForDate(routine, date)) return "none";
  return logs[`${routine.id}__${date}`] ? "complete" : "scheduled";
}

export default function CalendarPage() {
  const { appTimeZone, hydrated, getDailyRoutines, logs, routines } = useRoutines();
  const today = getTodayDate(appTimeZone);
  const [month, setMonth] = useState(monthStart(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  useEffect(() => {
    setMonth(monthStart(today));
    setSelectedDate(today);
  }, [appTimeZone, today]);

  useEffect(() => {
    if (!hydrated) return;
    const queryRoutineId = new URLSearchParams(window.location.search).get("routine");
    const nextRoutineId = queryRoutineId && routines.some((routine) => routine.id === queryRoutineId) ? queryRoutineId : null;
    setSelectedRoutineId(nextRoutineId);
    const nextSearch = nextRoutineId ? `?routine=${encodeURIComponent(nextRoutineId)}` : "";
    if (window.location.search !== nextSearch) window.history.replaceState(null, "", `/calendar${nextSearch}`);
  }, [hydrated, routines]);

  const selectedRoutine = selectedRoutineId ? routines.find((routine) => routine.id === selectedRoutineId) ?? null : null;

  const selectRoutine = (routineId: string) => {
    const nextRoutineId = routineId || null;
    setSelectedRoutineId(nextRoutineId);
    const nextSearch = nextRoutineId ? `?routine=${encodeURIComponent(nextRoutineId)}` : "";
    window.history.replaceState(null, "", `/calendar${nextSearch}`);
  };

  const moveMonth = (amount: number) => {
    const nextMonth = addMonths(month, amount);
    const selectedDay = parseDateKey(selectedDate).getDate();
    const nextDate = parseDateKey(nextMonth);
    const nextSelectedDate = nextMonth.slice(0, 7) === today.slice(0, 7)
      ? today
      : toDateKey(new Date(nextDate.getFullYear(), nextDate.getMonth(), Math.min(selectedDay, daysInMonth(nextMonth))));
    setMonth(nextMonth);
    setSelectedDate(nextSelectedDate);
  };

  const cells = useMemo(() => {
    const count = daysInMonth(month);
    const offset = getDayOfWeek(month);
    return Array.from({ length: offset + count }, (_, index) => {
      if (index < offset) return null;
      const day = index - offset + 1;
      const date = toDateKey(new Date(parseDateKey(month).getFullYear(), parseDateKey(month).getMonth(), day));
      const daily = getDailyRoutines(date);
      const status = selectedRoutine ? routineStatusFor(selectedRoutine, date, logs) : statusFor(daily.required);
      return { day, date, status };
    });
  }, [getDailyRoutines, logs, month, selectedRoutine]);

  if (!hydrated) return <div className="page-wrap"><div className="skeleton" /></div>;
  const selected = getDailyRoutines(selectedDate);
  const selectedRequiredDone = selected.required.filter((item) => item.completed).length;
  const selectedOptionalDone = selected.optional.filter((item) => item.completed).length;
  const selectedRoutineDate = selectedRoutine ? routineForDate(selectedRoutine, selectedDate) : null;
  const selectedRoutineStatus = selectedRoutine ? routineStatusFor(selectedRoutine, selectedDate, logs) : null;
  const selectedRoutineStatusLabel = selectedRoutineStatus === "complete"
    ? "完了済み"
    : selectedRoutineStatus === "scheduled"
      ? "予定あり・未完了"
      : "その日は予定なし";

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">History</p>
          <h1>カレンダー</h1>
          <p>過去の積み重ねを、静かに振り返る。</p>
        </div>
      </div>

      <div className="calendar-layout">
        <section className="card calendar-card">
          <div className="calendar-toolbar">
            <h2 className="month-title">{formatMonth(month)}</h2>
            <div className="calendar-toolbar-controls">
              <label className="calendar-filter" htmlFor="calendar-routine-select">
                <span>表示対象</span>
                <select id="calendar-routine-select" value={selectedRoutineId ?? ""} onChange={(event) => selectRoutine(event.target.value)}>
                  <option value="">全体</option>
                  {routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.content}{routine.isActive ? "" : "（無効化中）"}</option>)}
                </select>
              </label>
              <div className="month-controls">
                <button className="icon-btn" type="button" aria-label="前の月" onClick={() => moveMonth(-1)}><Icon name="chevron-left" size={17} /></button>
                <button className="icon-btn" type="button" aria-label="次の月" onClick={() => moveMonth(1)}><Icon name="chevron-right" size={17} /></button>
              </div>
            </div>
          </div>
          <div className="weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {cells.map((cell, index) => {
              if (!cell) return <span key={`blank-${index}`} className="calendar-cell muted" />;
              return (
                <button key={cell.date} type="button" className={`calendar-cell ${selectedDate === cell.date ? "selected" : ""} ${cell.date === today ? "today" : ""}`} onClick={() => setSelectedDate(cell.date)}>
                  <span className="day-number">{cell.day}</span>
                  {selectedRoutine ? <span className={`day-dot ${cell.status}`} /> : cell.status !== "none" && <span className={`day-dot ${cell.status}`} />}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            {selectedRoutine ? <>
              <span className="legend-item"><i className="legend-dot complete" /> 完了</span>
              <span className="legend-item"><i className="legend-dot scheduled" /> 予定あり・未完了</span>
              <span className="legend-item"><i className="legend-dot none" /> 予定なし</span>
            </> : <>
              <span className="legend-item"><i className="legend-dot complete" /> 必須達成</span>
              <span className="legend-item"><i className="legend-dot partial" /> 一部達成</span>
              <span className="legend-item"><i className="legend-dot" /> 未完了</span>
            </>}
          </div>
        </section>

        <aside className="card selected-day-card">
          <p className="eyebrow">Selected day</p>
          <h3>{formatDateLong(selectedDate)}</h3>
          {selectedRoutine ? <>
            <p className="selected-routine-name">{selectedRoutineDate?.content ?? selectedRoutine.content}</p>
            <p>{selectedRoutineStatusLabel}</p>
            <div className="selected-stat"><span>実施状況</span><strong>{selectedRoutineStatusLabel}</strong></div>
          </> : <>
            <p>必須ルーティーンを基準にした達成状況</p>
            <div className="selected-stat"><span>必ずやる</span><strong>{selectedRequiredDone} / {selected.required.length}</strong></div>
            <div className="selected-stat"><span>できればやる</span><strong>{selectedOptionalDone} / {selected.optional.length}</strong></div>
          </>}
          <Link className="btn btn-secondary" href={`/?date=${selectedDate}`}>この日の記録を見る <Icon name="arrow-up-right" size={15} /></Link>
        </aside>
      </div>
    </div>
  );
}
