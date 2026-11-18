/**
 * Live Wallpaper — dynamic wallpaper and glass panels for the DeepSeek Harness Web GUI.
 *
 * Browser half. The wallpaper layer is one fixed element behind the shell; the
 * shell's own surfaces become translucent through token overrides and a small
 * set of container rules, and every control lives in the right-side drawer
 * registered into `shell.overlay`.
 */
window.__ModuleLoader__.load({
  id: '@caprimoon/dsh-live-wallpaper',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement

    const PREFIX = '/plugins/live-wallpaper'
    const API = PREFIX + '/api'
    // Storage keys and the media directory keep their original names: they are
    // stable identities for the user's own data (tuned settings, favourites,
    // imported files) and must survive the project rename.
    const KEY_SETTINGS = 'dsh-live-canvas:settings'
    const KEY_FAVORITES = 'dsh-live-canvas:favorites'
    const KEY_LOCALS = 'dsh-live-canvas:locals'
    const KEY_CURRENT = 'dsh-live-canvas:current'
    const KEY_FILTERS = 'dsh-live-canvas:filters'

    const SOURCE_NAMES = {
      mixkit: 'Mixkit',
      moe: 'MoeWalls',
      motion: 'MotionBgs',
      waifu: 'WallpaperWaifu',
      free: 'LiveWallpapers4Free',
    }

    const TOPICS = [
      { id: 'all', label: '全部分类', routes: { mixkit: '', moe: '', motion: '', waifu: '', free: '' } },
      { id: 'nature', label: '自然风景', routes: { mixkit: 'nature', moe: 'landscape', motion: 'nature', waifu: 'landscape', free: 'nature-live-wallpapers' } },
      { id: 'human', label: '人文 / 生活', routes: { mixkit: 'people', moe: 'lifestyle', waifu: 'lifestyle', free: 'people-live-wallpapers' } },
      { id: 'city', label: '城市 / 建筑', routes: { mixkit: 'city', motion: 'city', free: 'world-live-wallpapers' } },
      { id: 'abstract', label: '抽象 / 几何', routes: { mixkit: 'abstract', moe: 'abstract', motion: 'abstract', waifu: 'abstract', free: 'abstract-live-wallpapers' } },
      { id: 'anime', label: '动漫 / 二次元', routes: { moe: 'anime', motion: 'anime', waifu: 'anime', free: 'anime-live-wallpapers' } },
      { id: 'games', label: '游戏', routes: { moe: 'games', motion: 'games', waifu: 'games', free: 'games-live-wallpapers' } },
      { id: 'fantasy', label: '幻想 / 科幻', routes: { moe: 'fantasy', motion: 'space', waifu: 'fantasy', free: 'fantasy-live-wallpapers' } },
      { id: 'pixel', label: '像素艺术', routes: { moe: 'pixel-art', waifu: 'pixel-art' } },
    ]

    const BUILTINS = [
      { id: 'builtin:rain', source: 'builtin', title: '深蓝雨幕', scene: 'rain', kind: 'scene' },
      { id: 'builtin:stars', source: 'builtin', title: '远航星空', scene: 'stars', kind: 'scene' },
      { id: 'builtin:matrix', source: 'builtin', title: '代码之雨', scene: 'matrix', kind: 'scene' },
    ]

    const DEFAULTS = {
      enabled: true, dim: 20, blur: 0,
      // Six zones, always independent: 1 左侧栏, 2 内容区, 3 输入框,
      // 4 用量栏, 5 指令菜单, 6 我的消息. These are the tuned shipping values.
      color1: '#232323', glass1: 55, glassBlur1: 10,
      color2: '#232323', glass2: 25, glassBlur2: 2,
      color3: '#4a4a4a', glass3: 30, glassBlur3: 8,
      color4: '#4a4a4a', glass4: 30, glassBlur4: 8,
      color5: '#4a4a4a', glass5: 85, glassBlur5: 24,
      // The sent bubble keeps the contrast step the content area used to derive:
      // rgb(66,66,66) is #232323 lifted by the old 14% rule.
      color6: '#424242', glass6: 25, glassBlur6: 0,
      fit: 'cover', quality: 'auto', focalX: 49, focalY: 50, speed: 1,
      paused: false, pauseHidden: true, pauseOnTask: false,
      // `motionConsent` is a grant the user gives by pressing 播放/仍然播放, not a
      // preference: it ships unset so the reduced-motion rule applies from the
      // first run.
      respectMotion: true, motionConsent: false, interval: 0,
      // True until the user picks a zone color: the tint then follows the
      // active palette, so light themes get light glass instead of the dark
      // defaults the reference shipped.
      colorsAuto: true,
    }

    /** Zone tints that match each palette while the colors stay automatic. */
    const AUTO_COLORS = {
      dark: { 1: '#232323', 2: '#232323', 3: '#4a4a4a', 4: '#4a4a4a', 5: '#4a4a4a', 6: '#424242' },
      light: { 1: '#eef1f6', 2: '#f6f8fb', 3: '#ffffff', 4: '#ffffff', 5: '#ffffff', 6: '#dddfe2' },
    }

    const SETTINGS_FIELDS = [
      { key: 'dim', type: 'range', min: 0, max: 85, step: 1, unit: '%', default: 20, title: '背景遮罩（%）', description: '在壁纸画面上方叠加半透明黑色遮罩。数值越高背景越暗、代码与对话文字越清晰；设为 0% 显示壁纸原始亮度。' },
      { key: 'blur', type: 'range', min: 0, max: 18, step: 1, unit: 'px', default: 0, title: '背景模糊（px）', description: '对壁纸画面本身做高斯模糊，仅柔化视觉效果，不改变视频原分辨率。' },
      { key: 'color1', type: 'color', default: '#232323', title: '1 · 左侧栏颜色', description: '左侧项目栏的玻璃底色。' },
      { key: 'glass1', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 55, title: '1 · 左侧栏遮罩（%）', description: '左侧栏的不透明度（0% 全透，100% 完全不透明）。' },
      { key: 'glassBlur1', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 10, title: '1 · 左侧栏模糊（px）', description: '左侧栏背后的毛玻璃虚化强度（0px 关闭）。' },
      { key: 'color2', type: 'color', default: '#232323', title: '2 · 内容区颜色', description: '中栏内容区（对话、插件页等所有主面板）的玻璃底色；你发送的消息气泡会自动基于此颜色微调对比度。' },
      { key: 'glass2', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 25, title: '2 · 内容区遮罩（%）', description: '内容区的不透明度（0% 全透，100% 完全不透明）。' },
      { key: 'glassBlur2', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 2, title: '2 · 内容区模糊（px）', description: '内容区背后的毛玻璃虚化强度（0px 关闭）。' },
      { key: 'color3', type: 'color', default: '#4a4a4a', title: '3 · 底部输入框颜色', description: '输入框卡片的玻璃底色（默认 #4A4A4A）。' },
      { key: 'glass3', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 30, title: '3 · 输入框遮罩（%）', description: '输入框的不透明度（0% 全透，100% 完全不透明）。' },
      { key: 'glassBlur3', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 8, title: '3 · 输入框模糊（px）', description: '输入框背后的虚化强度，与内容区的模糊各算各的、互不影响。' },
      { key: 'color4', type: 'color', default: '#4a4a4a', title: '4 · 用量栏颜色', description: '底部用量栏那条圆角磨砂条的底色（默认 #4A4A4A）。' },
      { key: 'glass4', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 30, title: '4 · 用量栏遮罩（%）', description: '用量栏磨砂条的不透明度。数值越高文字越清晰。' },
      { key: 'glassBlur4', type: 'range', min: 0, max: 30, step: 1, unit: 'px', default: 8, title: '4 · 用量栏模糊（px）', description: '用量栏磨砂条背后的虚化强度（0px 只保留半透明底色）。' },
      { key: 'color5', type: 'color', default: '#4a4a4a', title: '5 · 指令菜单颜色', description: '输入「/」「@」时弹出的指令与引用菜单底色（默认 #4A4A4A）。' },
      { key: 'glass5', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 85, title: '5 · 指令菜单遮罩（%）', description: '指令菜单的不透明度。菜单要压住会话文字，建议保持较高值。' },
      { key: 'glassBlur5', type: 'range', min: 0, max: 30, step: 1, unit: 'px', default: 24, title: '5 · 指令菜单模糊（px）', description: '指令菜单背后的虚化强度。' },
      { key: 'color6', type: 'color', default: '#424242', title: '6 · 我的消息颜色', description: '你发送的消息气泡底色（默认 #424242，比内容区亮一档以便区分）。' },
      { key: 'glass6', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 25, title: '6 · 我的消息遮罩（%）', description: '消息气泡的不透明度（0% 全透，100% 完全不透明）。' },
      { key: 'glassBlur6', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 0, title: '6 · 我的消息模糊（px）', description: '消息气泡背后的虚化强度（0px 关闭）。' },
      {
        key: 'fit', type: 'select', default: 'cover', title: '画面适配',
        description: '壁纸与窗口比例不一致时的缩放方式。推荐“填满整窗”：按最短边等比放大铺满全屏，不会留黑边（长边超出部分居中裁切）。',
        options: [
          { value: 'cover', label: '填满整窗 · 按最短边等比铺满（不留黑边）' },
          { value: 'contain', label: '完整显示 · 保持比例不裁切（可能留黑边）' },
          { value: 'fill', label: '拉伸铺满 · 强制铺满（可能变形）' },
        ],
      },
      { key: 'focalX', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 49, onlyWhen: (s) => s.fit === 'cover', title: '主体横向位置（%）', description: '仅在“填满整窗”模式下生效，当画面横向被裁切时，调整画面水平对齐重心（50% 为居中）。' },
      { key: 'focalY', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: (s) => s.fit === 'cover', title: '主体纵向位置（%）', description: '仅在“填满整窗”模式下生效，当画面纵向被裁切时，调整画面垂直对齐重心（50% 为居中）。' },
      {
        key: 'quality', type: 'select', default: 'auto', title: '视频画质',
        description: '在线图库视频的优先清晰度。高清地址仅在原站提供且可访问时生效，不可用时自动回退预览版。',
        options: [
          { value: 'auto', label: '自动 · 优先 1080p 原版' },
          { value: 'preview', label: '预览 · 加载更快更省流量' },
          { value: 'hd', label: '1080p 原版（若原站提供）' },
          { value: '2k', label: '2K 原版（若原站提供）' },
          { value: '4k', label: '4K 原版（若原站提供）' },
        ],
      },
      {
        key: 'speed', type: 'select', numeric: true, default: 1, title: '播放速度',
        description: '调整动态视频壁纸的播放倍速。放慢速度可带来更舒缓的背景氛围。',
        options: [
          { value: 0.5, label: '0.5× · 舒缓' },
          { value: 0.75, label: '0.75×' },
          { value: 1, label: '1× · 原速' },
          { value: 1.25, label: '1.25×' },
          { value: 1.5, label: '1.5×' },
        ],
      },
      {
        key: 'interval', type: 'select', numeric: true, default: 0, title: '自动轮换',
        description: '按固定间隔自动随机切换下一张壁纸（优先从“我的收藏”中选取，无收藏时使用内置场景）。',
        options: [
          { value: 0, label: '关闭' },
          { value: 5, label: '每 5 分钟' },
          { value: 15, label: '每 15 分钟' },
          { value: 30, label: '每 30 分钟' },
        ],
      },
      { key: 'pauseHidden', type: 'boolean', default: true, title: '窗口不可见时暂停播放', description: '切换至其他应用或最小化窗口时自动暂停动态壁纸与动画渲染，切回时自动恢复。' },
      { key: 'pauseOnTask', type: 'boolean', default: true, title: '任务运行中暂停动态壁纸', description: '模型生成回复或执行工具期间自动暂停动态壁纸并保留毛玻璃效果，任务完成后自动恢复播放，减少高负载卡顿。' },
      { key: 'respectMotion', type: 'boolean', default: true, title: '尊重系统减少动态效果', description: '开启后，当系统启用了“减少动态效果”（Windows 的“动画效果”关闭）时，壁纸默认保持静止；只有点击抽屉里的“仍然播放”才会恢复动画。此项只影响壁纸，不影响应用自身的界面动画。' },
    ]

    /* ------------------------------------------------------------------ *
     * utilities
     * ------------------------------------------------------------------ */

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))

    function normalizeHexColor(raw, fallback) {
      const text = String(raw || '').trim()
      const short = text.match(/^#?([0-9a-f]{3})$/i)
      if (short) {
        const [r, g, b] = short[1].toLowerCase().split('')
        return '#' + r + r + g + g + b + b
      }
      const full = text.match(/^#?([0-9a-f]{6})$/i)
      return full ? '#' + full[1].toLowerCase() : fallback
    }

    function normalizeFieldValue(field, raw) {
      if (field.type === 'range') {
        const n = Number(raw)
        return Number.isFinite(n) ? clamp(Math.round(n), field.min, field.max) : field.default
      }
      if (field.type === 'color') return normalizeHexColor(raw, field.default)
      if (field.type === 'select') {
        const value = field.numeric ? Number(raw) : raw
        return field.options.some((option) => option.value === value) ? value : field.default
      }
      if (field.type === 'boolean') return typeof raw === 'boolean' ? raw : field.default
      return field.default
    }

    function normalizeSettings(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const out = Object.assign({}, DEFAULTS, source)
      for (const field of SETTINGS_FIELDS) out[field.key] = normalizeFieldValue(field, out[field.key])
      out.enabled = out.enabled !== false
      out.paused = !!out.paused
      out.motionConsent = !!out.motionConsent
      // A zone color that differs from the shipped default is a manual choice,
      // whatever an older build stored in `colorsAuto`; otherwise the flag is
      // respected and the tint keeps following the palette.
      const manual = [1, 2, 3, 4].some((zone) => {
        const stored = source['color' + zone]
        if (typeof stored !== 'string' || stored.trim() === '') return false
        return normalizeHexColor(stored, '#000000').toLowerCase() !== String(DEFAULTS['color' + zone]).toLowerCase()
      })
      out.colorsAuto = manual ? false : source.colorsAuto !== false
      return out
    }

    function hexToRgb(hex, fallback) {
      const value = normalizeHexColor(hex, fallback)
      return [
        parseInt(value.slice(1, 3), 16),
        parseInt(value.slice(3, 5), 16),
        parseInt(value.slice(5, 7), 16),
      ]
    }

    function readStore(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        return raw === null ? fallback : JSON.parse(raw)
      } catch {
        return fallback
      }
    }

    function writeStore(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* storage may be full or disabled; the UI keeps working in memory */
      }
    }

    function readFilters() {
      const raw = readStore(KEY_FILTERS, {})
      const source = typeof raw.source === 'string' && (raw.source === 'all' || SOURCE_NAMES[raw.source]) ? raw.source : 'all'
      const topic = TOPICS.some((entry) => entry.id === raw.topic) ? raw.topic : 'nature'
      const query = typeof raw.query === 'string' ? raw.query : ''
      return { source, topic, query }
    }

    async function api(method, params) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, params: params ?? {} }),
      })
      if (!response.ok) throw new Error('接口返回 HTTP ' + response.status)
      const body = await response.json()
      if (!body.ok) throw new Error(body.error || '接口失败')
      return body.value
    }

    const thumbUrl = (target) => PREFIX + '/thumb?u=' + encodeURIComponent(target)
    const mediaUrl = (localId) => PREFIX + '/media/' + encodeURIComponent(localId)

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function friendlyError(error) {
      const text = String(error?.message || error || '未知错误')
      if (/Failed to fetch|NetworkError/i.test(text)) return '网络连接失败'
      return text
    }

    /* ------------------------------------------------------------------ *
     * engine — one instance owns the layer, settings, and playback
     * ------------------------------------------------------------------ */

    /** The palette the document currently paints. */
    const isDark = () => document.body?.hasAttribute('data-ds-dark-theme') === true

    function createEngine(ctx) {
      let settings = normalizeSettings(readStore(KEY_SETTINGS, {}))
      let favorites = Array.isArray(readStore(KEY_FAVORITES, [])) ? readStore(KEY_FAVORITES, []) : []
      let locals = Array.isArray(readStore(KEY_LOCALS, [])) ? readStore(KEY_LOCALS, []) : []
      let current = readStore(KEY_CURRENT, null) || BUILTINS[0]
      let filters = readFilters()

      let layer = null
      let canvas = null
      let mediaBox = null
      let activeMedia = null
      let activeIsCanvas = true
      let loadVersion = 0
      let disposed = false
      let raf = 0
      let lastFrame = 0
      let frame = 0
      let points = []
      let width = 1
      let height = 1
      let busy = false
      let lastError = ''
      let statusLine = ''
      let taskRunning = false
      let manualTaskPlay = false
      let rotationAt = 0
      let source = null

      // Drawer state
      let open = false
      let tab = 'gallery'
      let browse = { items: [], next: '', page: 1, status: 'idle', error: '', warnings: [], cursors: [''] }
      let browseRequest = 0
      let localFeedback = ''

      const listeners = new Set()
      let snapshot = null

      function buildSnapshot() {
        return {
          settings, favorites, locals, current, filters, open, tab, busy, lastError, statusLine,
          taskRunning, browse: { ...browse, items: browse.items, cursors: browse.cursors.slice() },
          localFeedback, dark: isDark(),
          effectiveColors: {
            1: zoneStyle(1).color, 2: zoneStyle(2).color, 3: zoneStyle(3).color,
            4: zoneStyle(4).color, 5: zoneStyle(5).color, 6: zoneStyle(6).color,
          },
        }
      }

      function getSnapshot() {
        if (snapshot === null) snapshot = buildSnapshot()
        return snapshot
      }

      function emit() {
        snapshot = buildSnapshot()
        for (const listener of listeners) listener()
      }

      function subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }

      function saveSettings() {
        writeStore(KEY_SETTINGS, settings)
      }

      const reduced = () => settings.respectMotion && reducedMotion() && !settings.motionConsent
      const isTaskPaused = () => !!(settings.pauseOnTask && taskRunning && !manualTaskPlay)
      const shouldPause = () => settings.paused || !settings.enabled || (settings.pauseHidden && document.hidden) || reduced() || isTaskPaused()

      function statusText() {
        if (!settings.enabled) return '壁纸已关闭'
        if (reduced()) return '已按系统“减少动态效果”暂停'
        if (isTaskPaused()) return '任务运行中，已暂停动态壁纸'
        if (settings.paused) return '已暂停'
        if (activeMedia === null) return '内置动态场景 · 低负载'
        return activeIsCanvas ? '内置动态场景 · 低负载' : activeMedia.tagName === 'VIDEO' ? '静音循环播放' : '图片壁纸'
      }

      function refreshStatus() {
        statusLine = statusText()
      }

      /* ---------------- appearance ---------------- */

      function zoneStyle(zone) {
        const colorKey = 'color' + zone
        const fallback = AUTO_COLORS.dark[zone]
        const chosen = settings.colorsAuto === false
          ? settings[colorKey]
          : AUTO_COLORS[isDark() ? 'dark' : 'light'][zone]
        const opacity = clamp(settings['glass' + zone], 0, 100)
        const blurPx = clamp(settings['glassBlur' + zone], 0, 30)
        const rgb = hexToRgb(chosen, fallback)
        const alpha = (opacity / 100).toFixed(3)
        return {
          bg: 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')',
          blur: blurPx > 0 ? 'blur(' + blurPx + 'px)' : 'none',
          color: normalizeHexColor(chosen, fallback),
        }
      }

      function applyAppearance() {
        if (layer === null) return
        const root = document.documentElement
        const one = zoneStyle(1)
        const two = zoneStyle(2)
        const three = zoneStyle(3)
        const four = zoneStyle(4)
        const five = zoneStyle(5)
        const six = zoneStyle(6)
        root.style.setProperty('--lwc-dim', (clamp(settings.dim, 0, 85) / 100).toFixed(3))
        root.style.setProperty('--lwc-blur', clamp(settings.blur, 0, 18) + 'px')
        root.style.setProperty('--lwc-fit', settings.fit)
        root.style.setProperty('--lwc-x', clamp(settings.focalX, 0, 100) + '%')
        root.style.setProperty('--lwc-y', clamp(settings.focalY, 0, 100) + '%')
        root.style.setProperty('--lwc-bg-1', one.bg)
        root.style.setProperty('--lwc-bg-2', two.bg)
        root.style.setProperty('--lwc-bg-3', three.bg)
        root.style.setProperty('--lwc-bg-4', four.bg)
        root.style.setProperty('--lwc-bg-5', five.bg)
        root.style.setProperty('--lwc-bg-6', six.bg)
        root.style.setProperty('--lwc-blur-1', one.blur)
        root.style.setProperty('--lwc-blur-2', two.blur)
        root.style.setProperty('--lwc-blur-3', three.blur)
        root.style.setProperty('--lwc-blur-4', four.blur)
        root.style.setProperty('--lwc-blur-5', five.blur)
        root.style.setProperty('--lwc-blur-6', six.blur)
        // Zone 2 lives on a layer behind the panel content (see STYLE_TEXT), so the
        // composer card and the instruction menu sit beside it rather than inside
        // it — each keeps its own backdrop filter and stays independently tunable.
        layer.hidden = !settings.enabled
        if (settings.enabled) root.setAttribute('data-live-wallpaper', 'on')
        else root.removeAttribute('data-live-wallpaper')
        refreshStatus()
      }

      /* ---------------- media ---------------- */

      function ensureLayer() {
        if (layer !== null) return
        if (document.body === null) return
        layer = document.createElement('div')
        layer.id = 'lwc-background'
        layer.setAttribute('aria-hidden', 'true')
        canvas = document.createElement('canvas')
        canvas.id = 'lwc-canvas'
        mediaBox = document.createElement('div')
        mediaBox.id = 'lwc-media'
        const shade = document.createElement('div')
        shade.id = 'lwc-shade'
        layer.append(canvas, mediaBox, shade)
        document.body.append(layer)
      }

      function resize() {
        if (canvas === null || layer === null) return
        width = layer.clientWidth || window.innerWidth
        height = layer.clientHeight || window.innerHeight
        const ratio = Math.min(window.devicePixelRatio || 1, 1.4)
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
        canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0)
        points = Array.from({ length: 90 }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          z: 0.2 + Math.random() * 0.8,
          length: 8 + Math.random() * 25,
        }))
        drawScene(0)
      }

      function drawScene(elapsed) {
        if (canvas === null) return
        const context = canvas.getContext('2d')
        if (context === null) return
        const scene = current?.scene || 'rain'
        context.fillStyle = scene === 'matrix' ? '#031011' : '#071321'
        context.fillRect(0, 0, width, height)
        const glow = context.createRadialGradient(width * 0.72, height * 0.22, 0, width * 0.7, height * 0.35, width * 0.8)
        glow.addColorStop(0, scene === 'matrix' ? '#0c363b' : '#15394e')
        glow.addColorStop(1, '#030914')
        context.fillStyle = glow
        context.fillRect(0, 0, width, height)
        for (let index = 0; index < points.length; index++) {
          const point = points[index]
          if (elapsed) {
            point.y += (scene === 'stars' ? 4 : 120) * point.z * elapsed / 1000
            if (point.y > height + 30) point.y = -30
          }
          if (scene === 'stars') {
            context.fillStyle = 'rgba(199,229,248,' + point.z * 0.8 + ')'
            context.beginPath()
            context.arc(point.x, point.y, point.z * 1.5, 0, Math.PI * 2)
            context.fill()
          } else if (scene === 'matrix') {
            context.font = (12 + point.z * 7) + 'px monospace'
            context.fillStyle = 'rgba(80,211,203,' + point.z * 0.55 + ')'
            context.fillText('01<>/{}'[Math.floor((index + frame / 15) % 7)], point.x, point.y)
          } else {
            context.strokeStyle = 'rgba(127,202,236,' + point.z * 0.45 + ')'
            context.lineWidth = point.z
            context.beginPath()
            context.moveTo(point.x, point.y)
            context.lineTo(point.x - 3, point.y + point.length)
            context.stroke()
          }
        }
      }

      function tick(now) {
        raf = 0
        if (disposed || shouldPause() || !activeIsCanvas) return
        if (now - lastFrame >= 40) {
          drawScene(Math.min(80, now - lastFrame))
          lastFrame = now
          frame++
        }
        raf = requestAnimationFrame(tick)
      }

      function syncPlayback() {
        if (layer === null) return
        refreshStatus()
        if (shouldPause()) {
          if (activeMedia !== null && activeMedia.tagName === 'VIDEO') activeMedia.pause()
          if (raf) cancelAnimationFrame(raf)
          raf = 0
          if (activeIsCanvas) drawScene(0)
          emit()
          return
        }
        if (activeIsCanvas) {
          lastFrame = performance.now()
          if (!raf) raf = requestAnimationFrame(tick)
        } else if (activeMedia !== null && activeMedia.tagName === 'VIDEO') {
          const playback = activeMedia.play()
          playback?.catch?.(() => { lastError = '播放被阻止，请点击“播放”重试' })
        }
        emit()
      }

      function makeMedia(url, kind) {
        return new Promise((resolve, reject) => {
          const isVideo = kind !== 'image'
          const node = document.createElement(isVideo ? 'video' : 'img')
          if (isVideo) {
            node.muted = true
            node.defaultMuted = true
            node.loop = true
            node.playsInline = true
            node.preload = 'auto'
            node.playbackRate = clamp(settings.speed, 0.25, 2)
          }
          node.style.opacity = '0'
          mediaBox.append(node)
          let timer = 0
          const settle = (error) => {
            clearTimeout(timer)
            node.onload = node.onloadeddata = node.onerror = null
            if (error) {
              node.pause?.()
              node.remove()
              reject(error)
              return
            }
            resolve(node)
          }
          node.onload = node.onloadeddata = () => settle(null)
          node.onerror = () => settle(new Error('该视频暂时无法播放'))
          timer = window.setTimeout(() => settle(new Error('视频加载超时')), 18000)
          node.src = url
        })
      }

      async function choose(item, userGesture) {
        const version = ++loadVersion
        const previous = current
        busy = true
        lastError = ''
        if (userGesture) {
          // Picking a wallpaper resumes a manual pause, but it must not silently
          // cancel "尊重系统减少动态效果": only the explicit 播放 / 仍然播放
          // buttons grant that consent.
          settings.paused = false
        }
        emit()
        try {
          if (item.kind === 'scene') {
            activeMedia?.pause?.()
            mediaBox.replaceChildren()
            activeMedia = null
            activeIsCanvas = true
            canvas.hidden = false
            current = { ...item }
          } else {
            let resource = { ...item }
            const needsResolve = resource.page && SOURCE_NAMES[resource.source] && resource.resolvedQuality !== settings.quality
            if (needsResolve || (!resource.url && !resource.localId)) {
              const resolved = await api('resolve', {
                source: resource.source,
                page: resource.page,
                quality: settings.quality,
              })
              resource = { ...resource, ...resolved }
              delete resource.localId
            }
            if (disposed || version !== loadVersion) return
            let node
            try {
              node = await makeMedia(resource.localId ? mediaUrl(resource.localId) : resource.url, resource.kind)
            } catch (firstError) {
              if (disposed || version !== loadVersion) return
              if (resource.localId) throw firstError
              statusLine = '直连失败，正在通过本地缓存重试…'
              emit()
              try {
                const cached = await api('prepare', { url: resource.url })
                resource = { ...resource, localId: cached.localId }
                node = await makeMedia(mediaUrl(cached.localId), resource.kind)
              } catch (cacheError) {
                const preview = resource.variants?.find((entry) => entry.quality === 'preview')
                if (!preview || resource.selectedQuality === 'preview') throw cacheError
                resource = {
                  ...resource, url: preview.url, selectedQuality: 'preview', qualityLabel: '预览',
                  qualityNotice: '高清版本未能播放，已回退预览：' + friendlyError(cacheError),
                }
                delete resource.localId
                statusLine = '高清未能播放，正在回退预览…'
                emit()
                node = await makeMedia(resource.url, resource.kind)
              }
            }
            if (disposed || version !== loadVersion) {
              node.pause?.()
              node.remove()
              return
            }
            activeMedia?.pause?.()
            for (const old of Array.from(mediaBox.children)) {
              if (old === node) continue
              old.pause?.()
              old.remove()
            }
            activeMedia = node
            activeIsCanvas = false
            node.style.opacity = '1'
            canvas.hidden = true
            current = resource
            if (node.tagName === 'VIDEO') {
              node.addEventListener('error', () => {
                if (activeMedia === node) {
                  lastError = '视频连接中断，请重试或换一张壁纸'
                  emit()
                }
              })
            }
          }
          if (userGesture) settings.enabled = true
          writeStore(KEY_CURRENT, current)
          saveSettings()
          applyAppearance()
          resize()
          syncPlayback()
          if (userGesture) toast('已应用：' + item.title)
        } catch (error) {
          if (version === loadVersion && !disposed) {
            current = previous
            lastError = '加载失败：' + friendlyError(error)
            toast('壁纸加载失败，已保留原背景')
          }
        } finally {
          if (version === loadVersion) {
            busy = false
            refreshStatus()
            emit()
          }
        }
      }

      /* ---------------- library ---------------- */

      function isFavorite(item) {
        return favorites.some((entry) => entry.id === item.id)
      }

      function toggleFavorite(item) {
        favorites = isFavorite(item)
          ? favorites.filter((entry) => entry.id !== item.id)
          : [...favorites.filter((entry) => entry.id !== item.id), { ...item }].slice(-200)
        writeStore(KEY_FAVORITES, favorites)
        emit()
      }

      function normalizeTopic(sourceId, topicId) {
        const definition = TOPICS.find((entry) => entry.id === topicId) ?? TOPICS[0]
        if (sourceId === 'all' || Object.hasOwn(definition.routes, sourceId)) return definition.id
        const fallback = TOPICS.find((entry) => entry.id === 'nature' && Object.hasOwn(entry.routes, sourceId))
        return fallback ? fallback.id : 'all'
      }

      async function browseCatalog(options) {
        const request = ++browseRequest
        const params = {
          source: filters.source,
          topic: filters.topic,
          query: filters.query,
          page: browse.page,
          cursor: browse.cursors[browse.page - 1] || '',
          refresh: options?.refresh === true,
        }
        browse.status = 'loading'
        browse.error = ''
        emit()
        try {
          const result = await api('browseCatalog', params)
          if (request !== browseRequest) return
          browse.items = result.items ?? []
          browse.next = result.next ?? ''
          browse.warnings = result.warnings ?? []
          browse.status = 'ready'
        } catch (error) {
          if (request !== browseRequest) return
          browse.status = 'error'
          browse.error = friendlyError(error)
        }
        emit()
      }

      function setFilter(patch) {
        filters = { ...filters, ...patch }
        if (patch.source !== undefined) filters.topic = normalizeTopic(filters.source, filters.topic)
        writeStore(KEY_FILTERS, filters)
        browse.page = 1
        browse.cursors = ['']
        browse.items = []
        emit()
        void browseCatalog()
      }

      function goPage(delta) {
        const next = browse.page + delta
        if (next < 1) return
        if (delta > 0) {
          if (!browse.next) return
          browse.cursors[next - 1] = browse.next
        }
        browse.page = next
        emit()
        void browseCatalog()
      }

      function randomPick() {
        const pool = tab === 'favorites' ? favorites : (browse.status === 'ready' && browse.items.length > 0 ? browse.items : [])
        const alternates = pool.filter((entry) => entry.id !== current?.id)
        const candidate = alternates.length > 0 ? alternates : (favorites.length > 0 ? favorites : BUILTINS)
        const filtered = candidate.filter((entry) => entry.id !== current?.id)
        const usable = filtered.length > 0 ? filtered : candidate
        if (!usable.length) return
        void choose(usable[Math.floor(Math.random() * usable.length)], true)
      }

      /* ---------------- local import ---------------- */

      async function importFile(file) {
        localFeedback = '正在导入 0%…'
        emit()
        let upload
        try {
          upload = await api('beginUpload', { name: file.name, size: file.size })
          let offset = 0
          const chunkSize = 192 * 1024
          while (offset < file.size) {
            const slice = file.slice(offset, Math.min(offset + chunkSize, file.size))
            const buffer = new Uint8Array(await slice.arrayBuffer())
            let binary = ''
            for (let index = 0; index < buffer.length; index += 0x8000) {
              binary += String.fromCharCode.apply(null, buffer.subarray(index, index + 0x8000))
            }
            const result = await api('uploadChunk', { id: upload.id, offset, base64: btoa(binary) })
            offset = result.offset
            localFeedback = '正在导入 ' + Math.round((offset / file.size) * 100) + '%…'
            emit()
          }
          localFeedback = '正在复制到壁纸库…'
          emit()
          const item = await api('finishUpload', { id: upload.id })
          locals = [...locals.filter((entry) => entry.id !== item.id), item]
          writeStore(KEY_LOCALS, locals)
          localFeedback = '已导入，重启后仍可使用'
          tab = 'local'
          emit()
          await choose(item, true)
        } catch (error) {
          localFeedback = '导入失败：' + friendlyError(error)
          emit()
          if (upload !== undefined) api('cancelUpload', { id: upload.id }).catch(() => {})
        }
      }

      async function applyDirectLink(url) {
        const trimmed = String(url || '').trim()
        if (!trimmed) return
        try {
          const resolved = await api('resolve', { url: trimmed })
          const base = decodeURIComponent(new URL(resolved.url).pathname.split('/').pop() || '')
          const kind = /\.(mp4|webm)$/i.test(new URL(resolved.url).pathname) ? 'video' : 'image'
          const item = { id: resolved.url, source: 'custom', title: base ? base.replace(/\.[^.]+$/, '') : '自定义壁纸', kind, url: resolved.url }
          if (!isFavorite(item)) toggleFavorite(item)
          await choose(item, true)
        } catch (error) {
          localFeedback = '直链应用失败：' + friendlyError(error)
          emit()
        }
      }

      /* ---------------- drawer/state ---------------- */

      function setSettings(patch) {
        const previousQuality = settings.quality
        const intervalChanged = patch.interval !== undefined && patch.interval !== settings.interval
        settings = normalizeSettings({ ...settings, ...patch })
        if (intervalChanged) rotationAt = Date.now()
        if (previousQuality !== settings.quality && current?.page) {
          void choose(current, false)
        }
        saveSettings()
        applyAppearance()
        syncPlayback()
        emit()
      }

      function togglePlayback() {
        const wasPaused = shouldPause()
        settings.motionConsent = true
        settings.paused = !wasPaused
        saveSettings()
        applyAppearance()
        syncPlayback()
        emit()
      }

      function acceptMotion() {
        settings.motionConsent = true
        settings.paused = false
        saveSettings()
        applyAppearance()
        syncPlayback()
        emit()
      }

      function resetSettings() {
        settings = normalizeSettings({ ...DEFAULTS, enabled: settings.enabled, paused: settings.paused })
        rotationAt = Date.now()
        saveSettings()
        applyAppearance()
        syncPlayback()
        emit()
      }

      function setOpen(next) {
        open = next
        if (open && tab === 'gallery' && browse.status === 'idle') void browseCatalog()
        emit()
      }

      /** Load the first gallery page once, when the page is first shown. */
      function ensureBrowse() {
        if (browse.status === 'idle') void browseCatalog()
      }

      function setTab(next) {
        tab = next
        if (next === 'gallery' && browse.status === 'idle') void browseCatalog()
        emit()
      }

      /* ---------------- boot ---------------- */

      function boot() {
        ensureLayer()
        if (layer === null) {
          // The shell always mounts before a Client bundle runs; this only
          // covers a loader that executed before the body existed.
          document.addEventListener('DOMContentLoaded', () => {
            if (!disposed && layer === null) boot()
          }, { once: true })
          return () => {}
        }
        applyAppearance()
        if (current?.kind === 'scene') {
          activeIsCanvas = true
          canvas.hidden = false
        } else {
          activeIsCanvas = false
          canvas.hidden = true
          void choose(current, false)
        }
        resize()
        syncPlayback()

        const onResize = () => {
          resize()
          syncPlayback()
        }
        window.addEventListener('resize', onResize)
        const onVisibility = () => syncPlayback()
        document.addEventListener('visibilitychange', onVisibility)
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        const onMotion = () => syncPlayback()
        motionQuery.addEventListener?.('change', onMotion)

        let rotation = 0
        rotationAt = Date.now()
        rotation = window.setInterval(() => {
          if (!settings.interval || busy || shouldPause()) return
          if (Date.now() - rotationAt < settings.interval * 60000) return
          rotationAt = Date.now()
          const pool = favorites
          const alternates = pool.filter((entry) => entry.id !== current?.id)
          const usable = alternates.length > 0 ? alternates : BUILTINS.filter((entry) => entry.id !== current?.id)
          if (!usable.length) return
          void choose(usable[Math.floor(Math.random() * usable.length)], false)
        }, 15000)

        // Live "agent is working" signal: the Host half broadcasts it over SSE.
        try {
          source = new EventSource(PREFIX + '/events')
          source.addEventListener('status', (event) => {
            try {
              const payload = JSON.parse(event.data)
              if (payload.running !== taskRunning) {
                taskRunning = !!payload.running
                manualTaskPlay = false
                syncPlayback()
              }
            } catch {
              /* ignore a malformed frame */
            }
          })
        } catch {
          source = null
        }

        // The glass palette follows the active theme while the colors stay automatic.
        const offTheme = ctx?.on?.('theme/change', () => {
          applyAppearance()
          emit()
        })

        return () => {
          disposed = true
          offTheme?.()
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          motionQuery.removeEventListener?.('change', onMotion)
          window.clearInterval(rotation)
          source?.close()
          source = null
          if (raf) cancelAnimationFrame(raf)
          raf = 0
          activeMedia?.pause?.()
          mediaBox?.replaceChildren()
          activeMedia = null
          layer?.remove()
          layer = null
          const root = document.documentElement
          root.removeAttribute('data-live-wallpaper')
          for (const name of ['--lwc-dim', '--lwc-blur', '--lwc-fit', '--lwc-x', '--lwc-y', '--lwc-bg-1', '--lwc-bg-2', '--lwc-bg-3', '--lwc-bg-4', '--lwc-bg-5', '--lwc-bg-6', '--lwc-blur-1', '--lwc-blur-2', '--lwc-blur-3', '--lwc-blur-4', '--lwc-blur-5', '--lwc-blur-6']) {
            root.style.removeProperty(name)
          }
        }
      }

      let toastTimer = 0
      let toastText = ''
      function toast(message) {
        toastText = message
        emit()
        window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => {
          toastText = ''
          emit()
        }, 3200)
      }

      return {
        getSnapshot, subscribe, boot, setSettings, togglePlayback, acceptMotion, resetSettings,
        choose, isFavorite, toggleFavorite, setFilter, goPage, randomPick, importFile, applyDirectLink,
        setOpen, setTab, ensureBrowse, browseCatalog, getToast: () => toastText, reducedMotionEligible: reduced,
        toggleDrawer: () => setOpen(!open),
      }
    }

    /* ------------------------------------------------------------------ *
     * styles
     * ------------------------------------------------------------------ */

    const STYLE_TEXT = [
      '#lwc-background{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none!important;background:#07111d;contain:strict}',
      '#lwc-background>*{position:absolute;inset:0;width:100%;height:100%;pointer-events:none!important}',
      '#lwc-media>*{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:var(--lwc-fit,cover)!important;object-position:var(--lwc-x,50%) var(--lwc-y,50%)!important;filter:blur(var(--lwc-blur,0px));transition:opacity .35s ease}',
      '#lwc-canvas{filter:blur(var(--lwc-blur,0px));transition:opacity .35s ease}',
      '#lwc-shade{background:rgba(0,0,0,var(--lwc-dim,.30))}',
      // Zone tokens: the shell's own materials become the three glass zones.
      // `body` and `body[data-ds-dark-theme]` both declare these, so the rule
      // lists both to beat each palette block at equal specificity.
      'html[data-live-wallpaper="on"] body,html[data-live-wallpaper="on"] body[data-ds-dark-theme]{--dsw-alias-bg-base:var(--lwc-bg-2,rgba(35,35,35,0.500));--dsw-specific-sidebar-fill:var(--lwc-bg-1,rgba(35,35,35,0.500));--dsw-specific-input-major:var(--lwc-bg-3,rgba(74,74,74,0.500));--dsw-specific-bubble:var(--lwc-bg-2-user,rgba(66,66,66,0.500));background-color:transparent!important}',
      // The frame paints `--dsw-specific-sidebar-fill` on Windows (caption strip
      // included); clear it so the wallpaper reaches the window edges, and drop
      // the caption band's own fill.
      'html[data-live-wallpaper="on"] [data-slot="root"] > *{background:transparent!important}',
      // Zone 1 — the whole left column in one piece, painted by a layer behind its
      // content. The blur must NOT sit on the column, on the sidebar root or on any
      // other ancestor: on Windows the collapse toggle and the collapsed New Session
      // button are `position: fixed; left: 12px / 48px`, and a `backdrop-filter`
      // ancestor re-anchors them to itself instead of the window. A pseudo layer is
      // nobody's ancestor, so it frosts the full column — footer included — with no
      // seam, and the fixed buttons keep their viewport coordinates.
      'html[data-live-wallpaper="on"] [class*="_sidebarCol"]{position:relative;isolation:isolate;background:transparent!important;border-right-color:transparent!important}',
      'html[data-live-wallpaper="on"] [class*="_sidebarCol"]::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--lwc-bg-1,rgba(35,35,35,0.500));backdrop-filter:var(--lwc-blur-1,none);-webkit-backdrop-filter:var(--lwc-blur-1,none)}',
      'html[data-live-wallpaper="on"] [data-slot="sidebar"] > *{background:transparent!important}',
      // The sidebar ends its scroll list with a 24px fade painted from
      // `--dsw-specific-sidebar-fill`. That token is translucent here, so the
      // "cover" turned into a visible band; nothing needs covering on glass.
      'html[data-live-wallpaper="on"] [data-slot="sidebar"] [class*="_scrollFade"]{display:none!important}',
      'html[data-live-wallpaper="on"] [data-slot="sidebar"] [class*="_scrollFade"]::before,html[data-live-wallpaper="on"] [data-slot="sidebar"] [class*="_scrollFade"]::after{background:none!important;background-image:none!important}',
      // Zone 2 — the main column ground, drawn as its own layer behind the panel
      // content. A background layer on the panel itself would make every descendant
      // with a backdrop-filter (输入框、指令菜单) nest inside it, and a nested
      // filter samples the wallpaper without this tint — the shaded rectangle the
      // user saw. As a sibling layer it is simply part of what they sample, so all
      // five zones stay independent.
      'html[data-live-wallpaper="on"] [class*="_centerCol"]{background:transparent!important}',
      'html[data-live-wallpaper="on"] [class*="_mainPanel"]{position:relative!important;isolation:isolate;background:transparent!important}',
      'html[data-live-wallpaper="on"] [class*="_mainPanel"]::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--lwc-bg-2,rgba(35,35,35,0.500));backdrop-filter:var(--lwc-blur-2,none);-webkit-backdrop-filter:var(--lwc-blur-2,none)}',
      'html[data-live-wallpaper="on"] [data-slot="main"] [data-phase]:not([contenteditable]):not([data-composer-input]):not([data-composer-card] *){background:transparent!important}',
      // The composer seat's own 36px fade reads bg-base, which is translucent
      // now; clear it. The status readings live in `[data-composer-dock]`, so
      // the frost is a rounded pill around that row instead of a band behind
      // the whole composer.
      'html[data-live-wallpaper="on"] [data-composer-seat]{background:none!important;box-shadow:none!important}',
      'html[data-live-wallpaper="on"] [data-composer-seat]::before,html[data-live-wallpaper="on"] [data-composer-seat]::after{background:none!important;background-image:none!important}',
      'html[data-live-wallpaper="on"] [data-composer-dock]{background:var(--lwc-bg-4,rgba(74,74,74,0.700))!important;backdrop-filter:var(--lwc-blur-4,none);-webkit-backdrop-filter:var(--lwc-blur-4,none);border-radius:999px;padding:0;border:0;margin-top:2px;margin-bottom:-2px}',
      // Zone 3 — the composer card, always with its own filter; independent of the
      // content-area blur because that one now lives on a layer behind it.
      'html[data-live-wallpaper="on"] [data-composer-card]{background:var(--lwc-bg-3,rgba(74,74,74,0.500))!important;background-image:none!important;backdrop-filter:var(--lwc-blur-3,none);-webkit-backdrop-filter:var(--lwc-blur-3,none);isolation:isolate}',
      // Zone 5 — the `/` and `@` instruction menus, which the composer renders inside
      // `[data-composer-overlay]`. `data-trigger-menu` is the host's own hook.
      'html[data-live-wallpaper="on"] [data-trigger-menu]{background:var(--lwc-bg-5,rgba(74,74,74,0.920))!important;backdrop-filter:var(--lwc-blur-5,none);-webkit-backdrop-filter:var(--lwc-blur-5,none);border-radius:14px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28))}',
      // Belt and braces: the same fill on any card inside the composer slot, so
      // a renamed attribute cannot leave the host's own input surface behind.
      'html[data-live-wallpaper="on"] [data-slot="conversation.composer.bar"] [class*="_card"]{background-color:var(--lwc-bg-3,rgba(74,74,74,0.500))!important}',
      // One surface only: the card's own children drop their fills so no inner
      // plate can read as a second, darker input box. Scoped to direct children
      // on purpose — the `/` command menu and other popovers render inside
      // `[data-composer-overlay]`, and they must keep the host's own surface.
      'html[data-live-wallpaper="on"] [data-composer-card] > *:not(button){background-color:transparent!important;background-image:none!important}',
      'html[data-live-wallpaper="on"] [data-input-scroll],html[data-live-wallpaper="on"] [data-composer-input],html[data-live-wallpaper="on"] [data-composer-placeholder]{background-color:transparent!important;background-image:none!important}',
      // Sent bubbles have their own zone so the contrast step is tunable. Only the
      // fill and the frost change here: radius and padding stay the host's own.
      'html[data-live-wallpaper="on"] [data-message-bubble]{background:var(--lwc-bg-6,rgba(66,66,66,0.250))!important;backdrop-filter:var(--lwc-blur-6,none);-webkit-backdrop-filter:var(--lwc-blur-6,none)}',
      // Drawer (the gallery and settings live here, as in the reference).
      '.lwc-drawer{position:fixed;top:var(--dsh-frame-top-clearance,0px);right:0;bottom:0;width:clamp(360px,30vw,540px);z-index:60;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#17191e) 96%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:var(--dsw-alias-label-primary,#e8ecf2);border-left:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));box-shadow:-16px 0 44px rgba(0,0,0,.22)}',
      '.lwc-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
      '.lwc-drawer-title{font-size:14px;font-weight:600;letter-spacing:.01em}',
      '.lwc-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}',
      '.lwc-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}',
      '.lwc-drawer-body{flex:1;min-height:0;overflow:auto;padding:12px 14px 24px}',
      '.lwc-page-card{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#17191e) 96%,transparent);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:16px;padding:14px 18px;margin-bottom:12px}',
      '.lwc-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
      '.lwc-tab{border:0;border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.lwc-tab[data-active="true"]{background:#4d6bfe;color:#fff}',
      '.lwc-hero{display:flex;gap:14px;align-items:center}',
      '.lwc-hero img,.lwc-hero .lwc-scene-art{width:96px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#9fb6d0;font-size:18px}',
      '.lwc-hero-body{min-width:0;flex:1}',
      '.lwc-hero-title{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.lwc-hero-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa4b2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.lwc-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.lwc-btn{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));border-radius:8px;padding:5px 11px;font-size:12px;cursor:pointer;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:inherit}',
      '.lwc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2))}',
      '.lwc-btn[data-primary="true"]{background:#4d6bfe;border-color:transparent;color:#fff}',
      '.lwc-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.lwc-hint{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa4b2);margin-top:8px}',
      '.lwc-field{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14))}',
      '.lwc-field:last-child{border-bottom:0;padding-bottom:0}',
      '.lwc-label{display:block;font-size:12.5px;font-weight:600;margin-bottom:3px;color:var(--dsw-alias-label-primary,#e8ecf2)}',
      '.lwc-desc{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.lwc-range{display:flex;align-items:center;gap:10px;margin-top:8px}',
      '.lwc-range input[type=range]{flex:1;accent-color:#4d6bfe;min-width:0}',
      '.lwc-output{min-width:52px;text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.lwc-select,.lwc-color-row select{width:100%;max-width:420px;box-sizing:border-box;padding:6px 8px;border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:inherit;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3))}',
      '.lwc-switch{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:0;height:24px}',
      '.lwc-track{width:36px;height:20px;border-radius:999px;background:rgba(127,127,127,.5);position:relative;transition:background .15s;flex:none}',
      '.lwc-track::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.28)}',
      '.lwc-switch[aria-checked="true"] .lwc-track{background:#4d6bfe}',
      '.lwc-switch[aria-checked="true"] .lwc-track::after{transform:translateX(16px)}',
      '.lwc-color-row{display:flex;align-items:center;gap:8px}',
      '.lwc-color-row input[type=color]{width:46px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));border-radius:6px;background:transparent;cursor:pointer}',
      '.lwc-hex{font-size:11px;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.lwc-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}',
      '.lwc-filters select{padding:6px 9px;border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:inherit;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3))}',
      '.lwc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
      '.lwc-chip{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));border-radius:999px;padding:3px 10px;font-size:11.5px;background:transparent;color:inherit;cursor:pointer}',
      '.lwc-chip[data-active="true"]{background:#4d6bfe;border-color:transparent;color:#fff}',
      '.lwc-search{display:flex;gap:6px;margin-bottom:8px;max-width:560px}',
      '.lwc-search input{flex:1;min-width:0;padding:6px 9px;border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:inherit;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3))}',
      '.lwc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}',
      '.lwc-card{position:relative;min-width:0}',
      '.lwc-card-cover{position:relative;display:block;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid transparent;background:rgba(0,0,0,.35);padding:0;cursor:pointer}',
      '.lwc-card[data-active="true"] .lwc-card-cover{border-color:#4d6bfe;box-shadow:0 0 0 1px #4d6bfe}',
      '.lwc-card-cover img{width:100%;height:100%;object-fit:cover;display:block}',
      '.lwc-scene-art{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;color:#9fb6d0}',
      '.lwc-play{position:absolute;right:6px;bottom:6px;font-size:10px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.6);color:#eaf2ff}',
      '.lwc-card-title{margin-top:6px;font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.lwc-credit{font-size:10.5px;color:var(--dsw-alias-label-secondary,#9aa4b2);margin-top:2px}',
      '.lwc-fav{position:absolute;right:4px;top:4px;border:0;border-radius:999px;width:22px;height:22px;font-size:12px;line-height:1;background:rgba(0,0,0,.45);color:#ffd76a;cursor:pointer}',
      '.lwc-empty{padding:22px 6px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.lwc-status{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa4b2);margin:6px 0 10px}',
      '.lwc-pager{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:16px}',
      '.lwc-toast{position:sticky;bottom:0;margin:8px 0 0;padding:8px 12px;border-radius:10px;font-size:12px;background:rgba(0,0,0,.78);color:#eaf2ff;text-align:center}',
      '.lwc-import{border-radius:12px;border:1px dashed var(--dsw-alias-border-l2,rgba(127,127,127,.4));padding:12px;margin-bottom:14px;max-width:620px}',
      '.lwc-import input[type=text]{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:inherit;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));margin-bottom:6px}',
    ].join('\n')

    /* ------------------------------------------------------------------ *
     * UI
     * ------------------------------------------------------------------ */

    function useEngine(engine) {
      const [snapshot, setSnapshot] = React.useState(() => engine.getSnapshot())
      React.useEffect(() => {
        const off = engine.subscribe(() => setSnapshot(engine.getSnapshot()))
        setSnapshot(engine.getSnapshot())
        return off
      }, [engine])
      return snapshot
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        className: 'lwc-switch',
        role: 'switch',
        'aria-checked': props.checked ? 'true' : 'false',
        onClick: () => props.onChange(!props.checked),
      }, h('span', { className: 'lwc-track' }), h('span', null, props.label ?? ''))
    }

    function RangeRow(props) {
      return h('div', { className: 'lwc-field' },
        h('label', { className: 'lwc-label' }, props.title),
        h('div', { className: 'lwc-desc' }, props.description),
        h('div', { className: 'lwc-range' },
          h('input', {
            type: 'range', min: props.min, max: props.max, step: props.step, value: props.value,
            'aria-label': props.title,
            onChange: (event) => props.onChange(Number(event.target.value)),
          }),
          h('span', { className: 'lwc-output' }, String(props.value) + (props.unit ?? '')),
        ),
      )
    }

    function ColorRow(props) {
      return h('div', { className: 'lwc-field' },
        h('label', { className: 'lwc-label' }, props.title),
        h('div', { className: 'lwc-desc' }, props.description),
        h('div', { className: 'lwc-color-row' },
          h('input', {
            type: 'color', value: props.value, 'aria-label': props.title,
            onChange: (event) => props.onChange(event.target.value),
          }),
          h('span', { className: 'lwc-hex' }, String(props.value).toUpperCase()),
          props.auto && h('span', { className: 'lwc-hex', style: { opacity: 0.7 } }, '跟随主题'),
          h('button', {
            type: 'button', className: 'lwc-btn',
            onClick: () => props.onReset(),
          }, '默认'),
        ),
      )
    }

    function SelectRow(props) {
      return h('div', { className: 'lwc-field' },
        h('label', { className: 'lwc-label' }, props.title),
        h('div', { className: 'lwc-desc' }, props.description),
        h('select', {
          className: 'lwc-select', value: String(props.value), 'aria-label': props.title,
          onChange: (event) => props.onChange(props.numeric ? Number(event.target.value) : event.target.value),
        }, props.options.map((option) => h('option', { key: String(option.value), value: String(option.value) }, option.label))),
      )
    }

    function SettingsTab({ engine, snapshot }) {
      const settings = snapshot.settings
      const fitLabel = SETTINGS_FIELDS.find((field) => field.key === 'fit').options.find((option) => option.value === settings.fit)?.label ?? settings.fit
      const qualityField = SETTINGS_FIELDS.find((field) => field.key === 'quality')
      const qualityLabel = qualityField.options.find((option) => option.value === settings.quality)?.label ?? settings.quality
      const summary = `当前显示：${fitLabel} · 画质 ${qualityLabel} · 背景 ${settings.dim}%/${settings.blur}px · 遮罩 ${settings.glass1}/${settings.glass2}/${settings.glass3}/${settings.glass4}/${settings.glass5}/${settings.glass6}% · 模糊 ${settings.glassBlur1}/${settings.glassBlur2}/${settings.glassBlur3}/${settings.glassBlur4}/${settings.glassBlur5}/${settings.glassBlur6}px`
      return h('div', null,
        h('div', { className: 'lwc-status' }, summary),
        SETTINGS_FIELDS.filter((field) => field.onlyWhen === undefined || field.onlyWhen(settings)).map((field) => {
          const value = settings[field.key]
          if (field.type === 'range') {
            return h(RangeRow, {
              key: field.key, title: field.title, description: field.description,
              min: field.min, max: field.max, step: field.step, unit: field.unit,
              value, onChange: (next) => engine.setSettings({ [field.key]: next }),
            })
          }
          if (field.type === 'color') {
            const zone = Number(field.key.slice(-1))
            return h(ColorRow, {
              key: field.key, title: field.title, description: field.description,
              value: settings.colorsAuto === false ? value : snapshot.effectiveColors[zone],
              defaultValue: field.default,
              auto: settings.colorsAuto !== false,
              onChange: (next) => engine.setSettings({ [field.key]: next, colorsAuto: false }),
              onReset: () => engine.setSettings({ [field.key]: field.default, colorsAuto: true }),
            })
          }
          if (field.type === 'select') {
            return h(SelectRow, {
              key: field.key, title: field.title, description: field.description,
              value, options: field.options, numeric: field.numeric,
              onChange: (next) => engine.setSettings({ [field.key]: next }),
            })
          }
          return h('div', { className: 'lwc-field', key: field.key },
            h('div', { className: 'lwc-label' }, field.title),
            h('div', { className: 'lwc-desc' }, field.description),
            h(Switch, { checked: !!value, label: value ? '已开启' : '已关闭', onChange: (next) => engine.setSettings({ [field.key]: next }) }),
          )
        }),
        h('div', { className: 'lwc-hint' }, '修改滑块或开关后右侧实时预览并自动保存。'),
        h('div', { className: 'lwc-row' }, h('button', { type: 'button', className: 'lwc-btn', onClick: () => engine.resetSettings() }, '恢复默认设置')),
      )
    }

    function Card({ engine, snapshot, item, onChoose }) {
      const active = snapshot.current?.id === item.id
      const favorite = engine.isFavorite(item)
      const source = SOURCE_NAMES[item.source]
      const credit = source
        ? source + (item.source === 'mixkit' ? ' · 实拍 / 素材' : (item.source === 'motion' || item.source === 'free') ? ' · HD / 4K 可选' : ' · 公开预览')
        : item.source === 'local' ? '本地资源' : item.source === 'custom' ? '自定义媒体' : '内置 · 离线可用'
      const cover = h('button', {
        type: 'button', className: 'lwc-card-cover', 'aria-label': '应用壁纸：' + item.title,
        onClick: () => onChoose(item),
      },
        item.thumb
          ? h('img', { src: thumbUrl(item.thumb), alt: item.title, loading: 'lazy' })
          : h('span', { className: 'lwc-scene-art' }, item.scene === 'stars' ? '✦ · ✧' : item.scene === 'matrix' ? '01 /' : '╱ ╱ ╱'),
        h('span', { className: 'lwc-play' }, active ? '使用中' : item.kind === 'scene' ? '内置' : '▷ 应用'),
      )
      return h('div', { className: 'lwc-card', 'data-active': active ? 'true' : 'false', 'data-wallpaper-id': item.id },
        cover,
        h('div', { className: 'lwc-card-title', title: item.title }, item.title),
        h('div', { className: 'lwc-credit' }, credit),
        h('button', {
          type: 'button', className: 'lwc-fav', 'aria-label': (favorite ? '取消收藏：' : '收藏：') + item.title,
          'aria-pressed': favorite ? 'true' : 'false', onClick: () => engine.toggleFavorite(item),
        }, favorite ? '★' : '☆'),
      )
    }

    function GalleryTab({ engine, snapshot }) {
      const [query, setQuery] = React.useState(snapshot.filters.query)
      React.useEffect(() => { setQuery(snapshot.filters.query) }, [snapshot.filters.query])
      const filters = snapshot.filters
      const topic = TOPICS.find((entry) => entry.id === filters.topic) ?? TOPICS[0]
      const topics = TOPICS.filter((entry) => filters.source === 'all' || Object.hasOwn(entry.routes, filters.source))
      const browse = snapshot.browse
      const status = browse.status === 'loading'
        ? '正在读取图库…'
        : browse.status === 'error'
          ? '第 ' + browse.page + ' 页加载失败：' + browse.error
          : browse.items.length > 0
            ? browse.items.length + ' 个视频 · ' + (SOURCE_NAMES[filters.source] ?? '全部数据源') + ' · ' + topic.label + ' · 第 ' + browse.page + ' 页'
            : ''
      const note = filters.query
        ? '关键词搜索覆盖所选源的全站内容；选择分类会清空关键词。'
        : filters.source === 'mixkit'
          ? 'Mixkit 提供实拍与抽象素材；部分短片并非无缝循环，许可以原站为准。'
          : filters.source === 'all'
            ? '跨源浏览 · Mixkit 优先展示实拍 / 素材 · 其他源的风景与生活分类可能包含插画。'
            : (SOURCE_NAMES[filters.source] ?? '') + ' · 按原站分类，可能包含插画。'
      return h('div', null,
        h('div', { className: 'lwc-filters' },
          h('select', {
            'aria-label': '视频数据源', value: filters.source,
            onChange: (event) => engine.setFilter({ source: event.target.value }),
          },
            h('option', { value: 'all' }, '全部数据源 · 聚合'),
            h('option', { value: 'mixkit' }, 'Mixkit · 实拍 / 抽象素材'),
            h('option', { value: 'moe' }, 'MoeWalls · 动态壁纸'),
            h('option', { value: 'motion' }, 'MotionBgs · HD / 4K'),
            h('option', { value: 'waifu' }, 'WallpaperWaifu · 动态壁纸'),
            h('option', { value: 'free' }, 'LiveWallpapers4Free · HD / 4K'),
          ),
          h('select', {
            'aria-label': '内容分类', value: filters.topic,
            onChange: (event) => engine.setFilter({ topic: event.target.value }),
          }, topics.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
        ),
        h('div', { className: 'lwc-chips' }, topics.filter((entry) => entry.id !== 'all').map((entry) =>
          h('button', {
            key: entry.id, type: 'button', className: 'lwc-chip',
            'data-active': filters.topic === entry.id ? 'true' : 'false',
            onClick: () => engine.setFilter({ topic: entry.id, query: '' }),
          }, entry.label))),
        h('form', {
          className: 'lwc-search',
          onSubmit: (event) => { event.preventDefault(); engine.setFilter({ query: query.trim(), topic: query.trim() ? 'all' : filters.topic }) },
        },
          h('input', {
            type: 'search', value: query, placeholder: '搜索：forest / street / abstract',
            'aria-label': '搜索壁纸，英文关键词',
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', { type: 'submit', className: 'lwc-btn' }, '搜索'),
          h('button', { type: 'button', className: 'lwc-btn', onClick: () => { setQuery(''); engine.setFilter({ source: 'all', topic: 'nature', query: '' }) } }, '重置'),
        ),
        h('div', { className: 'lwc-status' }, note),
        browse.status === 'loading' && h('div', { className: 'lwc-status' }, status),
        browse.warnings.length > 0 && h('div', { className: 'lwc-status' }, '部分源暂不可用：' + browse.warnings.map((warning) => warning.name).join('、')),
        browse.items.length === 0 && browse.status !== 'loading'
          ? h('div', { className: 'lwc-empty' }, browse.status === 'error' ? '加载失败：' + browse.error : '没有找到结果，换个关键词试试。')
          : h('div', { className: 'lwc-grid' }, browse.items.map((item) =>
            h(Card, { key: item.id, engine, snapshot, item, onChoose: (target) => engine.choose(target, true) }))),
        h('div', { className: 'lwc-pager' },
          h('button', { type: 'button', className: 'lwc-btn', disabled: browse.page === 1, onClick: () => engine.goPage(-1) }, '上一页'),
          h('span', { className: 'lwc-status' }, '第 ' + browse.page + ' 页'),
          h('button', { type: 'button', className: 'lwc-btn', disabled: !browse.next, onClick: () => engine.goPage(1) }, '下一页'),
        ),
        h('div', { className: 'lwc-hint' }, '已接入 5 家视频源（Mixkit 提供实拍与抽象素材；其余为动态壁纸站）。搜索支持英文关键词。MP4 / WebM 解码取决于内置浏览器支持；本地导入上限 256 MB，不转码、不压缩。'),
      )
    }

    function ListTab({ engine, snapshot, items, emptyText }) {
      return items.length === 0
        ? h('div', { className: 'lwc-empty' }, emptyText)
        : h('div', { className: 'lwc-grid' }, items.map((item) =>
          h(Card, { key: item.id, engine, snapshot, item, onChoose: (target) => engine.choose(target, true) })))
    }

    function LocalTab({ engine, snapshot }) {
      const fileRef = React.useRef(null)
      const [path, setPath] = React.useState('')
      const [url, setUrl] = React.useState('')
      return h('div', null,
        h('div', { className: 'lwc-import' },
          h('div', { className: 'lwc-label' }, '导入本地视频 / 图片'),
          h('input', {
            ref: fileRef, type: 'file', accept: 'video/mp4,video/webm,image/gif,image/png,image/jpeg,image/webp',
            style: { display: 'none' },
            onChange: (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void engine.importFile(file)
            },
          }),
          h('div', { className: 'lwc-row' },
            h('button', { type: 'button', className: 'lwc-btn', onClick: () => fileRef.current?.click() }, '选择视频 / GIF 文件'),
          ),
          h('div', { className: 'lwc-hint' }, '文件只复制到本机插件数据目录，不上传、不转码。'),
          h('div', { className: 'lwc-row' },
            h('input', {
              type: 'text', placeholder: 'https://…/wallpaper.mp4 或 .webm', value: url,
              onChange: (event) => setUrl(event.target.value),
            }),
          ),
          h('div', { className: 'lwc-row' },
            h('button', { type: 'button', className: 'lwc-btn', onClick: () => { void engine.applyDirectLink(url); setUrl('') } }, '应用直链'),
          ),
          snapshot.localFeedback && h('div', { className: 'lwc-status' }, snapshot.localFeedback),
        ),
        snapshot.locals.length === 0
          ? h('div', { className: 'lwc-empty' }, '还没有本地壁纸。在上方选择视频或填写直链。')
          : h(ListTab, { engine, snapshot, items: snapshot.locals, emptyText: '' }),
      )
    }

function Drawer({ engine }) {
      const snapshot = useEngine(engine)
      // Hooks must run before the closed-state early return.
      React.useEffect(() => {
        engine.ensureBrowse()
      }, [engine])
      if (!snapshot.open) return null
      const item = snapshot.current
      const tabs = [
        ['gallery', '在线图库'], ['favorites', '我的收藏'], ['scenes', '内置场景'],
        ['local', '本地壁纸'], ['settings', '显示设置'],
      ]
      const reducedBlocked = engine.reducedMotionEligible()
      const bodyContent = snapshot.tab === 'settings'
        ? h(SettingsTab, { engine, snapshot })
        : snapshot.tab === 'gallery'
          ? h(GalleryTab, { engine, snapshot })
          : snapshot.tab === 'favorites'
            ? h(ListTab, { engine, snapshot, items: snapshot.favorites, emptyText: '还没有收藏。点击壁纸旁的 ☆ 加入。' })
            : snapshot.tab === 'local'
              ? h(LocalTab, { engine, snapshot })
              : h(ListTab, { engine, snapshot, items: BUILTINS, emptyText: '' })
      return h('aside', { className: 'lwc-drawer', role: 'complementary', 'aria-label': '动态壁纸' },
        h('div', { className: 'lwc-drawer-head' },
          h('span', { className: 'lwc-drawer-title' }, '动态壁纸'),
          h('button', {
            type: 'button', className: 'lwc-close', 'aria-label': '关闭', onClick: () => engine.setOpen(false),
          }, h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none' }))),
        ),
        h('div', { className: 'lwc-drawer-body' },
          h('div', { className: 'lwc-page-card' },
            h('div', { className: 'lwc-hero' },
              item?.thumb
                ? h('img', { src: thumbUrl(item.thumb), alt: item.title })
                : h('span', { className: 'lwc-scene-art' }, item?.scene === 'stars' ? '✦' : item?.scene === 'matrix' ? '01' : '╱'),
              h('div', { className: 'lwc-hero-body' },
                h('div', { className: 'lwc-hero-title' }, item?.title ?? '未设置'),
                h('div', { className: 'lwc-hero-sub' }, snapshot.busy ? '正在准备壁纸…' : (snapshot.statusLine || '')),
                h('div', { className: 'lwc-row' },
                  h('button', { type: 'button', className: 'lwc-btn', onClick: () => engine.togglePlayback() }, snapshot.settings.paused ? '播放' : '暂停'),
                  h('button', { type: 'button', className: 'lwc-btn', onClick: () => engine.randomPick() }, '随机一张'),
                  h('button', {
                    type: 'button', className: 'lwc-btn',
                    onClick: () => engine.setSettings({ enabled: !snapshot.settings.enabled }),
                  }, snapshot.settings.enabled ? '关闭壁纸' : '开启壁纸'),
                ),
                snapshot.lastError && h('div', { className: 'lwc-hint' }, snapshot.lastError),
              ),
            ),
          ),
          reducedBlocked && h('div', { className: 'lwc-page-card' },
            h('div', { className: 'lwc-hint', style: { marginTop: 0 } }, '系统开启了“减少动态效果”，壁纸默认静止。'),
            h('div', { className: 'lwc-row' },
              h('button', { type: 'button', className: 'lwc-btn', onClick: () => engine.acceptMotion() }, '仍然播放'))),
          h('div', { className: 'lwc-tabs' }, tabs.map(([key, label]) =>
            h('button', {
              key, type: 'button', className: 'lwc-tab',
              'data-active': snapshot.tab === key ? 'true' : 'false',
              'aria-pressed': snapshot.tab === key ? 'true' : 'false',
              onClick: () => engine.setTab(key),
            }, label))),
          h('div', { className: 'lwc-page-card' }, bodyContent),
        ),
        engine.getToast() && h('div', { className: 'lwc-toast' }, engine.getToast()),
      )
    }

    /**
     * The window into the drawer: the sidebar row selects this panel id, and the
     * panel exists only to hand control to the drawer and give the conversation
     * column back, so the row can live with 插件 / 插件市场 while the UI stays a
     * drawer.
     */
    function PanelLauncher({ engine }) {
      React.useLayoutEffect(() => {
        engine.toggleDrawer()
        try {
          engine.ctx.layout.selectPanel(null)
        } catch {
          /* the layout keeps the panel when null is refused */
        }
      }, [engine])
      return h('div', { 'aria-hidden': true })
    }

    /** The sidebar row glyph: sized exactly like the host's own panel icons. */
    function PanelEntry(props) {
      const size = props.size ?? 16
      return h('span', {
        'aria-hidden': true,
        style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size },
      }, h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none' },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M2 10.5l3.4-3.2 2.4 2.2 2.2-2.6L14 10.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' })))
    }

    /* ------------------------------------------------------------------ *
     * plugin
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        const engine = createEngine(ctx)
        engine.ctx = ctx
        ctx.effect(() => {
          const style = document.createElement('style')
          style.id = 'dsh-live-wallpaper-style'
          style.textContent = STYLE_TEXT
          document.head.append(style)
          return () => style.remove()
        })
        ctx.effect(() => engine.boot())
        // The row lives in the global panel list; its `main` seat only opens the
        // drawer, so the gallery UI stays a drawer as requested.
        ctx.slots.register({
          name: 'main', key: 'live-wallpaper',
        }, () => h(PanelLauncher, { engine }))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'live-wallpaper', order: 30, label: '动态壁纸',
        }, (props) => h(PanelEntry, { engine, size: props?.size })))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'live-wallpaper-drawer', order: 80,
        }, () => h(Drawer, { engine })))
      },
    }
  },
})