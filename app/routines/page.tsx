"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { formatShortDate, getTodayDate, WEEKDAYS } from "@/lib/date";
import { useRoutines } from "@/lib/routine-context";
import type { Priority, Routine } from "@/lib/types";

interface RoutineFormProps {
  routine?: Routine;
  onSubmit: (input: { content: string; priority: Priority; daysOfWeek: number[]; startDate: string; endDate?: string; isActive: boolean }) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

function RoutineForm({ routine, onSubmit, onCancel, submitLabel = "追加する" }: RoutineFormProps) {
  const [content, setContent] = useState(routine?.content ?? "");
  const [priority, setPriority] = useState<Priority>(routine?.priority ?? "required");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(routine?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(routine?.startDate ?? getTodayDate());
  const [endDate, setEndDate] = useState(routine?.endDate ?? "");
  const [isActive, setIsActive] = useState(routine?.isActive ?? true);

  const toggleDay = (day: number) => setDaysOfWeek((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort());
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim() || daysOfWeek.length === 0 || !startDate) return;
    onSubmit({ content: content.trim(), priority, daysOfWeek, startDate, endDate: endDate || undefined, isActive });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="routine-content">内容</label>
        <input id="routine-content" className="text-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="例：本を読む" autoFocus={Boolean(routine)} />
      </div>
      <div className="field">
        <label>優先度</label>
        <div className="priority-switch">
          <button type="button" className={`priority-option ${priority === "required" ? "selected" : ""}`} onClick={() => setPriority("required")}>必ずやる</button>
          <button type="button" className={`priority-option ${priority === "optional" ? "selected" : ""}`} onClick={() => setPriority("optional")}>できればやる</button>
        </div>
      </div>
      <div className="field">
        <label>実施曜日</label>
        <div className="days-picker">
          {WEEKDAYS.map((day, index) => <button key={day} type="button" className={`day-option ${daysOfWeek.includes(index) ? "selected" : ""}`} onClick={() => toggleDay(index)}>{day}</button>)}
        </div>
        {daysOfWeek.length === 0 && <p className="field-hint">少なくとも1つ曜日を選んでください。</p>}
      </div>
      <div className="field">
        <label>期間</label>
        <div className="date-fields">
          <input aria-label="開始日" className="date-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input aria-label="終了日（任意）" className="date-input" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <p className="field-hint">開始日　　終了日（任意）</p>
      </div>
      {routine && <label className="field" style={{ alignItems: "center", display: "flex", gap: 8 }}><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> 有効なルーティーンとして扱う</label>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>キャンセル</button>}
        <button type="submit" className="btn btn-primary" disabled={!content.trim() || daysOfWeek.length === 0}>{submitLabel}</button>
      </div>
    </form>
  );
}

function dayText(days: number[]) {
  return days.length === 7 ? "毎日" : days.map((day) => WEEKDAYS[day]).join("・");
}

function ManagedRoutine({ routine, onEdit, onDeactivate, onReactivate }: { routine: Routine; onEdit: () => void; onDeactivate: () => void; onReactivate: () => void }) {
  return (
    <div className="managed-row">
      <div className="managed-main">
        <div className="managed-content">{routine.content}</div>
        <div className="managed-meta"><span className={`priority-badge ${routine.priority}`}>{routine.priority === "required" ? "必ずやる" : "できればやる"}</span><span>{dayText(routine.daysOfWeek)}</span><span>開始 {formatShortDate(routine.startDate)}</span></div>
      </div>
      <div className="managed-actions">
        {routine.isActive ? <><button className="text-btn" type="button" onClick={onEdit}><Icon name="edit" size={13} /> 編集</button><button className="text-btn danger" type="button" onClick={onDeactivate}><Icon name="pause" size={13} /> 無効化</button></> : <button className="text-btn" type="button" onClick={onReactivate}><Icon name="play" size={13} /> 再開</button>}
      </div>
    </div>
  );
}

export default function RoutinesPage() {
  const { hydrated, routines, addRoutine, updateRoutine, deactivateRoutine, reactivateRoutine } = useRoutines();
  const [editing, setEditing] = useState<Routine | null>(null);

  if (!hydrated) return <div className="page-wrap"><div className="skeleton" /></div>;
  const activeRequired = routines.filter((routine) => routine.isActive && routine.priority === "required");
  const activeOptional = routines.filter((routine) => routine.isActive && routine.priority === "optional");
  const inactive = routines.filter((routine) => !routine.isActive);

  const disable = (routine: Routine) => {
    if (window.confirm(`「${routine.content}」を無効化しますか？過去の記録は保持されます。`)) deactivateRoutine(routine.id);
  };

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">Your system</p><h1>ルーティーン管理</h1><p>続けたいことを、無理なく整える。</p></div>
      </div>
      <div className="management-grid">
        <section className="card form-card">
          <p className="eyebrow">New routine</p>
          <h2>新しいルーティーン</h2>
          <RoutineForm onSubmit={(input) => addRoutine(input)} />
        </section>
        <div className="routine-list">
          <section className="card management-section">
            <div className="section-head"><h2 className="section-title">必ずやる</h2><span className="section-count">{activeRequired.length}件</span></div>
            {activeRequired.length === 0 ? <p className="routine-empty">まだ登録されていません。</p> : activeRequired.map((routine) => <ManagedRoutine key={routine.id} routine={routine} onEdit={() => setEditing(routine)} onDeactivate={() => disable(routine)} onReactivate={() => reactivateRoutine(routine.id)} />)}
          </section>
          <section className="card management-section">
            <div className="section-head"><h2 className="section-title" style={{ color: "var(--blue)" }}>できればやる</h2><span className="section-count">{activeOptional.length}件</span></div>
            {activeOptional.length === 0 ? <p className="routine-empty">まだ登録されていません。</p> : activeOptional.map((routine) => <ManagedRoutine key={routine.id} routine={routine} onEdit={() => setEditing(routine)} onDeactivate={() => disable(routine)} onReactivate={() => reactivateRoutine(routine.id)} />)}
          </section>
          {inactive.length > 0 && <section className="card management-section inactive-section"><div className="section-head"><h2 className="section-title">無効化中</h2><span className="section-count">{inactive.length}件</span></div>{inactive.map((routine) => <ManagedRoutine key={routine.id} routine={routine} onEdit={() => setEditing(routine)} onDeactivate={() => disable(routine)} onReactivate={() => reactivateRoutine(routine.id)} />)}</section>}
        </div>
      </div>

      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><div className="modal card" role="dialog" aria-modal="true" aria-label="ルーティーンを編集"><div className="modal-head"><h2>ルーティーンを編集</h2><button className="icon-btn" type="button" aria-label="閉じる" onClick={() => setEditing(null)}><Icon name="x" size={17} /></button></div><RoutineForm routine={editing} submitLabel="変更を保存" onCancel={() => setEditing(null)} onSubmit={(input) => { updateRoutine(editing.id, input); setEditing(null); }} /></div></div>}
    </div>
  );
}
