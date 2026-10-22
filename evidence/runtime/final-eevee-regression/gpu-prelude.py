def _dsh_engine_setup():
    import bpy, json
    mode = "eevee"
    manual = False
    info = {"mode": mode, "manual": manual}
    try:
        import gpu
        info["backend"] = gpu.platform.backend_type_get()
        info["renderer"] = gpu.platform.renderer_get()
    except Exception as e:
        info["backend"] = "n/a: %s" % str(e)[:60]
    sc = bpy.context.scene
    info["before"] = {"engine": sc.render.engine}
    if mode == "keep":
        info["ok"] = True
        info["skipped"] = True
        info["after"] = {"engine": sc.render.engine}
        print("DSH_GPU " + json.dumps(info, ensure_ascii=False))
        return
    if mode == "cycles":
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
        except Exception as e:
            info.update({"ok": False, "error": "no cycles prefs: %s" % e})
            print("DSH_GPU " + json.dumps(info, ensure_ascii=False))
            return
        def snap():
            try:
                devs = [d.name for d in prefs.devices if d.use and d.type != "CPU"]
            except Exception:
                devs = []
            return {"device_type": prefs.compute_device_type, "scene_device": getattr(sc.cycles, "device", None), "gpu_enabled": devs}
        info["cycles_before"] = snap()
        if info["cycles_before"]["device_type"] == "NONE" or not info["cycles_before"]["gpu_enabled"]:
            chosen = None
            errs = []
            for t in ["OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"]:
                try:
                    prefs.compute_device_type = t
                    prefs.get_devices()
                    if [d for d in prefs.devices if d.type != "CPU"]:
                        for d in prefs.devices:
                            d.use = (d.type != "CPU")
                        chosen = t
                        break
                except Exception as e:
                    errs.append("%s: %s" % (t, e))
            info["tried"] = errs
            info["configured"] = chosen
            if not chosen:
                info["error"] = "no GPU backend available (tried OPTIX/CUDA/HIP/ONEAPI/METAL)"
        try:
            sc.render.engine = "CYCLES"
            if info.get("configured"):
                sc.cycles.device = "GPU"
        except Exception as e:
            info["engine_set_err"] = str(e)[:80]
        info["cycles_after"] = snap()
        a = info["cycles_after"]
        info["fell_back_to_cpu"] = bool(a["device_type"] == "NONE" or not a["gpu_enabled"])
        info["ok"] = (not info["fell_back_to_cpu"]) or (not manual)
        info["after"] = {"engine": sc.render.engine}
        print("DSH_GPU " + json.dumps(info, ensure_ascii=False))
        return
    ee = getattr(sc, "eevee", None)
    info["before"]["rt"] = getattr(ee, "use_raytracing", None)
    info["before"]["samples"] = getattr(ee, "taa_render_samples", None)
    try:
        try:
            sc.render.engine = "BLENDER_EEVEE_NEXT"
        except (TypeError, ValueError):
            sc.render.engine = "BLENDER_EEVEE"
        if ee is not None:
            if hasattr(ee, "use_raytracing"):
                ee.use_raytracing = True
            if hasattr(ee, "ray_tracing_method"):
                try:
                    ee.ray_tracing_method = "SCREEN"
                except Exception:
                    pass
            if hasattr(ee, "use_shadows"):
                ee.use_shadows = True
            for attr, val in (("shadow_ray_count", 2), ("shadow_step_count", 8)):
                if hasattr(ee, attr):
                    try:
                        setattr(ee, attr, val)
                    except Exception:
                        pass
            cur = getattr(ee, "taa_render_samples", 64) or 64
            if hasattr(ee, "taa_render_samples") and cur < 64:
                ee.taa_render_samples = 64
        info["configured"] = "eevee-rt" if (ee is not None and getattr(ee, "use_raytracing", False)) else "eevee"
    except Exception as e:
        info["ok"] = False
        info["error"] = "%s: %s" % (type(e).__name__, str(e)[:120])
    info["after"] = {"engine": sc.render.engine, "rt": getattr(ee, "use_raytracing", None),
                     "ray_method": str(getattr(ee, "ray_tracing_method", "")), "samples": getattr(ee, "taa_render_samples", None)}
    info["fell_back_to_cpu"] = False
    info.setdefault("ok", True)
    print("DSH_GPU " + json.dumps(info, ensure_ascii=False))
_dsh_engine_setup()
del _dsh_engine_setup