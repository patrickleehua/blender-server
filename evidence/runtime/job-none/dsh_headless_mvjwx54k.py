# ---- DSH env prelude（子进程内可见；绕开 WSL interop 的 env 过滤）----
try:
    import os as _os_pre, json as _json_pre, time as _time_pre
    _os_pre.environ.update({"DSH_RUN_ID":"run-mvjwx54jkjq","DSH_OUTDIR":"E:\\workplace\\blender-server\\evidence\\runtime\\job-none","DSH_SESSION":"plugin-pid-44728","DSH_PLUGIN_VERSION":"1.0.0","DSH_ARGS":"[]"})
    def _dsh_stage_emit(name, **extra):
        _d = {"name": str(name), "t": round(_time_pre.time(), 3), "run": _os_pre.environ.get("DSH_RUN_ID")}
        _d.update({str(k): v for k, v in extra.items()})
        print("DSH_STAGE " + _json_pre.dumps(_d, ensure_ascii=False), flush=True)
except Exception:
    def _dsh_stage_emit(name, **extra):
        pass
try:
    def _dsh_progress_emit(**fields):
        _dp = {"t": round(_time_pre.time(), 3), "run": _os_pre.environ.get("DSH_RUN_ID")}
        _dp.update({str(k): v for k, v in fields.items()})
        print("DSH_PROGRESS " + _json_pre.dumps(_dp, ensure_ascii=False), flush=True)
        return _dp
except Exception:
    def _dsh_progress_emit(**fields):
        pass
dsh_progress = _dsh_progress_emit
dsh_stage = _dsh_stage_emit
_dsh_stage_emit("boot")
import sys as _sys, types as _types
K = _sys.modules.get("dsh_rt_kernel")
if K is None:
    K = _types.ModuleType("dsh_rt_kernel")
    _sys.modules["dsh_rt_kernel"] = K
if not hasattr(K, "__getattr__"):
    def _dsh_kernel_getattr(_name, _K=K):
        if _name.startswith("dsh_") and _name.endswith("_api"):
            _have = sorted(_k[4:-4] for _k in dir(_K)
                           if _k.startswith("dsh_") and _k.endswith("_api"))
            _base = _name[4:-4]
            raise AttributeError(
                "内核里没有 %s —— 模块 %r 没被加载。已加载：%s。"
                "headless 用 preload=%r 带上它；或 K.dsh_kit.kapi(%r) 查/取。"
                % (_name, _base, _have or "（只有 kit）", _base, _base))
        raise AttributeError(_name)
    K.__getattr__ = _dsh_kernel_getattr
import bpy, math, mathutils
def _dsh_light_hygiene(apply=False, max_shadow=4):
    import json as _j, bpy as _b
    lights = [o for o in _b.data.objects if o.type == "LIGHT"]
    rows = [{"name": o.name, "type": o.data.type, "energy": round(float(o.data.energy), 3), "shadow": bool(o.data.use_shadow)} for o in lights]
    res = {"lights": len(rows), "shadow_casters_before": sum(1 for r in rows if r["shadow"]), "by_type": {}, "max_shadow": int(max_shadow)}
    for r in rows:
        res["by_type"][r["type"]] = res["by_type"].get(r["type"], 0) + 1
    pool = None
    try:
        pool = str(_b.context.scene.eevee.shadow_pool_size)
    except Exception:
        pass
    res["shadow_pool_size"] = pool
    if apply:
        keep = 0
        for o in sorted(lights, key=lambda x: -float(x.data.energy)):
            if o.data.type in {"POINT", "SPOT"}:
                if keep < int(max_shadow):
                    keep += 1
                else:
                    o.data.use_shadow = False
        try:
            _b.context.scene.eevee.shadow_pool_size = "2048"
        except Exception:
            pass
        res["shadow_casters_after"] = sum(1 for o in lights if o.data.use_shadow)
        res["shadow_pool_size"] = getattr(_b.context.scene.eevee, "shadow_pool_size", pool)
    res["hint"] = "EEVEE 阴影池上限 2048 MB（枚举，写 4096 无效）。亮灯多的场景请 apply=True：只保留能量最高的 max_shadow 盏点/聚光灯投影，其余 use_shadow=False。"
    print("LIGHT_HYGIENE " + _j.dumps(res, ensure_ascii=False))
    return res
K.light_hygiene = _dsh_light_hygiene
def _dsh_route_collections(rules=None, apply=True):
    import json as _j, bpy as _b
    DEFAULT = [("LGT-", "COL_Lights"), ("LIGHT-", "COL_Lights"), ("CAM-", "COL_Camera"),
               ("GEO-VFX-", "COL_VFX"), ("GEO-CITY-", "COL_City"), ("GEO-GZ-", "COL_Godzilla")]
    rules = rules or DEFAULT
    moved = []
    for ob in list(_b.data.objects):
        for pref, cname in rules:
            if ob.name.startswith(pref):
                coll = _b.data.collections.get(cname) or _b.data.collections.new(cname)
                if coll.name not in [c.name for c in ob.users_collection]:
                    for c in list(ob.users_collection):
                        c.objects.unlink(ob)
                    coll.objects.link(ob)
                    moved.append({"object": ob.name, "collection": coll.name})
                break
    res = {"moved": moved, "count": len(moved), "rules": [list(r) for r in rules]}
    print("ROUTE_COLLECTIONS " + _j.dumps(res, ensure_ascii=False))
    return res
K.route_collections = _dsh_route_collections
Vector = mathutils.Vector
# ---- 路径辅助（v0.7.0）：GUI 与无头两侧都能用，省掉手拼 UNC 与 chr(92)
def _dsh_slashes(p):
    # macOS / Linux 用正斜杠；只有 Windows 才需要反转
    if False: return str(p)
    return str(p).replace("/", chr(92))
def _dsh_blend_path(p):
    """相对路径 → 相对当前 .blend 的绝对路径（Windows 形式）"""
    import os as _os
    s = str(p).strip()
    fp = bpy.data.filepath
    base = _os.path.dirname(_dsh_slashes(fp)) if fp else ""
    if s.startswith("//"): s = s[2:]
    if s.startswith("./"): s = s[2:]
    if not s or s == ".": return base
    if _os.path.isabs(s) or (len(s) > 1 and s[1] == ":"): return _dsh_slashes(s)
    return _dsh_slashes(_os.path.join(base, s)) if base else s
def _dsh_win_path(p):
    """任何路径 → Blender 进程侧可用形式（/mnt/d/x → D:/x；WSL 内部 → UNC；macOS/Linux 原生 → 原样）"""
    if False: return _dsh_blend_path(p)
    s = str(p).strip(); b = chr(92)
    if len(s) > 1 and s[1] == ":": return _dsh_slashes(s)
    if s.startswith("/mnt/") and len(s) > 6: return s[5].upper() + ":" + b + s[7:].replace("/", b)
    if s.startswith(b + b + "wsl"): return _dsh_slashes(s)
    # v0.8.4：正斜杠 UNC（//wsl.localhost/…）在 Blender 里会被当成「相对 .blend」而读不到 → 归一化
    if s.startswith("//wsl") or s.startswith("//WSL"): return b + _dsh_slashes(s[1:])
    if s.startswith("//") or s.startswith("./") or (s and not s.startswith("/")): return _dsh_blend_path(s)
    if s.startswith("/"): return b + b + "wsl.localhost" + b + "Ubuntu" + s.replace("/", b)
    return s
def _dsh_wsl_path(p):
    """Windows / UNC 路径 → WSL 侧可用形式（D:/x → /mnt/d/x；UNC → /...）；原生 POSIX 原样返回"""
    if False: return _dsh_blend_path(p)
    s = str(p).strip(); b = chr(92)
    if len(s) > 1 and s[1] == ":": return "/mnt/" + s[0].lower() + "/" + s[2:].replace(b, "/").lstrip("/")
    if s.startswith(b + b + "wsl.localhost" + b):
        parts = s.split(b, 4)
        return "/" + (parts[4].replace(b, "/") if len(parts) > 4 else "")
    if s.startswith("/mnt/"): return s
    if s.startswith("//") or s.startswith("./") or (s and not s.startswith("/")): return _dsh_win_path(s)
    return s
