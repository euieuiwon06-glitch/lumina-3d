# 원본 룩 보존: Cycles로 조명·GI·발광·절차적 무늬를 정점 색에 굽는다.
#   웹에서는 굽힌 값을 조명 계산 없이 그대로 보여주고(AgX 톤매핑만), 캐릭터만 실시간 조명을 쓴다.
import bpy, bmesh, math, os
import numpy as np

# 정점 색에는 블렌더 뷰 변환(AgX Punchy 등)을 거친 표시 색을 담는다 → 웹에서는 톤매핑 없이 그대로
HDR_SCALE = 1.0
SMOOTH_ITER = 2
EDGE_MAX = 0.55       # m, 이보다 긴 모서리는 잘게 나눠 조명 변화를 담는다
TRI_CAP = 50000       # 오브젝트당 조밀화 상한


def enable_gpu(scene, log):
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if [d for d in prefs.devices if d.type != 'CPU']:
                    for d in prefs.devices:
                        d.use = True
                    scene.cycles.device = 'GPU'
                    return kind
            except Exception:
                continue
    except Exception as e:
        log('GPU 설정 실패', e)
    return 'CPU'


def apply_and_single_user(objs):
    vl = bpy.context.view_layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.object.make_single_user(object=True, obdata=True, material=False, animation=False)
    bpy.ops.object.convert(target='MESH')  # 모디파이어(감면 포함) 적용


def densify(o):
    me = o.data
    s = max(abs(x) for x in o.matrix_world.to_scale()) or 1.0
    limit = EDGE_MAX / s
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(6):
        if len(bm.faces) > TRI_CAP:
            break
        long = [e for e in bm.edges if e.calc_length() > limit]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(me)
    bm.free()
    me.update()


# 표면 질감: 굽기 직전에 정점을 살짝 밀어 매끈하게 떨어지던 면·모서리를 깬다.
# 정점마다 제 법선 방향으로 밀면 맞붙은 조각 사이가 벌어지므로, 월드 좌표 하나에
# 벡터 하나가 정해지는 장(場)을 만들어 같은 자리의 정점은 같은 방향으로 민다(틈 없음).
ROUGH_WAVES = (
    # (파장 m, 가중치, 방향)
    (3.4, 1.00, (0.80, 0.42, 0.43)),
    (2.1, 0.62, (-0.35, 0.86, 0.37)),
    (1.3, 0.38, (0.55, -0.62, 0.56)),
    (0.9, 0.22, (-0.74, -0.30, 0.60)),
)


def roughen(o, amp):
    """월드 좌표 기준 벡터 노이즈만큼 정점을 민다. amp는 미터."""
    import numpy as np

    me = o.data
    n = len(me.vertices)
    if not n or amp <= 0:
        return
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(n, 3)
    mw = np.array(o.matrix_world.to_3x3())
    world = co @ mw.T + np.array(o.matrix_world.translation)

    def field(phase):
        h = np.zeros(n)
        wsum = 0.0
        for i, (wl, w, d) in enumerate(ROUGH_WAVES):
            d = np.array(d, dtype=np.float64)
            d /= np.linalg.norm(d)
            h += np.sin(world @ d * (2 * np.pi / wl) + phase + i * 1.7) * w
            wsum += w
        return h / wsum

    offset = np.stack([field(0.0), field(2.4), field(4.9)], axis=1) * amp
    # 오브젝트 로컬 좌표로 되돌려서 더한다
    co += offset @ np.linalg.inv(mw).T
    me.vertices.foreach_set('co', co.ravel())
    me.update()


def flat_shaded(me):
    return not any(p.use_smooth for p in me.polygons)


