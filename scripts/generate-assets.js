import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const FONT_STACK =
  "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', sans-serif"

const COLOR = {
  cream: '#FFF8E7',
  peach: '#FFE8DD',
  peachDeep: '#FFD8C2',
  orange: '#FF6B47',
  mint: '#4CAF7F',
  textDark: '#2C2C2C',
  shapeRed: '#E94B3C',
  shapeYellow: '#F4C430',
  shapeGreen: '#4CAF7F',
}

// =========================================================================
// 앱 아이콘 (1024x1024 기준, ○□△ 중심)
// =========================================================================
function iconSVG() {
  // 도형 외곽선 두께
  const sw = 24
  // 정삼각형 한 변 200 기준 높이
  const triHalf = 100
  const triH = Math.round((200 * Math.sqrt(3)) / 2) // ≈ 173
  // △ 중심 cx=704, cy=512
  const triCx = 704
  const triCy = 512
  const triTop = `${triCx},${triCy - Math.round((2 * triH) / 3)}`
  const triLeft = `${triCx - triHalf},${triCy + Math.round(triH / 3)}`
  const triRight = `${triCx + triHalf},${triCy + Math.round(triH / 3)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
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

  <!-- 배경 (둥근 사각형) -->
  <rect width="1024" height="1024" rx="240" ry="240" fill="url(#bg)"/>

  <!-- 상단 클립 데코 (가로 200 x 세로 50, 상단에서 80) -->
  <rect x="412" y="80" width="200" height="50" rx="16" ry="16" fill="url(#clipMetal)"/>
  <rect x="492" y="130" width="40" height="14" rx="3" fill="#888888"/>

  <!-- 중앙 ○ □ △ -->
  <!-- ○ 빨강 -->
  <circle cx="320" cy="512" r="100"
          fill="white" stroke="${COLOR.shapeRed}" stroke-width="${sw}"
          transform="rotate(-8 320 512)"/>

  <!-- □ 노랑 -->
  <rect x="412" y="412" width="200" height="200" rx="6" ry="6"
        fill="white" stroke="${COLOR.shapeYellow}" stroke-width="${sw}"
        stroke-linejoin="round"
        transform="rotate(6 512 512)"/>

  <!-- △ 초록 -->
  <polygon points="${triTop} ${triLeft} ${triRight}"
           fill="white" stroke="${COLOR.shapeGreen}" stroke-width="${sw}"
           stroke-linejoin="round"
           transform="rotate(-4 704 512)"/>

  <!-- 하단 텍스트: 동래미 게임 -->
  <text x="512" y="${1024 - 130}"
        font-family="${FONT_STACK}"
        font-weight="900" font-size="90"
        text-anchor="middle" fill="${COLOR.textDark}">동래미 게임</text>
</svg>`
}

async function makeIcon(size) {
  const out = join(PUBLIC_DIR, `icon-${size}.png`)
  await sharp(Buffer.from(iconSVG()))
    .resize(size, size)
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}

// =========================================================================
// OG 이미지 (1200x630 가로형, ○□△ 우측 배치)
// =========================================================================
function ogSVG() {
  const sw = 14
  // 우측 도형 영역: 가운데 cy ≈ 315
  // △ 한 변 220
  const triHalf = 110
  const triH = Math.round((220 * Math.sqrt(3)) / 2)
  const triCx = 1060
  const triCy = 320
  const triTop = `${triCx},${triCy - Math.round((2 * triH) / 3)}`
  const triLeft = `${triCx - triHalf},${triCy + Math.round(triH / 3)}`
  const triRight = `${triCx + triHalf},${triCy + Math.round(triH / 3)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLOR.cream}"/>
      <stop offset="60%" stop-color="${COLOR.peach}"/>
      <stop offset="100%" stop-color="${COLOR.peachDeep}"/>
    </linearGradient>
    <pattern id="grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="${COLOR.orange}" stroke-width="1" opacity="0.16"/>
    </pattern>
    <radialGradient id="gridMask" cx="100%" cy="0%" r="65%">
      <stop offset="0%" stop-color="black" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridFade">
      <rect width="1200" height="630" fill="url(#gridMask)"/>
    </mask>
  </defs>

  <!-- 배경 -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)" mask="url(#gridFade)"/>

  <!-- 좌측 텍스트 영역 -->
  <text x="80" y="190"
        font-family="${FONT_STACK}"
        font-weight="900" font-size="120"
        text-anchor="start">
    <tspan fill="${COLOR.orange}">해결해</tspan><tspan fill="${COLOR.mint}">On</tspan><tspan fill="${COLOR.orange}">나</tspan>
  </text>

  <text x="80" y="280"
        font-family="${FONT_STACK}"
        font-weight="800" font-size="56"
        text-anchor="start" fill="${COLOR.textDark}">동래미 게임</text>

  <text x="80" y="340"
        font-family="${FONT_STACK}"
        font-weight="600" font-size="30"
        text-anchor="start" fill="${COLOR.textDark}" opacity="0.65">실내 오리엔티어링 미션</text>

  <text x="80" y="400"
        font-family="${FONT_STACK}"
        font-weight="600" font-size="24"
        text-anchor="start" fill="${COLOR.textDark}" opacity="0.5">2026.6.20 (토) · 동래구청소년센터</text>

  <text x="80" y="592"
        font-family="${FONT_STACK}"
        font-weight="700" font-size="22"
        text-anchor="start" fill="${COLOR.textDark}" opacity="0.45">tanggo.vercel.app</text>

  <!-- 우측 ○ □ △ 큰 도형 -->
  <!-- ○ 빨강 -->
  <circle cx="720" cy="320" r="110"
          fill="white" stroke="${COLOR.shapeRed}" stroke-width="${sw}"
          transform="rotate(-10 720 320)"/>

  <!-- □ 노랑 -->
  <rect x="780" y="210" width="220" height="220" rx="8" ry="8"
        fill="white" stroke="${COLOR.shapeYellow}" stroke-width="${sw}"
        stroke-linejoin="round"
        transform="rotate(8 890 320)"/>

  <!-- △ 초록 -->
  <polygon points="${triTop} ${triLeft} ${triRight}"
           fill="white" stroke="${COLOR.shapeGreen}" stroke-width="${sw}"
           stroke-linejoin="round"
           transform="rotate(-5 1060 320)"/>
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
// 파비콘 — ○□△ 가로 배치 (작은 사이즈 식별 위해 도형만)
// =========================================================================
function faviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="${COLOR.cream}"/>
  <!-- ○ -->
  <circle cx="14" cy="32" r="9" fill="white" stroke="${COLOR.shapeRed}" stroke-width="4"/>
  <!-- □ -->
  <rect x="23" y="23" width="18" height="18" rx="1.5" ry="1.5"
        fill="white" stroke="${COLOR.shapeYellow}" stroke-width="4"
        stroke-linejoin="round"/>
  <!-- △ -->
  <polygon points="50,23 59,41 41,41"
           fill="white" stroke="${COLOR.shapeGreen}" stroke-width="4"
           stroke-linejoin="round"/>
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
