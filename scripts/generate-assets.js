import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const FONT_STACK =
  "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', sans-serif"

// 색상 토큰 (tokens.css 와 동일)
const COLOR = {
  cream: '#FFF8E7',
  peach: '#FFE8DD',
  peachDeep: '#FFD8C2',
  orange: '#FF6B47',
  orangeSub: '#FF8B66',
  mint: '#4CAF7F',
  yellowAccent: '#FFD93D',
  textDark: '#2C2C2C',
}

// =========================================================================
// 앱 아이콘 (정사각, 512 기준)
// =========================================================================
function iconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLOR.cream}"/>
      <stop offset="100%" stop-color="${COLOR.peach}"/>
    </linearGradient>
    <linearGradient id="clipMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d0d0d0"/>
      <stop offset="100%" stop-color="#a0a0a0"/>
    </linearGradient>
  </defs>

  <!-- 배경 (전체) -->
  <rect width="512" height="512" fill="url(#bg)"/>

  <!-- 클립보드 (안전 영역 내부) -->
  <rect x="80" y="118" width="352" height="332" rx="36" ry="36"
        fill="white" stroke="${COLOR.orange}" stroke-width="14"/>

  <!-- 클립 -->
  <rect x="216" y="92" width="80" height="36" rx="12" ry="12" fill="url(#clipMetal)"/>
  <rect x="244" y="126" width="24" height="10" rx="2" fill="#888888"/>

  <!-- 타이틀: 해결해On나 -->
  <text x="256" y="248"
        font-family="${FONT_STACK}"
        font-weight="900" font-size="62"
        text-anchor="middle">
    <tspan fill="${COLOR.orange}">해결해</tspan><tspan fill="${COLOR.mint}">On</tspan><tspan fill="${COLOR.orange}">나</tspan>
  </text>

  <!-- 서브: 동래미 게임 -->
  <text x="256" y="306"
        font-family="${FONT_STACK}"
        font-weight="800" font-size="34"
        text-anchor="middle" fill="${COLOR.textDark}">동래미 게임</text>

  <!-- 하단 도형 ○ □ △ -->
  <g transform="translate(184, 358)" fill="none" stroke="${COLOR.mint}" stroke-width="6" stroke-linejoin="round">
    <circle cx="20" cy="22" r="18"/>
    <rect x="60" y="4" width="36" height="36"/>
    <polygon points="138,4 156,40 120,40"/>
  </g>
