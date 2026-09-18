import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildQuestions, makeQuestion, normalizeMathLevel, MATH_LEVELS } from '../src/domain/mathgen.js'
import { isPickCorrect } from '../src/domain/judge.js'

// 确定性 rng：mulberry32（不用 LCG——s*1103515245 在 2^53 处丢精度，会出现短周期，
// 实测某个种子下 buildQuestions(15) 只出 5 题，抽样断言会因此变得不可靠）
function seededRng(seed = 42) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
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
  for (const lv of [1, 2, 3, 4, 5, 6]) {
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
  for (const lv of [1, 2, 3, 4, 5, 6]) {
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

test('L5 万以内加减：三位数正整数、选项按位值取、算式格式正确', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const q of buildQuestions(5, { rng: seededRng(seed * 37) })) {
      assert.ok(['addBig', 'subBig', 'missingBig'].includes(q.kind), `未知题型 ${q.kind}`)
      const ans = Number(q.answer)
      assert.ok(Number.isInteger(ans) && ans > 0, `答案应为正整数: ${q.answer}`)
      assert.ok(ans <= 9999, `万以内: ${q.answer}`)
      for (const o of q.options) {
        assert.ok(Number.isInteger(Number(o.id)) && Number(o.id) > 0, `选项应为正整数: ${o.id}`)
      }
      assert.ok(
        /^\d+ [+−] \d+ = \?$/.test(q.display) || /^\d+ \+ \? = \d+$/.test(q.display),
        `算式格式: ${q.display}`,
      )
    }
  }
})

test('L6 小数与分数：小数一位、分数同分母且结果为真分数', () => {
  // 抽样量按「能抓住稀有缺陷」定：0.09% 量级的退化题（曾被 decTenths 的越界 +1 造出
  // 「6.1 − 6.1 = ?」）在 200 题里大概率碰不到，所以这里跑 3000 题并断言数值域。
  for (let seed = 1; seed <= 300; seed++) {
    for (const q of buildQuestions(6, { rng: seededRng(seed * 41) })) {
      assert.ok(['addDec', 'subDec', 'addFrac'].includes(q.kind), `未知题型 ${q.kind}`)
      if (q.kind === 'addFrac') {
        const m = q.display.match(/^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \?$/)
        assert.ok(m, `分数算式格式: ${q.display}`)
        const n1 = Number(m[1]), d1 = Number(m[2]), n2 = Number(m[3]), d2 = Number(m[4])
        assert.equal(d1, d2, '同分母')
        assert.equal(q.answer, `${n1 + n2}/${d1}`, '答案分子相加')
        assert.ok(n1 + n2 < d1, '结果保持真分数（不用约分）')
        // 选项也只能是同分母真分数：sum 到顶时 sum+1 = den 会给出 5/5（值 = 1）这种假分数干扰项，
        // 与「结果保持真分数」的口径冲突（实测这个 helper 曾有 29.5% 的 addFrac 带此类选项）
        for (const o of q.options) {
          const [a, b] = o.id.split('/').map(Number)
          assert.ok(a >= 1 && a < b, `选项必须是真分数: ${o.id}（${q.display}）`)
          assert.ok(b === d1 || b === d1 * 2, `选项分母只能是 den 或 2den（后者是「分母也相加」的典型错法）: ${o.id}`)
        }
        const vals = q.options.map((o) => {
          const [a, b] = o.id.split('/').map(Number)
          return (a / b).toFixed(6)
        })
        assert.equal(new Set(vals).size, vals.length, `选项出现等值分数: ${q.options.map((o) => o.id).join(' ')}`)
      } else {
        assert.match(q.answer, /^\d+\.\d$/, `一位小数: ${q.answer}`)
        assert.ok(Number(q.answer) > 0, `结果为正（0.0 说明出了两个相同操作数的退化题）: ${q.display}`)
        for (const o of q.options) assert.match(o.id, /^\d+\.\d$/, `选项应为一位小数: ${o.id}`)
        // 5.0 + 2.0 这种整数式小数题学不到小数，至少一边必须有非零十分位
        const m = q.display.match(/^(\d+\.\d) [+−] (\d+\.\d) = \?$/)
        assert.ok(m, `小数算式格式: ${q.display}`)
        assert.ok(!(m[1].endsWith('.0') && m[2].endsWith('.0')), `至少一边带非零十分位: ${q.display}`)
        // 数值域：加法限定在 20.0 以内（关卡名义），减法必须被减数大于减数
        const A = Number(m[1]), B = Number(m[2])
        if (q.kind === 'addDec') {
          assert.ok(A >= 1.1 && A <= 10.0, `被加数越界: ${q.display}`)
          assert.ok(A + B <= 20.0001, `和超过 20.0: ${q.display}`)
        } else {
          assert.ok(A >= 2.0 && A <= 19.9, `被减数越界: ${q.display}`)
          assert.ok(B >= 0.1 && B < A, `减数越界或与被减数相等: ${q.display}`)
        }
      }
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), `答案 ${q.answer} 必须在选项中`)
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.ok(ids.length >= 3, '选项数足够')
    }
  }
})

