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

function localDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function localMondayKey(date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDateKey(monday);
}

function getWeekKey() {
  return localMondayKey(new Date());
}

function realignChecksByWeek(checksByWeek) {
  const src = checksByWeek || {};
  const out = {};
  for (const [wk, entries] of Object.entries(src)) {
    if (!entries || typeof entries !== "object") continue;
    const parsed = new Date(wk + "T00:00:00");
    const mondayKey = Number.isNaN(parsed.getTime()) ? wk : localMondayKey(parsed);
    const target = out[mondayKey] || (out[mondayKey] = {});
    for (const [k, v] of Object.entries(entries)) {
      target[k] = !!target[k] || !!v;
    }
  }
  return out;
}

function formatWeekLabel(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shiftDate(yyyyMmDd, days) {
  const d = new Date(yyyyMmDd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftWeek(weekKey, weeks) {
  return shiftDate(weekKey, weeks * 7);
}

function activeWeekKeys(checksByWeek) {
  const keys = [];
  for (const [wk, wkChecks] of Object.entries(checksByWeek || {})) {
    for (const v of Object.values(wkChecks || {})) {
      if (v) { keys.push(wk); break; }
    }
  }
  keys.sort();
  return keys;
}

function lastNWeekKeys(fromWeekKey, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftWeek(fromWeekKey, -i));
  return out;
}

function taskChecksInWeek(checksByWeek, taskId, weekKey) {
  const wk = checksByWeek[weekKey];
  if (!wk) return 0;
  let n = 0;
  for (let d = 0; d < 7; d++) if (wk[`${taskId}_${d}`]) n++;
  return n;
}

function taskWeekPct(checksByWeek, taskId, weekKey) {
  return Math.round(taskChecksInWeek(checksByWeek, taskId, weekKey) / 7 * 100);
}

function taskWindowPct(checksByWeek, taskId, weekKeys) {
  if (weekKeys.length === 0) return 0;
  let sum = 0;
  for (const wk of weekKeys) sum += taskChecksInWeek(checksByWeek, taskId, wk);
  return Math.round(sum / (weekKeys.length * 7) * 100);
}

function taskAllTimeStats(checksByWeek, taskId, currentWeekKey) {
  const active = activeWeekKeys(checksByWeek);
  if (active.length === 0) return { overallPct: 0 };
  let totalChecks = 0;
  let totalSlots = 0;
  let wk = active[0];
  while (wk <= currentWeekKey) {
    totalChecks += taskChecksInWeek(checksByWeek, taskId, wk);
    totalSlots += 7;
    wk = shiftWeek(wk, 1);
  }
  const overallPct = totalSlots === 0 ? 0 : Math.round(totalChecks / totalSlots * 100);
  return { overallPct };
}

function taskWeeklyStreaks(checksByWeek, taskId, currentWeekKey) {
  const active = activeWeekKeys(checksByWeek);
  if (active.length === 0) return { current: 0, longest: 0 };
  const first = active[0];
  const hits = [];
  let wk = first;
  while (wk <= currentWeekKey) {
    hits.push(taskChecksInWeek(checksByWeek, taskId, wk) > 0);
    wk = shiftWeek(wk, 1);
  }
  let longest = 0, run = 0;
  for (const h of hits) {
    if (h) { run++; if (run > longest) longest = run; } else { run = 0; }
  }
  let current = 0;
  let i = hits.length - 1;
  if (i >= 0 && !hits[i]) i--;
  for (; i >= 0; i--) {
    if (hits[i]) current++;
    else break;
  }
  return { current, longest };
}

function taskWeeklySeries(checksByWeek, taskId, currentWeekKey, n = 12) {
  const keys = lastNWeekKeys(currentWeekKey, n);
  return keys.map(wk => ({ weekKey: wk, pct: taskWeekPct(checksByWeek, taskId, wk) }));
}

function heatmapData(state, currentWeekKey, weeks) {
  const startWeek = shiftWeek(currentWeekKey, -(weeks - 1));
  const taskIds = Object.keys(state.tasks);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const wk = shiftWeek(startWeek, w);
    const wkChecks = state.checksByWeek[wk] || {};
    for (let d = 0; d < 7; d++) {
      let count = 0;
      for (const tid of taskIds) if (wkChecks[`${tid}_${d}`]) count++;
      const date = shiftDate(wk, d);
      out.push({ date, count, weekIdx: w, dayIdx: d });
    }
  }
  return out;
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
      checksByWeek: realignChecksByWeek(raw.checksByWeek),
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
    checksByWeek: realignChecksByWeek(checksByWeek),
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

// Hand-rolled drag-and-drop with Pointer Events. Touch uses long-press to pick up;
// mouse picks up immediately from the desktop grip. Body `touch-action: none` is
// the only reliable way to suppress scroll inside an installed PWA on iOS Safari.
function useDragAndDrop({ onDrop, resolveTarget }) {
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const rowsRef = useRef(new Map());
  const longPressTimerRef = useRef(null);
  const justDroppedRef = useRef(0);
  const startPosRef = useRef(null);
  const autoscrollRafRef = useRef(0);
  const autoscrollDirRef = useRef(0);
  const pointerIdRef = useRef(null);
  const capturedElRef = useRef(null);
  const prevBodyTouchActionRef = useRef("");

  const registerRow = (key, el, meta) => {
    if (el) rowsRef.current.set(key, { el, meta });
    else rowsRef.current.delete(key);
  };

  const isJustDropped = () => Date.now() - justDroppedRef.current < 300;

  const stopAutoscroll = () => {
    if (autoscrollRafRef.current) {
      cancelAnimationFrame(autoscrollRafRef.current);
      autoscrollRafRef.current = 0;
    }
    autoscrollDirRef.current = 0;
  };

  const startAutoscroll = (dir) => {
    if (autoscrollDirRef.current === dir) return;
    autoscrollDirRef.current = dir;
    if (autoscrollRafRef.current) cancelAnimationFrame(autoscrollRafRef.current);
    const tick = () => {
      if (autoscrollDirRef.current === 0) return;
      window.scrollBy(0, autoscrollDirRef.current * 8);
      autoscrollRafRef.current = requestAnimationFrame(tick);
    };
    autoscrollRafRef.current = requestAnimationFrame(tick);
  };

  const cleanup = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    stopAutoscroll();
    if (capturedElRef.current && pointerIdRef.current != null) {
      try { capturedElRef.current.releasePointerCapture(pointerIdRef.current); } catch {}
    }
    capturedElRef.current = null;
    pointerIdRef.current = null;
    if (dragRef.current?.active) {
      document.body.style.touchAction = prevBodyTouchActionRef.current;
    }
    dragRef.current = null;
    setDragState(null);
    startPosRef.current = null;
  };

  const beginActive = (clientY) => {
    if (!dragRef.current) return;
    dragRef.current.active = true;
    dragRef.current.startY = clientY;
    dragRef.current.pointerY = clientY;
    prevBodyTouchActionRef.current = document.body.style.touchAction;
    document.body.style.touchAction = "none";
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch {} }
    dragRef.current.indicator = resolveTarget(dragRef.current.kind, dragRef.current.id, clientY, rowsRef.current);
    setDragState({ ...dragRef.current });
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    if (e.pointerId !== pointerIdRef.current) return;
    const clientY = e.clientY;
    if (!dragRef.current.active) {
      const dx = e.clientX - startPosRef.current.x;
      const dy = clientY - startPosRef.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        // Pre-pickup movement → abort (treat as scroll).
        cleanup();
      }
      return;
    }
    e.preventDefault();
    const indicator = resolveTarget(dragRef.current.kind, dragRef.current.id, clientY, rowsRef.current);
    dragRef.current.pointerY = clientY;
    dragRef.current.indicator = indicator;
    setDragState({ ...dragRef.current });

    const vh = window.innerHeight;
    if (clientY < 60) startAutoscroll(-1);
    else if (clientY > vh - 60) startAutoscroll(1);
    else stopAutoscroll();
  };

  const onPointerUp = (e) => {
    if (!dragRef.current) { cleanup(); return; }
    if (e && e.pointerId !== pointerIdRef.current) return;
    if (dragRef.current.active && dragRef.current.indicator) {
      onDrop(dragRef.current.kind, dragRef.current.id, dragRef.current.indicator);
      justDroppedRef.current = Date.now();
    } else if (dragRef.current.active) {
      justDroppedRef.current = Date.now();
    }
    cleanup();
  };

  const onPointerCancel = (e) => {
    if (!dragRef.current) { cleanup(); return; }
    if (e && e.pointerId !== pointerIdRef.current) return;
    if (dragRef.current.active) justDroppedRef.current = Date.now();
    cleanup();
  };

  // mode: "touch-longpress" (only acts on touch, requires 250ms hold) or "immediate" (drags on touchdown — used by the handle on both touch and mouse).
  const startDrag = (kind, id, mode = "immediate") => (e) => {
    if (e.button != null && e.button !== 0) return;
    if (dragRef.current) return;
    const isTouch = e.pointerType === "touch";
    if (mode === "touch-longpress" && !isTouch) return;
    dragRef.current = { kind, id, active: false, pointerY: e.clientY, indicator: null };
    startPosRef.current = { x: e.clientX, y: e.clientY };
    pointerIdRef.current = e.pointerId;
    capturedElRef.current = e.currentTarget;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    if (isTouch) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        if (dragRef.current && !dragRef.current.active) beginActive(startPosRef.current.y);
      }, 250);
    } else {
      beginActive(e.clientY);
    }
  };

  useEffect(() => {
    return () => cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRowRect = (key) => {
    const entry = rowsRef.current.get(key);
    if (!entry?.el) return null;
    const r = entry.el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  };

  return { dragState, startDrag, onPointerMove, onPointerUp, onPointerCancel, registerRow, isJustDropped, getRowRect };
}

function renderKeysFromState(state) {
  const keys = [];
  for (const entry of state.order) {
    if (entry.kind === "group") {
      keys.push(`g-${entry.id}`);
      const g = state.groups[entry.id];
      if (g && !g.collapsed) {
        for (const tid of entry.taskIds) keys.push(`t-${tid}`);
      }
    } else {
      keys.push(`t-${entry.id}`);
    }
  }
  return keys;
}

function computeShiftMap(state, dragState, getRowRect, applyMove) {
  if (!dragState || !dragState.active || !dragState.indicator) return null;
  const next = applyMove(state, { kind: dragState.kind, id: dragState.id, target: dragState.indicator });
  if (next === state) return null;
  const currentKeys = renderKeysFromState(state);
  const newKeys = renderKeysFromState(next);
  const rects = new Map();
  for (const k of currentKeys) {
    const r = getRowRect(k);
    if (r) rects.set(k, r);
  }
  if (currentKeys.length === 0) return null;
  const firstTop = rects.get(currentKeys[0])?.top ?? 0;
  let cursor = firstTop;
  const newTop = new Map();
  for (const k of newKeys) {
    newTop.set(k, cursor);
    cursor += rects.get(k)?.height ?? 50;
  }
  const shifts = new Map();
  const draggedKey = dragState.kind === "task" ? `t-${dragState.id}` : `g-${dragState.id}`;
  for (const k of currentKeys) {
    if (k === draggedKey) continue;
    const oldTop = rects.get(k)?.top;
    const ny = newTop.get(k);
    if (oldTop != null && ny != null) {
      const delta = ny - oldTop;
      if (delta !== 0) shifts.set(k, delta);
    }
  }
  return shifts.size > 0 ? shifts : null;
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
    gridCols: "minmax(0, 1fr) repeat(7, 52px)",
    rowPad: "0 24px",
    titleSize: 24,
    checkSize: 26,
    checkBorder: 2,
    rowHeight: 52,
  } : {
    maxWidth: 440,
    gridCols: "minmax(0, 1fr) repeat(7, 30px)",
    rowPad: "0 12px",
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

  const [view, setView] = useState("grid");
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
    let cancelled = false;
    let pollId = null;
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
    const sync = (quiet) => {
      const p = pinRef.current;
      if (!p || !loadedRef.current) return;
      if (!quiet) setSyncStatus("syncing");
      fetchRemote(p).then(server => {
        if (cancelled) return;
        const migrated = migrate(server);
        const serverVersion = migrated?.version || 0;
        const localVersion = stateRef.current?.version || 0;
        if (migrated && serverVersion > localVersion) {
          setState(migrated);
        } else if (!migrated || localVersion > serverVersion) {
          pushRemote(p, stateRef.current).catch(() => {});
        }
        setSyncStatus("synced");
      }).catch(err => {
        if (cancelled) return;
        if (err.message === "bad_pin") setSyncStatus("bad_pin");
        else if (err.message === "not_configured") setSyncStatus("not_configured");
        else setSyncStatus("offline");
      });
    };
    const startPolling = () => {
      if (pollId != null) return;
      pollId = setInterval(() => sync(true), 5000);
    };
    const stopPolling = () => {
      if (pollId != null) { clearInterval(pollId); pollId = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flush();
        stopPolling();
      } else if (document.visibilityState === "visible") {
        sync(false);
        startPolling();
      }
    };
    if (document.visibilityState === "visible") startPolling();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stopPolling();
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

  // Low-level reducer-style mover. Returns next state with version bumped, or prev on no-op.
  // op = { kind: "task" | "group", id, target }
  // target =
  //   { type: "top", index }
  //   { type: "group-children", groupId, index }   // task only
  //   { type: "into-group", groupId }              // task only (append; auto-expand group)
  const applyMove = (prev, op) => {
    const { kind, id, target } = op;
    if (!target) return prev;

    if (kind === "task") {
      const loc = locateTask(prev.order, id);
      if (!loc) return prev;

      // Strip task from its current location; remember origin so we can detect no-ops.
      let order = prev.order
        .map(e => e.kind === "group" ? { ...e, taskIds: e.taskIds.filter(t => t !== id) } : e)
        .filter(e => !(e.kind === "task" && e.id === id));

      if (target.type === "top") {
        // Translate index from prev.order space to the stripped `order` space.
        let idx = target.index;
        if (loc.container === "top" && loc.topIdx < idx) idx -= 1;
        idx = Math.max(0, Math.min(order.length, idx));
        // No-op detection
        if (loc.container === "top" && loc.topIdx === target.index) return prev;
        if (loc.container === "top" && loc.topIdx + 1 === target.index) return prev;
        order.splice(idx, 0, { kind: "task", id });
        return { ...prev, order, version: bump(prev) };
      }

      if (target.type === "group-children") {
        const g = prev.groups[target.groupId];
        if (!g) return prev;
        const groupIdx = order.findIndex(e => e.kind === "group" && e.id === target.groupId);
        if (groupIdx === -1) return prev;
        let idx = target.index;
        if (loc.container === "group" && loc.groupId === target.groupId && loc.childIdx < idx) idx -= 1;
        const groupEntry = order[groupIdx];
        idx = Math.max(0, Math.min(groupEntry.taskIds.length, idx));
        // No-op detection
        if (loc.container === "group" && loc.groupId === target.groupId && loc.childIdx === target.index) return prev;
        if (loc.container === "group" && loc.groupId === target.groupId && loc.childIdx + 1 === target.index) return prev;
        const newTaskIds = [...groupEntry.taskIds];
        newTaskIds.splice(idx, 0, id);
        order = order.map((e, i) => i === groupIdx ? { ...e, taskIds: newTaskIds } : e);
        let groups = prev.groups;
        if (g.collapsed) {
          groups = { ...groups, [target.groupId]: { ...g, collapsed: false } };
        }
        return { ...prev, order, groups, version: bump(prev) };
      }

      if (target.type === "into-group") {
        const g = prev.groups[target.groupId];
        if (!g) return prev;
        const groupIdx = order.findIndex(e => e.kind === "group" && e.id === target.groupId);
        if (groupIdx === -1) return prev;
        // No-op: already last in this group.
        if (loc.container === "group" && loc.groupId === target.groupId && loc.childIdx === prev.order[loc.topIdx].taskIds.length - 1) return prev;
        order = order.map((e, i) => i === groupIdx ? { ...e, taskIds: [...e.taskIds, id] } : e);
        let groups = prev.groups;
        if (g.collapsed) {
          groups = { ...groups, [target.groupId]: { ...g, collapsed: false } };
        }
        return { ...prev, order, groups, version: bump(prev) };
      }
      return prev;
    }

    if (kind === "group") {
      if (target.type !== "top") return prev;
      const curIdx = prev.order.findIndex(e => e.kind === "group" && e.id === id);
      if (curIdx === -1) return prev;
      const entry = prev.order[curIdx];
      let order = prev.order.filter((_, i) => i !== curIdx);
      let idx = target.index;
      if (curIdx < idx) idx -= 1;
      idx = Math.max(0, Math.min(order.length, idx));
      if (curIdx === target.index || curIdx + 1 === target.index) return prev;
      order.splice(idx, 0, entry);
      return { ...prev, order, version: bump(prev) };
    }

    return prev;
  };

  const moveTask = (taskId, dir) => {
    setState(prev => {
      const loc = locateTask(prev.order, taskId);
      if (!loc) return prev;

      if (loc.container === "top") {
        if (dir === -1) {
          if (loc.topIdx === 0) return prev;
          const above = prev.order[loc.topIdx - 1];
          if (above.kind === "group") {
            return applyMove(prev, { kind: "task", id: taskId, target: { type: "into-group", groupId: above.id } });
          }
          return applyMove(prev, { kind: "task", id: taskId, target: { type: "top", index: loc.topIdx - 1 } });
        } else {
          if (loc.topIdx === prev.order.length - 1) return prev;
          const below = prev.order[loc.topIdx + 1];
          if (below.kind === "group") {
            return applyMove(prev, { kind: "task", id: taskId, target: { type: "group-children", groupId: below.id, index: 0 } });
          }
          return applyMove(prev, { kind: "task", id: taskId, target: { type: "top", index: loc.topIdx + 2 } });
        }
      } else {
        const groupEntry = prev.order[loc.topIdx];
        if (dir === -1) {
          if (loc.childIdx === 0) {
            return applyMove(prev, { kind: "task", id: taskId, target: { type: "top", index: loc.topIdx } });
          }
          return applyMove(prev, { kind: "task", id: taskId, target: { type: "group-children", groupId: loc.groupId, index: loc.childIdx - 1 } });
        } else {
          if (loc.childIdx === groupEntry.taskIds.length - 1) {
            return applyMove(prev, { kind: "task", id: taskId, target: { type: "top", index: loc.topIdx + 1 } });
          }
          return applyMove(prev, { kind: "task", id: taskId, target: { type: "group-children", groupId: loc.groupId, index: loc.childIdx + 2 } });
        }
      }
    });
  };

  const moveTaskToGroup = (taskId, groupId) => {
    setState(prev => {
      const loc = locateTask(prev.order, taskId);
      if (!loc) return prev;
      const currentGroup = loc.container === "group" ? loc.groupId : null;
      if (currentGroup === groupId) return prev;
      if (groupId && prev.groups[groupId]) {
        return applyMove(prev, { kind: "task", id: taskId, target: { type: "into-group", groupId } });
      }
      return applyMove(prev, { kind: "task", id: taskId, target: { type: "top", index: prev.order.length } });
    });
  };

  const resolveDropTarget = (dragKind, dragId, clientY, rowsMap) => {
    // Build an ordered list of rendered rows with rects + meta.
    const rendered = [];
    rowsMap.forEach(({ el, meta }, key) => {
      const rect = el.getBoundingClientRect();
      rendered.push({ key, rect, meta });
    });
    rendered.sort((a, b) => a.rect.top - b.rect.top);
    if (rendered.length === 0) return null;

    if (dragKind === "task") {
      // Check "into-group" first (middle 60% of group header rect).
      for (const r of rendered) {
        if (r.meta.kind !== "group-header") continue;
        const h = r.rect.height;
        const midTop = r.rect.top + h * 0.2;
        const midBot = r.rect.bottom - h * 0.2;
        if (clientY >= midTop && clientY <= midBot) {
          // No-op: dragging a task already last in this group? applyMove handles it.
          return { type: "into-group", groupId: r.meta.groupId };
        }
      }
      // Otherwise: find nearest "between" boundary.
      // Build between-slots in order. Slot meta: { target, boundaryY }
      const slots = [];
      for (let i = 0; i < rendered.length; i++) {
        const r = rendered[i];
        // "before this row"
        const target = beforeRowTaskTarget(r.meta);
        if (target) slots.push({ target, y: r.rect.top });
      }
      // "after last row" — use last-rendered row's bottom
      const last = rendered[rendered.length - 1];
      const lastTarget = afterRowTaskTarget(last.meta, rendered);
      if (lastTarget) slots.push({ target: lastTarget, y: last.rect.bottom });
      // Find slot with closest boundaryY.
      let best = null;
      let bestDist = Infinity;
      for (const s of slots) {
        const d = Math.abs(s.y - clientY);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      if (!best) return null;
      return best.target;
    }

    if (dragKind === "group") {
      // Only "between top-level entries" slots are valid.
      const slots = [];
      for (let i = 0; i < rendered.length; i++) {
        const r = rendered[i];
        if (r.meta.parentGroupId) continue; // skip group children
        slots.push({ target: { type: "top", index: r.meta.indexInOrder }, y: r.rect.top });
      }
      // Slot at end: just past the last top-level rendered entry.
      // Find last top-level row by display order.
      let lastTop = null;
      for (let i = rendered.length - 1; i >= 0; i--) {
        if (!rendered[i].meta.parentGroupId) { lastTop = rendered[i]; break; }
      }
      if (lastTop) slots.push({ target: { type: "top", index: state.order.length }, y: lastTop.rect.bottom });
      let best = null;
      let bestDist = Infinity;
      for (const s of slots) {
        const d = Math.abs(s.y - clientY);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      if (!best) return null;
      return best.target;
    }

    return null;
  };

  // Helpers used by resolveDropTarget. Kept inside App so they can close over `state`.
  function beforeRowTaskTarget(meta) {
    if (meta.parentGroupId) {
      return { type: "group-children", groupId: meta.parentGroupId, index: meta.indexInGroup };
    }
    return { type: "top", index: meta.indexInOrder };
  }
  function afterRowTaskTarget(meta) {
    if (meta.parentGroupId) {
      // After last child in this group → still inside the group (append).
      return { type: "group-children", groupId: meta.parentGroupId, index: meta.indexInGroup + 1 };
    }
    return { type: "top", index: meta.indexInOrder + 1 };
  }

  const dnd = useDragAndDrop({
    resolveTarget: resolveDropTarget,
    onDrop: (kind, id, target) => {
      setState(prev => applyMove(prev, { kind, id, target }));
    },
  });

  const shiftMap = computeShiftMap(state, dnd.dragState, dnd.getRowRect, applyMove);

  const moveGroup = (groupId, dir) => {
    setState(prev => {
      const idx = prev.order.findIndex(e => e.kind === "group" && e.id === groupId);
      if (idx === -1) return prev;
      if (dir === -1 && idx === 0) return prev;
      if (dir === +1 && idx === prev.order.length - 1) return prev;
      const targetIdx = dir === -1 ? idx - 1 : idx + 2;
      return applyMove(prev, { kind: "group", id: groupId, target: { type: "top", index: targetIdx } });
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

  const groupList = state.order.filter(e => e.kind === "group");
  const groupOptions = groupList.map(e => ({ id: e.id, name: state.groups[e.id]?.name || "(untitled)" }));

  const renderTaskRow = (taskId, opts) => {
    const task = state.tasks[taskId];
    if (!task) return null;
    const indented = !!opts?.indented;
    const canMoveUp = opts?.canMoveUp !== false;
    const canMoveDown = opts?.canMoveDown !== false;
    const currentGroupId = opts?.currentGroupId || "";
    const parentGroupId = opts?.parentGroupId || null;
    const indexInOrder = opts?.indexInOrder;
    const indexInGroup = opts?.indexInGroup;
    const rowKey = `t-${taskId}`;
    const meta = { kind: "task-row", parentGroupId, indexInOrder, indexInGroup };
    const isLastTopRow = !!opts?.isLastTopRow;
    const isLastChildInGroup = !!opts?.isLastChildInGroup;
    const isDragging = dnd.dragState?.kind === "task" && dnd.dragState?.id === taskId;
    const ind = dnd.dragState?.indicator;
    const showLineAbove =
      ind && dnd.dragState?.kind === "task" && (
        (ind.type === "top" && !parentGroupId && ind.index === indexInOrder) ||
        (ind.type === "group-children" && parentGroupId && ind.groupId === parentGroupId && ind.index === indexInGroup)
      );
    const showLineBelow = ind && (
      (dnd.dragState?.kind === "task" && (
        (ind.type === "top" && !parentGroupId && isLastTopRow && ind.index === state.order.length) ||
        (ind.type === "group-children" && parentGroupId && ind.groupId === parentGroupId && isLastChildInGroup && ind.index === indexInGroup + 1)
      )) ||
      (dnd.dragState?.kind === "group" && isLastTopRow && ind.type === "top" && ind.index === state.order.length)
    );
    const dragDeltaY = isDragging ? (dnd.dragState.pointerY - dnd.dragState.startY) : 0;

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
      <div
        key={taskId}
        ref={el => dnd.registerRow(rowKey, el, meta)}
        onPointerMove={dnd.onPointerMove}
        onPointerUp={dnd.onPointerUp}
        onPointerCancel={dnd.onPointerCancel}
        style={{
          display: "grid",
          gridTemplateColumns: `32px ${theme.gridCols}`,
          padding: theme.rowPad,
          gap: 2, alignItems: "center", borderTop: "1px solid #f0f0f0",
          touchAction: isDragging ? "none" : "pan-y",
          WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none",
          position: "relative",
          zIndex: isDragging ? 10 : "auto",
          opacity: isDragging ? 0.55 : 1,
          background: isDragging ? "#fff" : undefined,
          boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
          transform: isDragging
            ? `scale(1.01) translateY(${dragDeltaY}px)`
            : (shiftMap?.get(rowKey) ? `translateY(${shiftMap.get(rowKey)}px)` : undefined),
          transition: isDragging ? "none" : (dnd.dragState?.active ? "transform 0.18s ease-out" : undefined),
        }}
      >
        {showLineAbove && (
          <div style={{
            position: "absolute", left: 0, right: 0, top: -1, height: 2,
            background: "#000", pointerEvents: "none", zIndex: 5,
          }} />
        )}
        {showLineBelow && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: -1, height: 2,
            background: "#000", pointerEvents: "none", zIndex: 5,
          }} />
        )}
        <div
          onPointerDown={dnd.startDrag("task", taskId)}
          onClick={e => e.stopPropagation()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "grab", color: "#999", fontSize: 14, lineHeight: 1,
            userSelect: "none", height: theme.rowHeight, width: 32,
            touchAction: "none",
          }}
          aria-label="Drag handle"
        >⋮⋮</div>
        <div
          onClick={(e) => { if (dnd.isJustDropped()) { e.preventDefault(); return; } startEditTask(taskId); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 8px 12px 0",
            paddingLeft: indented ? 20 : 0,
            cursor: "pointer", userSelect: "none",
            minWidth: 0,
          }}
        >
          <span style={{
            fontSize: 15, color: "#111", flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{task.name}</span>
          <span style={{
            fontSize: 11, color: "#999", fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}>{Math.round(DAYS.filter((_, di) => checks[`${taskId}_${di}`]).length / 7 * 100)}%</span>
        </div>
        {DAYS.map((_, di) => {
          const on = !!checks[`${taskId}_${di}`];
          const today = di === todayCol;
          return (
            <div
              key={di}
              onPointerDown={e => e.stopPropagation()}
              onClick={(e) => { if (dnd.isJustDropped()) { e.preventDefault(); return; } toggle(taskId, di); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: theme.rowHeight, cursor: "pointer",
                background: today ? "#ededed" : "transparent",
                touchAction: "manipulation",
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

  const renderGroupHeader = (entry, opts) => {
    const group = state.groups[entry.id];
    if (!group) return null;
    const childCount = entry.taskIds.length;
    const canMoveUp = opts?.canMoveUp !== false;
    const canMoveDown = opts?.canMoveDown !== false;
    const indexInOrder = opts?.indexInOrder;
    const rowKey = `g-${entry.id}`;
    const meta = { kind: "group-header", groupId: entry.id, parentGroupId: null, indexInOrder };
    const isDragging = dnd.dragState?.kind === "group" && dnd.dragState?.id === entry.id;
    const ind = dnd.dragState?.indicator;
    const isIntoTarget =
      ind && dnd.dragState?.kind === "task" && ind.type === "into-group" && ind.groupId === entry.id;
    const showLineAbove =
      ind && (
        (dnd.dragState?.kind === "task" && ind.type === "top" && ind.index === indexInOrder) ||
        (dnd.dragState?.kind === "group" && ind.type === "top" && ind.index === indexInOrder)
      );
    const isLastTopRow = !!opts?.isLastTopRow;
    const showLineBelow =
      ind && isLastTopRow && ind.type === "top" && ind.index === state.order.length;
    const dragDeltaY = isDragging ? (dnd.dragState.pointerY - dnd.dragState.startY) : 0;

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
          <button
            onClick={() => moveGroup(entry.id, -1)}
            disabled={!canMoveUp}
            style={{ ...btnIcon, opacity: canMoveUp ? 1 : 0.35, cursor: canMoveUp ? "pointer" : "default" }}
            aria-label="Move group up"
          >↑</button>
          <button
            onClick={() => moveGroup(entry.id, +1)}
            disabled={!canMoveDown}
            style={{ ...btnIcon, opacity: canMoveDown ? 1 : 0.35, cursor: canMoveDown ? "pointer" : "default" }}
            aria-label="Move group down"
          >↓</button>
          <button onClick={saveEditGroup} style={btnPrimary}>Save</button>
          <button onClick={() => deleteGroup(entry.id)} style={btnDanger}>Delete</button>
        </div>
      );
    }

    return (
      <div
        key={`g-${entry.id}`}
        ref={el => dnd.registerRow(rowKey, el, meta)}
        onPointerMove={dnd.onPointerMove}
        onPointerUp={dnd.onPointerUp}
        onPointerCancel={dnd.onPointerCancel}
        style={{
          display: "flex", alignItems: "center",
          padding: `10px ${wide ? 24 : 16}px 10px ${(wide ? 24 : 16) - 4}px`,
          borderTop: "1px solid #f0f0f0",
          background: isIntoTarget ? "rgba(0,0,0,0.04)" : "#fafafa",
          gap: 8,
          touchAction: isDragging ? "none" : "pan-y",
          WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none",
          position: "relative",
          zIndex: isDragging ? 10 : "auto",
          opacity: isDragging ? 0.55 : 1,
          boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
          transform: isDragging
            ? `scale(1.01) translateY(${dragDeltaY}px)`
            : (shiftMap?.get(rowKey) ? `translateY(${shiftMap.get(rowKey)}px)` : undefined),
          transition: isDragging ? "none" : (dnd.dragState?.active ? "transform 0.18s ease-out" : undefined),
        }}
      >
        {showLineAbove && (
          <div style={{
            position: "absolute", left: 0, right: 0, top: -1, height: 2,
            background: "#000", pointerEvents: "none", zIndex: 5,
          }} />
        )}
        {showLineBelow && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: -1, height: 2,
            background: "#000", pointerEvents: "none", zIndex: 5,
          }} />
        )}
        <div
          onPointerDown={dnd.startDrag("group", entry.id)}
          onClick={e => e.stopPropagation()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "grab", color: "#999", fontSize: 14, lineHeight: 1,
            userSelect: "none", width: 32, minHeight: 40,
            touchAction: "none",
          }}
          aria-label="Drag handle"
        >⋮⋮</div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={(e) => { if (dnd.isJustDropped()) { e.preventDefault(); return; } toggleGroupCollapsed(entry.id); }}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 16, color: "#555", padding: "8px 10px", fontFamily: FONT,
            minWidth: 40, minHeight: 40, textAlign: "center",
            touchAction: "manipulation",
          }}
          aria-label={group.collapsed ? "Expand" : "Collapse"}
        >{group.collapsed ? "▸" : "▾"}</button>
        <div
          onClick={(e) => { if (dnd.isJustDropped()) { e.preventDefault(); return; } startEditGroup(entry.id); }}
          style={{
            flex: 1, fontSize: 14, fontWeight: 600, color: "#333",
            cursor: "pointer", userSelect: "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: 0.2, textTransform: "uppercase",
          }}
        >{group.name}</div>
        {childCount > 0 && (
          <div style={{ fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
            {childCount} task{childCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
    );
  };

  const renderItems = [];
  const lastEntry = state.order[state.order.length - 1];
  const lastIsOpenGroupWithChildren =
    lastEntry && lastEntry.kind === "group" &&
    state.groups[lastEntry.id] && !state.groups[lastEntry.id].collapsed &&
    lastEntry.taskIds.length > 0;
  state.order.forEach((entry, idx) => {
    const isLastTopIdx = idx === state.order.length - 1;
    if (entry.kind === "task") {
      renderItems.push(renderTaskRow(entry.id, {
        indented: false,
        canMoveUp: idx > 0,
        canMoveDown: idx < state.order.length - 1,
        currentGroupId: "",
        parentGroupId: null,
        indexInOrder: idx,
        isLastTopRow: isLastTopIdx,
      }));
    } else if (entry.kind === "group") {
      renderItems.push(renderGroupHeader(entry, {
        canMoveUp: idx > 0,
        canMoveDown: idx < state.order.length - 1,
        indexInOrder: idx,
        isLastTopRow: isLastTopIdx && !lastIsOpenGroupWithChildren,
      }));
      const group = state.groups[entry.id];
      if (group && !group.collapsed) {
        entry.taskIds.forEach((tid, ci) => {
          const isFirstChild = ci === 0;
          const isLastChild = ci === entry.taskIds.length - 1;
          const groupIsFirst = idx === 0;
          const groupIsLast = isLastTopIdx;
          renderItems.push(renderTaskRow(tid, {
            indented: true,
            canMoveUp: !(isFirstChild && groupIsFirst),
            canMoveDown: !(isLastChild && groupIsLast),
            currentGroupId: entry.id,
            parentGroupId: entry.id,
            indexInGroup: ci,
            isLastChildInGroup: isLastChild,
            isLastTopRow: groupIsLast && isLastChild,
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
        {view === "grid" && (<>
        {/* Header */}
        <div style={{ padding: `calc(env(safe-area-inset-top) + 18px) ${wide ? 24 : 16}px 14px` }}>
          <div style={{ fontSize: theme.titleSize, fontWeight: 600, letterSpacing: -0.3 }}>Weekly Tracker</div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 4,
          }}>
            <div style={{ fontSize: 12, color: "#999" }}>
              Week of {formatWeekLabel(weekKey)} · {weekDone}/{weekTotal}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setPinModal(true)} style={{
                fontSize: 11, color: STATUS_COLOR[syncStatus],
                background: "transparent", border: "none", cursor: "pointer",
                padding: "2px 0", fontFamily: FONT, fontWeight: 500,
              }}>
                ● {STATUS_LABEL[syncStatus]}
              </button>
              <button
                onClick={() => setView("stats")}
                aria-label="Stats"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "4px 4px", display: "flex", alignItems: "center",
                  color: "#666",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="10" width="3" height="6" fill="currentColor" />
                  <rect x="7.5" y="6" width="3" height="10" fill="currentColor" />
                  <rect x="13" y="2" width="3" height="14" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Day header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `32px ${theme.gridCols}`,
          padding: theme.rowPad,
          gap: 2, alignItems: "center",
          position: "sticky",
          top: "env(safe-area-inset-top)",
          zIndex: 20,
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}>
          <div />
          <div />
          {DAYS.map((d, di) => {
            const isToday = di === todayCol;
            return (
              <div key={di} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "5px 0",
                background: isToday ? "#ededed" : "transparent",
              }}>
                {isToday ? (
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#000", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>{d}</div>
                ) : (
                  <div style={{
                    fontSize: 11, color: "#aaa", fontWeight: 500, letterSpacing: 0.5,
                  }}>{d}</div>
                )}
              </div>
            );
          })}
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
        </>)}

        {view === "stats" && (
          <StatsScreen
            state={state}
            weekKey={weekKey}
            wide={wide}
            theme={theme}
            onBack={() => setView("grid")}
          />
        )}
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

const HEAT_COLORS = ["#f0f0f0", "#d4d4d4", "#a0a0a0", "#555", "#000"];

function heatBucket(count, totalTasks) {
  if (count <= 0 || totalTasks <= 0) return 0;
  const r = count / totalTasks;
  if (r >= 1) return 4;
  if (r >= 0.66) return 3;
  if (r >= 0.33) return 2;
  return 1;
}

function Heatmap({ weeks, state, currentWeekKey, wide }) {
  const data = heatmapData(state, currentWeekKey, weeks);
  const totalTasks = Object.keys(state.tasks).length || 1;
  const cell = wide ? 12 : 9;
  const gap = 2;
  const leftPad = 14;
  const topPad = 14;
  const width = leftPad + weeks * (cell + gap);
  const height = topPad + 7 * (cell + gap);

  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const wk = shiftWeek(currentWeekKey, -(weeks - 1 - w));
    const d = new Date(wk + "T00:00:00Z");
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({ w, label: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
      lastMonth = m;
    }
  }

  const dayLabels = [
    { i: 0, t: "M" },
    { i: 2, t: "W" },
    { i: 4, t: "F" },
  ];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }} role="img" aria-label="Daily activity heatmap">
        {monthLabels.map(m => (
          <text
            key={m.w}
            x={leftPad + m.w * (cell + gap)}
            y={10}
            fontSize={9}
            fill="#999"
            fontFamily={FONT}
          >{m.label}</text>
        ))}
        {dayLabels.map(dl => (
          <text
            key={dl.i}
            x={0}
            y={topPad + dl.i * (cell + gap) + cell - 1}
            fontSize={9}
            fill="#999"
            fontFamily={FONT}
          >{dl.t}</text>
        ))}
        {data.map(d => {
          const b = heatBucket(d.count, totalTasks);
          return (
            <rect
              key={`${d.weekIdx}_${d.dayIdx}`}
              x={leftPad + d.weekIdx * (cell + gap)}
              y={topPad + d.dayIdx * (cell + gap)}
              width={cell}
              height={cell}
              rx={1.5}
              fill={HEAT_COLORS[b]}
            >
              <title>{`${d.date} · ${d.count}/${totalTasks}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function WeeklyBarChart({ series }) {
  const height = 48;
  const barW = 10;
  const gap = 3;
  const width = series.length * (barW + gap);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: "block" }}
      role="img"
      aria-label="Last 12 weeks"
    >
      {series.map((s, i) => {
        const x = i * (barW + gap);
        const h = Math.max(1, Math.round((s.pct / 100) * height));
        const isLast = i === series.length - 1;
        return (
          <g key={s.weekKey}>
            <rect x={x} y={0} width={barW} height={height} fill="#f0f0f0" rx={1.5} />
            <rect
              x={x}
              y={height - h}
              width={barW}
              height={h}
              fill={isLast ? "#000" : "#333"}
              rx={1.5}
            >
              <title>{`${s.weekKey} · ${s.pct}%`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function TaskCard({ task, stats, theme }) {
  return (
    <div style={{
      background: "#fff",
      borderTop: "1px solid #f0f0f0",
      padding: theme.rowPad,
      paddingTop: 12,
      paddingBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: 15, color: "#111", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{task.name}</span>
        <span style={{ fontSize: 11, color: "#999", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {stats.allTime.overallPct}%
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        This week {stats.thisWeekChecks}/7 · 4w {stats.pct4}% · 12w {stats.pct12}%
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        Streak {stats.streak.current}w · Best {stats.streak.longest}w
      </div>
      <div style={{ marginTop: 8 }}>
        <WeeklyBarChart series={stats.series} />
      </div>
    </div>
  );
}

function StatsScreen({ state, weekKey, wide, theme, onBack }) {
  const activeKeys = activeWeekKeys(state.checksByWeek);
  const taskCount = Object.keys(state.tasks).length;
  const weeksCount = activeKeys.length;
  const last4 = lastNWeekKeys(weekKey, 4);
  const last12 = lastNWeekKeys(weekKey, 12);

  const renderEntries = [];
  state.order.forEach((entry) => {
    if (entry.kind === "group") {
      const g = state.groups[entry.id];
      if (!g) return;
      renderEntries.push({ kind: "group", id: entry.id, name: g.name });
      for (const tid of entry.taskIds) {
        if (state.tasks[tid]) renderEntries.push({ kind: "task", id: tid });
      }
    } else if (entry.kind === "task") {
      if (state.tasks[entry.id]) renderEntries.push({ kind: "task", id: entry.id });
    }
  });

  const taskStats = (tid) => ({
    thisWeekChecks: taskChecksInWeek(state.checksByWeek, tid, weekKey),
    pct4: taskWindowPct(state.checksByWeek, tid, last4),
    pct12: taskWindowPct(state.checksByWeek, tid, last12),
    allTime: taskAllTimeStats(state.checksByWeek, tid, weekKey),
    streak: taskWeeklyStreaks(state.checksByWeek, tid, weekKey),
    series: taskWeeklySeries(state.checksByWeek, tid, weekKey, 12),
  });

  return (
    <>
      <div style={{ padding: `calc(env(safe-area-inset-top) + 18px) ${wide ? 24 : 16}px 14px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: 4, display: "flex", alignItems: "center", color: "#444",
              marginLeft: -4,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ fontSize: theme.titleSize, fontWeight: 600, letterSpacing: -0.3 }}>Stats</div>
        </div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
          Across {weeksCount} week{weeksCount === 1 ? "" : "s"} · {taskCount} task{taskCount === 1 ? "" : "s"}
        </div>
      </div>

      <div style={{ padding: `4px ${wide ? 24 : 16}px 18px`, borderTop: "1px solid #f0f0f0" }}>
        <div style={{
          fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: 0.5,
          margin: "12px 0 10px",
        }}>
          Daily activity · last 6 months
        </div>
        <Heatmap weeks={26} state={state} currentWeekKey={weekKey} wide={wide} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: 0.5,
          padding: `14px ${wide ? 24 : 16}px 8px`, borderTop: "1px solid #f0f0f0",
        }}>
          Tasks
        </div>
        {renderEntries.length === 0 && (
          <div style={{ padding: theme.rowPad, paddingTop: 16, paddingBottom: 16, fontSize: 13, color: "#999" }}>
            No tasks yet.
          </div>
        )}
        {renderEntries.map((e) => {
          if (e.kind === "group") {
            return (
              <div
                key={`g-${e.id}`}
                style={{
                  padding: `10px ${wide ? 24 : 16}px`,
                  borderTop: "1px solid #f0f0f0",
                  background: "#fafafa",
                  fontSize: 14, fontWeight: 600, color: "#333",
                  letterSpacing: 0.2, textTransform: "uppercase",
                }}
              >{e.name}</div>
            );
          }
          const t = state.tasks[e.id];
          if (!t) return null;
          return (
            <TaskCard
              key={`t-${e.id}`}
              task={t}
              stats={taskStats(e.id)}
              theme={theme}
            />
          );
        })}
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
