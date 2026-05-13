import { useState, useEffect, useRef } from "react";

const DAYS = ["M", "T", "W", "Th", "F", "Sa", "S"];
const FONT = "'system-ui', '-apple-system', 'Helvetica Neue', sans-serif";

const DEFAULT_TASKS = [
  "Drums", "Flute", "Writing", "Keys",
  "Bass", "Exercise", "Learn Tunes", "Booking",
  "Shows", "Setlist"
];

function getWeekKey() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function formatWeekLabel(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; }
    catch { return init; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

const btnBase = {
  fontSize: 14,
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontWeight: 500,
  whiteSpace: "nowrap",
};
const btnPrimary = { ...btnBase, background: "#000", color: "#fff" };
const btnGhost = { ...btnBase, background: "transparent", color: "#666", border: "1px solid #e0e0e0" };
const btnDanger = { ...btnBase, background: "transparent", color: "#c33", border: "1px solid #f0d0d0" };

export default function App() {
  const weekKey = getWeekKey();
  const [tasks, setTasks] = useStorage("wt_tasks_v1", DEFAULT_TASKS);
  const [checks, setChecks] = useStorage(`wt_checks_${weekKey}`, {});
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [newTask, setNewTask] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const editRef = useRef();
  const newRef = useRef();

  const todayCol = ((new Date().getDay() + 6) % 7);

  const toggle = (ti, di) =>
    setChecks(prev => ({ ...prev, [`${ti}_${di}`]: !prev[`${ti}_${di}`] }));

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditVal(tasks[i]);
    setTimeout(() => editRef.current?.focus(), 30);
  };

  const saveEdit = () => {
    if (editVal.trim())
      setTasks(prev => prev.map((t, i) => i === editingIdx ? editVal.trim() : t));
    setEditingIdx(null);
  };

  const deleteTask = (i) => {
    setTasks(prev => prev.filter((_, idx) => idx !== i));
    setChecks(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ti = parseInt(k.split("_")[0]);
        const di = k.split("_")[1];
        if (ti < i) next[k] = v;
        else if (ti > i) next[`${ti - 1}_${di}`] = v;
      });
      return next;
    });
    setEditingIdx(null);
  };

  const addTask = () => {
    if (newTask.trim()) {
      setTasks(prev => [...prev, newTask.trim()]);
      setNewTask("");
      setShowAdd(false);
    }
  };

  const startAdd = () => {
    setShowAdd(true);
    setTimeout(() => newRef.current?.focus(), 30);
  };

  const weekDone = tasks.reduce((acc, _, ti) =>
    acc + DAYS.filter((_, di) => checks[`${ti}_${di}`]).length, 0);
  const weekTotal = tasks.length * 7;
  const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const gridCols = "1fr repeat(7, 32px)";
  const rowPad = "0 16px";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f7f7f7",
      display: "flex",
      justifyContent: "center",
      fontFamily: FONT,
      WebkitFontSmoothing: "antialiased",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 440,
        minHeight: "100vh",
        background: "#fff",
        borderLeft: "1px solid #ececec",
        borderRight: "1px solid #ececec",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {/* Header */}
        <div style={{ padding: "calc(env(safe-area-inset-top) + 18px) 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>Weekly Tracker</div>
            <div style={{ fontSize: 14, color: "#555", fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
          </div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
            Week of {formatWeekLabel(weekKey)} · {weekDone}/{weekTotal}
          </div>
          <div style={{ height: 3, background: "#eee", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#000", transition: "width .25s ease" }} />
          </div>
        </div>

        {/* Day header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: rowPad,
          gap: 2,
          marginBottom: 2,
          alignItems: "center",
        }}>
          <div />
          {DAYS.map((d, di) => (
            <div key={di} style={{
              textAlign: "center",
              fontSize: 11,
              color: di === todayCol ? "#000" : "#aaa",
              fontWeight: di === todayCol ? 700 : 500,
              padding: "6px 0",
              letterSpacing: 0.5,
            }}>{d}</div>
          ))}
        </div>

        {/* Tasks */}
        <div style={{ flex: 1 }}>
          {tasks.map((task, ti) => (
            editingIdx === ti ? (
              <div key={ti} style={{
                padding: "10px 16px",
                borderTop: "1px solid #f0f0f0",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}>
                <input
                  ref={editRef}
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingIdx(null);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    padding: "8px 10px",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    outline: "none",
                  }}
                />
                <button onClick={saveEdit} style={btnPrimary}>Save</button>
                <button onClick={() => deleteTask(ti)} style={btnDanger}>Delete</button>
              </div>
            ) : (
              <div key={ti} style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                padding: rowPad,
                gap: 2,
                alignItems: "center",
                borderTop: "1px solid #f0f0f0",
              }}>
                <div
                  onClick={() => startEdit(ti)}
                  style={{
                    fontSize: 15,
                    color: "#111",
                    padding: "12px 8px 12px 0",
                    cursor: "pointer",
                    userSelect: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >{task}</div>
                {DAYS.map((_, di) => {
                  const on = !!checks[`${ti}_${di}`];
                  const today = di === todayCol;
                  return (
                    <div
                      key={di}
                      onClick={() => toggle(ti, di)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 44,
                        cursor: "pointer",
                        background: today ? "#fafafa" : "transparent",
                      }}
                    >
                      <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: on ? "none" : "1.5px solid #d0d0d0",
                        background: on ? "#000" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background .15s, border-color .15s",
                      }}>
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ))}
        </div>

        {/* Add task */}
        <div style={{ borderTop: "1px solid #f0f0f0", padding: "10px 16px 16px" }}>
          {showAdd ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={newRef}
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="New task"
                onKeyDown={e => {
                  if (e.key === "Enter") addTask();
                  if (e.key === "Escape") { setShowAdd(false); setNewTask(""); }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  outline: "none",
                }}
              />
              <button onClick={addTask} style={btnPrimary}>Add</button>
              <button onClick={() => { setShowAdd(false); setNewTask(""); }} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={startAdd} style={{
              width: "100%",
              padding: "12px",
              fontSize: 14,
              color: "#666",
              background: "transparent",
              border: "1px dashed #ddd",
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: FONT,
            }}>+ Add task</button>
          )}
        </div>
      </div>
    </div>
  );
}