def bake_vertex_colors(objs, scene, log, samples=96, saturation=1.0, rough=None):
    apply_and_single_user(objs)
    tris = 0
    rough_mats, rough_amp = (rough or (None, 0))
    if os.environ.get('LUMINA_ROUGH') is not None:
        rough_amp = float(os.environ['LUMINA_ROUGH'])
    roughened = 0
    for o in objs:
        densify(o)
        if rough_mats and {s.material.name for s in o.material_slots if s.material} & rough_mats:
            roughen(o, rough_amp)
            roughened += 1
        me = o.data
        dom = 'CORNER' if flat_shaded(me) else 'POINT'
        if 'LuminaBake' in me.color_attributes:
            me.color_attributes.remove(me.color_attributes['LuminaBake'])
        attr = me.color_attributes.new('LuminaBake', 'FLOAT_COLOR', dom)
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = list(me.color_attributes).index(attr)
        except Exception:
            pass
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
    log(f'굽기 대상 {len(objs)}개, 조밀화 후 {tris:,} tris')
    if roughened:
        log(f'표면 요철 {roughened}개 오브젝트, 진폭 {rough_amp}m')

    scene.render.engine = 'CYCLES'
    dev = enable_gpu(scene, log)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.target = 'VERTEX_COLORS'
    vl = bpy.context.view_layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    if os.environ.get('LUMINA_SKIP_BAKE'):
        # 크기·형태만 볼 때 쓰는 지름길(색은 비어 있다). 검수용이라 배포에는 쓰지 않는다
        log('굽기 건너뜀(LUMINA_SKIP_BAKE)')
    else:
        log(f'Cycles 굽기 시작({dev}, {samples} samples)')
        bpy.ops.object.bake(type='COMBINED', target='VERTEX_COLORS', use_clear=True)
        log('굽기 완료')

    # 1) 정점 노이즈 줄이기: 부드러운 면은 이웃 정점과 평균(각진 면은 그대로)
    datas = []
    for o in objs:
        me = o.data
        attr = me.color_attributes['LuminaBake']
        n = len(attr.data)
        buf = np.empty(n * 4, dtype=np.float32)
        attr.data.foreach_get('color', buf)
        c = buf.reshape(n, 4)
        if attr.domain == 'POINT' and len(me.edges):
            ev = np.empty(len(me.edges) * 2, dtype=np.int32)
            me.edges.foreach_get('vertices', ev)
            ev = ev.reshape(-1, 2)
            deg = np.bincount(ev.ravel(), minlength=n).astype(np.float32)[:, None]
            for _ in range(SMOOTH_ITER):
                acc = np.zeros((n, 3), dtype=np.float32)
                np.add.at(acc, ev[:, 0], c[ev[:, 1], :3])
                np.add.at(acc, ev[:, 1], c[ev[:, 0], :3])
                avg = np.where(deg > 0, acc / np.maximum(deg, 1), c[:, :3])
                c[:, :3] = c[:, :3] * 0.4 + avg * 0.6
        datas.append((attr, c))
    # 2) 블렌더 색 관리(뷰 변환·룩·노출)를 그대로 적용해 "화면에 보이던 색"으로 바꾼다
    total = sum(len(c) for _, c in datas)
    display = apply_view_transform(np.concatenate([c[:, :3] for _, c in datas]), scene, log)
    # 3) three는 정점 색을 선형으로 읽고 출력에서 sRGB로 인코딩하므로 선형으로 되돌려 저장
    lin = np.where(display <= 0.04045, display / 12.92, ((display + 0.055) / 1.055) ** 2.4).astype(np.float32)
    k = 0
    for attr, c in datas:
        m = len(c)
        c[:, :3] = lin[k:k + m]
        c[:, 3] = 1.0
        k += m
        attr.data.foreach_set('color', c.ravel())
    log(f'색 관리 적용 {total:,}개 색 ({scene.view_settings.view_transform} / {scene.view_settings.look})')


def apply_view_transform(rgb, scene, log):
    """장면 선형 색 → 블렌더 뷰 변환을 거친 sRGB 표시값(0~1). 16비트 PNG로 저장했다 읽어 OCIO를 그대로 쓴다."""
    import os, tempfile
    n = len(rgb)
    W = 4096
    H = (n + W - 1) // W
    px = np.zeros((W * H, 4), dtype=np.float32)
    px[:n, :3] = rgb
    px[:, 3] = 1.0
    img = bpy.data.images.new('LuminaBakeCM', W, H, alpha=False, float_buffer=True)
    img.pixels.foreach_set(px.ravel())
    path = os.path.join(tempfile.gettempdir(), 'lumina_bake_cm.png')
    s = scene.render.image_settings
    prev = (s.file_format, s.color_depth, s.color_mode)
    s.file_format, s.color_depth, s.color_mode = 'PNG', '16', 'RGB'
    img.save_render(path, scene=scene)
    s.file_format, s.color_depth, s.color_mode = prev
    bpy.data.images.remove(img)
    out = bpy.data.images.load(path)
    out.colorspace_settings.name = 'Non-Color'  # 파일에 적힌 표시값 그대로 읽기
    buf = np.empty(W * H * 4, dtype=np.float32)
    out.pixels.foreach_get(buf)
    bpy.data.images.remove(out)
    return np.clip(buf.reshape(-1, 4)[:n, :3], 0, 1)


def baked_material(mat):
    """굽힌 정점 색만 쓰는 재질: 흰 바탕 × 색 속성, 투명도는 유지"""
    alpha = 1.0
    blended = False
    if mat.use_nodes and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.bl_idname == 'ShaderNodeBsdfPrincipled':
                a = n.inputs['Alpha']
                alpha = min(alpha, 0.6 if a.is_linked else float(a.default_value))
            if n.bl_idname == 'ShaderNodeBsdfTransparent':
                alpha = min(alpha, 0.6)
    try:
        blended = mat.surface_render_method == 'BLENDED' or mat.blend_method == 'BLEND'
    except Exception:
        pass
    if not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'LuminaBake'
    nt.links.new(ca.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    p.inputs['Roughness'].default_value = 1.0
    p.inputs['Alpha'].default_value = alpha if (alpha < 0.999 or blended) else 1.0
    if alpha < 0.999:
        try:
            mat.surface_render_method = 'BLENDED'
        except Exception:
            mat.blend_method = 'BLEND'
    # 웹 로더가 알아보도록 표시
    mat['lumina_baked'] = 1