</svg>`
}

async function makeIcon(size) {
  const svg = iconSVG()
  const out = join(PUBLIC_DIR, `icon-${size}.png`)
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}

// =========================================================================
// OG 이미지 (1200x630)
// =========================================================================
function ogSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLOR.cream}"/>
      <stop offset="60%" stop-color="${COLOR.peach}"/>
      <stop offset="100%" stop-color="${COLOR.peachDeep}"/>
    </linearGradient>
    <linearGradient id="clipMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d0d0d0"/>
      <stop offset="100%" stop-color="#a0a0a0"/>
    </linearGradient>
    <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${COLOR.orange}" stroke-width="1" opacity="0.18"/>
    </pattern>
    <radialGradient id="gridMask" cx="100%" cy="0%" r="60%">
      <stop offset="0%" stop-color="black" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridFade">
      <rect width="1200" height="630" fill="url(#gridMask)"/>
    </mask>
  </defs>

  <!-- 배경 -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- 우상단 격자 데코 -->
  <rect width="1200" height="630" fill="url(#grid)" mask="url(#gridFade)"/>

  <!-- 좌측 텍스트 영역 -->
  <g>
    <!-- 작은 배지: 동래구청소년센터 -->
    <rect x="80" y="80" width="280" height="44" rx="22" fill="#C8F0D5"/>
    <text x="220" y="110"
          font-family="${FONT_STACK}"
          font-weight="800" font-size="20"
          text-anchor="middle" fill="${COLOR.textDark}">📍 동래구청소년센터</text>

    <!-- 메인 타이틀 해결해On나 -->
    <text x="80" y="270"
          font-family="${FONT_STACK}"
          font-weight="900" font-size="120"
          text-anchor="start">
      <tspan fill="${COLOR.orange}">해결해</tspan><tspan fill="${COLOR.mint}">On</tspan><tspan fill="${COLOR.orange}">나</tspan>
    </text>

    <!-- 시즌 타이틀 동래미(○□△) 게임 -->
    <text x="80" y="345"
          font-family="${FONT_STACK}"
          font-weight="800" font-size="44"
          text-anchor="start">
      <tspan fill="#E94B3C">동</tspan><tspan fill="#F4C430">래</tspan><tspan fill="${COLOR.mint}">미</tspan><tspan fill="${COLOR.textDark}" opacity="0.7">(</tspan>
    </text>
    <!-- 도형 그룹 (텍스트 옆에 인라인 배치) -->
    <g transform="translate(316, 313)" fill="none" stroke="${COLOR.mint}" stroke-width="3.5" stroke-linejoin="round">
      <circle cx="14" cy="20" r="12"/>
      <rect x="36" y="8" width="24" height="24"/>
      <polygon points="84,8 96,32 72,32"/>
    </g>
    <text x="426" y="345"
          font-family="${FONT_STACK}"
          font-weight="800" font-size="44"
          text-anchor="start">
      <tspan fill="${COLOR.textDark}" opacity="0.7">)</tspan> <tspan fill="${COLOR.textDark}">게임</tspan>
    </text>

    <!-- 슬로건 -->
    <text x="80" y="410"
          font-family="${FONT_STACK}"
          font-weight="600" font-size="28"
          fill="${COLOR.textDark}" opacity="0.7">실내 오리엔티어링 미션</text>

    <!-- 날짜 -->
    <text x="80" y="455"
          font-family="${FONT_STACK}"
          font-weight="600" font-size="22"
          fill="${COLOR.textDark}" opacity="0.55">2026.6.20 (토) · 동래구청소년센터</text>
  </g>

  <!-- 우측 클립보드 일러스트 -->
  <g transform="translate(820, 130)">
    <rect x="0" y="40" width="300" height="380" rx="28" ry="28"
          fill="white" stroke="${COLOR.orange}" stroke-width="10"/>
    <rect x="118" y="20" width="64" height="32" rx="10" fill="url(#clipMetal)"/>
    <rect x="142" y="50" width="16" height="8" rx="2" fill="#888"/>

    <!-- 큰 타겟 -->
    <circle cx="150" cy="220" r="78" fill="white" stroke="${COLOR.orange}" stroke-width="9"/>
    <circle cx="150" cy="220" r="55" fill="white" stroke="${COLOR.orange}" stroke-width="7"/>
    <circle cx="150" cy="220" r="30" fill="${COLOR.orange}"/>

    <!-- 작은 도형 행 -->
    <g transform="translate(76, 340)" fill="none" stroke="${COLOR.mint}" stroke-width="4.5" stroke-linejoin="round">
      <circle cx="16" cy="16" r="14"/>
      <rect x="52" y="2" width="28" height="28"/>
      <polygon points="116,2 132,30 100,30"/>
    </g>
  </g>

  <!-- 우하단 도메인 -->
  <text x="1130" y="600"
        font-family="${FONT_STACK}"
        font-weight="600" font-size="20"
        text-anchor="end" fill="${COLOR.textDark}" opacity="0.5">tanggo.vercel.app</text>
</svg>`
}

async function makeOG() {
  const out = join(PUBLIC_DIR, 'og-image.png')
  await sharp(Buffer.from(ogSVG()))
    .resize(1200, 630)
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}

// =========================================================================
// 파비콘 (16, 32) — 단순화 버전
// =========================================================================
function faviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="${COLOR.orange}"/>
  <text x="32" y="46"
        font-family="${FONT_STACK}"
        font-weight="900" font-size="42"
        text-anchor="middle" fill="white">해</text>
</svg>`
}

async function makeFavicon(size) {
  const out = join(PUBLIC_DIR, `favicon-${size}.png`)
  await sharp(Buffer.from(faviconSVG()))
    .resize(size, size)
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}

// =========================================================================
// 실행
// =========================================================================
async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true })

  await Promise.all([
    makeIcon(192),
    makeIcon(512),
    makeOG(),
    makeFavicon(16),
    makeFavicon(32),
  ])

  console.log('\n🎉 모든 에셋 생성 완료')
}

main().catch((err) => {
  console.error('❌ 에셋 생성 실패:', err)
  process.exit(1)
})
