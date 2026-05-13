import { useState, useEffect, useRef } from "react";

const DAYS = ["M", "T", "W", "Th", "F", "Sa", "S"];
const FONT = "'system-ui', '-apple-system', 'Helvetica Neue', sans-serif";

const DEFAULT_TASKS = [
  "Drums", "Flute", "Writing", "Keys",
  "Bass", "Exercise", "Learn Tunes", "Booking",
  "Shows", "Setlist"
];

const STATE_KEY = "wt_state_v2";
const PIN_KEY = "wt_pin";

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

function loadLocalState() {
  try {
    const cached = localStorage.getItem(STATE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  try {
    const oldTasks = JSON.parse(localStorage.getItem("wt_tasks_v1") || "null");
    if (oldTasks) {
      const checksByWeek = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("wt_checks_")) {
          try { checksByWeek[k.slice("wt_checks_".length)] = JSON.parse(localStorage.getItem(k) || "{}"); }
          catch {}
        }
      }
      return { tasks: oldTasks, checksByWeek };
    }
  } catch {}
  return { tasks: DEFAULT_TASKS, checksByWeek: {} };
}

function saveLocalState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = e => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

async function fetchRemote(pin) {
  const r = await fetch("/api/state", { headers: { "x-pin": pin } });
  if (r.status === 401) throw new Error("bad_pin");
  if (r.status === 503) throw new Error("not_configured");
  if (!r.ok) throw new Error("server_error");
  return await r.json();
}

async function pushRemote(pin, state) {
  const r = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pin": pin },
    body: JSON.stringify(state),
  });
  if (r.status === 401) throw new Error("bad_pin");
  if (r.status === 503) throw new Error("not_configured");
  if (!r.ok) throw new Error("server_error");
}

const btnBase = {
  fontSize: 14, padding: "8px 14px", borderRadius: 8, border: "none",
  cursor: "pointer", fontFamily: FONT, fontWeight: 500, whiteSpace: "nowrap",
};
const btnPrimary = { ...btnBase, background: "#000", color: "#fff" };
const btnGhost = { ...btnBase, background: "transparent", color: "#666", border: "1px solid #e0e0e0" };
const btnDanger = { ...btnBase, background: "transparent", color: "#c33", border: "1px solid #f0d0d0" };

const STATUS_LABEL = {
  local: "Local only",
  syncing: "Syncing…",
  synced: "Synced",
  offline: "Offline",
  bad_pin: "Bad PIN",
  not_configured: "Setup needed",
};
const STATUS_COLOR = {
  local: "#999",
  syncing: "#888",
  synced: "#1a8f3a",
  offline: "#b87900",
  bad_pin: "#c33",
  not_configured: "#c33",
};