test('isPickCorrect：答案以字符串规整比较（防 id 类型不一致）', () => {
  assert.equal(isPickCorrect({ answer: '7' }, '7'), true)
  assert.equal(isPickCorrect({ answer: 7 }, '7'), true)
  assert.equal(isPickCorrect({ answer: '7' }, 8), false)
  assert.equal(isPickCorrect(null, '7'), false)
})

test('新关卡 7/8/9：关卡可解析、出题结构完整、选项含答案', () => {
  for (const lv of [7, 8, 9]) {
    assert.ok(MATH_LEVELS[lv], `关卡 ${lv} 元信息存在`)
    const qs = buildQuestions(lv, { rng: seededRng(lv * 13 + 5) })
    assert.equal(qs.length, 10, `level ${lv} 应出 10 题`)
    for (const q of qs) {
      assert.ok(Array.isArray(q.seq) && q.seq.length > 0, '音频序列非空')
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), `答案 ${q.answer} 在选项中（${q.display}）`)
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.ok(q.sig, '签名存在（错题本依赖）')
    }
  }
})

test('L10 认识形状：答案就在展示的图形里、选项都是图形且不重复', () => {
  // 形状清单在测试里再写一遍（契约）：emoji 多在辅助平面，正则字符类不加 u 标志会被
  // 拆成代理对而匹配不上，所以这里用数组比较，不用 /^[⭕🔺…]$/ 这类写法。
  // **每种形状只能出现一次**：放两个方块（🟦/🟨）时「找一样的形状」会出现双答案、「找不同」变成考颜色。
  const SHAPES = ['⭕', '🔺', '🟦', '🔷', '⭐']
  const SHAPE_NAMES = { '⭕': '圆', '🔺': '三角', '🟦': '方块', '🔷': '菱形', '⭐': '星' }
  assert.equal(new Set(Object.values(SHAPE_NAMES)).size, SHAPES.length, '每个图形必须代表不同的形状（不能两个方块）')
  // 源码里的清单必须与这份契约逐字一致：加回第二个方块时上面的语义断言抓不到，这条能抓到
  const src = fs.readFileSync(new URL('../src/domain/mathgen.js', import.meta.url), 'utf8')
  const literal = src.match(/const SHAPES = \[([^\]]+)\]/)[1].replace(/['\s,]/g, '')
  assert.equal(literal, SHAPES.join(''), '源码 SHAPES 与契约不一致（加图形前先想清楚是否同形不同色）')
  for (const lv of [10]) {
    for (let seed = 1; seed <= 30; seed++) {
      for (const q of buildQuestions(lv, { rng: seededRng(seed * 53 + lv) })) {
        assert.ok(['shapeSame', 'shapeOdd'].includes(q.kind), `未知题型 ${q.kind}`)
        const shown = q.display.replace('?', '').trim().split(/\s+/).filter(Boolean)
        for (const o of q.options) assert.ok(SHAPES.includes(o.label), `选项应为图形: ${o.label}`)
        assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, '图形选项不重复')
        assert.ok(q.options.map((o) => o.id).includes(q.answer), '答案在选项中')
        if (q.kind === 'shapeSame') {
          // 题干展示的就是目标图形本身：答案必须等于它
          assert.equal(shown.length, 1, `找一样的形状只展示一个目标图形: ${q.display}`)
          assert.equal(q.answer, shown[0], '答案必须与展示的图形一致')
          assert.ok(q.options.some((o) => o.id === shown[0]), '选项里要有同一个图形')
          assert.equal(q.options.length, 4, '4 个选项')
          // 题面不能带「?」：L7 图形规律也用「… ?」且同为启蒙，孩子会读成「下一个是什么」
          assert.ok(!q.display.includes('?'), `找一样的形状不该出现问号（与图形规律混淆）: ${q.display}`)
        } else {
          // 找不同：展示 4 个图形，3 个相同 + 1 个不同，答案就是那一个
          assert.equal(shown.length, 4, `找不同展示 4 个图形: ${q.display}`)
          const counts = {}
          for (const g of shown) counts[g] = (counts[g] || 0) + 1
          const odd = Object.entries(counts).filter(([, n]) => n === 1).map(([g]) => g)
          assert.equal(odd.length, 1, `只能有一个不一样的图形: ${q.display}`)
          assert.equal(q.answer, odd[0], '答案就是那个不一样的图形')
          assert.equal(counts[q.common], 3, '其余三个必须同形')
          // 选项只能是题面里出现过的那两个：多放一个没出现过的图形，按字面它也「和谁都不一样」
          assert.equal(q.options.length, 2, '选项为题面里的两个图形')
          for (const o of q.options) assert.ok(shown.includes(o.label), `选项必须出现在题面里: ${o.label} / ${q.display}`)
          assert.ok(!q.display.includes('?'), `找不同不该出现问号: ${q.display}`)
        }
      }
    }
  }
})

