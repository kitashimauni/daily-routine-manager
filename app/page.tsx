"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { addDays, formatDateLong, getTodayDate, isFutureDate, isValidDateKey } from "@/lib/date";
import { useRoutines } from "@/lib/routine-context";
import type { RoutineWithStatus } from "@/lib/types";

function RoutineGroup({
  title,
  items,
  optional = false,
  readOnly,
  pendingRoutineId,
  onToggle,
}: {
  title: string;
  items: RoutineWithStatus[];
  optional?: boolean;
  readOnly: boolean;
  pendingRoutineId: string | null;
  onToggle: (id: string) => void;
}) {
  const completed = items.filter((item) => item.completed).length;
  return (
    <section className={`card routine-section ${optional ? "optional" : ""}`}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="section-count">{completed} / {items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="routine-empty">この日の予定はありません。</p>
      ) : (
        items.map(({ routine, completed: done }) => (
          <div className={`routine-row ${done ? "done" : ""}`} key={routine.id}>
            <button
              className={`routine-check ${done ? "checked" : ""}`}
              type="button"
              disabled={readOnly || pendingRoutineId === routine.id}
              aria-busy={pendingRoutineId === routine.id}
              aria-label={`${routine.content}を${done ? "未完了に戻す" : "完了にする"}`}
              onClick={() => onToggle(routine.id)}
            >
              {done && <Icon name="check" size={15} strokeWidth={2.4} />}
            </button>
            <span className="routine-content">{routine.content}</span>
          </div>
        ))
      )}
      {items.length > 0 && readOnly && (
        <p className="routine-empty" style={{ paddingBottom: 10 }}>未来の日付は閲覧のみです。</p>
      )}
    </section>
  );
}

function EmptyRoutineState() {
  return (
    <section className="card empty-state-card">
      <div className="empty-state-mark" aria-hidden="true"><Icon name="plus" size={20} /></div>
      <p className="eyebrow">Start small</p>
      <h2>まだルーティーンがありません</h2>
      <p>毎日続けたいことを登録してみましょう。</p>
      <Link href="/routines" className="btn btn-primary"><Icon name="plus" size={16} /> 最初のルーティーンを追加</Link>
    </section>
  );
}

export default function TodayPage() {
  const { hydrated, getDailyRoutines, toggleRoutine } = useRoutines();
  const [date, setDate] = useState("");
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null);

  useEffect(() => {
    const queryDate = new URLSearchParams(window.location.search).get("date");
    const todayDate = getTodayDate();
    const nextDate = queryDate && isValidDateKey(queryDate) ? queryDate : todayDate;
    setDate(nextDate);
    if (queryDate !== nextDate) window.history.replaceState(null, "", nextDate === todayDate ? "/" : `/?date=${nextDate}`);
  }, []);

  const daily = useMemo(() => (date ? getDailyRoutines(date) : { required: [], optional: [] }), [date, getDailyRoutines]);
  const requiredDone = daily.required.filter((item) => item.completed).length;
  const optionalDone = daily.optional.filter((item) => item.completed).length;
  const total = daily.required.length + daily.optional.length;
  const completed = requiredDone + optionalDone;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const today = date === getTodayDate();
  const readOnly = date ? isFutureDate(date) : false;

  const moveDate = (amount: number) => {
    const nextDate = addDays(date, amount);
    setDate(nextDate);
    window.history.replaceState(null, "", `/?date=${nextDate}`);
  };

  const handleToggle = async (routineId: string) => {
    if (pendingRoutineId) return;
    setPendingRoutineId(routineId);
    try {
      await toggleRoutine(routineId, date);
    } finally {
      setPendingRoutineId(null);
    }
  };

  if (!hydrated || !date) {
    return <div className="page-wrap"><div className="skeleton" /></div>;
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Daily practice</p>
          <h1>今日のルーティーン</h1>
          <p>小さな一歩を、今日もひとつずつ。</p>
        </div>
        <div className="heading-actions">
          <Link href="/routines" className="btn btn-primary"><Icon name="plus" size={16} /> ルーティーンを追加</Link>
        </div>
      </div>

      <div className="date-toolbar">
        <div className="date-nav">
          <button className="icon-btn" type="button" aria-label="前の日" onClick={() => moveDate(-1)}><Icon name="chevron-left" /></button>
          <h2 className="date-title">{formatDateLong(date)}</h2>
          {today && <span className="today-chip">TODAY</span>}
          <button className="icon-btn" type="button" aria-label="次の日" onClick={() => moveDate(1)}><Icon name="chevron-right" /></button>
        </div>
        {readOnly ? <span className="read-only-note"><Icon name="lock" size={13} /> 未来の日付は閲覧のみ</span> : !today ? <button className="btn btn-ghost" type="button" onClick={() => { setDate(getTodayDate()); window.history.replaceState(null, "", "/"); }}>今日に戻る</button> : null}
      </div>

      <section className="overview-card card">
        <div>
          <p className="overview-kicker">{today ? "TODAY'S PROGRESS" : "SELECTED DAY"}</p>
          <h2>{requiredDone} <span>/ {daily.required.length} 必ずやる</span></h2>
          <p className="overview-copy">{requiredDone === daily.required.length && daily.required.length > 0 ? "必須のルーティーンを達成しました。" : "できることから、ひとつずつ進めていきましょう。"}</p>
        </div>
        <div className="overview-progress">
          <span className="progress-amount">{progress}<small>%</small></span>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <span className="progress-label">今日の全体進捗　{completed} / {total}</span>
        </div>
      </section>

      {today && total === 0 ? <EmptyRoutineState /> : <div className="routine-columns">
        <RoutineGroup title="必ずやる" items={daily.required} readOnly={readOnly} pendingRoutineId={pendingRoutineId} onToggle={(id) => { void handleToggle(id); }} />
        <RoutineGroup title="できればやる" items={daily.optional} optional readOnly={readOnly} pendingRoutineId={pendingRoutineId} onToggle={(id) => { void handleToggle(id); }} />
      </div>}
    </div>
  );
}
