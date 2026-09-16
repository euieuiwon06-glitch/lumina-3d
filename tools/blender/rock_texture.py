# 테라스·둔덕 재질에 돌 느낌(얼룩·잔 범프)을 넣는다.
#
#   blender -b <scene.blend> --python rock_texture.py -- --preview   # 가까이서 미리 렌더(저장 안 함)
#   blender -b <scene.blend> --python rock_texture.py -- --apply     # .blend에 저장
#
# 웹에서는 조명을 정점 색으로 구워 쓰므로 정점 간격(약 0.27m)보다 잔 무늬는 뭉개진다.
# 그래서 여기서는 그 간격에서도 살아남는 얼룩과, 굽는 순간의 음영을 흔드는 범프만 넣는다.
# 실루엣을 깨는 실제 요철은 커브에 디스플레이스를 걸 수 없어 내보내기 쪽에서 한다
# (bake.py의 roughen — 커브를 메시로 realize한 뒤 정점을 민다).
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
APPLY = '--apply' in argv
PREVIEW = '--preview' in argv


def num(flag, default):
    return float(next((a.split('=')[1] for a in argv if a.startswith(f'--{flag}=')), default))


# 재질: 얼룩 세기(색 변화 비율), 범프 세기
MOTTLE = num('mottle', 0.15)
BUMP = num('bump', 0.38)

GROUND_MATS = ['M_IvoryTerrace', 'M_IvoryTerraceSide', 'M_LilacBank', 'M_LilacBankUnder', 'M_LilacSoil']
SKIP_COLLECTIONS = {'KIT_공통에셋', 'CAMERAS', 'NAV_동선표시', 'ENV_조명_Lights'}
GEOM = {'MESH', 'CURVE', 'SURFACE'}


def shipped(o):
    return not any(c.name in SKIP_COLLECTIONS for c in o.users_collection)


def mats(o):
    return {s.material.name for s in o.material_slots if s.material}


# ------------------------------------------------------------------ 재질 얼룩·범프
def ensure_nodes(mat):
    """기존 노드는 그대로 두고, 베이스 색에 얼룩을 곱하고 범프를 더한다(있으면 값만 갱신)."""
    nt = mat.node_tree
    n = nt.nodes
    bsdf = next((x for x in n if x.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return False

    # --- 얼룩: 노이즈 → 컬러램프 → 베이스 색에 곱하기
    mix = n.get('ROCK_Mottle')
    if mix is None:
        # 월드 좌표로 뽑아야 맞붙은 조각끼리 얼룩이 이어진다
        coord = n.new('ShaderNodeNewGeometry')
        coord.name = 'ROCK_Coord'
        noise = n.new('ShaderNodeTexNoise')
        noise.name = 'ROCK_Noise'
        ramp = n.new('ShaderNodeValToRGB')
        ramp.name = 'ROCK_Ramp'
        mix = n.new('ShaderNodeMixRGB')
        mix.name = 'ROCK_Mottle'
        mix.blend_type = 'MULTIPLY'
        nt.links.new(noise.inputs['Vector'], coord.outputs['Position'])
        nt.links.new(ramp.inputs['Fac'], noise.outputs['Fac'])
        nt.links.new(mix.inputs['Color2'], ramp.outputs['Color'])
        # 원래 베이스 색을 mix의 Color1로 옮기고, mix를 베이스 색에 꽂는다
        src = bsdf.inputs['Base Color']
        if src.is_linked:
            nt.links.new(mix.inputs['Color1'], src.links[0].from_socket)
        else:
            mix.inputs['Color1'].default_value = src.default_value[:]
        nt.links.new(src, mix.outputs['Color'])
    noise = n['ROCK_Noise']
    ramp = n['ROCK_Ramp']
    # 정점 간격(약 0.27m)에서 살아남을 만한 크기: 무늬 하나가 대략 0.5m
    noise.inputs['Scale'].default_value = 1.9
    noise.inputs['Detail'].default_value = 9.0
    noise.inputs['Roughness'].default_value = 0.68
    ramp.color_ramp.elements[0].color = (1 - MOTTLE, 1 - MOTTLE * 1.05, 1 - MOTTLE * 0.9, 1)
    ramp.color_ramp.elements[1].color = (1 + MOTTLE * 0.55, 1 + MOTTLE * 0.5, 1 + MOTTLE * 0.6, 1)
    mix.inputs['Fac'].default_value = 1.0

    # --- 범프: 잔 알갱이. 이미 범프가 있으면 그 앞에 이어 붙인다
    bump = n.get('ROCK_Bump')
    if bump is None:
        bnoise = n.new('ShaderNodeTexNoise')
        bnoise.name = 'ROCK_BumpNoise'
        bump = n.new('ShaderNodeBump')
        bump.name = 'ROCK_Bump'
        nt.links.new(bnoise.inputs['Vector'], n['ROCK_Coord'].outputs['Position'])
        nt.links.new(bump.inputs['Height'], bnoise.outputs['Fac'])
        nrm = bsdf.inputs['Normal']
        if nrm.is_linked:
            # 원래 범프를 이 범프의 입력으로 넣어 두 겹으로 쌓는다
            nt.links.new(bump.inputs['Normal'], nrm.links[0].from_socket)
        nt.links.new(nrm, bump.outputs['Normal'])
    bnoise = n['ROCK_BumpNoise']
    # 범프도 정점마다 음영이 달라질 만큼은 커야 한다(더 잘면 구우면서 평균돼 사라진다)
    bnoise.inputs['Scale'].default_value = 2.6
    bnoise.inputs['Detail'].default_value = 10.0
    bnoise.inputs['Roughness'].default_value = 0.72
    bump.inputs['Strength'].default_value = BUMP
    bump.inputs['Distance'].default_value = 0.06
    return True


objs = [o for o in bpy.context.scene.objects if o.type in GEOM and shipped(o)]
ground = [o for o in objs if mats(o) & set(GROUND_MATS)]
print(f'[rock] 대상 지형 오브젝트 {len(ground)}개')

done = [m for m in GROUND_MATS if bpy.data.materials.get(m) and ensure_nodes(bpy.data.materials[m])]
print(f'[rock] 얼룩·범프 넣은 재질 {len(done)}개 {done} (얼룩 {MOTTLE}, 범프 {BUMP})')

if PREVIEW:
    import os

    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('ROCK_PreviewCam')
    cam_data.lens = 34
    cam = bpy.data.objects.new('ROCK_PreviewCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # 앞 테라스 모서리에 바짝 붙어서 본다
    t = bpy.data.objects.get('Step_00_Fore')
    from mathutils import Vector

    c = t.matrix_world.translation if t else Vector((0, 0, 0))
    cam.location = c + Vector((3.2, -6.4, 1.5))
    cam.rotation_euler = (1.30, 0.0, 0.42)
    scene.render.resolution_x, scene.render.resolution_y = 960, 600
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 96
    scene.render.filepath = os.path.join(os.environ.get('ROCK_OUT', '/tmp'), 'rock_preview.png')
    bpy.ops.render.render(write_still=True)
    print(f'[rock] 미리보기 {scene.render.filepath}')
elif APPLY:
    bpy.ops.wm.save_mainfile()
    print(f'[rock] 저장 완료 {bpy.data.filepath}')
else:
    print('[rock] 아무것도 저장하지 않았다(--preview 또는 --apply)')
