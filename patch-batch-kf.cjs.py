import io
p = r'E:\Demo\MOO\server\src\routes\episodes.ts'
s = io.open(p, encoding='utf-8').read()
old = "candidatesPerShot: z.number().min(1).max(9).optional(), // >1 时生成九宫格候选（不选首帧，待用户挑选）\n  stream: z.boolean().optional(),"
new = "candidatesPerShot: z.number().min(1).max(9).optional(), // >1 时生成九宫格候选（不选首帧，待用户挑选）\n  frameTypes: z.array(z.enum(['first', 'last', 'middle'])).optional(), // 默认 ['first']；首尾帧链路传 ['first','last']\n  stream: z.boolean().optional(),"
assert old in s, 'old not found'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('OK patched episodes.ts')

# 同时把 opts 传递加上 frameTypes
old2 = """  const opts = {
    provider: req.body.provider,
    modelName: req.body.modelName,
    shotIds: req.body.shotIds,
    candidatesPerShot: req.body.candidatesPerShot,
  };"""
new2 = """  const opts = {
    provider: req.body.provider,
    modelName: req.body.modelName,
    shotIds: req.body.shotIds,
    candidatesPerShot: req.body.candidatesPerShot,
    frameTypes: req.body.frameTypes,
  };"""
assert old2 in s or old2 in io.open(p, encoding='utf-8').read(), 'opts not found'
s = s.replace(old2, new2, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('OK opts patched')
