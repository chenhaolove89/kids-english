# -*- coding: utf-8 -*-
"""
阅读理解篇章的逐字注音器：为每篇短文产出「多音字」的目标读音，供 gen-zh-azure.mjs
拼 SSML <phoneme> 强制读音。

为什么只注多音字：
  - 单音字的读音引擎不会错，多打 phoneme 标签只会让整句更机械（字音/例词管线也是
    「例句只注目标字，保韵律」的口径）。
  - 一/不 按项目既有口径**不注**：它们在词组里是变调（一个 yí ge、不是 bú shì），
    引擎的语句模型读得对，硬标本调反而错（见 zh_pinyin_annotate.py 同款说明）。
  - 其余凡 pypinyin 词库里有多个读音的字（下称多音字候选），**必须**在产出表里出现——
    这是本文件的核心契约，由 --check 与 tests/zh-reading.test.js 双向校验。

读音来源：pypinyin 的**词组语境**读音（整句喂进去，词表命中才可信），
再叠加人工校订表 OVERRIDES——校订才是权威：机器给的只是待审稿。

用法：
  python tools/zh_passage_annotate.py            # 产出 tools/zh-passage-pinyin.json
  python tools/zh_passage_annotate.py --report   # 只打印待人工复核的多音字清单
  python tools/zh_passage_annotate.py --check    # 校验完整性（多音字是否都已注 + 读音是否合法）
"""
import json
import sys
from pathlib import Path

from pypinyin import pinyin, Style

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'content-packages' / 'zh-passages.json'
OUT = ROOT / 'tools' / 'zh-passage-pinyin.json'

# 一/不：变调字，裸读即本调，引擎语句模型正确，硬标反而错（项目既有口径）
SANDBHI_EXCLUDED = set('一不')
# 轻声虚词：留给引擎。两类豁免的理由是**反过来的**——它们是最常见的字，语句模型在这里
# 可靠；而它们的正确形式恰恰是轻声（我的 de、看了看的 le），硬标一个本调进去会读错。
EXEMPT_FUNCTION = set('的了着地得们子个儿吧呢啊呀吗么没')
# 轻声词的后续字：pypinyin 对这类词给的是**全调**（奶奶 nǎi nǎi、胳膊 gē bó、娃娃 wá wá），
# 照注就把轻声教错了；而它们都是最常见的词，引擎的自然语音读得对轻声。所以词首照标读音，
# 后续字留给引擎。表按本批文本里真正出现的词列。
# **注意别把叠词一概而论**：形容词/副词叠词（亮亮、甜甜、卷卷、直直、慢慢、高高）标准是
# 两音节都读全调，照标才对；只有称谓与动词叠词（奶奶、爸爸、妈妈、宝宝、宝宝、摸摸）才轻声。
QINGSHENG_TAIL = {
    '胳膊': 1, '娃娃': 1, '妹妹': 1, '木头': 1, '东西': 1, '跟头': 1,  # 名词后续轻声
    '奶奶': 1, '爸爸': 1, '妈妈': 1, '宝宝': 1, '摸摸': 1,            # 称谓/动词叠词，第二音节轻声
}
# 其余汉字**一律标注**（含只有一个读音的字）。
# 为什么不能只注「多音字」：引擎会在**非常规结构**里自己读错单音字——实测「她把伞往我这边
# 偏了偏」把第二个「偏」读成 piàn（「偏」只有 piān 一个读音，所以按"多音字"筛根本注不到它）。
# 为什么叠词第二字要留给引擎：「奶奶/爸爸/妈妈/宝宝/摸摸」的正确形式是第二音节轻声，
# 硬标全调（nǎi nǎi、bà bà）比引擎的自然读法更不标准。


# 人工校订：机器给的只是待审稿，这里才是权威。
# 键 = (篇id, 行序号, '字#第几次出现')，值 = 目标拼音。用「第几次出现」定位而不是下标，
# 免得手数下标出错（比如「它背上背着一个壳」里两个「背」读音不同）。
# 每一处都要能对着句子读通；理由写在右边的注释里（零容错内容，改一处就说清为什么）。
OVERRIDES = {
    # 机器按 pypinyin 词表给的读音在句子里是错的，逐条复核出来的：
    ('ps-g12-3', 5, '倒#1'): 'dǎo',      # 「镜子倒了」是倒下，不是倒水
    ('ps-g12-5', 0, '种#1'): 'zhòng',    # 「种了一棵小树」是种树（动词），不是种子
    ('ps-g34-4', 0, '结#1'): 'jiē',      # 「结出小绒球」是结果实
    ('ps-g34-3', 5, '缝#1'): 'féng',     # 「缝了一个袖口」是缝（动词），不是缝隙
    ('ps-g34-5', 1, '卷#1'): 'juǎn',     # 「卷卷的壳」是卷起来
    ('ps-g34-5', 1, '卷#2'): 'juǎn',
    ('ps-g34-5', 1, '背#2'): 'bēi',      # 「背上背着」第二个「背」是背东西（动词）
    ('ps-g34-5', 1, '背#3'): 'bēi',      # 「像背着一座小房子」同为动词
    ('ps-g12-4', 4, '落#1'): 'luò',      # 「从云里落下来」是落（luò），不是落下的 là
    ('ps-g34-2', 3, '落#1'): 'luò',      # 「翻着跟头落下来」同样是落下来（同句后面三次机器给的都是 luò）
}


