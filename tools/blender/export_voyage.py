# LUMINA 3D — 항해 연출용 우주 해파리 정원(Space_Jellyfish_Garden_360.blend) → 웹 에셋
#
#   blender -b Space_Jellyfish_Garden_360.blend --python export_voyage.py -- <out_dir> [--no-pano] [--no-glb]
#
# 원본 .blend는 저장하지 않는다(메모리에서만 변환). 원본에는 애니메이션이 없으므로
# 헤엄(갓 수축·촉수 물결·섬 지나감)은 웹에서 만든다. 그래서 움직일 단위로 묶어 내보낸다.
# 산출물
#   <out>/space_pano.jpg  하늘·성운·달·먼 행성 360° 파노라마(Cycles)
#   <out>/voyage.glb      JF_Bell(갓·정원·나무, 불투명 부분은 조명을 정점 색에 구움)
#                         JF_Tentacles(촉수 리본·구슬 줄, 같은 로컬 좌표 → 웹 정점 셰이더로 물결)
#                         Island_XX(떠 있는 섬, 구움)
#   <out>/voyage.json     구슬·조명 위치(빛 번짐 점), 기준 카메라
import bpy, sys, os, json, math, time
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import simplify_material  # noqa: E402
import bake as baker  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
FLAGS = set(argv[1:])
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
sc = bpy.context.scene
vl = bpy.context.view_layer


def log(*a):
    print(f'[voyage {time.time() - T0:6.1f}s]', *a, flush=True)


