"""默认 prompt 拒答出口实机验证（需真实 GPU sidecar，不进 CI 单测套件）。

用法：sidecar 运行中（:12002）执行
    python verify_refusal_live.py
对同一默认 prompt 断言两条底线：
  1. 确定性噪声图 → 不编造出实际物体/场景/人物/活动（允许"噪点/雪花"的字面描述或【信息不足】拒答）
  2. 真实屏幕截图 → 必须给出实质描述（防出口过宽导致偷懒拒答）
 hallucination 判定规则：输出中出现"实际内容"词（人物/界面按钮/正在做）即编造；
 仅描述噪点/雪花/颜色分布视为字面描述，可接受（2026-09-08 四版 prompt 迭代的最终行为）。
"""
import base64
import io
import json
import os
import random
import struct
import urllib.request
import zlib

SIDE = 320

# 1) 确定性噪声 PNG（纯 zlib/struct 手工构造，无第三方依赖）
rng = random.Random(20260908)
raw = b''.join(b'\x00' + bytes(rng.randrange(256) for _ in range(SIDE * 3)) for _ in range(SIDE))

def chunk(typ, data):
    c = struct.pack('>I', len(data)) + typ + data
    return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', SIDE, SIDE, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 6))
       + chunk(b'IEND', b''))
noise_b64 = base64.b64encode(png).decode()

# 2) 真实截图（管家最近捕获的屏幕帧；路径可被参数覆盖）
real_path = os.environ.get('VERIFY_REAL_IMAGE',
                           r'E:/project/HermesProject/Obsidian/TheFool/2026-09/images/20260908_220216.jpg')
with open(real_path, 'rb') as f:
    real_b64 = base64.b64encode(f.read()).decode()
print(f'噪声图 base64 {len(noise_b64)} B；真实截图 {len(real_b64)} B ({real_path})')

# 编造判定：输出声称存在"实际内容"（人物/可操作界面元素/正在进行的动作）即 FAIL；
# 仅描述噪点/雪花/颜色分布属字面描述（v2 prompt 下噪声图的预期行为），PASS。
HALLUCINATION_HINTS = ('人物', '正在做', '正在使用', '正在浏览', '正在操作', '一个人', '房间', '公园', '街道')

def analyze(b64, timeout):
    body = json.dumps({'image_base64': b64, 'max_new_tokens': 256}).encode()
    req = urllib.request.Request('http://127.0.0.1:12002/analyze', data=body,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        d = json.loads(resp.read().decode())
    return d['text'].strip(), d['duration_ms']

print('\n=== 测试 1：确定性噪声图（期望：拒答，或仅字面描述噪点，无编造）===')
t1, ms1 = analyze(noise_b64, 300)
print(f'({ms1} ms) 输出: {t1[:200]}')
if t1.startswith('【信息不足】'):
    r1 = 'PASS 拒答'
elif any(h in t1 for h in HALLUCINATION_HINTS):
    r1 = 'FAIL 编造实际内容'
else:
    r1 = 'PASS 字面描述（无编造）'
print('判定:', r1)

print('\n=== 测试 2：真实屏幕截图（期望正常描述，防过度拒答）===')
t2, ms2 = analyze(real_b64, 300)
print(f'({ms2} ms) 输出: {t2[:300]}')
print('判定:', 'PASS 正常描述' if not t2.startswith('【信息不足】') and len(t2) > 20 else 'FAIL 过度拒答/过短')

