# 내보내기 공용: 절차적 재질을 glTF 호환 값으로 환산
import bpy


# ------------------------------------------------------------------ 재질 환산
def lin_avg(cols, ws=None):
    ws = ws or [1] * len(cols)
    t = sum(ws) or 1
    return [sum(c[i] * w for c, w in zip(cols, ws)) / t for i in range(3)]


def eval_color(sock, depth=0):
    """절차적 노드가 연결된 색 입력을 대표 색 하나로 환산한다."""
    if depth > 8:
        return [0.8, 0.8, 0.8]
    if not sock.is_linked:
        v = sock.default_value
        try:
            return [v[0], v[1], v[2]]
        except TypeError:
            return [float(v)] * 3
    link = sock.links[0]
    n = link.from_node
    t = n.bl_idname
    if t == 'ShaderNodeValToRGB':
        els = n.color_ramp.elements
        # 램프 가장자리보다 가운데 값이 화면에 많이 보인다
        return lin_avg([list(e.color[:3]) for e in els], [1.0 + (0.5 - abs(e.position - 0.5)) for e in els])
    if t == 'ShaderNodeMix':
        if n.data_type == 'RGBA':
            fac = n.inputs[0]
            f = 0.5 if fac.is_linked else fac.default_value
            a, b = eval_color(n.inputs[6], depth + 1), eval_color(n.inputs[7], depth + 1)
            return [a[i] * (1 - f) + b[i] * f for i in range(3)]
        return [0.8, 0.8, 0.8]
    if t == 'ShaderNodeMixRGB':
        f = 0.5 if n.inputs['Fac'].is_linked else n.inputs['Fac'].default_value
        a, b = eval_color(n.inputs['Color1'], depth + 1), eval_color(n.inputs['Color2'], depth + 1)
        return [a[i] * (1 - f) + b[i] * f for i in range(3)]
    if t == 'ShaderNodeRGB':
        v = n.outputs[0].default_value
        return [v[0], v[1], v[2]]
    if t in ('ShaderNodeAttribute', 'ShaderNodeVertexColor'):
        return None  # 정점 색
    if t in ('ShaderNodeMapRange', 'ShaderNodeMath', 'ShaderNodeTexNoise', 'ShaderNodeLayerWeight'):
        return [0.5, 0.5, 0.5]
    return [0.8, 0.8, 0.8]


def eval_float(sock, fallback):
    if not sock.is_linked:
        return float(sock.default_value)
    n = sock.links[0].from_node
    if n.bl_idname == 'ShaderNodeValue':
        return float(n.outputs[0].default_value)
    return fallback


def surface_summary(mat):
    """material → dict(base, rough, metal, alpha, emit, estr, vcol)"""
    s = dict(base=list(mat.diffuse_color[:3]), rough=0.6, metal=0.0, alpha=1.0, emit=[0, 0, 0], estr=0.0, vcol=False)
    if not (mat.use_nodes and mat.node_tree):
        return s
    out = next((n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeOutputMaterial' and n.is_active_output), None) \
        or next((n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'), None)
    if not out or not out.inputs['Surface'].is_linked:
        return s

    def visit(node, weight):
        t = node.bl_idname
        if t == 'ShaderNodeBsdfPrincipled':
            c = eval_color(node.inputs['Base Color'])
            if c is None:
                s['vcol'] = True
                c = [1, 1, 1]
            s['base'] = c
            s['rough'] = eval_float(node.inputs['Roughness'], 0.6)
            s['metal'] = eval_float(node.inputs['Metallic'], 0.0)
            a = node.inputs['Alpha']
            s['alpha'] = min(s['alpha'], (0.6 if a.is_linked else float(a.default_value)) * weight + (1 - weight))
            ec = eval_color(node.inputs['Emission Color']) or [1, 1, 1]
            # 노드로 연결된 발광은 대개 가장자리·면 방향에 따른 은은한 빛이다. 전체 발광으로 환산하면 하얗게 뜬다
            es = eval_float(node.inputs['Emission Strength'], 0.15)
            if node.inputs['Emission Color'].is_linked:
                # 발광 색이 프레넬·면 방향 노드로 연결된 경우(얼음·결정 가장자리 빛): 전체 면에는 아주 약하게
                es *= 0.12
            if es > 0 and max(ec) > 0.001:
                s['emit'], s['estr'] = ec, es * weight
        elif t == 'ShaderNodeEmission':
            ec = eval_color(node.inputs['Color']) or [1, 1, 1]
            strength_linked = node.inputs['Strength'].is_linked
            es = eval_float(node.inputs['Strength'], 1.0) * weight
            if strength_linked:
                # 보로노이·노이즈로 세기를 정하는 반짝임 점 → 면 전체에는 거의 보이지 않게
                if 'hasPrincipled' in s and s['estr'] > 0:
                    return
                es = 0.03 * weight
            s['emit'], s['estr'] = ec, es
            if 'hasPrincipled' not in s:
                s['base'] = [c * 0.4 for c in ec]
        elif t == 'ShaderNodeBsdfTransparent':
            s['alpha'] = min(s['alpha'], 1 - weight)
        elif t == 'ShaderNodeAddShader':
            for i in (0, 1):
                if node.inputs[i].is_linked:
                    visit(node.inputs[i].links[0].from_node, weight)
        elif t == 'ShaderNodeMixShader':
            f = 0.5 if node.inputs[0].is_linked else node.inputs[0].default_value
            for i, w in ((1, 1 - f), (2, f)):
                if node.inputs[i].is_linked:
                    visit(node.inputs[i].links[0].from_node, weight * w if w < 0.999 else weight)
        elif t in ('ShaderNodeBsdfDiffuse', 'ShaderNodeBsdfGlossy', 'ShaderNodeSubsurfaceScattering'):
            c = eval_color(node.inputs['Color']) or [1, 1, 1]
            s['base'] = c

    root = out.inputs['Surface'].links[0].from_node
    s['hasPrincipled'] = any(n.bl_idname == 'ShaderNodeBsdfPrincipled' for n in mat.node_tree.nodes)
    visit(root, 1.0)
    s.pop('hasPrincipled', None)
    return s


def simplify_material(mat):
    s = surface_summary(mat)
    nt = mat.node_tree if mat.use_nodes else None
    if nt is None:
        mat.use_nodes = True
        nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*[max(0, min(1, c)) for c in s['base']], 1)
    p.inputs['Roughness'].default_value = max(0.05, min(1, s['rough']))
    p.inputs['Metallic'].default_value = max(0, min(1, s['metal']))
    p.inputs['Alpha'].default_value = max(0.05, min(1, s['alpha']))
    if s['estr'] > 0:
        p.inputs['Emission Color'].default_value = (*[max(0, c) for c in s['emit']], 1)
        p.inputs['Emission Strength'].default_value = s['estr']
    if s['vcol']:
        a = nt.nodes.new('ShaderNodeVertexColor')
        nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
    if s['alpha'] < 0.999:
        try:
            mat.surface_render_method = 'BLENDED'
        except Exception:
            mat.blend_method = 'BLEND'
    return s