def to_yup(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


# 반투명 막(웹에서 가장자리가 밝은 막 셰이더로 그린다) — 굽지 않는다
TRANSPARENT = {'Jelly_Bell', 'Jelly_Rim', 'Jelly_Tentacle', 'Lantern_Pod', 'Crystal'}
ROOT = bpy.data.objects['Jellyfish_Root']
JELLY = bpy.data.collections['Jellyfish']
ENV = bpy.data.collections['Environment']


def mats_of(o):
    return [s.material.name for s in o.material_slots if s.material]


jelly_objs = [o for o in JELLY.all_objects if o.type in ('MESH', 'CURVE')]
islands = [o for o in ENV.all_objects if o.type == 'MESH' and o.name.startswith('Island_')]
root_inv = ROOT.matrix_world.inverted()

# ------------------------------------------------------------------ 빛 번짐 점·카메라 기록
meta = dict(beads=[], lights=[], pods=[])
for o in JELLY.all_objects:
    local = root_inv @ o.matrix_world.translation
    if o.type == 'MESH' and o.name.startswith('Bead_'):
        meta['beads'].append(to_yup(local))
    elif o.type == 'LIGHT':
        meta['lights'].append(dict(p=to_yup(local), color=[round(c, 3) for c in o.data.color], energy=o.data.energy))
cam = bpy.data.objects.get('Cam_Hero')
if cam:
    fwd = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
    meta['camHero'] = dict(p=to_yup(root_inv @ cam.matrix_world.translation), dir=to_yup(fwd), lens=cam.data.lens)
meta['root'] = to_yup(ROOT.matrix_world.translation)
log(f'구슬 {len(meta["beads"])}개, 조명 {len(meta["lights"])}개')

# ------------------------------------------------------------------ 파노라마(해파리·섬 숨김)
if '--no-pano' not in FLAGS:
    hidden = []
    for o in jelly_objs + islands + [o for o in ENV.all_objects if o.name.startswith('Island_') and o.type != 'MESH']:
        if not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    cd = bpy.data.cameras.new('PanoCam')
    cd.type = 'PANO'
    try:
        cd.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cd.cycles.panorama_type = 'EQUIRECTANGULAR'
    cd.clip_end = 100000
    pc = bpy.data.objects.new('PanoCam', cd)
    sc.collection.objects.link(pc)
    pc.location = ROOT.matrix_world.translation
    pc.rotation_euler = (math.pi / 2, 0, 0)  # 등장방형 가운데 = 블렌더 +Y
    sc.camera = pc
    sc.render.engine = 'CYCLES'
    baker.enable_gpu(sc, log)
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 4096, 2048, 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    sc.render.filepath = os.path.join(OUT, 'space_pano.jpg')
    bpy.ops.render.render(write_still=True)
    log('파노라마', sc.render.filepath)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(pc)

if '--no-glb' in FLAGS:
    with open(os.path.join(OUT, 'voyage.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)
    log('완료(GLB 생략)')
    sys.exit(0)

# ------------------------------------------------------------------ 메시로 바꾸기
bpy.ops.object.select_all(action='DESELECT')
curves = [o for o in jelly_objs if o.type == 'CURVE']
for o in curves:
    o.select_set(True)
if curves:
    vl.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
jelly_objs = [o for o in JELLY.all_objects if o.type == 'MESH']
for o in jelly_objs + islands:
    if o.data.users > 1:
        o.data = o.data.copy()

tentacle_names = ('Tentacle_', 'Bead_')
tentacles = [o for o in jelly_objs if o.name.startswith(tentacle_names)]
bell = [o for o in jelly_objs if o not in tentacles]

opaque = [o for o in jelly_objs + islands if not (set(mats_of(o)) & TRANSPARENT)]
clear = [o for o in jelly_objs + islands if o not in opaque]
log(f'불투명(굽기) {len(opaque)}개, 막 {len(clear)}개')

# 촉수 리본은 웹에서 정점을 흔들므로 길이 방향으로 촘촘하게
for o in tentacles:
    if o in clear:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        vl.objects.active = o
        bpy.ops.object.convert(target='MESH')
        baker.densify(o)

samples = int(os.environ.get('LUMINA_BAKE_SAMPLES', '64'))
baker.bake_vertex_colors(opaque, sc, log, samples=samples)

done = set()
for o in jelly_objs + islands:
    for s in o.material_slots:
        m = s.material
        if not m or m.name in done:
            continue
        done.add(m.name)
        if m.name in TRANSPARENT:
            simplify_material(m)
        else:
            baker.baked_material(m)


# ------------------------------------------------------------------ 움직일 단위로 묶기
def join(objs, name, parent=None):
    objs = [o for o in objs if o.name in bpy.data.objects]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = vl.objects.active
    ob.name = name
    ob.data.name = name
    if parent is not None:
        mw = ob.matrix_world.copy()
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
        ob.matrix_world = mw
    return ob


def rebase_to_root(ob):
    """오브젝트 로컬 좌표 = 해파리 루트 로컬 좌표가 되게(웹 셰이더가 같은 좌표로 촉수 길이를 잰다)"""
    mw = ob.matrix_world.copy()
    ob.data.transform(ROOT.matrix_world.inverted() @ mw)
    ob.parent = ROOT
    ob.matrix_parent_inverse.identity()
    ob.matrix_basis.identity()


dome = next((o for o in bell if o.name == 'Bell_Dome'), bell[0])
bell_ob = join([dome] + [o for o in bell if o is not dome], 'JF_Bell')
rebase_to_root(bell_ob)
tent_ob = join(tentacles, 'JF_Tentacles')
rebase_to_root(tent_ob)
isl_obs = []
for e in [o for o in ENV.all_objects if o.type == 'EMPTY' and o.name.startswith('Island_')]:
    # 앞서 합친 섬의 오브젝트는 지워졌으므로 목록을 새로 읽는다
    kids = [o for o in ENV.all_objects if o.type == 'MESH' and o.parent == e]
    ob = join(kids, f'{e.name}_M')
    if ob:
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = mw
        isl_obs.append(ob)
vl.update()

bpy.ops.object.select_all(action='DESELECT')
for o in [ROOT, bell_ob, tent_ob] + isl_obs:
    o.select_set(True)
path = os.path.join(OUT, 'voyage.glb')
bpy.ops.export_scene.gltf(
    filepath=path, export_format='GLB', use_selection=True, export_apply=True,
    export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_texcoords=False, export_animations=False, export_skins=False, export_morph=False,
)
log('GLB', path, f'{os.path.getsize(path) / 1e6:.1f}MB')

# 촉수 길이(웹 물결 세기 정규화용)
xs = [v.co.x for v in tent_ob.data.vertices]
meta['tentacleLength'] = round(max(xs) - min(xs), 3)
meta['baked'] = dict(display=True, view=sc.view_settings.view_transform, look=sc.view_settings.look)
with open(os.path.join(OUT, 'voyage.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False)
log('완료')
