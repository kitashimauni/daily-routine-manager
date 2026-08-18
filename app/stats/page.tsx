"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { addDays, addMonths, formatMonth, getTodayDate, monthStart } from "@/lib/date";
import { useRoutines } from "@/lib/routine-context";
import type { Priority, Routine } from "@/lib/types";

function datesForMonth(month: string) {
  const start = monthStart(month);
  const dates: string[] = [];
  let cursor = start;
  while (cursor.startsWith(start.slice(0, 7))) { dates.push(cursor); cursor = addDays(cursor, 1); }
  return dates;
}

function ProgressSummary({ priority, planned, completed }: { priority: Priority; planned: number; completed: number }) {
  const rate = planned ? Math.round((completed / planned) * 100) : 0;
  return <section className={`card stat-summary ${priority}`}><h2>{priority === "required" ? "必ずやる" : "できればやる"}<span>この期間</span></h2><div className="stat-rate">{rate}<small>%</small></div><div className="stat-detail">{completed} / {planned}回 完了</div><div className="progress-track"><div className="progress-fill" style={{ width: `${rate}%` }} /></div></section>;
}

export default function StatsPage() {
  const { hydrated, routines, getDailyRoutines } = useRoutines();
  const today = getTodayDate();
  const [month, setMonth] = useState(monthStart(today));
  const [period, setPeriod] = useState<"month" | "30days">("month");
  const dates = useMemo(() => {
    const range = period === "month" ? datesForMonth(month) : Array.from({ length: 30 }, (_, index) => addDays(today, index - 29));
    return range.filter((date) => date <= today);
  }, [month, period, today]);

  if (!hydrated) return <div className="page-wrap"><div className="skeleton" /></div>;

  const entries = dates.flatMap((date) => {
    const daily = getDailyRoutines(date);
    return [...daily.required, ...daily.optional].map(({ routine, completed }) => ({
      routineId: routine.id,
      content: routine.content,
      priority: routine.priority,
      completed,
    }));
  });
  const rows = routines.flatMap((routine) => {
    const routineEntries = entries.filter((entry) => entry.routineId === routine.id);
    const contents = Array.from(new Set(routineEntries.map((entry) => entry.content)));
    if (contents.length === 0 && routine.isActive) contents.push(routine.content);
    return contents.map((content) => {
      const contentEntries = routineEntries.filter((entry) => entry.content === content);
      const completed = contentEntries.filter((entry) => entry.completed).length;
      const priorities = new Set(contentEntries.map((entry) => entry.priority));
      const displayPriority = priorities.size === 0
        ? routine.priority
        : priorities.size === 1
          ? Array.from(priorities)[0]
          : undefined;
      return {
        key: `${routine.id}:${content}`,
        routine,
        content,
        planned: contentEntries.length,
        completed,
        rate: contentEntries.length ? Math.round((completed / contentEntries.length) * 100) : 0,
        displayPriority,
      };
    });
  });
  const total = (group: typeof entries) => ({ planned: group.length, completed: group.filter((entry) => entry.completed).length });
  const requiredTotal = total(entries.filter((entry) => entry.priority === "required"));
  const optionalTotal = total(entries.filter((entry) => entry.priority === "optional"));

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">Your progress</p><h1>統計</h1><p>積み重ねを数字で、やさしく確認する。</p></div>
        <div className="period-switch"><button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>月間</button><button type="button" className={period === "30days" ? "active" : ""} onClick={() => setPeriod("30days")}>直近30日</button></div>
      </div>
      <div className="date-toolbar"><div className="date-nav"><button className="icon-btn" type="button" aria-label="前の月" onClick={() => setMonth(addMonths(month, -1))} disabled={period === "30days"}><Icon name="chevron-left" size={17} /></button><h2 className="date-title">{period === "month" ? formatMonth(month) : "直近30日"}</h2><button className="icon-btn" type="button" aria-label="次の月" onClick={() => setMonth(addMonths(month, 1))} disabled={period === "30days"}><Icon name="chevron-right" size={17} /></button></div></div>
      <div className="stats-hero"><ProgressSummary priority="required" planned={requiredTotal.planned} completed={requiredTotal.completed} /><ProgressSummary priority="optional" planned={optionalTotal.planned} completed={optionalTotal.completed} /></div>
      <section className="card stats-list"><h2>ルーティーン別</h2>{rows.length === 0 ? <p className="routine-empty">ルーティーンを登録すると、ここに達成率が表示されます。</p> : rows.map(({ key, content, planned, completed, rate, displayPriority }) => <div className="stats-row" key={key}><div><div className="stats-routine-name">{content}</div><div className="stats-routine-meta">{displayPriority === undefined ? "期間中に変更あり" : displayPriority === "required" ? "必ずやる" : "できればやる"} · {completed} / {planned}回</div></div><div className="stats-progress-track"><div className={`stats-progress-fill ${displayPriority === "optional" ? "optional" : ""}`} style={{ width: `${rate}%` }} /></div><div className="stats-percent">{rate}%</div></div>) }<p className="stats-note"><Icon name="check" size={13} /> 「必ずやる」の達成率を、その日の全体達成の基準にしています。曜日が対象外の日は予定回数に含めません。</p></section>
    </div>
  );
}