export default function App() {
  const wide = useMediaQuery("(min-width: 700px)");
  const theme = wide ? {
    maxWidth: 720,
    gridCols: "1fr repeat(7, 52px)",
    rowPad: "0 24px",
    titleSize: 24,
    checkSize: 26,
    checkBorder: 2,
    rowHeight: 52,
  } : {
    maxWidth: 440,
    gridCols: "1fr repeat(7, 32px)",
    rowPad: "0 16px",
    titleSize: 22,
    checkSize: 22,
    checkBorder: 1.5,
    rowHeight: 44,
  };

  const weekKey = getWeekKey();
  const [state, setState] = useState(loadLocalState);
  const [pin, setPin] = useState(() => {
    try { return localStorage.getItem(PIN_KEY); } catch { return null; }
  });
  const [syncStatus, setSyncStatus] = useState(pin ? "syncing" : "local");
  const [pinModal, setPinModal] = useState(false);
  const loadedRef = useRef(false);

  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [newTask, setNewTask] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const editRef = useRef();
  const newRef = useRef();

  const tasks = state.tasks;
  const checks = state.checksByWeek[weekKey] || {};
  const todayCol = ((new Date().getDay() + 6) % 7);

  useEffect(() => {
    if (!pin) {
      setSyncStatus("local");
      loadedRef.current = true;
      return;
    }
    let cancelled = false;
    setSyncStatus("syncing");
    fetchRemote(pin).then(server => {
      if (cancelled) return;
      if (server && server.tasks) {
        setState(server);
      } else {
        pushRemote(pin, state).catch(() => {});
      }
      setSyncStatus("synced");
      loadedRef.current = true;
    }).catch(err => {
      if (cancelled) return;
      if (err.message === "bad_pin") {
        try { localStorage.removeItem(PIN_KEY); } catch {}
        setPin(null);
        setSyncStatus("bad_pin");
      } else if (err.message === "not_configured") {
        setSyncStatus("not_configured");
      } else {
        setSyncStatus("offline");
      }
      loadedRef.current = true;
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveLocalState(state);
    if (!pin) return;
    const t = setTimeout(() => {
      setSyncStatus("syncing");
      pushRemote(pin, state)
        .then(() => setSyncStatus("synced"))
        .catch(err => {
          if (err.message === "bad_pin") setSyncStatus("bad_pin");
          else if (err.message === "not_configured") setSyncStatus("not_configured");
          else setSyncStatus("offline");
        });
    }, 600);
    return () => clearTimeout(t);
  }, [state, pin]);

  const updateTasks = (fn) => setState(prev => ({ ...prev, tasks: fn(prev.tasks) }));
  const updateChecks = (fn) => setState(prev => ({
    ...prev,
    checksByWeek: { ...prev.checksByWeek, [weekKey]: fn(prev.checksByWeek[weekKey] || {}) }
  }));

  const toggle = (ti, di) =>
    updateChecks(prev => ({ ...prev, [`${ti}_${di}`]: !prev[`${ti}_${di}`] }));

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditVal(tasks[i]);
    setTimeout(() => editRef.current?.focus(), 30);
  };

  const saveEdit = () => {
    if (editVal.trim())
      updateTasks(prev => prev.map((t, i) => i === editingIdx ? editVal.trim() : t));
    setEditingIdx(null);
  };

  const deleteTask = (i) => {
    setState(prev => {
      const newTasks = prev.tasks.filter((_, idx) => idx !== i);
      const newChecksByWeek = {};
      for (const [wk, wkChecks] of Object.entries(prev.checksByWeek)) {
        const shifted = {};
        for (const [k, v] of Object.entries(wkChecks)) {
          const [ti, di] = k.split("_");
          const tiNum = parseInt(ti);
          if (tiNum < i) shifted[k] = v;
          else if (tiNum > i) shifted[`${tiNum - 1}_${di}`] = v;
        }
        newChecksByWeek[wk] = shifted;
      }
      return { tasks: newTasks, checksByWeek: newChecksByWeek };
    });
    setEditingIdx(null);
  };

  const addTask = () => {
    if (newTask.trim()) {
      updateTasks(prev => [...prev, newTask.trim()]);
      setNewTask("");
      setShowAdd(false);
    }
  };

  const startAdd = () => {
    setShowAdd(true);
    setTimeout(() => newRef.current?.focus(), 30);
  };

  const savePin = (p) => {
    try { localStorage.setItem(PIN_KEY, p); } catch {}
    setPin(p);
    setPinModal(false);
  };
  const clearPin = () => {
    try { localStorage.removeItem(PIN_KEY); } catch {}
    setPin(null);
    setPinModal(false);
  };

  const weekDone = tasks.reduce((acc, _, ti) =>
    acc + DAYS.filter((_, di) => checks[`${ti}_${di}`]).length, 0);
  const weekTotal = tasks.length * 7;
  const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  return (
    <div style={{
      minHeight: "100vh", background: "#f7f7f7",
      display: "flex", justifyContent: "center",
      fontFamily: FONT, WebkitFontSmoothing: "antialiased",
    }}>
      <div style={{
        width: "100%", maxWidth: theme.maxWidth, minHeight: "100vh", background: "#fff",
        borderLeft: "1px solid #ececec", borderRight: "1px solid #ececec",
        display: "flex", flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {/* Header */}
        <div style={{ padding: `calc(env(safe-area-inset-top) + 18px) ${wide ? 24 : 16}px 14px` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: theme.titleSize, fontWeight: 600, letterSpacing: -0.3 }}>Weekly Tracker</div>
            <div style={{ fontSize: 14, color: "#555", fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 4,
          }}>
            <div style={{ fontSize: 12, color: "#999" }}>
              Week of {formatWeekLabel(weekKey)} · {weekDone}/{weekTotal}
            </div>
            <button onClick={() => setPinModal(true)} style={{
              fontSize: 11, color: STATUS_COLOR[syncStatus],
              background: "transparent", border: "none", cursor: "pointer",
              padding: "2px 0", fontFamily: FONT, fontWeight: 500,
            }}>
              ● {STATUS_LABEL[syncStatus]}
            </button>
          </div>
          <div style={{ height: 3, background: "#eee", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#000", transition: "width .25s ease" }} />
          </div>
        </div>

        {/* Day header row */}
        <div style={{
          display: "grid", gridTemplateColumns: theme.gridCols, padding: theme.rowPad,
          gap: 2, marginBottom: 2, alignItems: "center",
        }}>
          <div />
          {DAYS.map((d, di) => (
            <div key={di} style={{
              textAlign: "center", fontSize: 11,
              color: di === todayCol ? "#000" : "#aaa",
              fontWeight: di === todayCol ? 700 : 500,
              padding: "6px 0", letterSpacing: 0.5,
            }}>{d}</div>
          ))}
        </div>

        {/* Tasks */}
        <div style={{ flex: 1 }}>
          {tasks.map((task, ti) => (
            editingIdx === ti ? (
              <div key={ti} style={{
                padding: `10px ${wide ? 24 : 16}px`, borderTop: "1px solid #f0f0f0",
                display: "flex", gap: 8, alignItems: "center",
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
                    flex: 1, minWidth: 0, fontSize: 15, padding: "8px 10px",
                    border: "1px solid #ddd", borderRadius: 8, outline: "none",
                  }}
                />
                <button onClick={saveEdit} style={btnPrimary}>Save</button>
                <button onClick={() => deleteTask(ti)} style={btnDanger}>Delete</button>
              </div>
            ) : (
              <div key={ti} style={{
                display: "grid", gridTemplateColumns: theme.gridCols, padding: theme.rowPad,
                gap: 2, alignItems: "center", borderTop: "1px solid #f0f0f0",
              }}>
                <div
                  onClick={() => startEdit(ti)}
                  style={{
                    fontSize: 15, color: "#111", padding: "12px 8px 12px 0",
                    cursor: "pointer", userSelect: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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
                        display: "flex", alignItems: "center", justifyContent: "center",
                        height: theme.rowHeight, cursor: "pointer",
                        background: today ? "#fafafa" : "transparent",
                      }}
                    >
                      <div style={{
                        width: theme.checkSize, height: theme.checkSize, borderRadius: "50%",
                        border: on ? "none" : `${theme.checkBorder}px solid #d0d0d0`,
                        background: on ? "#000" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
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
        <div style={{ borderTop: "1px solid #f0f0f0", padding: `10px ${wide ? 24 : 16}px 16px` }}>
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
                  flex: 1, minWidth: 0, fontSize: 15, padding: "10px 12px",
                  border: "1px solid #ddd", borderRadius: 8, outline: "none",
                }}
              />
              <button onClick={addTask} style={btnPrimary}>Add</button>
              <button onClick={() => { setShowAdd(false); setNewTask(""); }} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={startAdd} style={{
              width: "100%", padding: "12px", fontSize: 14, color: "#666",
              background: "transparent", border: "1px dashed #ddd", borderRadius: 10,
              cursor: "pointer", fontFamily: FONT,
            }}>+ Add task</button>
          )}
        </div>
      </div>

      {pinModal && (
        <PinModal
          currentPin={pin}
          status={syncStatus}
          onSave={savePin}
          onClear={clearPin}
          onCancel={() => setPinModal(false)}
        />
      )}
    </div>
  );
}

function PinModal({ currentPin, status, onSave, onClear, onCancel }) {
  const [val, setVal] = useState("");
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);

  const helpText = currentPin
    ? status === "bad_pin"
      ? "The saved PIN is no longer valid. Enter a new one."
      : "Sync is enabled. Enter a new PIN to switch, or disable sync."
    : "Enter the sync PIN (the SYNC_PIN value you set on Vercel) to share data across devices.";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 16, fontFamily: FONT,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, padding: 20,
        width: "100%", maxWidth: 320,
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {currentPin ? "Sync settings" : "Enable sync"}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginBottom: 14, lineHeight: 1.4 }}>
          {helpText}
        </div>
        <input
          ref={inputRef}
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="PIN"
          autoComplete="off"
          onKeyDown={e => { if (e.key === "Enter" && val) onSave(val); }}
          style={{
            width: "100%", fontSize: 15, padding: "10px 12px",
            border: "1px solid #ddd", borderRadius: 8, outline: "none",
            fontFamily: FONT, marginBottom: 12, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {currentPin && (
            <button onClick={onClear} style={btnDanger}>Disable sync</button>
          )}
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button
            onClick={() => val && onSave(val)}
            disabled={!val}
            style={{ ...btnPrimary, opacity: val ? 1 : 0.4 }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
