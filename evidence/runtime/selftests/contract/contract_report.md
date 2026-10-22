# 契约与假设报告（自动生成）

> 生成时间：2026-10-23 02:30:48

## 组件（3）

| 组件 | 对象 | 标签 | 缺失对象 |
|---|---|---|---|
| seat | Seat | seat | - |
| backrest | Backrest, Tenon | backrest | - |
| ghost | NoSuchObject | - | NoSuchObject |

## 连接与判定（1）

| 连接 | a → b | 候选 | 禁止项 | 状态 | 判定依据 |
|---|---|---|---|---|---|
| joint | seat → backrest | attach, insert | boolean_union, weld | **unresolved** | 探针误差 0.005 <= 0.01 → 支持（不可辨识：dy, tenon_len） |

## 包络

| 包络 | min | max | 作用域 |
|---|---|---|---|
| chair_env | [-0.5, -0.5, 0.0] | [0.5, 0.5, 1.5] | Seat, Backrest, Tenon, Stray |

## 证据账本（0）

| 标签 | 文件 | md5 | 尺寸 |
|---|---|---|---|

## 历史

- 2026-10-23 02:30:48 register_component {"id": "seat", "objects": ["Seat"], "missing": []}
- 2026-10-23 02:30:48 register_component {"id": "backrest", "objects": ["Backrest", "Tenon"], "missing": []}
- 2026-10-23 02:30:48 register_component {"id": "ghost", "objects": ["NoSuchObject"], "missing": ["NoSuchObject"]}
- 2026-10-23 02:30:48 register_connection {"id": "joint", "a": "seat", "b": "backrest", "candidates": ["attach", "insert"], "status": "proposed"}
- 2026-10-23 02:30:48 register_envelope {"id": "chair_env", "min": [-0.5, -0.5, 0.0], "max": [0.5, 0.5, 1.5], "scope": ["Seat", "Backrest", "Tenon", "Stray"]}
- 2026-10-23 02:30:48 verify {"id": "joint", "verdict": "unresolved"}
- 2026-10-23 02:30:48 verify {"id": "joint", "verdict": "supported"}
- 2026-10-23 02:30:48 advance {"id": "joint", "status": "proposed"}
- 2026-10-23 02:30:48 flip {"id": "joint", "to": "attach", "why": "换假设重测"}
- 2026-10-23 02:30:48 verify {"id": "joint", "verdict": "supported"}
- 2026-10-23 02:30:48 demote {"id": "joint", "detail": {"why": "中心漂移 0.6000（门限 0.0841=对角线 10%）；尺寸漂移 ['y 1.2000']（门限 20%）", "center_moved": 0.6, "center_limit": 0.0841, "size_delta": [0.0, 1.2, 0.0], "snapshot_t": "2026-10-23 02:3

## 复现

    该报告由契约层生成：blender_rt_plan(op="report")
    假设/区间/探针流程见 docs/假设驱动建模-cookbook.md