test('L10 认识形状：同一局里不出现两道题面与选项都一样的题', () => {
  // 签名先拼干扰项、没排序时同一局会出现外观完全相同的两道题（实测 17.3% 的局）
  for (let seed = 1; seed <= 120; seed++) {
    const qs = buildQuestions(10, { rng: seededRng(seed * 91) })
    const looks = qs.map((q) => q.kind + '|' + q.display + '|' + q.options.map((o) => o.label).sort().join(''))
    assert.equal(new Set(looks).size, looks.length, `第 ${seed} 局有重复题面：${looks.filter((v, i) => looks.indexOf(v) !== i)}`)
  }
})

test('L11 认识时间：钟面 emoji 与答案时间必须对应（读钟面/拨钟面互为反向）', () => {
  // 钟面 emoji 码点：1F550 起 12 个整点，再 12 个半点。emojione 的「几点」与码点顺序错一位
  // 就会整关错读，所以这里把 display 里的钟面解回时间再和答案对一遍。
  const labelOf = (cp) => {
    const off = cp - 0x1f550
    const half = off >= 12
    const hour = (off % 12) + 1
    return `${hour}:${half ? '30' : '00'}`
  }
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildQuestions(11, { rng: seededRng(seed * 59) })) {
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), '答案在选项中')
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.equal(q.options.length, 4, '四个选项')
      if (q.kind === 'clockRead') {
        const m = q.display.match(/^(\S+) 是几点？$/)
        assert.ok(m, `读钟面题干格式: ${q.display}`)
        assert.match(q.answer, /^\d{1,2}:(00|30)$/, `答案是整点或半点: ${q.answer}`)
        assert.equal(labelOf(m[1].codePointAt(0)), q.answer, '钟面显示的时间必须等于答案')
        for (const o of q.options) assert.match(o.label, /^\d{1,2}:(00|30)$/, `选项是时间: ${o.label}`)
      } else {
        assert.equal(q.kind, 'clockSet')
        const label = q.display.replace(' 是哪个钟？', '')
        assert.match(label, /^\d{1,2}:(00|30)$/, `拨钟面题干格式: ${q.display}`)
        assert.equal(labelOf(q.answer.codePointAt(0)), label, '答案钟面必须等于题干时间')
        // 选项也要逐个解码验（原来这条写成 `labelOf(...) !== undefined`，恒真等于没查）
        for (const o of q.options) {
          const t = labelOf(o.id.codePointAt(0))
          assert.ok(t !== label || o.id === q.answer, `同时间的钟面只应是答案那一个: ${t} / ${q.answer}`)
        }
      }
    }
  }
})