def hanzi(ch):
    return '\u4e00' <= ch <= '\u9fff'


def readings(ch):
    """该字在 pypinyin 词库里的全部读音（去重、保持顺序）"""
    out = []
    for r in pinyin(ch, style=Style.TONE, heteronym=True)[0]:
        if r not in out:
            out.append(r)
    return out


def is_target(ch):
    """需要标注的字：全部汉字，除掉变调字（一/不）与轻声虚词（留给语句模型）"""
    return hanzi(ch) and ch not in SANDBHI_EXCLUDED and ch not in EXEMPT_FUNCTION


def soft_positions(line):
    """留给引擎的位置（轻声）：返回需要跳过的下标集合。
    只按 QINGSHENG_TAIL 里逐词定位——**不做「相邻同字就跳过」的一刀切**：
    形容词叠词（亮亮的、甜甜的、卷卷的）标准是两音节全调，那种跳过会把读音交给引擎碰运气。
    """
    skip = set()
    for word, tail in QINGSHENG_TAIL.items():
        start = 0
        while True:
            j = line.find(word, start)
            if j < 0:
                break
            for k in range(tail, len(word)):
                skip.add(j + k)
            start = j + 1
    return skip


def context_readings(line):
    """整句喂进 pypinyin，逐字取语境读音（词表命中才可信）。

    注意：pypinyin 会把「——」「……」这类**连续标点当成一个 token**（一个 token 覆盖两个字符），
    直接按位置取会从那里开始整行错位（实测 g34-2 有一行因此整行没注上音）。
    这里用双指针：汉字 token 前进 1 个字符，标点 token 按它自身的字符宽度前进。
    返回 (逐字读音, 是否完全对齐)——对不齐的行要当问题报出来，不能带病出表。
    """
    toks = [r[0] if r else '' for r in pinyin(line, style=Style.TONE)]
    out = [None] * len(line)
    ci = 0
    for tok in toks:
        if ci >= len(line):
            break
        if hanzi(line[ci]):
            out[ci] = tok or None
            ci += 1
        else:
            # 标点：token 与源字符一一对应时宽度是 1，连续标点被并成一项时宽度是它的长度
            ci += max(1, len(tok))
    return out, ci == len(line)


def build():
    src = json.loads(SRC.read_text(encoding='utf-8'))
    # 按篇存「行 → 槽位数组」：与 [...line] 等长，元素为拼音或 null。
    # 不用「字→拼音」的字表形态：同一行里同一个字可能有两个读音
    # （「它背上背着一个壳」的 bèi/bēi），字表表达不了。
    table = {}
    stats = {'candidates': 0, 'annotated': 0, 'overridden': 0}
    misaligned = []
    for p in src['passages']:
        per_line = {}
        for li, line in enumerate(p['lines']):
            ctx, aligned = context_readings(line)
            soft = soft_positions(line)
            if not aligned:
                misaligned.append((p['id'], li, line))
            seen = {}
            slots = [None] * len(line)
            for i, ch in enumerate(line):
                if not is_target(ch) or i in soft:
                    continue
                stats['candidates'] += 1
                seen[ch] = seen.get(ch, 0) + 1
                key = (p['id'], li, f'{ch}#{seen[ch]}')
                if key in OVERRIDES:
                    slots[i] = OVERRIDES[key]
                    stats['overridden'] += 1
                else:
                    slots[i] = ctx[i]
                if slots[i]:
                    stats['annotated'] += 1
            if any(slots):
                per_line[line] = slots
        if per_line:
            table[p['id']] = per_line
    if misaligned:
        print(f'⚠ {len(misaligned)} 行与 pypinyin 没能对齐（这些行的读音要人工补齐）：')
        for pid, li, line in misaligned:
            print(f'    [{pid} 行{li}] {line}')
    return src, table, stats


