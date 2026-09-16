# LUMINA 3D — 배경 .blend → 웹 게임 에셋 변환
#
#   blender -b <scene.blend> --python export_scene.py -- <scene_id> <out_dir> [--no-pano] [--no-grid] [--no-glb]
#
# 원본 .blend는 저장하지 않는다(메모리에서만 변환).
# 산출물
#   <out>/<id>.glb        걸어 다니는 근경(재질은 glTF 호환 값으로 환산, Draco 압축)
#   <out>/<id>_pano.jpg   원경+하늘 360° 파노라마(Cycles 등장방형 렌더)
#   <out>/<id>.json       동선 표시(ENTRY/EXIT/POI/QUEST), 조명, 보행 격자, 기준 카메라
import bpy, bmesh, sys, os, json, math, base64, time
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import simplify_material  # noqa: E402
import bake as baker  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SID, OUT = argv[0], argv[1]
FLAGS = set(argv[2:])
os.makedirs(OUT, exist_ok=True)
T0 = time.time()


def log(*a):
    print(f'[export {SID} {time.time() - T0:6.1f}s]', *a, flush=True)


# 장면별 설정: 원경(파노라마로만 굽는 컬렉션), 보행 컬렉션, 폴리곤 예산
CONFIG = {
    'workshop':  dict(far=['ENV_외부전경_Exterior'], walk=['ENV_바닥_Walkable']),
    'neighborhood': dict(far=[], walk=['ENV_바닥_Walkable']),
    'walkway':   dict(far=[], walk=['ENV_산책로_Walkable']),
    'overlook':  dict(far=['ENV_우주_행성_Space'], walk=['ENV_테라스_Walkable', 'ENV_항해정원_NavigationGarden']),
    'nursery':   dict(far=[], walk=['ENV_바닥_Walkable']),
    'solar':     dict(far=['ENV_구름바다_CloudSea', 'ENV_먼섬_DistantIslands', 'ENV_하늘_행성_태양_Sky'],
                      walk=['ENV_대지선반_Walkable', 'ENV_길_Path']),
    # rough: (요철을 줄 재질, 진폭 m). 표면을 실제로 울퉁불퉁하게 만들지만 Draco 압축이
    # 크게 나빠진다 — 같은 조건에서 GLB가 진폭 0m 4.1MB, 2cm 14.8MB, 5cm 15.6MB로
    # 진폭과 거의 무관하게 +11MB 늘었다(면의 규칙성이 깨지는 것 자체가 원인).
    # 그래서 여기서는 꺼 두고, 같은 노이즈 장으로 웹에서 그릴 때 정점을 민다(src/engine/rock.js,
    # LOOK.twilight.rock). 파일 크기는 그대로다. 굽기에는 재질 얼룩·범프(rock_texture.py)만 들어간다.
    'twilight':  dict(far=['ENV_먼섬_지평선_Distant', 'ENV_하늘_달_Sky'], walk=['ENV_디딤테라스_Walkable'],
                      rough=({'M_IvoryTerrace', 'M_IvoryTerraceSide', 'M_LilacBank', 'M_LilacBankUnder', 'M_LilacSoil'}, 0.0)),
    'ice':       dict(far=['ENV_원경_산맥_바다_해파리'], walk=['ENV_얼음대지_Walkable', 'ENV_계단테라스_징검다리', 'ENV_도착선착장_Dock']),
}
cfg = CONFIG[SID]
SKIP = {'CAMERAS', 'NAV_동선표시', 'KIT_공통에셋', 'ENV_조명_Lights'}
MAX_TRIS_PER_OBJECT = 36000
GRID_CELL = 0.25

scene = bpy.context.scene
vl = bpy.context.view_layer