test('L12 长度与测量：单位题答案只可能是厘米或米，换算题按 1 米 = 100 厘米', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const q of buildQuestions(12, { rng: seededRng(seed * 61) })) {
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), `答案 ${q.answer} 在选项中（${q.display}）`)
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.ok(ids.length >= 3, '选项数足够')
      if (q.kind === 'unitPick') {
        assert.ok(['厘米', '米'].includes(q.answer), `单位题答案只能是厘米或米: ${q.answer}`)
        assert.deepEqual([...ids].sort(), [...['厘米', '米', '千米']].sort(), '三个长度单位都要出现')
        assert.match(q.display, /（  ）$/, `题面留了填空位: ${q.display}`)
        // 句子 ↔ 单位必须是常识配对（这里逐句钉住，防止以后换例子时配错）
        const UNIT_BY_SENTENCE = {
          铅笔: '厘米', 课桌: '厘米', 数学书: '厘米', 橡皮: '厘米', 爸爸: '厘米',
          教室的长: '米', 教室的门: '米', 一层楼: '米', 大树: '米', 操场: '米',
        }
        const key = Object.keys(UNIT_BY_SENTENCE).find((k) => q.display.includes(k))
        assert.ok(key, `未知量感例句: ${q.display}`)
        assert.equal(q.answer, UNIT_BY_SENTENCE[key], `单位与句子不匹配: ${q.display}`)
      } else {
        assert.equal(q.kind, 'unitConv')
        const m = q.display.match(/^(\d+) (米|厘米) = \? (米|厘米)$/)
        assert.ok(m, `换算题格式: ${q.display}`)
        const n = Number(m[1])
        if (m[2] === '米') {
          assert.equal(m[3], '厘米')
          assert.equal(q.answer, String(n * 100), '米 → 厘米 乘以 100')
          assert.ok(n >= 1 && n <= 9, `米数在一位数范围: ${n}`)
        } else {
          assert.equal(m[3], '米')
          assert.ok(n % 100 === 0, `厘米数是整百米: ${n}`)
          assert.equal(q.answer, String(n / 100), '厘米 → 米 除以 100')
          // 反向题答案是一位数：干扰项必须是「忘除 100 / 除以 10 / ±1」这类真错法，
          // 而不是 bigOptions 的 ±100 位值（会给出「100 厘米 = ? 米」的 101、11 这种离谱选项）
          for (const o of q.options) {
            const v = Number(o.id)
            assert.ok(v > 0, `选项应为正数: ${o.id}`)
            assert.ok(v <= n, `反向题干扰项不该大于被换算的厘米数（${o.id} > ${n}）`)
          }
        }
        for (const o of q.options) assert.ok(Number(o.id) > 0, `选项应为正数: ${o.id}`)
        assert.equal(q.options.length, 4, '四个选项')
      }
    }
  }
})

