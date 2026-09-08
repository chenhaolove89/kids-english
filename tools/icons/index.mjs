/**
 * 自绘图标库总入口：把缺图词（档2）按语义画成 Noto 扁平风 SVG。
 * key = words.csv 的 draw 列值（与词一一对应；sightwords/wordfamilies 等同名列
 * 靠 gen-assets 的「draw 值分类 === 词分类」判据隔离，不会误画）。
 */
import { icons as body, category as bodyCat } from './body.mjs'
import { icons as tvm, categories as tvmCats } from './toys-vehicles-music.mjs'
import { icons as fv, category as fvCat, categories as fvCats } from './food-veg.mjs'
import { icons as dd, category as ddCat, categories as ddCats } from './desserts-drinks.mjs'
import { icons as ch, category as chCat, categories as chCats } from './clothes-home.mjs'
import { icons as ks, category as ksCat, categories as ksCats } from './kitchen-school.mjs'
import { icons as fam, category as famCat } from './family.mjs'
import { icons as oi, categories as oiCats } from './ocean-insects.mjs'
import { icons as bt, categories as btCats } from './birds-time.mjs'

function reg(list) {
  const icons = {}
  const cats = {}
  for (const { icons: m, category, categories } of list) {
    for (const [k, v] of Object.entries(m)) {
      if (icons[k]) throw new Error(`图标 key 重复: ${k}`)
      icons[k] = v
      cats[k] = (categories && categories[k]) || category
    }
  }
  return { icons, cats }
}

const { icons: ICONS, cats: ICON_CATEGORY } = reg([
  { icons: body, category: bodyCat },
  { icons: tvm, categories: tvmCats },
  { icons: fv, category: fvCat, categories: fvCats },
  { icons: dd, category: ddCat, categories: ddCats },
  { icons: ch, category: chCat, categories: chCats },
  { icons: ks, category: ksCat, categories: ksCats },
  { icons: fam, category: famCat },
  { icons: oi, categories: oiCats },
  { icons: bt, categories: btCats },
])

export { ICONS, ICON_CATEGORY }