def to_yup(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def layer_coll(lc, name):
    if lc.collection.name == name:
        return lc
    for c in lc.children:
        r = layer_coll(c, name)
        if r:
            return r
    return None


def coll_of(ob):
    return ob.users_collection[0].name if ob.users_collection else ''


# ------------------------------------------------------------------ 동선·조명·카메라 기록
def gather_meta():
    nav = {}
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and any(c.name == 'NAV_동선표시' for c in o.users_collection):
            fwd = o.matrix_world.to_3x3() @ Vector((0, 0, 1)) if o.empty_display_type == 'SINGLE_ARROW' else None
            nav[o.name] = dict(p=to_yup(o.matrix_world.translation), dir=to_yup(fwd) if fwd else None)
    lights = []
    for o in bpy.data.objects:
        if o.type != 'LIGHT' or o.hide_render:
            continue
        L = o.data
        d = o.matrix_world.to_3x3() @ Vector((0, 0, -1))
        lights.append(dict(name=o.name, type=L.type, p=to_yup(o.matrix_world.translation), dir=to_yup(d),
                           color=[round(c, 4) for c in L.color], energy=round(L.energy, 3),
                           size=round(getattr(L, 'size', 0) or getattr(L, 'shadow_soft_size', 0), 3)))
    cams = {}
    for o in bpy.data.objects:
        if o.type == 'CAMERA':
            fwd = o.matrix_world.to_3x3() @ Vector((0, 0, -1))
            cams[o.name] = dict(p=to_yup(o.matrix_world.translation), dir=to_yup(fwd), lens=o.data.lens)
    w = scene.world
    return dict(nav=nav, lights=lights, cameras=cams,
                view=dict(transform=scene.view_settings.view_transform, look=scene.view_settings.look,
                          exposure=scene.view_settings.exposure),
                world=w.name if w else None)


# ------------------------------------------------------------------ 메시 준비
def prepare_meshes(far):
    """보이는 근경 오브젝트만 남기고 커브를 메시로, 무거운 오브젝트는 줄인다."""
    keep = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in list(scene.objects):
        c = coll_of(o)
        lc = layer_coll(vl.layer_collection, c) if c else None
        if lc and lc.exclude:
            continue
        if o.type not in ('MESH', 'CURVE') or c in SKIP or c in far or o.hide_render or not o.visible_get():
            continue
        keep.append(o)
    # 커브 → 메시
    curves = [o for o in keep if o.type == 'CURVE']
    if curves:
        bpy.ops.object.select_all(action='DESELECT')
        for o in curves:
            o.select_set(True)
        vl.objects.active = curves[0]
        bpy.ops.object.convert(target='MESH')
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in keep:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        ev.to_mesh_clear()
        if n > MAX_TRIS_PER_OBJECT:
            m = o.modifiers.new('WebDecimate', 'DECIMATE')
            m.ratio = MAX_TRIS_PER_OBJECT / n
            m.use_collapse_triangulate = True
            n = MAX_TRIS_PER_OBJECT
        total += n
    log(f'근경 오브젝트 {len(keep)}개, 약 {total:,} tris')
    return keep


# ------------------------------------------------------------------ GLB
def export_glb(objs, baked=False):
    seen = set()
    for o in objs:
        for slot in o.material_slots:
            if slot.material and slot.material.name not in seen:
                seen.add(slot.material.name)
                (baker.baked_material if baked else simplify_material)(slot.material)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, f'{SID}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_texcoords=False, export_animations=False, export_skins=False, export_morph=False,
    )
    log('GLB', path, f'{os.path.getsize(path) / 1e6:.1f}MB')


# ------------------------------------------------------------------ 파노라마
def render_pano(far, origin):
    for c in bpy.data.collections:
        lc = layer_coll(vl.layer_collection, c.name)
        if c.name in far or c.name in ('ENV_조명_Lights', 'CAMERAS'):
            continue
        if lc and not lc.exclude:
            c.hide_render = True
    cam_data = bpy.data.cameras.new('PanoCam')
    cam_data.type = 'PANO'
    try:
        cam_data.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cam_data.cycles.panorama_type = 'EQUIRECTANGULAR'
    cam_data.clip_end = 100000
    cam = bpy.data.objects.new('PanoCam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = origin
    cam.rotation_euler = (math.pi / 2, 0, 0)  # 등장방형 가운데 = 블렌더 +Y
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type != 'CPU']
                if gpus:
                    for d in prefs.devices:
                        d.use = True
                    scene.cycles.device = 'GPU'
                    log('Cycles GPU', kind, [d.name for d in gpus])
                    break
            except Exception:
                continue
    except Exception as e:
        log('GPU 설정 실패, CPU 사용', e)
    scene.render.resolution_x = 4096
    scene.render.resolution_y = 2048
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 90
    path = os.path.join(OUT, f'{SID}_pano.jpg')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log('파노라마', path)