test('L13 周长与面积：按公式求值、长方形两邻边不相等、单位说法正确', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildQuestions(13, { rng: seededRng(seed * 67) })) {
      const ans = Number(q.answer)
      assert.ok(Number.isInteger(ans) && ans > 0, `答案为正整数: ${q.answer}`)
      assert.ok(q.options.map((o) => o.id).includes(q.answer), '答案在选项中')
      assert.equal(q.longText, true, '长句题要走 word 分支渲染')
      const nums = q.display.match(/\d+/g).map(Number)
      if (q.kind === 'perimeter') {
        assert.match(q.display, /周长是多少厘米？$/, `周长题问法: ${q.display}`)
        if (q.display.includes('正方形')) {
          assert.equal(nums.length, 1, `正方形只给一个边长: ${q.display}`)
          assert.equal(ans, nums[0] * 4, '正方形周长 = 边长 × 4')
          assert.notEqual(nums[0], 4, '边长 4 时周长与面积都是 16，孩子分不清在算什么')
        } else {
          assert.equal(nums.length, 2, `长方形给长和宽: ${q.display}`)
          // 「长」不能比「宽」短，也不能相等（那是正方形）——教材定义，反着写就是教错
          assert.ok(nums[0] > nums[1], `长必须不短于宽: ${q.display}`)
          assert.equal(ans, (nums[0] + nums[1]) * 2, '长方形周长 = (长 + 宽) × 2')
          assert.notEqual(ans, nums[0] * nums[1], `周长不能与面积数值相同（长 ${nums[0]} 宽 ${nums[1]}）`)
        }
      } else {
        assert.equal(q.kind, 'area')
        assert.match(q.display, /面积是多少平方厘米？$/, `面积题问法: ${q.display}`)
        if (q.display.includes('正方形')) {
          assert.equal(ans, nums[0] * nums[0], '正方形面积 = 边长 × 边长')
          assert.notEqual(nums[0], 4, '边长 4 时周长与面积都是 16')
        } else {
          assert.ok(nums[0] > nums[1], `长必须不短于宽: ${q.display}`)
          assert.equal(ans, nums[0] * nums[1], '长方形面积 = 长 × 宽')
          assert.notEqual(ans, (nums[0] + nums[1]) * 2, `面积不能与周长数值相同（长 ${nums[0]} 宽 ${nums[1]}）`)
        }
      }
      for (const o of q.options) assert.ok(Number(o.id) > 0, `选项应为正数: ${o.id}`)
    }
  }
})

test('L14 分数初步：几分之几是真分数、同分母减法符合分子相减', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildQuestions(14, { rng: seededRng(seed * 71) })) {
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), `答案 ${q.answer} 在选项中（${q.display}）`)
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.ok(ids.length >= 3, '选项数足够')
      const [n, d] = q.answer.split('/').map(Number)
      assert.ok(n >= 1 && n < d, `答案是真分数: ${q.answer}`)
      // 两个选项算出同一个值（2/16 与 1/8）等于把题变成双答案，按分数值去重才算数
      const values = q.options.map((o) => {
        const [a, b] = o.id.split('/').map(Number)
        return (a / b).toFixed(6)
      })
      assert.equal(new Set(values).size, values.length, `选项出现等值分数: ${q.options.map((o) => o.id).join(' ')}`)
      if (q.kind === 'fracOf') {
        const m = q.display.match(/平均分成 (\d+) 份，吃了 (\d+) 份/)
        assert.ok(m, `几分之几题干格式: ${q.display}`)
        assert.equal(q.answer, `${m[2]}/${m[1]}`, '吃了几份就是几分之几')
        assert.ok(Number(m[2]) < Number(m[1]), '取的份数必须少于总份数')
        // 干扰项只能是同分母真分数：假分数（7/6）是五年级下册内容，而且「平均分成 6 份取 7 份」不可能
        for (const o of q.options) {
          const [a, b] = o.id.split('/').map(Number)
          assert.ok(a >= 1 && a < b, `选项必须是真分数: ${o.id}`)
          assert.equal(b, Number(m[1]), `选项必须同分母: ${o.id}`)
        }
        assert.equal(q.options.length, 4, '四个选项（den≥5 才凑得齐）')
      } else {
        assert.equal(q.kind, 'fracSubSame')
        const m = q.display.match(/^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/)
        assert.ok(m, `同分母减法格式: ${q.display}`)
        assert.equal(m[2], m[4], '同分母')
        assert.equal(q.answer, `${Number(m[1]) - Number(m[3])}/${m[2]}`, '分母不变、分子相减')
        assert.ok(Number(m[1]) > Number(m[3]), '被减数分子更大（不出负数）')
        // 选项同样只能同分母真分数（与 addFrac 共用 fracOptions）
        for (const o of q.options) {
          const [a, b] = o.id.split('/').map(Number)
          assert.ok(a >= 1 && a < b, `选项必须是真分数: ${o.id}（${q.display}）`)
          assert.ok(b === Number(m[2]) || b === Number(m[2]) * 2, `选项分母只能是 den 或 2den: ${o.id}`)
        }
      }
    }
  }
})

