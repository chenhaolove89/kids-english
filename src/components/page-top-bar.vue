<template>
  <!-- 返回钮 + 居中标题 + 右侧插槽：9 个内容页共用的顶栏 -->
  <view class="topbar">
    <view class="back" :style="backBg ? { background: backBg } : ''" @tap="$emit('back')">
      <text class="back-icon">←</text>
    </view>
    <text class="title" :class="{ 'title-ellipsis': ellipsis }" :style="titleSize ? { fontSize: titleSize } : ''">{{ title }}</text>
    <slot />
  </view>
</template>

<script setup>
/**
 * 内容页顶栏（学一学 / 挑战 / 数学练习 / 古诗 / 描红 / 三个旧入口）。
 *
 * 抽出来的原因：这段结构与样式此前在 9 个页面里逐字重复
 * （约 60 行模板 + 约 130 行样式），改一处要改 9 处。
 *
 * 用法：
 *   <PageTopBar class="topbar-page" :title="pageTitle" @back="goBack">
 *     <text class="score">⭐ {{ firstCorrect }}</text>   <!-- 右侧内容各页不同，走插槽 -->
 *   </PageTopBar>
 *
 * 约定：
 * - **内边距不在这里**：各页与 safe-area 的组合不同（有的页面容器已含安全区），
 *   由页面用 `class="topbar-page"` 在自己的 scoped 样式里给 padding
 *   （Vue 会把父组件的 scope id 加到子组件根元素上，所以父页面的 `.topbar-page`
 *   规则能命中这个根元素）。
 * - 右侧插槽元素保留页面的 scope id，因此各页原有的 `.score`/`.progress`/`.count`/
 *   `.pinyin`/`.total` 样式照旧生效，不需要 :deep()。
 * - 标题固定单行省略（nowrap + ellipsis）：古诗与描红的标题本身就是短文本
 *   （诗名 / 单字 + 写一写），加上省略不会改变它们的渲染结果。
 */
defineProps({
  /** 标题文本（单行，超长省略） */
  title: { type: String, default: '' },
  /** 标题字号，默认 40rpx；数学/语文/英语的关卡选择页用 42rpx */
  titleSize: { type: String, default: '' },
  /** 返回钮底色，默认白色；学一学页在彩色卡片上需要半透明白 */
  backBg: { type: String, default: '' },
  /**
   * 标题超长时单行省略。
   * 动态标题的页面（挑战/练习/学一学）需要它，否则长课名会换行把顶栏撑高；
   * 古诗与描红的标题是短文本（诗名 / 单字 + 写一写），原本就没有这三个属性，
   * 传 false 保持与原实现逐像素一致。
   */
  ellipsis: { type: Boolean, default: true },
})

defineEmits(['back'])
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
}
.back {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.1);
  /* 标题很长时不要让返回钮被挤扁 */
  flex-shrink: 0;
}
.back-icon {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
}
.title {
  flex: 1;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
}
.title-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
