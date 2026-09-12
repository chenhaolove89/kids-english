# -*- coding: utf-8 -*-
"""
Azure 方案B的拼音标注器:为全部中文音频条目产出目标拼音,供 gen-zh-azure.mjs
拼 SSML <phoneme> 强制读音(Azure 官方支持,与 Edge 免费端点不同)。

标注口径(零容错):
  1. 汉字字音(297):拼音 = tools/hanzi.csv 人工校订列,全部标注。
  2. 例词/词语课词音:
     a. 整词在 pypinyin 词组表有逐字唯一标注 → 直接采用(含变调/轻声,如 桌子→zhuōzi)。
     b. 否则:词含 一/不(pypinyin 对非词表词的变调不可靠,实测 一座→yī/不看→bù)、
        或 AA 叠词(爸爸→bàbà,实际第二音节轻声,默认 LM 才读得对)、
        或任一字「使用实证多音/零实证」→ 留 null 走默认读音。
        全部字都使用实证单音时才采信 pypinyin 的词语语境标注。
  3. 数字/数学用语/反馈语不标注(Edge 时代也无误读报告,保持默认)。

产出:tools/zh-pron-pinyin.json
  { "items": { "zh-5e72": {"text":"干","pinyin":["gān"]},
               "zhw-red":  {"text":"红色","pinyin":null}, ... } }
pinyin 为 null 时 gen-zh-azure.mjs 用原文合成(Azure 词语上下文默认读音)。
"""
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pypinyin.phrases_dict as pd
from pypinyin import pinyin, Style

# 相对本文件定位仓库根：写死绝对路径会让换机/换目录后静默读写另一份表
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tools' / 'zh-pron-pinyin.json'

TONE_MARKS = {'\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4'}


def split_pinyin(py):
    """声调标注拼音 -> (去调音节, 声调号1-5)。"""
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
    """词组实证:字 -> set[(去调, 声调号)]。"""
    att = defaultdict(set)
    for phrase, val in pd.phrases_dict.items():
        if len(val) != len(phrase):
            continue
        for ch, opts in zip(phrase, val):
            if not re.match(r'[\u4e00-\u9fff]', ch):
                continue
            for t in opts:
                try:
                    att[ch].add(split_pinyin(t))
                except ValueError:
                    pass
    return att


def word_pinyin(text, att):
    """词语逐字拼音;证据不足返回 None(走 TTS 默认读音)。"""
    if not re.fullmatch(r'[\u4e00-\u9fff]+', text):
        return None
    val = pd.phrases_dict.get(text)
    if val and len(val) == len(text) and all(len(o) == 1 for o in val):
        try:
            for o in val:
                split_pinyin(o[0])
        except ValueError:
            return None
        return [o[0] for o in val]
    # 无整词实证:一/不 变调、AA 叠词轻声 pypinyin 都标不对,宁缺毋滥
    if any(c in '一不' for c in text) or (len(text) == 2 and text[0] == text[1]):
        return None
    if any(len(att.get(c, ())) != 1 for c in text):
        return None
    outs = [pinyin(text, style=Style.TONE)[i][0] for i in range(len(text))]
    try:
        for o in outs:
            split_pinyin(o)
    except ValueError:
        return None
    return outs


def main():
    hanzi = list(csv.DictReader(open(ROOT / 'tools' / 'hanzi.csv', encoding='utf-8')))
    words = list(csv.DictReader(open(ROOT / 'tools' / 'words.csv', encoding='utf-8')))
    att = char_attested()
    sent_lines = open(ROOT / 'tools' / 'hanzi-sentences.csv', encoding='utf-8').read().replace('\ufeff', '').strip().split('\n')[1:]
    sent_map = {}
    for line in sent_lines:
        if line.strip():
            ch, s = line.split(',', 1)
            sent_map[ch.strip()] = s.strip()
    print(f'词组实证覆盖 {len(att)} 字, 例句 {len(sent_map)} 句')

    items = {}
    n_char, n_annotated, n_plain = 0, 0, 0
    plain_samples = []

    # 1) 汉字字音 + 例词音 + 例句音(例词同 hanzi.csv 的 word 列;id = 字的 Unicode 码点十六进制,同 gen-assets)
    n_sent = 0
    for h in hanzi:
        cp = f"{ord(h['char']):04x}"
        cid = f"zh-{cp}"
        items[cid] = {'text': h['char'], 'pinyin': [h['pinyin'].strip()]}
        n_char += 1
        wid = f"zh-{cp}w"
        py = word_pinyin(h["word"], att)
        items[wid] = {'text': h['word'], 'pinyin': py}
        if py:
            n_annotated += 1
        else:
            n_plain += 1
            plain_samples.append(f'{wid}({h["word"]})')
        # 例句:只注目标字(首现位置),其余 null 走语句模型,保韵律与自然变调
        sid = f"zh-{cp}s"
        sent = sent_map.get(h['char'])
        if not sent or h['char'] not in sent:
            print(f'!! 例句缺失或不含目标字: {h["char"]}')
            sys.exit(1)
        chars = list(sent)
        idx = chars.index(h['char'])
        py_sent = [None] * len(chars)
        py_sent[idx] = h['pinyin'].strip()
        items[sid] = {'text': sent, 'pinyin': py_sent}
        n_sent += 1

    # 2) 词语课词音(audio-zh/{id}.mp3,id = words.csv id)
    n_word_annotated = 0
    for w in words:
        wid = f"zhw-{w['id']}"
        py = word_pinyin(w.get("zh", ""), att)
        items[wid] = {'text': w.get('zh', ''), 'pinyin': py}
        if py:
            n_annotated += 1
            n_word_annotated += 1
        else:
            n_plain += 1
            if len(plain_samples) < 25:
                plain_samples.append(f'{wid}({w.get("zh", "")})')

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generatedAt': datetime.now().isoformat(), 'items': items},
                  f, ensure_ascii=False, indent=1)

    print(f'== 拼音标注完成 ==')
    print(f'字音 {n_char}(全标注), 例句 {n_sent}(只注目标字), 例词+词语 {n_annotated} 标注 / {n_plain} 走默认读音')
    print(f'词语课标注覆盖:{n_word_annotated}/{len(words)}')
    print(f'未标注样例: {", ".join(plain_samples[:25])}')


if __name__ == '__main__':
    sys.exit(main())