def report(src, table, stats):
    """打印待人工复核的清单：按「字→读音」聚合，附一个例句，便于逐条读通"""
    seen = {}
    for p in src['passages']:
        for li, line in enumerate(p['lines']):
            slots = table.get(p['id'], {}).get(line)
            if not slots:
                continue
            for i, py in enumerate(slots):
                if py:
                    seen.setdefault((line[i], py), []).append((p['id'], li, line))
    print(f'多音字（字→读音）共 {len(seen)} 种（候选 {stats["candidates"]} 处，人工校订 {stats["overridden"]} 处）：')
    for (ch, py), places in sorted(seen.items()):
        allr = '|'.join(readings(ch))
        mark = '★' if len(places) and any(py == r for r in readings(ch)) else '✗'
        print(f'  {mark} {ch} → {py:<8} (词库: {allr}) ×{len(places)}')
    print('\n同一字出现多种读音的地方（逐个确认语境；机器容易在这里出错）：')
    mixed = {}
    for (ch, py), places in seen.items():
        mixed.setdefault(ch, {})[py] = places
    for ch, pys in sorted(mixed.items()):
        if len(pys) < 2:
            continue
        print(f'  {ch}: {" / ".join(sorted(pys))}')
        for py, places in sorted(pys.items()):
            pid, li, line = places[0]
            print(f'      {py:<8} [{pid} 行{li}] {line}')
    # 同行同字多次出现：必须逐次确认（字表形态在这里会静默丢读音）
    print('\n同一行里同一个字出现多次的行（逐次确认）：')
    n = 0
    for p in src['passages']:
        for li, line in enumerate(p['lines']):
            cnt = {}
            for ch in line:
                if is_target(ch):
                    cnt[ch] = cnt.get(ch, 0) + 1
            dup = [c for c, k in cnt.items() if k > 1]
            if dup:
                n += 1
                print(f'      [{p["id"]} 行{li}] {line}  ← {dup}')
    if not n:
        print('      （无）')


def drift(computed):
    """表与源是否一致：--check 校验的是重新计算的结果，若磁盘上的表与它不同
    （手改过、或改了正文没重跑注音器），下游读的仍是旧表——必须报出来。"""
    if not OUT.exists():
        return '注音表不存在，请先跑 python tools/zh_passage_annotate.py'
    on_disk = json.loads(OUT.read_text(encoding='utf-8'))
    if on_disk != computed:
        pids = sorted(set(list(on_disk) + list(computed)))
        diff = [p for p in pids if on_disk.get(p) != computed.get(p)]
        return f'注音表与正文/校订表不一致（受影响：{"、".join(diff[:5])}），请重跑注音器'
    return None


def check(src, table):
    """完整性契约：文本里每个**需要标注**的字都必须已注音，且读音必须是该字的合法读音之一。
    软位置（叠词第二字、轻声词后续字）是有意留给引擎的，不算漏注。"""
    problems = []
    for p in src['passages']:
        for li, line in enumerate(p['lines']):
            slots = table.get(p['id'], {}).get(line)
            soft = soft_positions(line)
            for i, ch in enumerate(line):
                if not is_target(ch) or i in soft:
                    continue
                py = slots[i] if slots else None
                if not py:
                    problems.append(f'{p["id"]} 行{li}：「{ch}」没有注音（{line[:30]}）')
                elif py not in readings(ch):
                    problems.append(f'{p["id"]} 行{li}：「{ch}」的注音 {py} 不是它的读音之一（词库 {"|".join(readings(ch))}）')
    stale = drift(table)
    if stale:
        problems.append(stale)
    if problems:
        print(f'✗ 注音不完整/不合法：{len(problems)} 处')
        for x in problems[:20]:
            print('  - ' + x)
        return 1
    total = sum(1 for per in table.values() for slots in per.values() for s in slots if s)
    print(f'✓ 注音完整：{len(table)} 篇、{total} 处多音字标注，全部是该字的合法读音，且与磁盘上的表一致')
    return 0


def main():
    src, table, stats = build()
    if '--check' in sys.argv:
        return check(src, table)
    if '--report' in sys.argv:
        report(src, table, stats)
        return 0
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'✓ 已写出 {OUT.relative_to(ROOT)}：{len(table)} 篇、候选 {stats["candidates"]} 处、已注 {stats["annotated"]} 处（其中人工校订 {stats["overridden"]} 处）')
    return check(src, table)


if __name__ == '__main__':
    sys.exit(main())
