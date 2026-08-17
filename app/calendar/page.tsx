"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { addMonths, addDays, daysInMonth, formatDateLong, formatMonth, getDayOfWeek, getTodayDate, monthStart, parseDateKey, toDateKey, WEEKDAYS } from "@/lib/date";
import { useRoutines } from "@/lib/routine-context";
import type { CalendarStatus } from "@/lib/types";

function statusFor(required: { completed: boolean }[]): CalendarStatus {
  if (required.length === 0) return "none";
  const completed = required.filter((item) => item.completed).length;
  if (completed === required.length) return "complete";
  if (completed > 0) return "partial";
  return "empty";
}

export default function CalendarPage() {
  const { hydrated, getDailyRoutines } = useRoutines();
  const today = getTodayDate();
  const [month, setMonth] = useState(monthStart(today));
  const [selectedDate, setSelectedDate] = useState(today);

  const cells = useMemo(() => {
    const count = daysInMonth(month);
    const offset = getDayOfWeek(month);
    return Array.from({ length: offset + count }, (_, index) => {
      if (index < offset) return null;
      const day = index - offset + 1;
      const date = toDateKey(new Date(parseDateKey(month).getFullYear(), parseDateKey(month).getMonth(), day));
      return { day, date };
    });
  }, [month]);

  if (!hydrated) return <div className="page-wrap"><div className="skeleton" /></div>;
  const selected = getDailyRoutines(selectedDate);
  const selectedRequiredDone = selected.required.filter((item) => item.completed).length;
  const selectedOptionalDone = selected.optional.filter((item) => item.completed).length;

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
            <div className="month-controls">
              <button className="icon-btn" type="button" aria-label="前の月" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevron-left" size={17} /></button>
              <button className="icon-btn" type="button" aria-label="次の月" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevron-right" size={17} /></button>
            </div>
          </div>
          <div className="weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {cells.map((cell, index) => {
              if (!cell) return <span key={`blank-${index}`} className="calendar-cell muted" />;
              const daily = getDailyRoutines(cell.date);
              const status = statusFor(daily.required);
              return (
                <button key={cell.date} type="button" className={`calendar-cell ${selectedDate === cell.date ? "selected" : ""} ${cell.date === today ? "today" : ""}`} onClick={() => setSelectedDate(cell.date)}>
                  <span className="day-number">{cell.day}</span>
                  {status !== "none" && <span className={`day-dot ${status}`} />}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span className="legend-item"><i className="legend-dot complete" /> 必須達成</span>
            <span className="legend-item"><i className="legend-dot partial" /> 一部達成</span>
            <span className="legend-item"><i className="legend-dot" /> 未完了</span>
          </div>
        </section>

        <aside className="card selected-day-card">
          <p className="eyebrow">Selected day</p>
          <h3>{formatDateLong(selectedDate)}</h3>
          <p>必須ルーティーンを基準にした達成状況</p>
          <div className="selected-stat"><span>必ずやる</span><strong>{selectedRequiredDone} / {selected.required.length}</strong></div>
          <div className="selected-stat"><span>できればやる</span><strong>{selectedOptionalDone} / {selected.optional.length}</strong></div>
          <Link className="btn btn-secondary" href={`/?date=${selectedDate}`}>この日の記録を見る <Icon name="arrow-up-right" size={15} /></Link>
        </aside>
      </div>
    </div>
  );
}