def _dsh_run(path, reload_modules=True):
    """跑一个 .py 文件（WSL / Windows / 相对 .blend 三种路径都收）；可选重载同目录模块"""
    import os as _os
    p = _dsh_win_path(path)
    if not _os.path.isfile(p):
        alt = _dsh_wsl_path(p)
        if _os.path.isfile(alt): p = alt
        else: raise FileNotFoundError("找不到脚本: %s（也试过 %s）" % (path, alt))
    if reload_modules:
        import importlib as _il, sys as _sy
        d = _os.path.dirname(_os.path.abspath(p))
        _il.invalidate_caches()
        if d not in _sy.path: _sy.path.insert(0, d)
        for _n, _m in list(_sy.modules.items()):
            _f = getattr(_m, "__file__", None)
            if _f and _os.path.dirname(_os.path.abspath(_f)) == d:
                try: _il.reload(_m)
                except Exception: pass
    _g = globals(); _g["__file__"] = p
    with open(p, encoding="utf-8") as _fh: _src = _fh.read()
    exec(compile(_src, p, "exec"), _g)
    return p
def _dsh_stage(path, sub="stage"):
    """把文件复制到 Blender 一定读得到的本地路径（UNC/中文路径兜底）。返回 {ok, src, staged, bytes, reason}。"""
    import os as _os, shutil as _sh
    src = _dsh_win_path(path)
    info = {"src": src, "staged": src}
    if not _os.path.isfile(src):
        info["ok"] = False; info["reason"] = "源文件不存在"; return info
    try:
        if src.startswith(chr(92) * 2):
            base = str(getattr(K, "out_dir", "") or "")
            d = _os.path.join(base, str(sub))
            _os.makedirs(d, exist_ok=True)
            dst = _os.path.join(d, _os.path.basename(src))
            _sh.copyfile(src, dst)
            info["staged"] = dst; info["bytes"] = _os.path.getsize(dst); info["was_unc"] = True
    except Exception as _e:
        info["ok"] = False; info["reason"] = str(_e)[:120]; return info
    info["ok"] = True; return info
def _dsh_reload_modules(prefixes=None, root=None):
    """热重载：清掉指定前缀/目录下的用户模块（热会话里普通 import 会命中 sys.modules 旧代码）。"""
    import sys as _sys, importlib as _il, os as _os
    _il.invalidate_caches()
    pre = [str(p) for p in (prefixes or []) if str(p)]
    root_abs = _os.path.abspath(root) if root else None
    purged = []
    for _n, _m in list(_sys.modules.items()):
        _f = getattr(_m, "__file__", None)
        _hit = bool(pre) and any(_n == p or _n.startswith(p + ".") for p in pre)
        if not _hit and root_abs and _f:
            try:
                _hit = _os.path.abspath(_f).startswith(root_abs)
            except Exception:
                _hit = False
        if _hit and not _n.startswith("bpy"):
            _sys.modules.pop(_n, None); purged.append(_n)
    return {"purged": purged, "count": len(purged), "prefixes": pre, "root": root_abs}
def _dsh_stage_emit(name, **extra):
    """v0.9.3（D5）：阶段心跳 —— print("DSH_STAGE {单行 JSON}") 且 flush=True。
    插件侧在 blender_rt_job(op="status").stage / stdout 日志里读最后一条。
    用法：dsh_stage("building") / K.progress("render", i=3, total=12)。"""
    import json as _stj, time as _stt, os as _sto
    _d = {"name": str(name), "t": round(_stt.time(), 3), "run": _sto.environ.get("DSH_RUN_ID")}
    _d.update({str(k): v for k, v in extra.items()})
    print("DSH_STAGE " + _stj.dumps(_d, ensure_ascii=False), flush=True)
dsh_stage = _dsh_stage_emit
K.dsh_distro = "Ubuntu"
K.win_path = _dsh_win_path
K.wsl_path = _dsh_wsl_path
K.blend_path = _dsh_blend_path
K.run = _dsh_run
K.stage = _dsh_stage
K.progress = _dsh_stage_emit
K.reload_modules = _dsh_reload_modules
K.out_dir = "E:\\workplace\\blender-server\\evidence\\runtime\\job-none"
# v0.8.8：runtime 目录也注入（qc.py 据此现场加载同目录模块，如 qc_render.py）
K.runtime_dir = "E:\\workplace\\blender-server\\bridge\\runtime"
K.workdir = K.out_dir
try:
    import os as _os_env, json as _json_env
    K.env = _os_env.environ
    K.run_id = _os_env.environ.get("DSH_RUN_ID")
    K.session = _os_env.environ.get("DSH_SESSION")
    K.outdir_env = _os_env.environ.get("DSH_OUTDIR")
    K.args = _json_env.loads(_os_env.environ.get("DSH_ARGS") or "[]")
except Exception:
    K.env = {}; K.args = []; K.run_id = None; K.session = None; K.outdir_env = None
