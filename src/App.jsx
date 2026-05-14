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

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function migrate(raw) {
  if (!raw) return null;
  if (raw.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      tasks: raw.tasks || {},
      groups: raw.groups || {},
      order: raw.order || [],
      checksByWeek: raw.checksByWeek || {},
      version: raw.version || 0,
    };
  }
  const oldTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const ids = oldTasks.map(() => newId());
  const tasks = {};
  oldTasks.forEach((name, i) => { tasks[ids[i]] = { name }; });
  const order = ids.map(id => ({ kind: "task", id }));
  const checksByWeek = {};
  for (const [wk, wkChecks] of Object.entries(raw.checksByWeek || {})) {
    const next = {};
    for (const [k, v] of Object.entries(wkChecks)) {
      const [tiStr, di] = k.split("_");
      const ti = parseInt(tiStr, 10);
      if (Number.isFinite(ti) && ti >= 0 && ti < ids.length) {
        next[`${ids[ti]}_${di}`] = v;
      }
    }
    checksByWeek[wk] = next;
  }
  return {
    schemaVersion: 2,
    tasks,
    groups: {},
    order,
    checksByWeek,
    version: raw.version || 0,
  };
}

function defaultState() {
  const ids = DEFAULT_TASKS.map(() => newId());
  const tasks = {};
  DEFAULT_TASKS.forEach((name, i) => { tasks[ids[i]] = { name }; });
  return {
    schemaVersion: 2,
    tasks,
    groups: {},
    order: ids.map(id => ({ kind: "task", id })),
    checksByWeek: {},
    version: 0,
  };
}

