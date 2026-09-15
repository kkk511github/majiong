"""Offline Blender 4.5 tile bake. No models/lights are shipped to the game.

Run with Blender --background --python ... -- --source <app> --out <directory>.
Every pose uses the same bevelled solid, UVs, lights and lens. A plate contains
all 42 semantic faces, so face counting/colours cannot drift between cameras.
"""
import bpy, math, json, sys, argparse
from pathlib import Path
from mathutils import Vector, Euler, Matrix

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--out', required=True)
p.add_argument('--only', default='')
p.add_argument('--individual', action='store_true')
args = p.parse_args(sys.argv[sys.argv.index('--')+1:])
out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
textures = Path(args.source)/'cocos-table/art-source/ink'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = 48
s.cycles.use_denoising = True
s.cycles.device = 'CPU'
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.image_settings.color_depth = '8'
s.view_settings.view_transform = 'Standard'
s.view_settings.look = 'None'
s.view_settings.exposure = 0
s.world.color = (0.45, 0.45, 0.45)
s.world.use_nodes = True
s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(0.85,0.9,1,1)
s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45

def mat(name,color,rough=.25):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Roughness'].default_value=rough
    b.inputs['IOR'].default_value=1.48
    return m

ivory=mat('Ivory polished melamine',(.86,.83,.74),.24)
# A shared substrate normal and roughness carry across the face and moulding.
nt=ivory.node_tree; bsdf=nt.nodes.get('Principled BSDF')
noise=nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=165; noise.inputs['Detail'].default_value=2
micro=nt.nodes.new('ShaderNodeBump'); micro.inputs['Strength'].default_value=.14; micro.inputs['Distance'].default_value=.002
nt.links.new(noise.outputs['Fac'],micro.inputs['Height']); nt.links.new(micro.outputs['Normal'],bsdf.inputs['Normal'])
bsdf.inputs['Coat Weight'].default_value=.36; bsdf.inputs['Coat Roughness'].default_value=.16
bsdf.inputs['Subsurface Weight'].default_value=.025
jade=mat('Dense green back',(.035,.23,.005),.23)
jnt=jade.node_tree; jb=jnt.nodes.get('Principled BSDF')
jn=jnt.nodes.new('ShaderNodeTexNoise');jn.inputs['Scale'].default_value=110
jbum=jnt.nodes.new('ShaderNodeBump');jbum.inputs['Strength'].default_value=.11;jbum.inputs['Distance'].default_value=.003
jnt.links.new(jn.outputs['Fac'],jbum.inputs['Height']);jnt.links.new(jbum.outputs['Normal'],jb.inputs['Normal'])
jb.inputs['Coat Weight'].default_value=.12;jb.inputs['Coat Roughness'].default_value=.28
jb.inputs['Specular IOR Level'].default_value=.22
seam=mat('Green bevel highlight',(.12,.37,.012),.26)
def cube(name,dim,loc,material,bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Moulded round bevel','BEVEL'); mod.width=bevel; mod.segments=8
    normal=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL'); normal.keep_sharp=True
    for poly in o.data.polygons: poly.use_smooth=True
    o.data.materials.append(material)
    return o

base=cube('Green body',(.76,1.08,.19),(0,0,-.105),jade,.043)
rim=cube('Green seam',(.755,1.075,.065),(0,0,-.023),seam,.024)
front=cube('Ivory body',(.76,1.08,.28),(0,0,.105),ivory,.105)
# The ink is part of the actual solid's top surface, not a separate decal quad.
# Planar UVs survive the bevel modifier, with transparent margins at the edges.
uv=front.data.uv_layers.active or front.data.uv_layers.new(name='Face UV')
for poly in front.data.polygons:
    poly.material_index=1 if poly.normal.z > .5 else 0
    for li in poly.loop_indices:
        co=front.data.vertices[front.data.loops[li].vertex_index].co
        uv.data[li].uv=(co.x/.658+.5,co.y/.97+.5)

def ink_mat(k,rotate=False):
    m=ivory.copy(); m.name='Engraved ink '+str(k); nt=m.node_tree; b=nt.nodes.get('Principled BSDF')
    tex=nt.nodes.new('ShaderNodeTexImage'); tex.extension='CLIP'; tex.interpolation='Cubic'; tex.image=bpy.data.images.load(str(textures/(str(k)+'.png')),check_existing=True)
    if rotate:
        coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Location'].default_value=(1,1,0);mapping.inputs['Rotation'].default_value=(0,0,math.pi)
        nt.links.new(coord.outputs['UV'],mapping.inputs['Vector']);nt.links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
    mix=nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MIX'; mix.inputs[1].default_value=(.86,.83,.74,1)
    nt.links.new(tex.outputs['Alpha'],mix.inputs[0]); nt.links.new(tex.outputs['Color'],mix.inputs[2]); nt.links.new(mix.outputs[0],b.inputs['Base Color'])
    # Shallow recessed enamel: the rim catches light while the centre sits inside
    # the same tile surface. The noise stays beneath the engraving normal.
    carve=nt.nodes.new('ShaderNodeBump'); carve.invert=True
    carve.inputs['Strength'].default_value=.6; carve.inputs['Distance'].default_value=.023
    nt.links.new(tex.outputs['Alpha'],carve.inputs['Height'])
    nt.links.new(nt.nodes.get('Bump').outputs['Normal'],carve.inputs['Normal'])
    nt.links.new(carve.outputs['Normal'],b.inputs['Normal'])
    spec=nt.nodes.new('ShaderNodeMapRange'); spec.inputs['To Min'].default_value=.5; spec.inputs['To Max'].default_value=.18
    nt.links.new(tex.outputs['Alpha'],spec.inputs['Value']); nt.links.new(spec.outputs['Result'],b.inputs['Specular IOR Level'])
    rough=nt.nodes.new('ShaderNodeMapRange'); rough.inputs['From Min'].default_value=0; rough.inputs['From Max'].default_value=1
    rough.inputs['To Min'].default_value=.24; rough.inputs['To Max'].default_value=.31
    nt.links.new(tex.outputs['Alpha'],rough.inputs['Value']); nt.links.new(rough.outputs['Result'],b.inputs['Roughness'])
    return m

inks=[ink_mat(k) for k in range(42)]
reverse_inks=[ink_mat(k,True) for k in range(42)]
front.data.materials.append(inks[0])
templates=[base,rim,front]
for obj in templates: obj.hide_render=True
bpy.ops.object.camera_add(location=(0,-9,10))
cam=bpy.context.object; cam.name='Baked orthographic lens'; s.camera=cam
cam.data.type='ORTHO'
def area(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object; o.name=name; o.data.energy=power; o.data.shape='DISK'; o.data.size=size
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    return o
key=area('Large softbox upper left',(-4,-6,10),1300,7)
fill=area('Soft rim', (6,4,8),850,8)

poses={
 'own':{'eye':(0,-12,3),'rot':(90,0,0),'kinds':42},
 'bottom':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42},
 'top':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42},
 # All exposed cards have level parallel edges. The side seat changes the ink
 # orientation only; lateral camera yaw made the old rows look diagonally skewed.
 'left':{'eye':(0,-10,17),'rot':(0,0,-90),'kinds':42},
 'right':{'eye':(0,-10,17),'rot':(0,0,90),'kinds':42},
 # Side flowers lie in straight rectangular troughs. Keep the raised solid
 # and engraved face, but bake both without the former trapezoidal shear.
 'flower-left':{'eye':(0,-12,15),'rot':(0,0,-90),'kinds':42,'depth':1.5},
 'flower-right':{'eye':(0,-12,15),'rot':(0,0,90),'kinds':42,'depth':1.5},
 'flower-bottom':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42,'depth':1.2},
 'flower-top':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42,'depth':1.2},
 # River and flower views now share the same mirrored tabletop axes.
 'river-left':{'eye':(0,-10,20),'rot':(0,0,-90),'kinds':42,'shear':61/407},
 'river-right':{'eye':(0,-10,20),'rot':(0,0,-90),'kinds':42,'reverseInk':True,'shear':-61/407},
 'meld-left':{'eye':(0,-10,20),'rot':(0,0,-90),'kinds':42,'shear':.1658476658},
 'meld-right':{'eye':(0,-10,20),'rot':(0,0,-90),'kinds':42,'reverseInk':True,'shear':-.1658476658},
 'left-near':{'eye':(0,-10,17),'rot':(0,0,-90),'kinds':42},
 'left-far':{'eye':(0,-10,17),'rot':(0,0,-90),'kinds':42},
 'right-near':{'eye':(0,-10,17),'rot':(0,0,90),'kinds':42},
 'right-far':{'eye':(0,-10,17),'rot':(0,0,90),'kinds':42},
 'top-left':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42},
 'top-right':{'eye':(0,-10,13),'rot':(0,0,0),'kinds':42},
 'cover-bottom':{'eye':(0,-10,13),'rot':(180,0,0),'kinds':1,'back':True},
 'cover-top':{'eye':(0,-10,13),'rot':(180,0,0),'kinds':1,'back':True},
 'cover-left':{'eye':(0,-10,20),'rot':(180,0,-90),'kinds':1,'back':True,'shear':.1658476658},
 'cover-right':{'eye':(0,-10,20),'rot':(180,0,90),'kinds':1,'back':True,'shear':-.1658476658},
 'back-top':{'eye':(0,-10,9),'rot':(90,0,180),'kinds':1,'back':True},
 # Standing tiles stay physically upright: no screen-space shear on their
 # vertical edges. Camera yaw projects their tabletop row parallel to the
 # adjacent outer groove edge (74 / 407), without leaning like a domino.
 'back-left':{'eye':(1.7250396901398164,-14,13),'rot':(90,0,-90),'kinds':1,'back':True},
 'back-right':{'eye':(-1.7250396901398164,-14,13),'rot':(90,0,90),'kinds':1,'back':True},
}
catalog={}
cell=256; spacing=1.70
for name,pose in poses.items():
    if args.only and name not in args.only.split(','): continue
    cam.location=Vector(pose['eye']).normalized()*20
    cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
    rot=Euler(tuple(math.radians(a) for a in pose['rot'])).to_matrix().to_4x4()
    rot=rot@Matrix.Diagonal((1,1,pose.get('depth',1),1))
    if pose.get('shear'):
        basis=cam.rotation_euler.to_matrix().to_4x4()
        shear=Matrix.Identity(4); shear[0][1]=pose['shear']
        rot=basis@shear@basis.inverted()@rot
    right=cam.rotation_euler.to_matrix()@Vector((1,0,0))
    up=cam.rotation_euler.to_matrix()@Vector((0,1,0))
    cols=7 if pose['kinds']>1 else 1; rows=6 if pose['kinds']>1 else 1
    s.render.resolution_x=cols*cell; s.render.resolution_y=rows*cell
    s.render.resolution_percentage=100
    # Blender's ortho_scale measures the horizontal field when landscape.
    cam.data.ortho_scale=cols*spacing
    if args.individual:
        s.render.resolution_x=384;s.render.resolution_y=384;cam.data.ortho_scale=spacing
        s.cycles.use_animated_seed=False;s.cycles.seed=0
    for frame in (range(pose['kinds']) if args.individual else [None]):
        objects=[]
        for k in ([frame] if args.individual else range(pose['kinds'])):
            offset=Vector((0,0,0)) if args.individual else right*((k%cols-(cols-1)/2)*spacing)+up*(((rows-1)/2-k//cols)*spacing)
            for t in templates:
                o=t.copy(); o.data=t.data.copy(); bpy.context.collection.objects.link(o)
                o.hide_render=False
                if pose.get('shear') or pose.get('depth'):
                    # Object transforms decompose shear into rotation/scale. Bake
                    # it into the evaluated solid instead so adjacent edges join.
                    deps=bpy.context.evaluated_depsgraph_get()
                    o.data=bpy.data.meshes.new_from_object(t.evaluated_get(deps))
                    o.modifiers.clear();o.data.transform(rot@t.matrix_world)
                    o.matrix_world=Matrix.Identity(4)
                else:
                    o.matrix_world=rot@t.matrix_world
                o.location+=offset; o.name=name+'-'+str(k)+'-'+t.name
                if t==front: o.data.materials[1]=ivory if pose.get('back') else (reverse_inks if pose.get('reverseInk') else inks)[k]
                objects.append(o)
        # Very broad lighting keeps all atlas cells at the same exposure.
        key.location=Vector((-30,-40,70)); key.data.energy=60000; key.data.size=25
        fill.location=Vector((35,20,55)); fill.data.energy=14000; fill.data.size=35
        key.rotation_euler=(-key.location).to_track_quat('-Z','Y').to_euler()
        fill.rotation_euler=(-fill.location).to_track_quat('-Z','Y').to_euler()
        s.render.filepath=str(out/(name+'-'+str(frame)+'.png' if args.individual else name+'.png'))
        bpy.ops.render.render(write_still=True)
        catalog[name]={'file':name+'.png','cell':384 if args.individual else cell,'columns':cols,'rows':rows,'kinds':pose['kinds'],'eye':pose['eye'],'rotation':pose['rot'],'shear':pose.get('shear',0),'individual':args.individual,'reverseInk':pose.get('reverseInk',False)}
        for o in objects: bpy.data.objects.remove(o,do_unlink=True)
        print('BAKED',name,flush=True)
(out/'poses.json').write_text(json.dumps(catalog,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'tile-master.blend'))
