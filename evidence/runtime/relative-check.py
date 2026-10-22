import bpy,json
assert 'SameSessionCube' in bpy.data.objects
print('HEADLESS '+json.dumps({'relative_file':__file__,'objects':len(bpy.data.objects)}))