function loadLocalState() {
  try {
    const cached = localStorage.getItem(STATE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const migrated = migrate(parsed);
      if (migrated) return migrated;
    }
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
      const migrated = migrate({ tasks: oldTasks, checksByWeek, version: 0 });
      if (migrated) return migrated;
    }
  } catch {}
  return defaultState();
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
const btnIcon = {
  ...btnBase, padding: "8px 12px", fontSize: 15, minWidth: 40, minHeight: 40,
  background: "transparent", color: "#666", border: "1px solid #e0e0e0",
};

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
  const stateRef = useRef(null);
  const pinRef = useRef(pin);

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editGroupVal, setEditGroupVal] = useState("");
  const [newTask, setNewTask] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const editRef = useRef();
  const editGroupRef = useRef();
  const newRef = useRef();
  const newGroupRef = useRef();

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
      const migrated = migrate(server);
      const serverVersion = migrated?.version || 0;
      const localVersion = state.version || 0;
      if (migrated && serverVersion > localVersion) {
        setState(migrated);
      } else if (!migrated || localVersion > serverVersion) {
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
    stateRef.current = state;
    pinRef.current = pin;
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

  useEffect(() => {
    const flush = () => {
      const p = pinRef.current;
      const s = stateRef.current;
      if (!p || !s || !loadedRef.current) return;
      try {
        fetch("/api/state", {
          method: "POST",
          headers: { "content-type": "application/json", "x-pin": p },
          body: JSON.stringify(s),
          keepalive: true,
        });
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const bump = (prev) => (prev.version || 0) + 1;

  const updateChecks = (fn) => setState(prev => ({
    ...prev,
    checksByWeek: { ...prev.checksByWeek, [weekKey]: fn(prev.checksByWeek[weekKey] || {}) },
    version: bump(prev),
  }));

  const toggle = (taskId, di) =>
    updateChecks(prev => ({ ...prev, [`${taskId}_${di}`]: !prev[`${taskId}_${di}`] }));

  const addTask = (name, groupId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    setState(prev => {
      const tasks = { ...prev.tasks, [id]: { name: trimmed } };
      let order = prev.order;
      if (groupId && prev.groups[groupId]) {
        order = prev.order.map(e =>
          e.kind === "group" && e.id === groupId
            ? { ...e, taskIds: [...e.taskIds, id] }
            : e
        );
      } else {
        order = [...prev.order, { kind: "task", id }];
      }
      return { ...prev, tasks, order, version: bump(prev) };
    });
  };

  const renameTask = (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState(prev => ({
      ...prev,
      tasks: { ...prev.tasks, [id]: { ...prev.tasks[id], name: trimmed } },
      version: bump(prev),
    }));
  };

  const deleteTask = (id) => {
    setState(prev => {
      const tasks = { ...prev.tasks };
      delete tasks[id];
      const order = prev.order
        .map(e => e.kind === "group" ? { ...e, taskIds: e.taskIds.filter(t => t !== id) } : e)
        .filter(e => !(e.kind === "task" && e.id === id));
      const checksByWeek = {};
      const prefix = `${id}_`;
      for (const [wk, wkChecks] of Object.entries(prev.checksByWeek)) {
        const next = {};
        for (const [k, v] of Object.entries(wkChecks)) {
          if (!k.startsWith(prefix)) next[k] = v;
        }
        checksByWeek[wk] = next;
      }
      return { ...prev, tasks, order, checksByWeek, version: bump(prev) };
    });
    setEditingTaskId(null);
  };

  // Walk `order` to find the position of a task: returns
  //   { container: "top", topIdx }                       // top-level task at order[topIdx]
  //   { container: "group", groupId, topIdx, childIdx }  // task inside group at order[topIdx]
  const locateTask = (order, taskId) => {
    for (let i = 0; i < order.length; i++) {
      const e = order[i];
      if (e.kind === "task" && e.id === taskId) return { container: "top", topIdx: i };
      if (e.kind === "group") {
        const childIdx = e.taskIds.indexOf(taskId);
        if (childIdx !== -1) return { container: "group", groupId: e.id, topIdx: i, childIdx };
      }
    }
    return null;
  };

  const moveTask = (taskId, dir) => {
    setState(prev => {
      const order = prev.order.map(e => e.kind === "group" ? { ...e, taskIds: [...e.taskIds] } : e);
      const loc = locateTask(order, taskId);
      if (!loc) return prev;

      if (loc.container === "top") {
        if (dir === -1) {
          if (loc.topIdx === 0) return prev;
          const above = order[loc.topIdx - 1];
          if (above.kind === "group") {
            // drop into the group as last child
            order.splice(loc.topIdx, 1);
            above.taskIds.push(taskId);
          } else {
            // swap with task above
            [order[loc.topIdx - 1], order[loc.topIdx]] = [order[loc.topIdx], order[loc.topIdx - 1]];
          }
        } else {
          if (loc.topIdx === order.length - 1) return prev;
          const below = order[loc.topIdx + 1];
          if (below.kind === "group") {
            // drop into the group as first child
            order.splice(loc.topIdx, 1);
            below.taskIds.unshift(taskId);
          } else {
            [order[loc.topIdx], order[loc.topIdx + 1]] = [order[loc.topIdx + 1], order[loc.topIdx]];
          }
        }
      } else {
        const groupEntry = order[loc.topIdx];
        if (dir === -1) {
          if (loc.childIdx === 0) {
            // lift out above the group
            groupEntry.taskIds.splice(0, 1);
            order.splice(loc.topIdx, 0, { kind: "task", id: taskId });
          } else {
            const arr = groupEntry.taskIds;
            [arr[loc.childIdx - 1], arr[loc.childIdx]] = [arr[loc.childIdx], arr[loc.childIdx - 1]];
          }
        } else {
          if (loc.childIdx === groupEntry.taskIds.length - 1) {
            // drop out below the group
            groupEntry.taskIds.splice(loc.childIdx, 1);
            order.splice(loc.topIdx + 1, 0, { kind: "task", id: taskId });
          } else {
            const arr = groupEntry.taskIds;
            [arr[loc.childIdx], arr[loc.childIdx + 1]] = [arr[loc.childIdx + 1], arr[loc.childIdx]];
          }
        }
      }
      return { ...prev, order, version: bump(prev) };
    });
  };

  const moveTaskToGroup = (taskId, groupId) => {
    setState(prev => {
      const loc = locateTask(prev.order, taskId);
      if (!loc) return prev;
      const currentGroup = loc.container === "group" ? loc.groupId : null;
      if (currentGroup === groupId) return prev;

      let order = prev.order
        .map(e => e.kind === "group" ? { ...e, taskIds: e.taskIds.filter(t => t !== taskId) } : e)
        .filter(e => !(e.kind === "task" && e.id === taskId));

      if (groupId && prev.groups[groupId]) {
        order = order.map(e =>
          e.kind === "group" && e.id === groupId
            ? { ...e, taskIds: [...e.taskIds, taskId] }
            : e
        );
      } else {
        order = [...order, { kind: "task", id: taskId }];
      }
      return { ...prev, order, version: bump(prev) };
    });
  };

  const addGroup = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    setState(prev => ({
      ...prev,
      groups: { ...prev.groups, [id]: { name: trimmed, collapsed: false } },
      order: [...prev.order, { kind: "group", id, taskIds: [] }],
      version: bump(prev),
    }));
  };

  const renameGroup = (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState(prev => ({
      ...prev,
      groups: { ...prev.groups, [id]: { ...prev.groups[id], name: trimmed } },
      version: bump(prev),
    }));
  };

  const toggleGroupCollapsed = (id) => {
    setState(prev => ({
      ...prev,
      groups: { ...prev.groups, [id]: { ...prev.groups[id], collapsed: !prev.groups[id].collapsed } },
      version: bump(prev),
    }));
  };

  const deleteGroup = (id) => {
    setState(prev => {
      const groups = { ...prev.groups };
      delete groups[id];
      const order = [];
      for (const e of prev.order) {
        if (e.kind === "group" && e.id === id) {
          for (const tid of e.taskIds) order.push({ kind: "task", id: tid });
        } else {
          order.push(e);
        }
      }
      return { ...prev, groups, order, version: bump(prev) };
    });
    setEditingGroupId(null);
  };

  const startEditTask = (id) => {
    setEditingTaskId(id);
    setEditVal(state.tasks[id]?.name || "");
    setTimeout(() => editRef.current?.focus(), 30);
  };

  const saveEditTask = () => {
    if (editVal.trim() && editingTaskId) renameTask(editingTaskId, editVal);
    setEditingTaskId(null);
  };

  const startEditGroup = (id) => {
    setEditingGroupId(id);
    setEditGroupVal(state.groups[id]?.name || "");
    setTimeout(() => editGroupRef.current?.focus(), 30);
  };

  const saveEditGroup = () => {
    if (editGroupVal.trim() && editingGroupId) renameGroup(editingGroupId, editGroupVal);
    setEditingGroupId(null);
  };

  const startAdd = () => {
    setShowAdd(true);
    setTimeout(() => newRef.current?.focus(), 30);
  };

  const startAddGroup = () => {
    setShowAddGroup(true);
    setTimeout(() => newGroupRef.current?.focus(), 30);
  };

  const submitAddTask = () => {
    if (newTask.trim()) {
      addTask(newTask, null);
      setNewTask("");
      setShowAdd(false);
    }
  };

  const submitAddGroup = () => {
    if (newGroup.trim()) {
      addGroup(newGroup);
      setNewGroup("");
      setShowAddGroup(false);
    }
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

  const allTaskIds = Object.keys(state.tasks);
  const weekDone = allTaskIds.reduce((acc, tid) =>
    acc + DAYS.filter((_, di) => checks[`${tid}_${di}`]).length, 0);
  const weekTotal = allTaskIds.length * 7;
  const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const groupList = state.order.filter(e => e.kind === "group");
  const groupOptions = groupList.map(e => ({ id: e.id, name: state.groups[e.id]?.name || "(untitled)" }));

  const renderTaskRow = (taskId, opts) => {
    const task = state.tasks[taskId];
    if (!task) return null;
    const indented = !!opts?.indented;
    const canMoveUp = opts?.canMoveUp !== false;
    const canMoveDown = opts?.canMoveDown !== false;
    const currentGroupId = opts?.currentGroupId || "";

    if (editingTaskId === taskId) {
      return (
        <div key={taskId} style={{
          padding: `10px ${wide ? 24 : 16}px`, borderTop: "1px solid #f0f0f0",
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        }}>
          <input
            ref={editRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") saveEditTask();
              if (e.key === "Escape") setEditingTaskId(null);
            }}
            style={{
              flex: "1 1 160px", minWidth: 0, fontSize: 15, padding: "8px 10px",
              border: "1px solid #ddd", borderRadius: 8, outline: "none",
            }}
          />
          <button
            onClick={() => moveTask(taskId, -1)}
            disabled={!canMoveUp}
            style={{ ...btnIcon, opacity: canMoveUp ? 1 : 0.35, cursor: canMoveUp ? "pointer" : "default" }}
            aria-label="Move up"
          >↑</button>
          <button
            onClick={() => moveTask(taskId, +1)}
            disabled={!canMoveDown}
            style={{ ...btnIcon, opacity: canMoveDown ? 1 : 0.35, cursor: canMoveDown ? "pointer" : "default" }}
            aria-label="Move down"
          >↓</button>
          <select
            value={currentGroupId}
            onChange={e => moveTaskToGroup(taskId, e.target.value || null)}
            style={{
              fontSize: 13, padding: "6px 8px", border: "1px solid #e0e0e0",
              borderRadius: 8, background: "#fff", color: "#444", fontFamily: FONT,
            }}
          >
            <option value="">(no group)</option>
            {groupOptions.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button onClick={saveEditTask} style={btnPrimary}>Save</button>
          <button onClick={() => deleteTask(taskId)} style={btnDanger}>Delete</button>
        </div>
      );
    }

    return (
      <div key={taskId} style={{
        display: "grid", gridTemplateColumns: theme.gridCols, padding: theme.rowPad,
        gap: 2, alignItems: "center", borderTop: "1px solid #f0f0f0",
      }}>
        <div
          onClick={() => startEditTask(taskId)}
          style={{
            fontSize: 15, color: "#111", padding: "12px 8px 12px 0",
            paddingLeft: indented ? 20 : 0,
            cursor: "pointer", userSelect: "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >{task.name}</div>
        {DAYS.map((_, di) => {
          const on = !!checks[`${taskId}_${di}`];
          const today = di === todayCol;
          return (
            <div
              key={di}
              onClick={() => toggle(taskId, di)}
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
    );
  };

  const renderGroupHeader = (entry) => {
    const group = state.groups[entry.id];
    if (!group) return null;
    const childCount = entry.taskIds.length;
    const groupDone = entry.taskIds.reduce((acc, tid) =>
      acc + DAYS.filter((_, di) => checks[`${tid}_${di}`]).length, 0);
    const groupTotal = childCount * 7;

    if (editingGroupId === entry.id) {
      return (
        <div key={`g-${entry.id}`} style={{
          padding: `10px ${wide ? 24 : 16}px`, borderTop: "1px solid #f0f0f0",
          background: "#fafafa",
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        }}>
          <input
            ref={editGroupRef}
            value={editGroupVal}
            onChange={e => setEditGroupVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") saveEditGroup();
              if (e.key === "Escape") setEditingGroupId(null);
            }}
            style={{
              flex: "1 1 160px", minWidth: 0, fontSize: 15, padding: "8px 10px",
              border: "1px solid #ddd", borderRadius: 8, outline: "none",
            }}
          />
          <button onClick={saveEditGroup} style={btnPrimary}>Save</button>
          <button onClick={() => deleteGroup(entry.id)} style={btnDanger}>Delete</button>
        </div>
      );
    }

    return (
      <div key={`g-${entry.id}`} style={{
        display: "flex", alignItems: "center",
        padding: `10px ${wide ? 24 : 16}px`,
        borderTop: "1px solid #f0f0f0",
        background: "#fafafa",
        gap: 8,
      }}>
        <button
          onClick={() => toggleGroupCollapsed(entry.id)}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 16, color: "#555", padding: "8px 10px", fontFamily: FONT,
            minWidth: 40, minHeight: 40, textAlign: "center",
          }}
          aria-label={group.collapsed ? "Expand" : "Collapse"}
        >{group.collapsed ? "▸" : "▾"}</button>
        <div
          onClick={() => startEditGroup(entry.id)}
          style={{
            flex: 1, fontSize: 14, fontWeight: 600, color: "#333",
            cursor: "pointer", userSelect: "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: 0.2, textTransform: "uppercase",
          }}
        >{group.name}</div>
        {childCount > 0 && (
          <div style={{ fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
            {groupDone}/{groupTotal}
          </div>
        )}
      </div>
    );
  };

  const renderItems = [];
  state.order.forEach((entry, idx) => {
    if (entry.kind === "task") {
      renderItems.push(renderTaskRow(entry.id, {
        indented: false,
        canMoveUp: idx > 0,
        canMoveDown: idx < state.order.length - 1,
        currentGroupId: "",
      }));
    } else if (entry.kind === "group") {
      renderItems.push(renderGroupHeader(entry));
      const group = state.groups[entry.id];
      if (group && !group.collapsed) {
        entry.taskIds.forEach((tid, ci) => {
          const isFirstChild = ci === 0;
          const isLastChild = ci === entry.taskIds.length - 1;
          const groupIsFirst = idx === 0;
          const groupIsLast = idx === state.order.length - 1;
          renderItems.push(renderTaskRow(tid, {
            indented: true,
            canMoveUp: !(isFirstChild && groupIsFirst),
            canMoveDown: !(isLastChild && groupIsLast),
            currentGroupId: entry.id,
          }));
        });
      }
    }
  });

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

        {/* Tasks + groups */}
        <div style={{ flex: 1 }}>
          {renderItems}
        </div>

        {/* Add controls */}
        <div style={{ borderTop: "1px solid #f0f0f0", padding: `10px ${wide ? 24 : 16}px 16px`, display: "flex", flexDirection: "column", gap: 8 }}>
          {showAdd ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={newRef}
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="New task"
                onKeyDown={e => {
                  if (e.key === "Enter") submitAddTask();
                  if (e.key === "Escape") { setShowAdd(false); setNewTask(""); }
                }}
                style={{
                  flex: 1, minWidth: 0, fontSize: 15, padding: "10px 12px",
                  border: "1px solid #ddd", borderRadius: 8, outline: "none",
                }}
              />
              <button onClick={submitAddTask} style={btnPrimary}>Add</button>
              <button onClick={() => { setShowAdd(false); setNewTask(""); }} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={startAdd} style={{
              width: "100%", padding: "12px", fontSize: 14, color: "#666",
              background: "transparent", border: "1px dashed #ddd", borderRadius: 10,
              cursor: "pointer", fontFamily: FONT,
            }}>+ Add task</button>
          )}
          {showAddGroup ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={newGroupRef}
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                placeholder="New group"
                onKeyDown={e => {
                  if (e.key === "Enter") submitAddGroup();
                  if (e.key === "Escape") { setShowAddGroup(false); setNewGroup(""); }
                }}
                style={{
                  flex: 1, minWidth: 0, fontSize: 15, padding: "10px 12px",
                  border: "1px solid #ddd", borderRadius: 8, outline: "none",
                }}
              />
              <button onClick={submitAddGroup} style={btnPrimary}>Add</button>
              <button onClick={() => { setShowAddGroup(false); setNewGroup(""); }} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={startAddGroup} style={{
              width: "100%", padding: "12px", fontSize: 14, color: "#666",
              background: "transparent", border: "1px dashed #ddd", borderRadius: 10,
              cursor: "pointer", fontFamily: FONT,
            }}>+ Add group</button>
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