# v0.8.7：路径常量也注入脚本命名空间（独立模块 + exec(open()) 写法同样可用）
DSH_OUT = K.out_dir
DSH_WIN = _dsh_win_path
DSH_WSL = _dsh_wsl_path
# ---- 共享内核 kit（唯一实现）：**按需执行** ----
# 实测：kit 10.7KB，每次 execute_code 都 exec 一遍要 8.4ms（= 往返 163ms 的 5%）。
# 改成条件执行：K 上已有 dsh_kit 就跳过（持久内核下只在第一次真跑）。
# 传输量不变（本地 socket 可忽略），换来零风险：任何路径都保证 kit 在。
if getattr(K, "dsh_kit", None) is None:
    # -*- coding: utf-8 -*-
    """DSH 共享内核（kit）—— **唯一实现**：JSON/API 样板、单位、几何、度量、回执骨架。
    
    为什么存在：此前 26 个模块各自复制了 `class _DshApi` / `def _j` / dispatch / 单位换算 / BVH / IoU，
    同一套管道代码 ~800-1500 行，且约定会在复制中漂移（contract.py 与 deliver.py 各自踩过同一个 dict-vs-Api 坑）。
    
    怎么用：kit 由 KERNEL_BOOTSTRAP 注入（注册为 K.dsh_kit），所以**每条注入路径都有它**：
        K = sys.modules.get("dsh_rt_kernel")
        _KIT = getattr(K, "dsh_kit", None)          # None 时说明没走 bootstrap（自建脚本要自己兜）
        _j = _KIT.j ; Api = _KIT.Api ; dispatch = _KIT.dispatch ; units = _KIT.units
    
    约定：kit 只放"**每个模块都要写一遍**"的东西；领域逻辑一律留在各模块。
    """
    import json
    import sys
    import types
    
    KIT_VERSION = 1
    
    
    def _kernel():
        K = sys.modules.get("dsh_rt_kernel")
        if K is None:
            K = types.ModuleType("dsh_rt_kernel")
            sys.modules["dsh_rt_kernel"] = K
        return K
    
    
    # ────────────────────────────── JSON / 回执 ──────────────────────────────
    def j(obj):
        """统一 JSON 序列化（中文不转义；非 JSON 类型退化为 str）。"""
        return json.dumps(obj, ensure_ascii=False, default=str)
    
    
    def err(msg, **kw):
        """统一错误回执。"""
        d = {"ok": False, "error": str(msg)[:300]}
        d.update(kw)
        return j(d)
    
    
    def receipt(ok=None, state=None, verdict=None, **kw):
        """统一回执骨架：ok / state / verdict / units 四件套 + 任意附加字段。
    
        state 与 verdict 的关系（与 gate v3 一致）：state 用于"这一项成没成"，verdict 用于三态判定；
        调用方给哪个就带哪个，不给就不编。
        """
        d = {}
        if ok is not None:
            d["ok"] = bool(ok)
        if state is not None:
            d["state"] = state
        if verdict is not None:
            d["verdict"] = verdict
        d["units"] = {"mm_per_unit": units()}
        d.update(kw)
        return d
    
    
    # ────────────────────────────── 单位 ──────────────────────────────
    def units():
        """mm_per_unit = scene.unit_settings.scale_length * 1000（Blender 默认 1 单位 = 1 m ⇒ 1000）。"""
        try:
            import bpy
            return float(bpy.context.scene.unit_settings.scale_length or 1.0) * 1000.0
        except Exception:
            return 1000.0
    
    
    def mm(v):
        """Blender 单位 → 毫米。"""
        return float(v) * units()
    
    
    # ────────────────────────────── 跨模块 API ──────────────────────────────
    def api(name):
        """取另一个模块的 API（`K.dsh_<name>_api`）；没注入返回 None。"""
        return getattr(_kernel(), "dsh_%s_api" % name, None)
    
    
    class Api(dict):
        """模块 API 的标准形态：dict 可下标访问 + 可直接调用（进程内 `api(op, args)`）。
    
        历史坑：API 曾是普通 dict ⇒ 进程内 `api(args)` 报 TypeError: dict object is not callable；
        两个模块各自写了转换 shim。这里统一定义，模块不要再自己造。
        """
    
        def __call__(self, op=None, args=None, **kw):
            if op is None or isinstance(op, dict):
                args, op = (op if isinstance(op, dict) else args), "help"
            payload = args if isinstance(args, str) else j(dict(args or {}, **kw))
            out = self["dispatch"](str(op), payload)
            return out if isinstance(out, dict) else json.loads(out)
    
        def call(self, op, args=None, **kw):
            return self(op, args, **kw)
    
    
    def register(name, version, ops, dispatch=None, extra=None):
        """把 `K.dsh_<name>_api` 注册成标准 Api（模块尾部一行搞定，别再手写 _DshApi）。
    
        ops: {"op名": 可调用}  —— 同时成为 API 的键，便于 `K.dsh_x_api["op"](...)` 直接调。
        """
        def _default_dispatch(op, args_json):
            return dispatch_table(ops, op, args_json)
        d = {"version": version, "dispatch": dispatch or _default_dispatch}
        for k, v in (ops or {}).items():
            d[k] = v
        d.update(extra or {})
        a = Api(d)
        setattr(_kernel(), "dsh_%s_api" % name, a)
        return a
    
    
    def resolve_refs(value, skip_keys=("out", "steps")):
        """把 args 里的 "@工件[.路径]" 解析成真值（递归 dict/list）—— **单发 op 与 pipe_run 共用同一套语义**。
    
        工件表在 K.dsh_artifacts（pipe_put / pipe_run 的 out= 写入）。引用不存在时抛 KeyError，
        skip_keys 里的键**不解析**（如 pipe_run 的 out="@名字" 是输出名；steps 由 pipe_run 自己按序解析）。
        路由层会把它变成可见的报错（而不是静默把字符串当参数用）。
        """
        reg = getattr(_kernel(), "dsh_artifacts", None) or {}
    
        def _walk(v):
            if isinstance(v, str) and v.startswith("@"):
                body = v[1:]
                parts = body.split(".")
                nm = parts[0]
                if nm not in reg:
                    raise KeyError("引用了不存在的工件 @%s（现有：%s）" % (nm, ", ".join(sorted(reg.keys())) or "无"))
                cur = reg[nm].get("value") if isinstance(reg[nm], dict) else reg[nm]
                for p in parts[1:]:
                    cur = cur[int(p)] if isinstance(cur, list) else cur[p]
                return cur
            if isinstance(v, dict):
                return {k: (x if k in skip_keys else _walk(x)) for k, x in v.items()}
            if isinstance(v, list):
                return [_walk(x) for x in v]
            return v
    
        return _walk(value)
    
    
    def kapi(name):
        """模块 API 一行式访问器（K.dsh_<name>_api）；找不到时列出已加载模块，别让人靠猜 preload 名。"""
        K = _kernel()
        api = getattr(K, "dsh_%s_api" % str(name), None)
        if api is None:
            have = sorted(k[len("dsh_"):-len("_api")] for k in dir(K) if k.startswith("dsh_") and k.endswith("_api"))
            raise RuntimeError("内核里没有 K.dsh_%s_api（已加载：%s）—— 在线路径请把它加进 preload（例如 preload=%s）；离线路径用 runtime/offline_bootstrap.py" % (name, have, name))
        return api
    
    
    def install_kernel(ns=None):
        """把 K（与 kapi）装进命名空间；不给就装进调用方的 globals。
    
        为什么需要它：K 只注入「被执行脚本的 globals」，而 `import` 进来的 lib/*.py 有自己的 globals
        ⇒ 直接写 K.dsh_vehicle_api 会 NameError。官方推荐两选一：
          * 文件顶部一行：`import sys; K = sys.modules["dsh_rt_kernel"]`
          * 或调用：`K.dsh_kit.install_kernel()` / `K.dsh_kit.kapi("vehicle")`
        """
        K = _kernel()
        target = ns if isinstance(ns, dict) else sys._getframe(1).f_globals
        target["K"] = K
        if getattr(K, "dsh_kit", None) is not None:
            target["kapi"] = K.dsh_kit.kapi
        return K
    
    
    def comp_tree(scene=None):
        """拿合成器节点树：Blender 5.2 起 scene.node_tree 已移除（搬到 scene.compositing_node_group）。
    
        现场：5.2 上访问 scene.node_tree、或 Glare 的 mix、Mix 的 blend_type 会从助手函数深处抛 AttributeError。
        统一从这里取，版本差异只在一处处理；拿不到就明确说清版本口径。
        """
        import bpy
        sc = scene or bpy.context.scene
        for attr in ("compositing_node_group", "node_tree"):
            holder = getattr(sc, attr, None)
            if holder is None:
                continue
            tree = getattr(holder, "node_tree", holder)
            if tree is not None:
                return tree
        raise RuntimeError("拿不到合成器节点树：Blender 5.2 起改用 scene.compositing_node_group（旧的 scene.node_tree 已移除）；取到后注意 Glare 的 mix 与 Mix 的 blend_type/mix 都改名了，用 getattr 兜底")
    
    def wrap_dispatch(base, extra=None):
        """给已有 dispatch 挂附加 op（如 selftest）：命中 extra 走额外表，否则交回原 dispatch。
    
        用途：模块的 op 表是各自手写的（形态不一），补 op 时不该去改它的内部结构。
        """
        extra = extra or {}
    
        def _d(op, args_json=None):
            fn = extra.get(str(op))
            if fn is not None:
                return dispatch_table({str(op): fn}, op, args_json)
            if callable(base):
                return base(op, args_json)
            return err("unknown op", op=op, ops=sorted(extra.keys()))
    
        return _d
    
    def flatten(args):
        """参数摊平：`{"args": {...}}` 与顶层键等价（历史两种写法都支持）。"""
        out = {}
        if isinstance(args, str):
            try:
                args = json.loads(args) if args.strip() else {}
            except Exception:
                args = {}
        for k, v in (args or {}).items():
            if k == "args" and isinstance(v, dict):
                out.update(v)
            else:
                out[k] = v
        return out
    
    
    def dispatch_table(ops, op, args_json=None):
        """标准 dispatch：解析 → 摊平 → 查表 → 调用 → 统一错误回执。"""
        kw = flatten(args_json)
        try:
            kw = resolve_refs(kw)   # S5-b：单发 op 也支持 "@工件[.路径]"
        except KeyError as e:
            return err("引用解析失败: %s" % str(e)[:160], op=op)
        fn = ops.get(str(op))
        if fn is None:
            return err("unknown op", op=op, ops=sorted(ops))
        try:
            out = fn(**kw)
            return out if isinstance(out, str) else j(out)
        except TypeError as e:
            return err("参数不匹配: %s" % str(e)[:200], op=op)
        except Exception as e:
            return err("%s: %s" % (type(e).__name__, str(e)[:200]), op=op)
    
    
    # ────────────────────────────── 几何 / 度量 ──────────────────────────────
    def objects(names, strict=True):
        """名字列表 → 对象列表；strict 时返回 (objs, missing)。"""
        import bpy
        if isinstance(names, str):
            names = [names]
        objs = [bpy.data.objects.get(str(n)) for n in (names or [])]
        missing = [n for n, o in zip(names or [], objs) if o is None]
        return (objs, missing) if strict else [o for o in objs if o is not None]
    
    
    def world_tris(objs, include_hidden=True):
        """一组对象的**世界三角面**（用 evaluated mesh：修改器/阵列都算进去）。"""
        import bpy
        dg = bpy.context.evaluated_depsgraph_get()
        tris = []
        for ob in objs:
            if ob is None or ob.type != "MESH":
                continue
            if not include_hidden:
                try:
                    if not ob.visible_get():
                        continue
                except Exception:
                    pass
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            try:
                me.calc_loop_triangles()
                mw = ob.matrix_world
                for t in me.loop_triangles:
                    tris.append([tuple(mw @ me.vertices[i].co) for i in t.vertices])
            finally:
                ev.to_mesh_clear()
        return tris
    
    
    def bvh(tris):
        """三角面 → BVH（空输入返回 None）。"""
        from mathutils.bvhtree import BVHTree
        if not tris:
            return None
        V = [v for t in tris for v in t]
        polys = [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(tris))]
        return BVHTree.FromPolygons(V, polys, all_triangles=True)
    
    
    def iou(mask_a, mask_b):
        """布尔掩码 IoU —— **唯一实现**（imgtools / qc / qc_render 都该用这个）。
    
        返回 (iou, inter, union)；空并集返回 (None, 0, 0)。
        """
        import numpy as np
        a = np.asarray(mask_a).astype(bool)
        b = np.asarray(mask_b).astype(bool)
        inter = int(np.count_nonzero(a & b))
        union = int(np.count_nonzero(a | b))
        return ((inter / union) if union else None), inter, union
    
    
    def pairwise_clearance(objs_a, objs_b, samples=1200, seed=0):
        """两组对象的最近距离（米）与是否互穿 —— 采样法（顶点+面心 ↔ 对面 BVH）。
    
        返回 dict：{"gap_m": float|None, "interpenetrating": bool, "overlap_tri_pairs": int}
        诚实边界：间隙是采样点距离（大曲面平行贴合可能高估）；互穿判定精确（三角面相交）。
        """
        import random
        ta, tb = world_tris(objs_a), world_tris(objs_b)
        if not ta or not tb:
            return {"gap_m": None, "interpenetrating": False, "overlap_tri_pairs": 0, "error": "empty_mesh"}
        ba, bb = bvh(ta), bvh(tb)
        ov = ba.overlap(bb) or []
        rng = random.Random(int(seed))
        best = None
        for tris, other in ((ta, bb), (tb, ba)):
            pts = []
            for t in tris:
                pts.append(t[0]); pts.append(t[1]); pts.append(t[2])
                pts.append(((t[0][0] + t[1][0] + t[2][0]) / 3.0,
                            (t[0][1] + t[1][1] + t[2][1]) / 3.0,
                            (t[0][2] + t[1][2] + t[2][2]) / 3.0))
            if len(pts) > int(samples):
                pts = rng.sample(pts, int(samples))
            for p in pts:
                r = other.find_nearest(p)
                if r is None or r[0] is None:
                    continue
                import mathutils
                d = (r[0] - mathutils.Vector(p)).length
                if best is None or d < best:
                    best = d
        return {"gap_m": best, "interpenetrating": len(ov) > 0, "overlap_tri_pairs": len(ov)}
    
    
    def selftest():
        """内核自检：JSON/单位/回执/派遣/几何/IoU —— 每条都当场验。"""
        ev = {}
        ev["j"] = j({"a": 1}) == '{"a": 1}'
        ev["flatten"] = flatten({"args": {"x": 1}, "y": 2}) == {"x": 1, "y": 2}
        ev["dispatch_unknown"] = '"unknown op"' in dispatch_table({"a": lambda: "{}"}, "nope")
        ev["dispatch_ok"] = dispatch_table({"a": lambda **k: j({"ok": True, **k})}, "a", '{"z": 3}') == '{"ok": true, "z": 3}'
        ev["api_callable"] = isinstance(Api({"dispatch": lambda o, a: '{"ok": true}'}), dict)
        ev["units_positive"] = units() > 0
        m = Api({"dispatch": lambda o, a: '{"ok": true}'})
        ev["api_call"] = m("help", {}) == {"ok": True}
        try:
            import numpy as np
            i, inter, uni = iou(np.array([[1, 0], [1, 0]]), np.array([[1, 1], [0, 0]]))
            ev["iou"] = abs(float(i) - 1.0 / 3.0) < 1e-9 and inter == 1 and uni == 3
        except Exception as e:
            ev["iou"] = "skip: %s" % str(e)[:40]
        ok = all(v is True for v in ev.values())
        return j({"ok": bool(ok), "version": KIT_VERSION, "evidence": ev})
    
    
    # 注册：KERNEL_BOOTSTRAP 会执行本文件 ⇒ K.dsh_kit 在任何注入路径里都存在
    _K = _kernel()
    _K.dsh_kit = types.SimpleNamespace(
        version=KIT_VERSION, j=j, err=err, receipt=receipt, units=units, mm=mm, api=api,
        Api=Api, register=register, flatten=flatten, dispatch_table=dispatch_table,
        objects=objects, world_tris=world_tris, bvh=bvh, iou=iou,
        pairwise_clearance=pairwise_clearance, selftest=selftest, kernel=_kernel, wrap_dispatch=wrap_dispatch, resolve_refs=resolve_refs, kapi=kapi, install_kernel=install_kernel, comp_tree=comp_tree,
    )
