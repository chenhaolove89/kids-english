import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestions, makeQuestion, normalizeMathLevel, MATH_LEVELS } from '../src/domain/mathgen.js'
import { isPickCorrect } from '../src/domain/judge.js'

// 确定性 rng：可复现的伪随机（测试用）
function seededRng(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

test('normalizeMathLevel：非法/越界关卡安全回退第 1 关', () => {
  assert.equal(normalizeMathLevel(99), 1)
  assert.equal(normalizeMathLevel(0), 1)
  assert.equal(normalizeMathLevel(-3), 1)
  assert.equal(normalizeMathLevel('abc'), 1)
  assert.equal(normalizeMathLevel(undefined), 1)
  assert.equal(normalizeMathLevel('3'), 3)
  assert.equal(normalizeMathLevel(4), 4)
})

test('buildQuestions：默认出 10 题，各题型结构完整', () => {
  for (const lv of [1, 2, 3, 4]) {
    const qs = buildQuestions(lv, { rng: seededRng(lv * 7 + 1) })
    assert.equal(qs.length, 10, `level ${lv} 应出 10 题`)
    for (const q of qs) {
      assert.ok(MATH_LEVELS[lv], '关卡元信息存在')
      assert.ok(q.kind, '题型存在')
      assert.ok(Array.isArray(q.seq) && q.seq.length > 0, '音频序列非空')
      if (q.kind === 'compare' || q.kind === 'compareNum') {
        assert.equal(q.groups.length, 2)
        assert.ok(['0', '1'].includes(q.answer), '比大小答案为组序号')
      } else {
        assert.ok(q.options.length >= 3, '选项数足够')
        const ids = q.options.map((o) => o.id)
        assert.ok(ids.includes(q.answer), `答案 ${q.answer} 必须在选项中`)
        assert.equal(new Set(ids).size, ids.length, '选项不重复')
      }
    }
  }
})

test('buildQuestions：加减乘除数值域不越界且无负数选项', () => {
  const qs = buildQuestions(2, { rng: seededRng(7) })
  for (const q of qs) {
    if (q.kind === 'add') assert.ok(Number(q.answer) <= 10, '十以内加法')
    if (q.kind === 'sub') assert.ok(Number(q.answer) >= 1, '减法结果为正')
    for (const o of q.options || []) assert.ok(Number(o.id) >= 0, '选项无负数')
  }
  const d = buildQuestions(4, { rng: seededRng(9) }).find((x) => x.kind === 'div')
  if (d) {
    const m = d.display.match(/^(\d+)\s*÷\s*(\d+)/)
    assert.ok(m, '除法算式格式正确')
    assert.equal(Number(m[1]) % Number(m[2]), 0, '除法必须整除')
  }
})

test('makeQuestion：rng 注入下可复现（同种子同题）', () => {
  const a = makeQuestion(3, { rng: seededRng(123) })
  const b = makeQuestion(3, { rng: seededRng(123) })
  assert.deepEqual(a, b)
})

test('buildQuestions：组内去重（kind|answer|display 不重复）', () => {
  const qs = buildQuestions(1, { rng: seededRng(5) })
  const keys = qs.map((q) => q.kind + '|' + q.answer + '|' + (q.display || ''))
  assert.equal(new Set(keys).size, keys.length)
})

test('题目快照可 JSON 序列化（中断恢复的前提）', () => {
  const qs = buildQuestions(2, { rng: seededRng(11) })
  const back = JSON.parse(JSON.stringify(qs))
  assert.deepEqual(back, qs)
})

test('题目形状不变量：要么有 options（含答案），要么有 compare 组——两者必居其一', () => {
  // compareNum 曾因既无 options 又不被模板 compare 分支接收而让第 3 关整页崩溃
  const GROUP_KINDS = new Set(['compare', 'compareNum'])
  for (const lv of [1, 2, 3, 4]) {
    const qs = buildQuestions(lv, { rng: seededRng(lv * 13 + 3) })
    for (const q of qs) {
      if (GROUP_KINDS.has(q.kind)) {
        assert.ok(Array.isArray(q.groups) && q.groups.length === 2, `${q.kind} 必须有两组`)
        assert.equal(q.options, undefined, `${q.kind} 不应有 options`)
      } else {
        assert.ok(Array.isArray(q.options) && q.options.length >= 3, `${q.kind} 必须有 options`)
        assert.ok(q.options.some((o) => o.id === String(q.answer)))
      }
    }
  }
})

test('missing 题和不超过 20（二十以内关卡名义）', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const qs = buildQuestions(3, { rng: seededRng(seed * 101) })
    for (const q of qs) {
      if (q.kind !== 'missing') continue
      const m = q.display.match(/^(\d+)\s*\+\s*\?\s*=\s*(\d+)$/)
      assert.ok(m, 'missing 算式格式')
      assert.ok(Number(m[2]) <= 20, `和 ${m[2]} 超 20`)
    }
  }
})

test('数字题选项不出现 0（compare 组序号除外）', () => {
  for (const lv of [1, 2, 3, 4]) {
    for (const q of buildQuestions(lv, { rng: seededRng(lv * 31) })) {
      for (const o of q.options || []) assert.ok(Number(o.id) >= 1, `选项出现 0: ${JSON.stringify(o)}`)
    }
  }
})

test('add/sub/compare 同题同种物品（两组可合起来数）', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const q of buildQuestions(2, { rng: seededRng(seed * 17) })) {
      const sets = [q.leftEmojis, q.rightEmojis].filter(Boolean).map((arr) => [...new Set(arr)].join(''))
      for (const s of sets) assert.equal(new Set(s).size, 1, '每组内必须同种')
      if (sets.length === 2) assert.equal(sets[0], sets[1], '左右两组应同种物品')
      if (q.kind === 'compare' && q.groups) {
        for (const g of q.groups) assert.equal(new Set(g.emojis).size, 1)
      }
    }
  }
})

test('isPickCorrect：答案以字符串规整比较（防 id 类型不一致）', () => {
  assert.equal(isPickCorrect({ answer: '7' }, '7'), true)
  assert.equal(isPickCorrect({ answer: 7 }, '7'), true)
  assert.equal(isPickCorrect({ answer: '7' }, 8), false)
  assert.equal(isPickCorrect(null, '7'), false)
})
