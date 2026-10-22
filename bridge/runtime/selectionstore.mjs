/**
 * selectionstore.mjs —— 「Blender 原生选中 → DSH」事件存储（v2.3）。
 *
 * 为什么需要它：v2.3 起"选中"从 DSH 面板点截图迁到 **Blender N 面板**：
 * 用户在 Blender 原生选区里选好物体 → 点「发送选中到 DSH」→ addon `POST /host/selection`
 * → Web/TUI 的客户端半边轮询 `/host/selection/latest` → 把对象名插入**当前会话草稿**
 * （不自动发送）→ `POST /host/selection/consume` 标记已消费。
 *
 * 唯一真源：`docs/宿主集成-接口契约-v2.3增补.md` §S1–§S3。
 *
 * 纪律：
 *   · 纯内存、零 I/O、零 Blender 往返（addon 自己 POST 过来；轮询方绝不碰 Blender）。
 *   · payload 在入口**消毒**（长度 / 条数上限），不让任意字符串把面板或回执撑爆。
 *   · `consume` 只增不减；同一份选中最多被插入一次（多标签页竞争的最坏结果是重复插入，服务端不撒谎）。
 */

/** 名字条数上限（选择全部 4000 对象时也不让 payload 失控）。 */
export const MAX_SELECTION_NAMES = 200;
/** 对象明细条数上限（名字之外的那份）。 */
export const MAX_SELECTION_OBJECTS = 50;
/** 「选中涉及哪些集合」摘要条数上限。 */
export const MAX_SELECTION_COLLECTIONS = 50;
/** 单个字符串上限。 */
export const MAX_STRING_CHARS = 200;
/** 子元素（编辑模式）索引/骨骼条数上限。 */
export const MAX_SUB_INDICES = 2000;
export const MAX_SUB_BONES = 500;
export const MAX_SUB_POINTS = 2000;
/** 子元素类型白名单（其他类型只保留 note，不猜测语义）。 */
const SUB_TYPES = new Set(['MESH', 'ARMATURE', 'CURVE', 'LATTICE', 'OTHER']);
/** 未消费的选中超过这个年龄只做提示，不阻止消费。 */
export const STALE_MS = 10 * 60 * 1000;

function cleanString(value, max = MAX_STRING_CHARS) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function cleanNames(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const name = cleanString(item);
    if (name === null || name.length === 0) continue;
    out.push(name);
    if (out.length >= MAX_SELECTION_NAMES) break;
  }
  return out;
}

function cleanIntList(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const n = Number(item);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) continue;
    out.push(Math.trunc(n));
    if (out.length >= max) break;
  }
  return out;
}