if getattr(K, "dsh_geo_api", None) is None:
    # -*- coding: utf-8 -*-
    """DSH 几何底座（geo）—— **机制层：只给动词，不给名词**。
    
    为什么有这个模块：实测同一个技能 + 同一个插件下，两个会话各自手写了一套 kit
    （box/cyl/boolean/镜像/预览…），**精确同名只有 4 个**，而语义等价的至少 8 组
    （bool_diff↔boolean、wipe↔clear_scene、bolt↔hexbolt、rail↔rail_teeth、loft↔loft_y/stack…）。
    后果两条：① 跨会话用法经验无法累积；② 同一批 Blender 版本坑各踩一遍。
    本模块把"**与物品无关**的那部分"收成唯一实现。
    
    ## 分层（这条线是存在的理由，破坏它就没意义）
    
    | 层 | 换物品会变吗 | 谁持有 | 内容 |
    |---|---|---|---|
    | 方法层（怎么建） | **会变** | 技能决策树 / Lead | 分面硬表面 / 光滑硬表面 / 有机 / 阵列 / 布尔 |
    | **机制层（用什么动词造）** | **不变** | **本模块** | 布尔 · 开孔 · 开槽 · 镜像 · 阵列 · 拉伸 · 放样 · 倒角 · 自动平滑 |
    | 形状层（长什么样） | **会变** | 项目 lib/spec.py | 齿距 / 站表 / 截面函数 / 坐标清单 |
    
    **收一个新函数前的三条判据**（全中才收）：
      1. 把参数里的数值全删掉，剩下那句描述**换个物品还成立**吗？
         （"造导轨齿" → 不成立，不收；"把实体从实体里减掉" → 成立，收）
      2. 默认值能被调用方**完全覆盖**吗？（本模块**一律不给形状默认值**）
      3. 它解决的是"Blender 怎么用"或"几何怎么算"，还是"这东西长什么样"？
    
    **违反这三条，底座就会把不同物品的模型压成一个样** —— 那正是它该被拒绝的理由。
    
    ## 明确不提供（属于形状层，请写在项目自己的 lib/ 里）
      导轨齿距 / 孔阵排布 / 握把截面 / 车辆站表 / 翼型轮廓 / 任何 pitch·tooth·ratio 的默认形状值。
    
    ## 怎么拿到
      KERNEL_BOOTSTRAP 已注入（与 kit 同等：**任何注入路径都在**），公开名直接可用；
      同时注册为 K.dsh_geo_api（可 dispatch）；也可显式 preload="geo"。
      自检：geo_selftest()   速查：geo_help()
    
    单位：几何坐标用**当前场景单位**；要按 mm 建模就把 scene.unit_settings.scale_length 设成 0.001
    （此时 K.dsh_kit.units() 回报 1.0 mm/unit）。本模块所有 `*_mm` 参数按毫米解释并自动换算。
    """
    import json
    import math
    import sys
    import types
    
    import bpy
    import bmesh
    from mathutils import Vector, Matrix
    
    GEO_VERSION = 1
    
    _K = sys.modules.get("dsh_rt_kernel")
    _KIT = getattr(_K, "dsh_kit", None)
    if _KIT is None:
        raise RuntimeError("geo.py 需要共享内核 K.dsh_kit（由 KERNEL_BOOTSTRAP 注入）")
    _j = _KIT.j
    _err = _KIT.err
    _receipt = _KIT.receipt
    _units = _KIT.units
    
    
    # ══════════════════════════════════════════════════════════════════════
    # 档 A · 环境适配 —— 与物品零关系，但每个会话都会踩一遍的 Blender/无头坑
    # ══════════════════════════════════════════════════════════════════════
    def mm2u(v):
        """毫米 → 场景单位。"""
        return float(v) / (_units() or 1000.0)
    
    
    def u2mm(v):
        """场景单位 → 毫米。"""
        return float(v) * (_units() or 1000.0)
    
    
    def principled(mat):
        """取材质的 Principled BSDF —— **必须按 bl_idname 找**。
        中文界面下节点名是"原理化BSDF"，按名字 get("Principled BSDF") 会 KeyError（实测踩过）。"""
        if mat is None:
            return None
        nt = getattr(mat, "node_tree", None)
        if nt is None:
            return None
        for n in nt.nodes:
            if getattr(n, "bl_idname", "") == "ShaderNodeBsdfPrincipled":
                return n
        return None
    
    
    def mix_rgb(nt, loc=(0.0, 0.0)):
        """兼容取 Mix 节点：Blender 5.x 用 ShaderNodeMix(data_type='RGBA')，老版回退 MixRGB。
        返回 (node, fac_in, c1_in, c2_in, color_out)。"""
        try:
            n = nt.nodes.new("ShaderNodeMix")
            n.data_type = "RGBA"
            n.location = loc
            return n, n.inputs["Factor"], n.inputs[6], n.inputs[7], n.outputs[2]
        except Exception:
            n = nt.nodes.new("ShaderNodeMixRGB")
            n.location = loc
            return n, n.inputs["Fac"], n.inputs["Color1"], n.inputs["Color2"], n.outputs["Color"]
    
    
    def apply_mods(ob):
        """把对象上的 modifier **用求值器**落进网格。
    
        不用 bpy.ops.object.modifier_apply：它依赖 active/选中/上下文，无头下时好时坏。
        """
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)
        return ob
    
    
    def bevel(ob, width_mm=0.0, segments=2, angle_deg=40.0):
        """**按角度限定**倒角并落地（只倒该倒的棱，不把缓变面倒成锯齿）。width_mm<=0 直接返回。"""
        if not width_mm or float(width_mm) <= 0:
            return ob
        m = ob.modifiers.new("geobevel", "BEVEL")
        m.width = mm2u(width_mm)
        m.segments = int(segments)
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(float(angle_deg))
        try:
            m.harden_normals = False
        except Exception:
            pass
        return apply_mods(ob)
    
    
    def shade_auto(ob, angle_deg=35.0):
        """自动平滑 —— **不改拓扑**的正解。
    
        Blender 4.1+/5.x 已移除 mesh.use_auto_smooth；而 EDGE_SPLIT 会把边**真正劈开**、
        制造边界边，直接顶穿"0 非流形边"的门。正确做法：面全平滑 + set_sharp_from_angle 标锐边。
        实测（5.2.2）：8 顶点正方体 → 顶点数不变、标出 12 条锐边。
        """
        me = ob.data
        if not len(me.polygons):
            return ob
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        try:
            me.set_sharp_from_angle(angle=math.radians(float(angle_deg)))
        except Exception:
            m = ob.modifiers.new("geosplit", "EDGE_SPLIT")
            m.split_angle = math.radians(float(angle_deg))
            m.use_edge_angle = True
            apply_mods(ob)
        try:
            me.update()
        except Exception:
            pass
        return ob
    
    
    def shade_flat(ob):
        """全部平直着色（硬表面块件的默认观感）。"""
        me = ob.data
        me.polygons.foreach_set("use_smooth", [False] * len(me.polygons))
        try:
            me.update()
        except Exception:
            pass
        return ob
    
    
    def recalc_normals(ob):
        """法线一律朝外 —— **这是后面所有互穿/间隙判据的前提**。"""
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        return ob
    
    
    def mesh_stats(ob):
        """网格体检：非流形边（link_faces != 2）/ 零面积面 / 顶点 / 面。"""
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        nm = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        degen = sum(1 for f in bm.faces if f.calc_area() < 1e-12)
        out = {"nonmanifold_edges": nm, "degenerate_faces": degen,
               "verts": len(bm.verts), "faces": len(bm.faces)}
        bm.free()
        return out
    
    
    # ══════════════════════════════════════════════════════════════════════
    # 档 B · 几何动词 —— 只有动词与显式参数，没有任何形状默认值
    # ══════════════════════════════════════════════════════════════════════
    def collection(name):
        """取/建集合（配合 COL_<agent> 归属约定）。"""
        c = bpy.data.collections.get(str(name))
        if c is None:
            c = bpy.data.collections.new(str(name))
            bpy.context.scene.collection.children.link(c)
        return c
    
    
    def own(ob, coll=None, owner=None):
        """登记归属：进集合 + 打 dsh.owner 标签（技能 §0.5.7 的约定，别只写在脑子里）。"""
        if ob is None:
            return ob
        c = coll if isinstance(coll, bpy.types.Collection) else collection(coll or "COL_geo")
        for cc in list(ob.users_collection):
            if cc is not c:
                try:
                    cc.objects.unlink(ob)
                except Exception:
                    pass
        if ob.name not in c.objects:
            try:
                c.objects.link(ob)
            except Exception:
                pass
        if owner:
            ob["dsh.owner"] = str(owner)
        return ob
    
    
    def assign(ob, matname):
        """挂材质（按名字；不存在就建一个占位）。材质名 → 具体数值属于**形状/外观层**，由项目定。"""
        if ob is None:
            return ob
        m = bpy.data.materials.get(str(matname))
        if m is None:
            m = bpy.data.materials.new(str(matname))
            m.diffuse_color = (0.05, 0.05, 0.05, 1)
        if ob.data.materials:
            ob.data.materials[0] = m
        else:
            ob.data.materials.append(m)
        return ob
    
    
    def assign_all(objs, matname):
        for o in (objs or []):
            assign(o, matname)
        return objs
    
    
    def solid(name, bm, coll="COL_geo", owner=None, bevel_mm=0.0, seg=2,
              angle_deg=40.0, smooth_angle=None):
        """bmesh → 场景对象：本模块**唯一的落地点**（统一走：法线朝外 → 登记 → 倒角 → 平滑）。"""
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(str(name))
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(str(name), me)
        bpy.context.scene.collection.objects.link(ob)
        own(ob, coll, owner)
        if bevel_mm:
            bevel(ob, bevel_mm, seg, angle_deg)
        if smooth_angle is not None:
            shade_auto(ob, smooth_angle)
        return ob
    
    
    def box(name, xr, yr, zr, coll="COL_geo", owner=None, bevel_mm=0.0, seg=2,
            angle_deg=40.0, smooth_angle=None):
        """轴对齐盒：三个区间 (min, max)。**没有尺寸默认值 —— 尺寸永远由调用方给。**"""
        x0, x1 = float(xr[0]), float(xr[1])
        y0, y1 = float(yr[0]), float(yr[1])
        z0, z1 = float(zr[0]), float(zr[1])
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
            v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
            v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
        return solid(name, bm, coll, owner, bevel_mm, seg, angle_deg, smooth_angle)
    
    
    def cyl(name, p0, p1, r, coll="COL_geo", r2=None, segs=24, owner=None,
            bevel_mm=0.0, smooth_angle=32.0):
        """两点定轴的圆柱（r2 给了就是圆台）。"""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        L = d.length
        if L < 1e-9:
            raise ValueError("geo.cyl: p0 与 p1 重合，轴长为 0")
        q = Vector((0.0, 0.0, 1.0)).rotation_difference(d.normalized())
        M = Matrix.Translation((a + b) * 0.5) @ q.to_matrix().to_4x4()
        r_b = float(r if r2 is None else r2)
        kw = dict(cap_ends=True, cap_tris=False, segments=int(segs), depth=L)
        bm = bmesh.new()
        try:
            bmesh.ops.create_cone(bm, radius1=float(r), radius2=r_b, **kw)
        except TypeError:
            bmesh.ops.create_cone(bm, diameter1=float(r) * 2.0, diameter2=r_b * 2.0, **kw)
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        return solid(name, bm, coll, owner, bevel_mm, 2, 40.0, smooth_angle)
    
    
    def tube(name, p0, p1, r_out, r_in, coll="COL_geo", segs=24, owner=None,
             bevel_mm=0.0, smooth_angle=32.0):
        """空心管（外圆柱 − 内圆柱），两端开口。"""
        if float(r_in) >= float(r_out):
            raise ValueError("geo.tube: r_in 必须小于 r_out")
        outer = cyl(name, p0, p1, r_out, coll=coll, r2=None, segs=segs, owner=owner,
                    bevel_mm=0.0, smooth_angle=None)
        inner = cyl("__geotube_in", p0, p1, r_in, coll="COL_geo", segs=segs,
                    smooth_angle=None)
        boolean(outer, inner, "DIFFERENCE", delete_cutter=True, verify=True)
        if bevel_mm:
            bevel(outer, bevel_mm, 2, 40.0)
        if smooth_angle is not None:
            shade_auto(outer, smooth_angle)
        return outer
    
    
    def prism(name, profile, axis, a0, a1, coll="COL_geo", owner=None, bevel_mm=0.0,
              seg=2, angle_deg=40.0, smooth_angle=None):
        """2D 闭合截面沿轴拉伸。profile=[(u,v),…]（轴=X→(Y,Z)；Y→(X,Z)；Z→(X,Y)）。"""
        ax = str(axis).upper()
        if ax not in ("X", "Y", "Z"):
            raise ValueError("geo.prism: axis 只能是 X/Y/Z")
    
        def P(u, v, a):
            if ax == "X":
                return (a, u, v)
            if ax == "Y":
                return (u, a, v)
            return (u, v, a)
    
        bm = bmesh.new()
        vs = [bm.verts.new(P(float(u), float(v), float(a0))) for (u, v) in profile]
        f = bm.faces.new(vs)
        res = bmesh.ops.extrude_face_region(bm, geom=[f])
        nv = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=Vector(P(0.0, 0.0, float(a1))) - Vector(P(0.0, 0.0, float(a0))),
                            verts=nv)
        return solid(name, bm, coll, owner, bevel_mm, seg, angle_deg, smooth_angle)
    
    
    def loft(name, rings, coll="COL_geo", owner=None, bevel_mm=0.0, seg=2,
             angle_deg=40.0, smooth_angle=None, cap=True):
        """多截面放样：rings=[层][点]，**层间点数一致、绕向一致**。轴向变截面实体用它。"""
        if not rings or not rings[0]:
            raise ValueError("geo.loft: rings 为空")
        n = len(rings[0])
        for i, r in enumerate(rings):
            if len(r) != n:
                raise ValueError("geo.loft: 第 %d 层点数 %d != 第 0 层 %d" % (i, len(r), n))
        bm = bmesh.new()
        vr = [[bm.verts.new(Vector(p)) for p in r] for r in rings]
        for a, b in zip(vr[:-1], vr[1:]):
            for i in range(n):
                j = (i + 1) % n
                try:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
                except ValueError:
                    pass
        if cap:
            for ring, rev in ((vr[0], True), (vr[-1], False)):
                vs = list(reversed(ring)) if rev else list(ring)
                try:
                    bm.faces.new(vs)
                except ValueError:
                    pass
        return solid(name, bm, coll, owner, bevel_mm, seg, angle_deg, smooth_angle)
    
    
    def stack(name, sections, axis="X", coll="COL_geo", owner=None, bevel_mm=0.0,
              seg=2, angle_deg=40.0, smooth_angle=None):
        """沿轴堆截面 → loft 的便捷形。sections=[(a, [(u,v),…]), …]（u,v 含义同 prism）。"""
        ax = str(axis).upper()
        if ax not in ("X", "Y", "Z"):
            raise ValueError("geo.stack: axis 只能是 X/Y/Z")
        rings = []
        for (a, pts) in sections:
            ring = []
            for (u, v) in pts:
                if ax == "X":
                    ring.append((float(a), float(u), float(v)))
                elif ax == "Y":
                    ring.append((float(u), float(a), float(v)))
                else:
                    ring.append((float(u), float(v), float(a)))
            rings.append(ring)
        return loft(name, rings, coll, owner, bevel_mm, seg, angle_deg, smooth_angle)
    
    
    def _obb(ob):
        """世界坐标包围盒 [min, max]。"""
        try:
            bpy.context.view_layer.update()
        except Exception:
            pass
        cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        lo = [min(c[i] for c in cs) for i in range(3)]
        hi = [max(c[i] for c in cs) for i in range(3)]
        return [Vector(lo), Vector(hi)]
    
    
    def _inside(a, b, tol):
        return all(a[0][i] >= b[0][i] - tol and a[1][i] <= b[1][i] + tol for i in range(3))
    
    
    def boolean(target, cutter, op="DIFFERENCE", solver="EXACT", delete_cutter=True, verify=True):
        """布尔 + **退化守卫**。
    
        已知坑（实测）：EXACT 布尔在**自交主体**（多个互相穿插的原语 join 成一个网格）上会
        **静默退化成"并集"** —— 不报错、只是形状悄悄错了，结果包围盒胀到切具尺寸。
        守卫（后验，便宜且确定）：
          差分结果必须仍包在 target 包围盒内；交点必须包在两者公共包围盒内；并集不许超出两者之并。
        违反 → 抛 RuntimeError（带诊断与修法），**不静默通过**。verify=False 可关（不建议）。
        """
        top = str(op).upper()
        if top not in ("DIFFERENCE", "UNION", "INTERSECT"):
            raise ValueError("geo.boolean: op 只能是 DIFFERENCE / UNION / INTERSECT")
        tbb = _obb(target)
        cbb = _obb(cutter)
        pre = mesh_stats(target)
        m = target.modifiers.new("geobool", "BOOLEAN")
        m.operation = top
        m.object = cutter
        try:
            m.solver = str(solver)
        except Exception:
            pass
        apply_mods(target)
        if delete_cutter:
            try:
                bpy.data.objects.remove(cutter, do_unlink=True)
            except Exception:
                pass
        info = {"op": top, "pre_nonmanifold_edges": pre["nonmanifold_edges"],
                "pre_degenerate_faces": pre["degenerate_faces"], "guard": "skipped"}
        if verify:
            rbb = _obb(target)
            span = max(1e-9, (tbb[1] - tbb[0]).length)
            tol = 1e-4 * max(1.0, span)
            bad = None
            if top == "DIFFERENCE":
                if not _inside(rbb, tbb, tol):
                    bad = "difference_grew_beyond_target"
            elif top == "INTERSECT":
                lo = Vector([max(tbb[0][i], cbb[0][i]) for i in range(3)])
                hi = Vector([min(tbb[1][i], cbb[1][i]) for i in range(3)])
                if not _inside(rbb, [lo, hi], tol):
                    bad = "intersect_outside_common"
            else:
                lo = Vector([min(tbb[0][i], cbb[0][i]) for i in range(3)])
                hi = Vector([max(tbb[1][i], cbb[1][i]) for i in range(3)])
                if not _inside(rbb, [lo, hi], tol):
                    bad = "union_beyond_both"
            if bad:
                raise RuntimeError(
                    "几何底座退化守卫拦下了一次布尔（%s）。%s 的结果包围盒超出了应有范围，"
                    "最常见原因是**主体是自交网格**（多个互相穿插的原语 join 在一起）—— "
                    "EXACT 布尔在这种输入上会静默退化成并集。修法："
                    "(1) 布尔只在**单一原语**上做，切完再 join；"
                    "(2) 或先跑 fix_repair（合并重复点/消零面积面/重算法线）再切；"
                    "(3) 确认这种形变是设计意图时传 verify=False。"
                    % (bad, top))
            info["guard"] = "pass"
        try:
            target["dsh_boolean_guard"] = _j(info)
        except Exception:
            pass
        return target
    
    
    def _merge(objs, name, coll="COL_tmp"):
        """把多个切具合成**一个**网格 —— 批量开孔走一次布尔（比逐个切快且稳）。"""
        bm = bmesh.new()
        for o in objs:
            bm.from_mesh(o.data)
        for o in objs:
            try:
                bpy.data.objects.remove(o, do_unlink=True)
            except Exception:
                pass
        return solid(name, bm, coll=coll, owner=None, smooth_angle=None)
    
    
    def hole_cut(target, holes, name="GEO_holes", coll="COL_tmp", verify=True):
        """批量开孔，一次布尔。holes 每项二选一：
          {"center":(x,y,z), "axis":"X|Y|Z", "r":R, "length":L}   —— 轴对齐孔
          (p0, p1, r)                                            —— 任意轴孔
        """
        cutters = []
        for i, h in enumerate(holes):
            if isinstance(h, dict):
                c = Vector(h.get("center", (0.0, 0.0, 0.0)))
                ax = str(h.get("axis", "X")).upper()
                dv = {"X": Vector((1.0, 0.0, 0.0)), "Y": Vector((0.0, 1.0, 0.0)),
                      "Z": Vector((0.0, 0.0, 1.0))}.get(ax)
                if dv is None:
                    raise ValueError("geo.hole_cut: axis 只能是 X/Y/Z")
                half = dv * (float(h["length"]) * 0.5)
                p0, p1, r = c - half, c + half, float(h["r"])
            else:
                p0, p1, r = h[0], h[1], float(h[2])
            cutters.append(cyl("__geohole%d" % i, p0, p1, r, coll=coll, smooth_angle=None))
        return boolean(target, _merge(cutters, name + "_cutter", coll), "DIFFERENCE", verify=verify)
    
    
    def slots_cut(target, slots, name="GEO_slots", coll="COL_tmp", verify=True):
        """批量开槽，一次布尔。slots 每项 = ((x0,x1),(y0,y1),(z0,z1)) 的盒子。"""
        cutters = [box("__geoslot%d" % i, s[0], s[1], s[2], coll=coll, smooth_angle=None)
                   for i, s in enumerate(slots)]
        return boolean(target, _merge(cutters, name + "_cutter", coll), "DIFFERENCE", verify=verify)
    
    
    def mirror(ob, axis="Y", name=None, coll=None):
        """通用镜像（不写死 Y）。负缩放**就地落地**并翻转法线 —— 否则会得到里外翻的壳，
        而法线方向是所有互穿判据的前提。"""
        ax = str(axis).upper()
        if ax not in ("X", "Y", "Z"):
            raise ValueError("geo.mirror: axis 只能是 X/Y/Z")
        me = ob.data.copy()
        dup = bpy.data.objects.new(name or (ob.name + "_mir"), me)
        (coll if isinstance(coll, bpy.types.Collection)
         else (ob.users_collection[0] if ob.users_collection else collection("COL_geo"))).objects.link(dup)
        s = [1.0, 1.0, 1.0]
        s["XYZ".index(ax)] = -1.0
        me.transform(Matrix.Diagonal((s[0], s[1], s[2], 1.0)))
        if s[0] * s[1] * s[2] < 0:
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
        me.update()
        try:
            dup["dsh.owner"] = ob.get("dsh.owner", "")
        except Exception:
            pass
        return dup
    
    
    def linear_array(ob, count, offset, name=None):
        """沿向量复制（份数含原件）。offset = 每一步的位移。"""
        n = int(count)
        if n < 1:
            raise ValueError("geo.linear_array: count 必须 >= 1")
        out = [ob]
        c = ob.users_collection[0] if ob.users_collection else collection("COL_geo")
        for i in range(1, n):
            dup = bpy.data.objects.new("%s_%02d" % (name or (ob.name + "_arr"), i), ob.data.copy())
            c.objects.link(dup)
            dup.matrix_world = Matrix.Translation(Vector(offset) * i) @ ob.matrix_world
            try:
                dup["dsh.owner"] = ob.get("dsh.owner", "")
            except Exception:
                pass
            out.append(dup)
        return out
    
    
    def join(objs, name=None, coll=None, owner=None):
        """合并成一格网格（**布尔请在 join 之前做** —— join 出的自交网格会让 EXACT 布尔退化）。"""
        objs = [o for o in (objs or []) if o is not None]
        if not objs:
            return None
        bm = bmesh.new()
        for o in objs:
            bm.from_mesh(o.data)
        base = objs[0]
        for o in objs:
            if o is not base:
                try:
                    bpy.data.objects.remove(o, do_unlink=True)
                except Exception:
                    pass
        old = base.data
        me = bpy.data.meshes.new(base.name)
        bm.to_mesh(me)
        bm.free()
        base.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)
        if name:
            base.name = str(name)
        own(base, coll or (base.users_collection[0] if base.users_collection else "COL_geo"),
            owner or base.get("dsh.owner"))
        return base
    
    
    def clear_scene(prefixes=("GEO_", "GEO-", "__")):
        """清场：默认只删自己那套前缀的件，**不碰相机/灯/别人的件**。返回删除数量。"""
        n = 0
        for o in list(bpy.data.objects):
            if any(o.name.startswith(p) for p in prefixes):
                bpy.data.objects.remove(o, do_unlink=True)
                n += 1
        return n
    
    
    # ══════════════════════════════════════════════════════════════════════
    # 档 C · 管线 / 量测 / 预览
    # ══════════════════════════════════════════════════════════════════════
    def tri_count(objs=None):
        """三角面数（供"面数预算"这类门用）。"""
        objs = objs if objs is not None else [o for o in bpy.data.objects if o.type == "MESH"]
        n = 0
        for o in objs:
            for p in o.data.polygons:
                n += max(0, len(p.vertices) - 2)
        return n
    
    
    def bbox_all(objs=None, unit="mm"):
        """整组件的世界包围盒（默认 mm）。返 {"ok","bbox","size","unit"}。"""
        objs = objs if objs is not None else [o for o in bpy.data.objects if o.type == "MESH"]
        objs = [o for o in objs if o is not None and o.type == "MESH"]
        if not objs:
            return {"ok": False, "error": "bbox_all: 没有 mesh 对象"}
        lo = [1e18] * 3
        hi = [-1e18] * 3
        for o in objs:
            bb = _obb(o)
            for i in range(3):
                lo[i] = min(lo[i], bb[0][i])
                hi[i] = max(hi[i], bb[1][i])
        if str(unit).lower() == "mm":
            f = u2mm
        else:
            f = float
        return {"ok": True, "unit": str(unit),
                "bbox": [[round(f(v), 4) for v in lo], [round(f(v), 4) for v in hi]],
                "size": [round(f(hi[i] - lo[i]), 4) for i in range(3)]}
    
    
    def _aim(loc, target):
        d = Vector(target) - Vector(loc)
        q = Vector((0.0, 0.0, -1.0)).rotation_difference(d.normalized())
        return q.to_euler()
    
    
    def quick_views(outdir, views, res=(1280, 720), engine="BLENDER_WORKBENCH", prefix=""):
        """多视角快速预览（不需要灯/材质也能出图）。
    
        views=[{"name","from","look_at","lens"?,"ortho"?}, …]；坐标 = 当前场景单位。
        轻量自足；要**与参考图算 IoU / 剖面对齐**请走 blender_rt_plan(op="qc_render_views")。
        """
        import os
        os.makedirs(str(outdir), exist_ok=True)
        sc = bpy.context.scene
        old_engine = sc.render.engine
        old_res = (sc.render.resolution_x, sc.render.resolution_y)
        made = []
        try:
            try:
                sc.render.engine = str(engine)
            except Exception:
                pass
            sc.render.resolution_x = int(res[0])
            sc.render.resolution_y = int(res[1])
            sc.render.resolution_percentage = 100
            sc.render.image_settings.file_format = "PNG"
            for v in views:
                cd = bpy.data.cameras.new("__geo_cam")
                cd.lens = float(v.get("lens", 50.0))
                if v.get("ortho"):
                    cd.type = "ORTHO"
                    cd.ortho_scale = float(v["ortho"])
                co = bpy.data.objects.new("__geo_cam", cd)
                sc.collection.objects.link(co)
                co.location = v["from"]
                co.rotation_euler = _aim(v["from"], v["look_at"])
                sc.camera = co
                fn = os.path.join(str(outdir), "%s%s.png" % (prefix, v.get("name", "view")))
                sc.render.filepath = fn
                bpy.ops.render.render(write_still=True)
                made.append(fn)
                bpy.data.objects.remove(co, do_unlink=True)
                if cd.users == 0:
                    bpy.data.cameras.remove(cd)
        finally:
            sc.render.resolution_x = int(old_res[0])
            sc.render.resolution_y = int(old_res[1])
            try:
                sc.render.engine = old_engine
            except Exception:
                pass
        return {"ok": True, "n": len(made), "files": made}
    
    
    # ══════════════════════════════════════════════════════════════════════
    # 自检 / 速查 / 注册
    # ══════════════════════════════════════════════════════════════════════
    def geo_help():
        return _j({
            "module": "geo.py", "version": GEO_VERSION,
            "what": "几何底座 —— 机制层：只给动词，不给名词（不含任何形状默认值）",
            "where": "KERNEL_BOOTSTRAP 已注入（公开名直接可用）；也注册为 K.dsh_geo_api；或 preload=\"geo\"",
            "A_env": ["principled", "mix_rgb", "apply_mods", "bevel", "shade_auto",
                      "shade_flat", "recalc_normals", "mesh_stats", "mm2u", "u2mm"],
            "B_verbs": ["solid", "box", "cyl", "tube", "prism", "loft", "stack",
                        "boolean", "hole_cut", "slots_cut", "mirror", "linear_array", "join", "clear_scene"],
            "C_pipe": ["collection", "own", "assign", "assign_all", "tri_count", "bbox_all", "quick_views"],
            "not_here": ["导轨齿距 / 孔阵排布 / 握把截面 / 车辆站表 / 翼型轮廓 —— 形状层，请写在项目 lib/spec.py"],
            "judgement": ["把参数里的数值全删掉，描述换个物品还成立吗？",
                          "默认值能被调用方完全覆盖吗？（本模块一律不给形状默认值）",
                          "它解决的是'Blender 怎么用/几何怎么算'还是'这东西长什么样'？"],
            "selftest": "geo_selftest()",
        })
    
    
    def geo_selftest():
        """自检：合成几何断言（非流形/退化/布尔守卫/镜像阵列/自动平滑不改拓扑/统计正确）。"""
        ev = {}
        canary = {}
        made = []
    
        def _clean():
            for o in made:
                try:
                    bpy.data.objects.remove(o, do_unlink=True)
                except Exception:
                    pass
    
        prev_scale = None
        try:
            prev_scale = float(bpy.context.scene.unit_settings.scale_length)
            bpy.context.scene.unit_settings.scale_length = 0.001   # 1 单位 = 1mm，方便用 mm 断言
    
            # 1) 盒 + 倒角 → 流形、无退化面
            b = box("__geo_t_box", (0, 20), (0, 10), (0, 5), coll="COL_geotest",
                    bevel_mm=0.5, smooth_angle=30.0)
            made.append(b)
            s = mesh_stats(b)
            ev["box_manifold"] = (s["nonmanifold_edges"] == 0 and s["degenerate_faces"] == 0)
    
            # 2) 柱 / 管
            c = cyl("__geo_t_cyl", (0, 0, 0), (0, 0, 30), 4.0, coll="COL_geotest", segs=24)
            made.append(c)
            ev["cyl_manifold"] = mesh_stats(c)["nonmanifold_edges"] == 0
            t = tube("__geo_t_tube", (0, 0, 0), (0, 0, 30), 5.0, 3.0, coll="COL_geotest")
            made.append(t)
            st = mesh_stats(t)
            ev["tube_hollow"] = st["nonmanifold_edges"] == 0 and st["faces"] > mesh_stats(c)["faces"]
    
            # 3) 放样（锥形方柱，层间点数一致）
            rings = []
            for i in range(6):
                t01 = i / 5.0
                h = 6.0 - 4.0 * t01
                rings.append([(-h, -h, i * 4.0), (h, -h, i * 4.0), (h, h, i * 4.0), (-h, h, i * 4.0)])
            L = loft("__geo_t_loft", rings, coll="COL_geotest")
            made.append(L)
            sl = mesh_stats(L)
            ev["loft_manifold"] = sl["nonmanifold_edges"] == 0 and sl["degenerate_faces"] == 0
    
            # 4) 布尔差分：守卫通过、包围盒不变、面数增加
            base = box("__geo_t_base", (0, 40), (0, 20), (0, 20), coll="COL_geotest")
            made.append(base)
            bb0 = bbox_all([base], unit="mm")
            f0 = mesh_stats(base)["faces"]
            hole_cut(base, [{"center": (20, 10, 10), "axis": "Z", "r": 6.0, "length": 60.0}],
                     name="__geo_t_hole", coll="COL_geotest")
            bb1 = bbox_all([base], unit="mm")
            ev["boolean_guard_pass"] = base.get("dsh_boolean_guard", "").find('"guard": "pass"') > 0
            ev["boolean_bbox_kept"] = bb0["bbox"] == bb1["bbox"]
            ev["boolean_faces_grew"] = mesh_stats(base)["faces"] > f0
            ev["boolean_manifold"] = mesh_stats(base)["nonmanifold_edges"] == 0
    
            # 5) 守卫两个方向都要测
            # ① **不许误报**：正常件 + 探出主体之外的切具 —— 正确的差集结果仍应包在主体内
            n1 = box("__geo_t_n1", (0, 40), (0, 20), (0, 20), coll="COL_geotest")
            made.append(n1)
            c1 = box("__geo_t_c1", (35, 90), (5, 15), (5, 15), coll="COL_geotest")
            made.append(c1)
            false_alarm = False
            try:
                boolean(n1, c1, "DIFFERENCE", delete_cutter=True, verify=True)
            except RuntimeError:
                false_alarm = True
            ev["guard_no_false_positive"] = (not false_alarm)
    
            # ② **金丝雀**：自交主体（两个互相穿插的盒 join 成一个网格）+ 探出主体的切具。
            #    若某天 EXACT 布尔在这种输入上退化成并集，包围盒会胀出去 → 守卫应当拦下。
            #    实测 5.2.2 上此构造**未复现**（故记为 canary，不参与 ok）—— 记录在案，
            #    将来版本回归时它会翻成 true，从回执里一眼看到。
            a1 = box("__geo_t_s1", (0, 20), (0, 20), (0, 20), coll="COL_geotest")
            a2 = box("__geo_t_s2", (10, 30), (10, 30), (10, 30), coll="COL_geotest")
            made.extend([a1, a2])
            si = join([a1, a2], name="__geo_t_selfint", coll="COL_geotest")
            made.append(si)
            c2 = box("__geo_t_c2", (25, 80), (10, 30), (10, 30), coll="COL_geotest")
            made.append(c2)
            fired = False
            try:
                boolean(si, c2, "DIFFERENCE", delete_cutter=True, verify=True)
            except RuntimeError:
                fired = True
            canary["selfint_guard_canary"] = fired
    
            # 6) 镜像 / 阵列
            src = box("__geo_t_m", (0, 10), (0, 5), (0, 5), coll="COL_geotest")
            made.append(src)
            mi = mirror(src, "Y")
            made.append(mi)
            arr = linear_array(src, 4, (30.0, 0.0, 0.0), name="__geo_t_a")
            made.extend(arr)
            ev["mirror_is_mirrored"] = bool(mi) and mi.name.endswith("_mir")
            ev["array_count_4"] = len(arr) == 4
    
            # 7) 自动平滑不改拓扑（EDGE_SPLIT 会劈边 → 直接顶穿非流形门）
            pv = mesh_stats(b)["verts"]
            nsharp = len([e for e in b.data.edges if e.use_edge_sharp])
            shade_auto(b, 30.0)
            ev["shade_auto_keeps_topology"] = mesh_stats(b)["verts"] == pv
            ev["shade_auto_marks_sharp"] = (len([e for e in b.data.edges if e.use_edge_sharp]) >= nsharp)
    
            # 8) 统计正确：正方体 12 三角面
            cube = box("__geo_t_cube", (0, 10), (0, 10), (0, 10), coll="COL_geotest")
            made.append(cube)
            ev["tri_count_cube_12"] = tri_count([cube]) == 12
            ev["bbox_size_10mm"] = bbox_all([cube], unit="mm")["size"] == [10.0, 10.0, 10.0]
        except Exception as e:
            _clean()
            try:
                if prev_scale is not None:
                    bpy.context.scene.unit_settings.scale_length = prev_scale
            except Exception:
                pass
            return _j({"ok": False, "error": "%s: %s" % (type(e).__name__, str(e)[:300]),
                       "version": GEO_VERSION, "evidence": ev, "canary": canary})
        _clean()
        try:
            if prev_scale is not None:
                bpy.context.scene.unit_settings.scale_length = prev_scale
        except Exception:
            pass
        ok = all(v is True for v in ev.values())
        return _j({"ok": bool(ok), "version": GEO_VERSION, "evidence": ev, "canary": canary})
    
    
    OPS = {
        "help": geo_help, "selftest": geo_selftest,
        "principled": principled, "mix_rgb": mix_rgb, "apply_mods": apply_mods,
        "bevel": bevel, "shade_auto": shade_auto, "shade_flat": shade_flat,
        "recalc_normals": recalc_normals, "mesh_stats": mesh_stats,
        "mm2u": mm2u, "u2mm": u2mm,
        "collection": collection, "own": own, "assign": assign, "assign_all": assign_all, "solid": solid,
        "box": box, "cyl": cyl, "tube": tube, "prism": prism, "loft": loft, "stack": stack,
        "boolean": boolean, "hole_cut": hole_cut, "slots_cut": slots_cut,
        "mirror": mirror, "linear_array": linear_array, "join": join, "clear_scene": clear_scene,
        "tri_count": tri_count, "bbox_all": bbox_all, "quick_views": quick_views,
    }
    
    # 注册：既挂 K.dsh_geo_api（可 dispatch），公开名也随 bootstrap 进脚本 globals（直接可用）
    _KIT.register("geo", GEO_VERSION, ops=OPS,
                  extra={"get": lambda n: OPS.get(str(n)), "help_text": geo_help})

_dsh_stage_emit("engine-prelude")
try:
    _DSH_FP0 = bpy.context.scene.render.filepath
except Exception:
    _DSH_FP0 = None
_dsh_stage_emit("preload-done")
import bpy, json
assert bpy.context.scene.render.engine == "CYCLES", bpy.context.scene.render.engine
print("HEADLESS " + json.dumps({"engine": bpy.context.scene.render.engine, "preserved": True}))
_dsh_stage_emit("script-end")

_dsh_stage_emit("done")