# ------------------------------------------------------------------ 보행 격자
def world_tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        try:
            me = ev.to_mesh()
        except Exception:
            continue
        if not me:
            continue
        me.calc_loop_triangles()
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in me.vertices)
        polys.extend((base + t.vertices[0], base + t.vertices[1], base + t.vertices[2]) for t in me.loop_triangles)
        ev.to_mesh_clear()
    return verts, polys


def build_grid(objs, walk_colls, starts):
    walk = [o for o in objs if coll_of(o) in walk_colls]
    obst = [o for o in objs if coll_of(o) not in walk_colls]
    wv, wp = world_tris(walk)
    ov, op = world_tris(obst)
    if not wp:
        log('보행 메시 없음')
        return None
    wb = BVHTree.FromPolygons(wv, wp)
    ob = BVHTree.FromPolygons(ov, op) if op else None
    xs = [v.x for v in wv]
    ys = [v.y for v in wv]
    zs = [v.z for v in wv]
    x0, x1, y0, y1 = min(xs) - 0.5, max(xs) + 0.5, min(ys) - 0.5, max(ys) + 0.5
    ztop = max(zs) + 3
    W = int((x1 - x0) / GRID_CELL) + 1
    H = int((y1 - y0) / GRID_CELL) + 1
    LAYERS = 3
    NAN = float('nan')
    grid = [[NAN] * (W * H) for _ in range(LAYERS)]
    down = Vector((0, 0, -1))
    up = Vector((0, 0, 1))
    R = 0.26
    log(f'격자 {W}x{H} 셀 계산')
    for j in range(H):
        y = y0 + j * GRID_CELL
        for i in range(W):
            x = x0 + i * GRID_CELL
            origin = Vector((x, y, ztop))
            found = []
            dist_left = ztop - (min(zs) - 1)
            guard = 0
            while guard < 12:
                guard += 1
                loc, nrm, idx, d = wb.ray_cast(origin, down, dist_left)
                if loc is None:
                    break
                # 위를 향한 면만 바닥(판·땅덩이의 밑면은 제외)
                if nrm.z > 0.55 and (not found or found[-1] - loc.z > 0.6):
                    found.append(loc.z)
                origin = loc + down * 0.02
                dist_left -= d + 0.02
            k = 0
            for z in found:
                if k >= LAYERS:
                    break
                p = Vector((x, y, z))
                blocked = False
                if ob:
                    for hgt in (0.35, 0.75, 1.1):
                        hit = ob.find_nearest(p + up * hgt, R)
                        if hit[0] is not None:
                            blocked = True
                            break
                    if not blocked:
                        hit = ob.ray_cast(p + up * 0.05, up, 1.2)
                        if hit[0] is not None:
                            blocked = True
                # 바로 위에 다른 보행면이 있으면(판 밑면·다리 아래 좁은 틈) 설 수 없다
                if not blocked and wb.ray_cast(p + up * 0.08, up, 1.1)[0] is not None:
                    blocked = True
                if not blocked:
                    grid[k][j * W + i] = z
                    k += 1
    # 이어진 영역(경사 한도 STEP)별로 묶고, 가장 큰 영역과 그에 버금가는 영역만 남긴다.
    # 가장자리 급경사·섬 밑면·떨어져 떠 있는 문턱 조각은 제거된다(표시는 런타임에서 가장 가까운 칸으로 옮긴다).
    STEP = 0.22
    import collections as C
    label = [[-1] * (W * H) for _ in range(LAYERS)]
    sizes = []
    for k0 in range(LAYERS):
        for n0 in range(W * H):
            if grid[k0][n0] != grid[k0][n0] or label[k0][n0] >= 0:
                continue
            lab = len(sizes)
            label[k0][n0] = lab
            q = C.deque([(n0 % W, n0 // W, k0)])
            size = 0
            while q:
                i, j, k = q.popleft()
                size += 1
                z = grid[k][j * W + i]
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ii, jj = i + di, j + dj
                    if not (0 <= ii < W and 0 <= jj < H):
                        continue
                    for kk in range(LAYERS):
                        nn = jj * W + ii
                        zz = grid[kk][nn]
                        if zz == zz and abs(zz - z) <= STEP and label[kk][nn] < 0:
                            label[kk][nn] = lab
                            q.append((ii, jj, kk))
            sizes.append(size)
    biggest = max(sizes) if sizes else 0
    good = {i for i, sz in enumerate(sizes) if sz >= max(200, biggest * 0.3)}
    log(f'연결 영역 {len(sizes)}개, 최대 {biggest:,}칸, 남김 {sorted(sizes[i] for i in good)}')
    keep = [[label[k][n] in good for n in range(W * H)] for k in range(LAYERS)]
    import array
    layers = []
    count = 0
    for k in range(LAYERS):
        # 높이(cm) Int16, 빈 칸 = -32768
        arr = array.array('h', [max(-32767, min(32767, round(grid[k][n] * 100))) if keep[k][n] else -32768 for n in range(W * H)])
        c = sum(1 for n in range(W * H) if keep[k][n])
        count += c
        if c:
            layers.append(base64.b64encode(arr.tobytes()).decode('ascii'))
    log(f'보행 가능 칸 {count:,}')
    # 블렌더 XY 격자. 런타임에서 three(x, -z)로 조회한다
    return dict(x0=round(x0, 4), y0=round(y0, 4), cell=GRID_CELL, w=W, h=H, layers=layers, step=STEP, format='int16cm')


# ------------------------------------------------------------------ 실행
meta = gather_meta()
meta['id'] = SID
nav_b = {}  # 블렌더 좌표(격자 시작점용)
for o in bpy.data.objects:
    if o.type == 'EMPTY' and any(c.name == 'NAV_동선표시' for c in o.users_collection):
        nav_b[o.name] = tuple(o.matrix_world.translation)

objs = prepare_meshes(cfg['far'])

if '--no-grid' not in FLAGS:
    starts = [v for k, v in nav_b.items() if k.startswith(('PLAYER_START', 'ENTRY_', 'EXIT_', 'POI_', 'QUEST_'))]
    meta['grid'] = build_grid(objs, set(cfg['walk']), starts)

json_path = os.path.join(OUT, f'{SID}.json')
if '--no-grid' in FLAGS and os.path.exists(json_path):
    with open(json_path, encoding='utf-8') as f:
        meta['grid'] = json.load(f).get('grid')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False)
log('JSON', json_path)

if '--no-glb' not in FLAGS:
    baked = '--bake' in FLAGS
    if baked:
        # 게임에서 움직이는 퀘스트 다리 조각은 주변에 그림자·반사광을 굽지 않는다
        # (복원 전 판석이 흩어졌을 때 길 끝에 얼룩이 남지 않게)
        for o in objs:
            if o.name.startswith('Quest_Bridge'):
                for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter'):
                    setattr(o, attr, False)
        baker.bake_vertex_colors([o for o in objs if o.type in ('MESH', 'CURVE')], scene, log,
                                 samples=int(os.environ.get('LUMINA_BAKE_SAMPLES', '128')),
                                 rough=cfg.get('rough'))
        # 정점 색 = 블렌더 뷰 변환을 거친 표시 색
        meta['baked'] = dict(display=True, view=scene.view_settings.view_transform, look=scene.view_settings.look)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False)
    export_glb(objs, baked)

if '--no-pano' not in FLAGS:
    start = nav_b.get('PLAYER_START') or next((v for k, v in nav_b.items() if k.startswith('ENTRY_')), (0, 0, 0))
    render_pano(set(cfg['far']), Vector((start[0], start[1], start[2] + 1.6)))

log('완료')