function cleanCounts(value) {
  const src = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const out = {};
  for (const key of ['vertices', 'edges', 'faces', 'bones', 'points']) {
    const n = Number(src[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.trunc(n);
  }
  return out;
}

/**
 * 消毒 v2.4 的子元素选择（编辑模式点线面 / 骨骼 / 曲线点 / 晶格点）。
 * 保留数组但夹上限；类型不在白名单时只留 note。
 * @param {any} sub addon 的 selection.sub
 * @returns {object|null}
 */
export function sanitizeSubSelection(sub) {
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return null;
  const type = typeof sub.type === 'string' && SUB_TYPES.has(sub.type) ? sub.type : 'OTHER';
  const object = cleanString(sub.object);
  if (!object) return null;
  const out = {
    type: type,
    object: object,
    mode: cleanString(sub.mode, 40) || null,
    counts: cleanCounts(sub.counts),
    truncated: sub.truncated === true,
  };
  const note = cleanString(sub.note, 200);
  if (note) out.note = note;

  if (sub.select_mode && typeof sub.select_mode === 'object' && !Array.isArray(sub.select_mode)) {
    out.select_mode = {
      vertex: sub.select_mode.vertex === true,
      edge: sub.select_mode.edge === true,
      face: sub.select_mode.face === true,
    };
  }
  if (sub.indices && typeof sub.indices === 'object' && !Array.isArray(sub.indices)) {
    const idx = {};
    for (const key of ['vertices', 'edges', 'faces']) {
      const raw = sub.indices[key];
      if (!Array.isArray(raw)) continue;
      idx[key] = cleanIntList(raw, MAX_SUB_INDICES);
      if (raw.length > idx[key].length) out.truncated = true;
    }
    out.indices = idx;
  }
  if (Array.isArray(sub.bones)) {
    const bones = [];
    for (const item of sub.bones) {
      const name = cleanString(item);
      if (!name) continue;
      bones.push(name);
      if (bones.length >= MAX_SUB_BONES) { out.truncated = true; break; }
    }
    out.bones = bones;
    if (sub.bones.length > bones.length) out.truncated = true;
  }
  if (Array.isArray(sub.points)) {
    const points = [];
    for (const item of sub.points) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const a = Number(item[0]);
      const b = Number(item[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      points.push([Math.trunc(a), Math.trunc(b)]);
      if (points.length >= MAX_SUB_POINTS) { out.truncated = true; break; }
    }
    out.points = points;
    if (sub.points.length > points.length) out.truncated = true;
  }
  return out;
}

/**
 * 消毒 addon 推来的 payload。保留字段名（客户端文本生成依赖它们），超出部分丢弃。
 * @param {any} payload addon 的 JSON body
 * @returns {object} 可存储的规范化 payload
 */
export function sanitizeSelectionPayload(payload) {
  const src = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
  const sel = (src.selection && typeof src.selection === 'object' && !Array.isArray(src.selection)) ? src.selection : {};
  const rawNameCount = Array.isArray(sel.names) ? sel.names.length : 0;
  const names = cleanNames(sel.names);
  const rawCount = Number(sel.count);
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : rawNameCount;
  const objects = [];
  if (Array.isArray(sel.objects)) {
    for (const item of sel.objects) {
      if (objects.length >= MAX_SELECTION_OBJECTS) break;
      if (!item || typeof item !== 'object') continue;
      const name = cleanString(item.name);
      if (name === null || name.length === 0) continue;
      const entry = { name: name, type: cleanString(item.type, 32) || 'UNKNOWN' };
      if (Array.isArray(item.dimensions_mm) && item.dimensions_mm.length === 3) {
        const dims = item.dimensions_mm.map((v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null));
        if (dims.every((v) => v !== null)) entry.dimensions_mm = dims;
      }
      objects.push(entry);
    }
  }
  const scene = (src.scene && typeof src.scene === 'object' && !Array.isArray(src.scene)) ? src.scene : {};
  const activity = (src.activity && typeof src.activity === 'object' && !Array.isArray(src.activity)) ? src.activity : null;
  // v2.3：kind=objects（发选中对象）| collection（发整个集合，大装配体用）
  const kind = sel.kind === 'collection' ? 'collection' : 'objects';
  const collections = [];
  if (Array.isArray(sel.collections)) {
    for (const item of sel.collections) {
      if (collections.length >= MAX_SELECTION_COLLECTIONS) break;
      if (!item || typeof item !== 'object') continue;
      const name = cleanString(item.name);
      if (name === null || name.length === 0) continue;
      const memberCount = Number(item.count);
      collections.push({ name: name, count: Number.isFinite(memberCount) ? Math.max(0, Math.trunc(memberCount)) : 0 });
    }
  }
  return {
    v: 1,
    source: cleanString(src.source, 40) || 'unknown',
    sent_at: Number.isFinite(Number(src.sent_at)) ? Math.trunc(Number(src.sent_at)) : null,
    selection: {
      kind: kind,
      collection: cleanString(sel.collection),
      count: count,
      names: names,
      truncated: sel.truncated === true || count > names.length || rawNameCount > names.length,
      active: cleanString(sel.active),
      mode: cleanString(sel.mode, 40),
      objects: objects,
      collections: collections,
      sub: sanitizeSubSelection(sel.sub),
    },
    scene: { name: cleanString(scene.name), file: cleanString(scene.file) },
    activity: activity === null ? null : {
      state: cleanString(activity.state, 20),
      human_active: activity.human_active === true,
      agent_active: activity.agent_active === true,
    },
  };
}

/**
 * 建一个选择事件存储（纯内存；`now` 可注入，便于单测）。
 * @param {() => number} [now] 时钟（毫秒）
 */
export function createSelectionStore(now = () => Date.now()) {
  let seq = 0;
  let latest = null;
  let consumedSeq = 0;
  let lastConsume = null;

  /**
   * 收一份 addon 推送的选中。
   * @param {any} payload 原始 JSON body
   * @returns {{ok: true, seq: number, received_at: number} | {ok: false, error: string}}
   */
  function put(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'invalid_payload' };
    }
    const sanitized = sanitizeSelectionPayload(payload);
    // 空选中也接收（用户可能先清空再发；由客户端决定是否插入文本），但必须是"一个对象"。
    seq += 1;
    latest = { seq: seq, received_at: now(), payload: sanitized };
    return { ok: true, seq: latest.seq, received_at: latest.received_at };
  }

  /**
   * 当前态：未消费时才有 payload（避免面板重载后把旧选中重复插入）。
   * @returns {{ok: true, seq: number, consumed_seq: number, unconsumed: boolean,
   *            received_at: number|null, stale_ms: number|null, selection: object|null,
   *            activity: object|null, scene: object|null,
   *            last_consume: {seq:number, ok:boolean|null, how:string|null, reason:string|null, at:number}|null}}
   */
  function snapshot() {
    const unconsumed = latest !== null && latest.seq > consumedSeq;
    const receivedAt = latest === null ? null : latest.received_at;
    return {
      ok: true,
      seq: previousSeq(),
      consumed_seq: consumedSeq,
      unconsumed: unconsumed,
      received_at: receivedAt,
      stale_ms: receivedAt === null ? null : Math.max(0, now() - receivedAt),
      selection: unconsumed ? latest.payload.selection : null,
      activity: unconsumed ? latest.payload.activity : null,
      scene: unconsumed ? latest.payload.scene : null,
      last_consume: lastConsume,
    };
  }

  /**
   * 标记"已经插入草稿"。只接受 1..当前 seq 的整数；非法值原样返回当前态（幂等）。
   * `meta` 是客户端的插入结果（`{ok, how, reason}`），仅用于诊断（"按钮点了但草稿没字"）；
   * 不传也合法（老客户端 / curl）。
   * @param {any} value 客户端回传的 seq
   * @param {{ok?: boolean, how?: string, reason?: string}} [meta]
   * @returns {{ok: boolean, consumed_seq: number, error?: string}}
   */
  function consume(value, meta) {
    const target = Number(value);
    if (!Number.isInteger(target) || target < 1 || target > seq) {
      return { ok: false, consumed_seq: consumedSeq, error: 'invalid_seq' };
    }
    if (target > consumedSeq) consumedSeq = target;
    const m = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {};
    lastConsume = {
      seq: target,
      ok: typeof m.ok === 'boolean' ? m.ok : null,
      how: cleanString(m.how, 40),
      reason: cleanString(m.reason, 200),
      at: now(),
    };
    return { ok: true, consumed_seq: consumedSeq };
  }

  function previousSeq() {
    return latest === null ? 0 : latest.seq;
  }

  return { put: put, snapshot: snapshot, consume: consume, currentSeq: previousSeq, consumedSeq: () => consumedSeq };
}