test('L15 百分数与比例：结果都是整数，比例题按份数整除', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildQuestions(15, { rng: seededRng(seed * 73) })) {
      const ans = Number(q.answer)
      assert.ok(Number.isInteger(ans) && ans > 0, `答案是正整数: ${q.answer}`)
      assert.ok(q.options.map((o) => o.id).includes(q.answer), '答案在选项中')
      assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, '选项不重复')
      if (q.kind === 'percent') {
        const m = q.display.match(/^(\d+) 的 (\d+)% 是多少？$/)
        assert.ok(m, `百分数题干格式: ${q.display}`)
        const [base, p] = [Number(m[1]), Number(m[2])]
        assert.equal((base * p) / 100, ans, `算式必须精确: ${q.display}`)
        assert.ok(Number.isInteger((base * p) / 100), `结果必须是整数（不能出小数）: ${q.display}`)
        // 基数不能是 100：100 的 p% 就是 p，孩子照抄题面里的数就能得分
        assert.notEqual(base, 100, `基数不该是 100（答案等于百分数本身，可以直接抄）: ${q.display}`)
        assert.notEqual(String(ans), String(p), '答案不该等于题面里的百分数')
      } else {
        assert.equal(q.kind, 'ratioShare')
        const m = q.display.match(/^(\d+) 颗糖按 (\d+) : (\d+) 分给两人，(多|少)的一份是多少颗？$/)
        assert.ok(m, `按比分配题干格式: ${q.display}`)
        const total = Number(m[1]), a = Number(m[2]), b = Number(m[3])
        assert.ok(a > b, '比的前项更大（题干里先说多的那份）')
        assert.equal(total % (a + b), 0, `总数必须能按份数整除: ${q.display}`)
        const per = total / (a + b)
        assert.equal(ans, (m[4] === '多' ? a : b) * per, '答案 = 份数 × 每份')
      }
    }
  }
})

test('L16 统计与数据：平均数必为整数，读数据题最多/最少唯一', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildQuestions(16, { rng: seededRng(seed * 79) })) {
      const ids = q.options.map((o) => o.id)
      assert.ok(ids.includes(q.answer), `答案 ${q.answer} 在选项中（${q.display}）`)
      assert.equal(new Set(ids).size, ids.length, '选项不重复')
      assert.ok(ids.length >= 3, '选项数足够')
      if (q.kind === 'average') {
        const nums = q.display.match(/\d+/g).map(Number)
        assert.equal(nums.length, 4, `四个数: ${q.display}`)
        const sum = nums.reduce((a, b) => a + b, 0)
        assert.equal(sum % 4, 0, `平均数必须是整数（偏移量成对相消）: ${q.display}`)
        assert.equal(String(sum / 4), q.answer, '答案 = 总和 ÷ 4')
      } else {
        assert.equal(q.kind, 'dataRead')
        const nums = q.display.match(/\d+/g).map(Number)
        assert.equal(nums.length, 3, `三个数量: ${q.display}`)
        assert.equal(new Set(nums).size, 3, `三个数量必须两两不同，"最多/最少"才唯一: ${q.display}`)
        const more = q.display.includes('最多')
        const expect = more ? Math.max(...nums) : Math.min(...nums)
        // 答案项的名字要从题干里反查：名字与数字按顺序一一对应
        const names = q.display.split('，').slice(0, 3).map((s) => s.split(' ')[0])
        assert.equal(q.answer, names[nums.indexOf(expect)], '答案必须是最多/最少那一项')
        assert.equal(q.options.length, 3, '三项各一个选项')
        // 量词与问法必须配对：小猫论「只」、班级论「人」且问「哪个班」，用错量词就是在教错话。
        // 逐项查（不只查第一项）：香蕉论「根」而不是「个」，只验 names[0] 会漏掉它。
        const UNIT_BY_NAME = { 苹果: '个', 桃子: '个', 香蕉: '根', 梨: '个', 小猫: '只', 小狗: '只', 小兔: '只', 红球: '个', 黄球: '个', 蓝球: '个', 一班: '人', 二班: '人', 三班: '人' }
        assert.ok(q.unit, `题目要带量词: ${q.display}`)
        for (const nm of names) {
          assert.equal(q.unit, UNIT_BY_NAME[nm], `「${nm}」的量词用错了（现用「${q.unit}」）: ${q.display}`)
        }
        assert.ok(q.display.includes(` ${q.unit}`), `题面必须带正确量词: ${q.display}`)
        assert.ok(q.display.includes(q.unit === '人' ? '哪个班' : '哪种'), `问法要与对象配对: ${q.display}`)
      }
    }
  }
})

