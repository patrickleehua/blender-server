const PLAN_HEADLESS_MAP = [
    ['visualreport_', 'dsh_visualreport_api', 'visualreport,qc,imgtools'],
    ['shapesolve_', 'dsh_shapesolve_api', 'shapesolve,imgtools'],
    ['eval_', 'dsh_evalharness_api', 'evalharness,assembly,audit,contract,clearance,gate,imgtools,calib,mesh_fix'],
    ['blockout_', 'dsh_blockout_api', 'blockout,qc,qc_render,montage'],
    ['asm_', 'dsh_assembly_api', 'assembly,audit,contract,clearance,gate,mesh_fix,geo,txn'],
    ['img_', 'dsh_img_api', 'imgtools'],
    ['audit_', 'dsh_audit_api', 'audit'],
    ['qc_render_', 'dsh_qc_render_api', 'qc_render,qc,imgtools,montage'],
    ['qc_', 'dsh_qc_api', 'qc,imgtools'],
    ['gate_', 'dsh_gate_api', 'gate,audit'],
    ['shape_', 'dsh_shape_api', 'shapegen,imgtools'],
    ['vehicle_', 'dsh_vehicle_api', 'vehicle,audit,clearance,gate'],
    ['clear_', 'dsh_clearance_api', 'clearance'],
    ['deliver_', 'dsh_deliver_api', 'deliver,gate'],
    ['fix_', 'dsh_fix_api', 'mesh_fix'],
    ['uv_', 'dsh_uv_api', 'uv_tools'],
    ['print_', 'dsh_print_api', 'printcheck'],
    ['sculpt_', 'dsh_sculpt_api', 'sculpt'],
    ['sweep_', 'dsh_sweep_api', 'sweep'],
    ['material_', 'dsh_material_api', 'material'],
    ['motion_', 'dsh_motion_api', 'motion'],
    ['generator_', 'dsh_generator_api', 'generator'],
    ['face_', 'dsh_face_api', 'faceeval'],
    ['human_', 'dsh_human_api', 'human,imgtools'],
    ['calib_', 'dsh_calib_api', 'calib'],
    ['pipe_', 'dsh_pipe_api', 'pipeline'],
];
const PLAN_HEADLESS_ALIAS = {
    qc_visual_report: ['dsh_visualreport_api', 'report', 'visualreport,qc,imgtools'],
    shape_solve: ['dsh_shapesolve_api', 'solve', 'shapesolve,imgtools'],
    fix_clash: ['dsh_assembly_api', 'repair', 'assembly,audit,contract,clearance,gate,mesh_fix,geo,txn'],
    fix_interference: ['dsh_assembly_api', 'fix_interference', 'assembly,audit,contract,clearance,gate,mesh_fix,geo,txn'],
    audit_clash_all: ['dsh_assembly_api', 'scan', 'assembly,audit,contract,clearance,gate,mesh_fix,geo,txn'],
    model_preflight: ['dsh_gate_api', 'preflight', 'gate,audit'],
    model_checkpoint: ['dsh_gate_api', 'checkpoint', 'gate,txn'],
    model_deliver: ['dsh_gate_api', 'deliver', 'gate,audit,txn,deliver'],
};
export function planHeadlessTarget(op) {
    const o = String(op || '');
    if (PLAN_HEADLESS_ALIAS[o]) {
        const a = PLAN_HEADLESS_ALIAS[o];
        return { api: a[0], sub: a[1], preload: a[2] };
    }
    for (const row of PLAN_HEADLESS_MAP) {
        const p = String(row[0]);
        if (o.indexOf(p) === 0)
            return { api: row[1], sub: o.slice(p.length), preload: row[2] };
    }
    return null;
}
