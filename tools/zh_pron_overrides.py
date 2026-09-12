# -*- coding: utf-8 -*-
"""
汉字字音注音表生成器 v2(同音字替身方案)。

背景:Edge TTS 免费端点拒绝一切注音类 SSML(phoneme/sub/break/say-as 均被服务端
掐断,见 tools/phoneme-probe*.mjs 探针),只放行纯文本。多音字裸读经常读错。
对策:把读音会错的字替换成「同音同调且使用实证无歧义」的替身字喂给 TTS,
生成音频即为正确读音——音频里只有声音没有文字。

判定源(v1 用 pypinyin heteronym 被罕见读音噪声污染,产生足→镞/鸟→袅等坏表):
  - 「使用实证读音」= pypinyin 词组表(47111 条词组)值的逐字拼音。
    一个字在真实词语里被标过哪些读音,才算数;假多音字(如 路 的 luò、越 的 huó)
    在词组里从不出现,自动消失。
  - Edge 裸字读音的两个预测器:词组最高频实证读音(偏口语高频)与 pypinyin
    默认音(词典默认,如 干→gàn、绿→lù)。两者都可能对,零容错下取并集:
    任一预测 ≠ hanzi.csv 目标读音 就替换(替换总是安全的,顶多白做一次)。

产出:tools/zh-pron-overrides.json
  { "干": {"pinyin": "gān", "sub": "甘", "evidence": 21}, ... }
sub 为 null 时 gen-assets.mjs 保留原字。表可复现、可人工审查。

规则(零容错口径):
  1. 目标读音 = tools/hanzi.csv 的 pinyin 列(人工校订)。
  2. 一/不 硬编码排除:变调字,裸读=本调,Edge 不会错(词组里的 yì/bú 是变调)。
  3. 替身字必须:使用实证只读目标音(全部词组都读目标音)、同音同调、非黑名单、
     与 hanzi.csv 课表读音不冲突、实证条数过三档门槛(30/8/3+词典单音)。
  4. 目标读音在词组里零实证的字 → 数据可疑,只报告不自动替换。
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pypinyin.phrases_dict as pd
from pypinyin import pinyin, Style

# 相对本文件定位仓库根：写死绝对路径会让换机/换目录后静默读写另一份表
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tools' / 'zh-pron-overrides.json'

# 对儿童产品不合适的替身字
BLACKLIST = set('屎尿屁痰尸孬瘟煞')
# 变调字:裸读即本调,不需要也不应该替换
SANDHI_CHARS = {'一', '不'}

TONE_MARKS = {'\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4'}


def split_pinyin(py):
    """声调标注拼音 -> (去调音节, 声调号1-5)。ü 的分音符保留。"""
    nfd = unicodedata.normalize('NFD', py)
    tone = '5'
    letters = []
    for ch in nfd:
        if ch in TONE_MARKS:
            tone = TONE_MARKS[ch]
        elif ch == '\u0308':
            letters.append(ch)
        else:
            letters.append(ch)
    base = unicodedata.normalize('NFC', ''.join(letters))
    if not re.fullmatch(r'[a-zü]+', base):
        raise ValueError(f'异常拼音: {py!r} -> {base!r}')
    return base, tone


def char_attested():
    """词组实证:字 -> Counter[(去调, 声调号)] = 该读音出现的词组数。"""
    att = defaultdict(Counter)
    bad = 0
    for phrase, val in pd.phrases_dict.items():
        if len(val) != len(phrase):
            bad += 1
            continue
        for ch, opts in zip(phrase, val):
            if not re.match(r'[\u4e00-\u9fff]', ch):
                continue
            for t in opts:
                try:
                    att[ch][split_pinyin(t)] += 1
                except ValueError:
                    bad += 1
    return att, bad


def pypinyin_readings(ch):
    """pypinyin heteronym 兜底读音集 {(去调, 声调号)}。"""
    out = set()
    py_tone = pinyin(ch, heteronym=True, style=Style.TONE)[0]
    py_base = pinyin(ch, heteronym=True, style=Style.NORMAL)[0]
    for t, b in zip(py_tone, py_base):
        try:
            bt, tone = split_pinyin(t)
        except ValueError:
            continue
        if bt == b:
            out.add((bt, tone))
    return out


def main():
    hanzi = list(csv.DictReader(open(ROOT / 'tools' / 'hanzi.csv', encoding='utf-8')))
    cur_pinyin = {h['char']: h['pinyin'].strip() for h in hanzi}
    print(f'hanzi.csv {len(hanzi)} 字')

    att, bad = char_attested()
    print(f'词组实证完成(对齐失败 {bad} 条),覆盖 {len(att)} 字')

    table = {}
    n_ok, n_sub, n_none, n_conflict = 0, 0, 0, 0
    for h in hanzi:
        ch, target = h['char'], h['pinyin'].strip()
        t_key = split_pinyin(target)
        if ch in SANDHI_CHARS:
            n_ok += 1
            continue

        primary = split_pinyin(pinyin(ch, style=Style.TONE)[0][0])
        att_c = att.get(ch)
        if att_c:
            # 预测1:词组最高频实证读音(优先非轻声)
            non_neutral = {k: v for k, v in att_c.items() if k[1] != '5'}
            pool = non_neutral or att_c
            predicted = max(pool, key=pool.get)
            if predicted != t_key and t_key not in att_c:
                # 目标读音在任何词组里都没出现过:数据可疑,不自动强替
                print(f'!! 目标读音零实证:{ch} hanzi.csv={target} 词组实证={dict(att_c)}')
                n_conflict += 1
                continue
            # 预测2:pypinyin 词典默认音。任一预测 ≠ 目标就替换(替换总是安全)
            need_sub = predicted != t_key or primary != t_key
        else:
            # 词组零覆盖:回退 pypinyin heteronym
            hs = pypinyin_readings(ch)
            if not hs or t_key not in hs:
                print(f'!! 目标读音零实证(回退):{ch} hanzi.csv={target} pypinyin={hs}')
                n_conflict += 1
                continue
            need_sub = primary != t_key and len(hs) > 1

        if not need_sub:
            n_ok += 1
            continue

        # 找替身:使用实证只读目标音的同音同调字,按实证条数降序,三档门槛
        cands = []
        for c, cnt in att.items():
            if c == ch or c in BLACKLIST:
                continue
            if c in cur_pinyin and cur_pinyin[c] != target:
                continue  # 与课表读音冲突的字不做替身
            if set(cnt) == {t_key}:
                cands.append((sum(cnt.values()), c))
        cands.sort(reverse=True)
        solid = [(v, c) for v, c in cands if v >= 30] or \
                [(v, c) for v, c in cands if v >= 8] or \
                [(v, c) for v, c in cands if v >= 3 and pypinyin_readings(c) == {t_key}]
        if solid:
            table[ch] = {'pinyin': target, 'sub': solid[0][1], 'evidence': solid[0][0]}
            n_sub += 1
        else:
            table[ch] = {'pinyin': target, 'sub': None, 'note': f'候选实证不足:{cands[:3]}'}
            n_none += 1

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=1)
    print(f'\n== 结果 ==\n无需处理 {n_ok},需替换 {n_sub},无合适替身 {n_none},数据可疑 {n_conflict}')
    for ch, v in table.items():
        mark = f"{v['sub']} (实证{v.get('evidence', '?')}条)" if v.get('sub') else '(无替身,保留原字)'
        print(f'  {ch} [{v["pinyin"]}] -> {mark}')


if __name__ == '__main__':
    sys.exit(main())