test('图形规律：二元周期、答案可从展示序列推出、选项都是图形', () => {
  for (let i = 0; i < 30; i++) {
    const q = makeQuestion(7, { rng: seededRng(100 + i) })
    assert.equal(q.kind, 'pattern')
    const parts = q.display.split(/\s+/).filter(Boolean)
    assert.equal(parts[parts.length - 1], '?', '末位是问号')
    const shown = parts.slice(0, -1)
    assert.equal(shown.length, 4, '展示 4 个图形')
    // 周期性：答案必须等于按周期推出的下一个图形
    const cycleLens = [2, 3]
    const okCycle = cycleLens.some((L) => shown.every((g, idx) => g === shown[idx % L]) && q.answer === shown[4 % L])
    assert.ok(okCycle, `周期可推导: ${q.display} 答案 ${q.answer}`)
    for (const o of q.options) assert.match(o.label, /^[●▲■★◆♥]$/, `选项为图形: ${o.label}`)
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, '图形选项不重复')
  }
})

test('应用题：答案与题意一致（加减乘）、无负数选项、数值域合理', () => {
  for (let i = 0; i < 40; i++) {
    const q = makeQuestion(8, { rng: seededRng(300 + i) })
    assert.ok(['wordAdd', 'wordSub', 'wordMul'].includes(q.kind), `题型 ${q.kind}`)
    assert.ok(q.display.endsWith('？'), `题干是完整问句: ${q.display}`)
    const ans = Number(q.answer)
    assert.ok(ans > 0 && ans <= 200, `答案在合理范围: ${ans}`)
    for (const o of q.options) assert.ok(Number(o.label) > 0, '无 0/负数选项')
    // 乘法题的答案必须等于某盒数×盒装数（题干两个数相乘）
    if (q.kind === 'wordMul') {
      const m = q.display.match(/每盒装 (\d+) .*?(\d+) 盒/)
      assert.ok(m, `乘法题干格式: ${q.display}`)
      assert.equal(ans, Number(m[1]) * Number(m[2]), '乘法答案正确')
    }
    if (q.kind === 'wordAdd') {
      const m = q.display.match(/有 (\d+) .*?买来 (\d+) /)
      assert.ok(m, `加法题干格式: ${q.display}`)
      assert.equal(ans, Number(m[1]) + Number(m[2]), '加法答案正确')
    }
    if (q.kind === 'wordSub') {
      const m = q.display.match(/有 (\d+) .*?送给同学 (\d+) /)
      assert.ok(m, `减法题干格式: ${q.display}`)
      assert.equal(ans, Number(m[1]) - Number(m[2]), '减法答案正确且不为负')
    }
  }
})

test('四则混合：按运算顺序求值（先乘除/括号优先）', () => {
  for (let i = 0; i < 40; i++) {
    const q = makeQuestion(9, { rng: seededRng(900 + i) })
    assert.equal(q.kind, 'mixed2')
    let expect
    let m = q.display.match(/^(\d+) × (\d+) \+ (\d+) = \?$/)
    if (m) expect = Number(m[1]) * Number(m[2]) + Number(m[3])
    m = q.display.match(/^(\d+) − (\d+) × (\d+) = \?$/)
    if (m) expect = Number(m[1]) - Number(m[2]) * Number(m[3])
    m = q.display.match(/^\((\d+) \+ (\d+)\) × (\d+) = \?$/)
    if (m) expect = (Number(m[1]) + Number(m[2])) * Number(m[3])
    assert.ok(expect !== undefined, `算式格式可解析: ${q.display}`)
    assert.equal(String(expect), q.answer, `按运算顺序求值: ${q.display}`)
    assert.ok(Number(q.answer) > 0, '结果为正')
  }
})
