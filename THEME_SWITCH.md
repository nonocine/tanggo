# 테마 스위치 (장영실 ↔ 해결해On나)

## 현재 적용된 테마

**장영실 창의과학 아카데미** (`jangyeongsil`)

- 아이콘 / OG 이미지: `public/theme/jangyeongsil/` 의 파일을 빌드 때마다 `public/` 루트로 복사
- 스플래시: 앱 첫 진입 시 `/splash.mp4` 재생 (`src/pages/Splash.tsx`)
- `index.html`, `public/manifest.json` 문구·색상 교체
  - 원본 백업: `index.default.html`, `public/manifest.default.json`

테마를 정하는 곳은 딱 한 군데다.

```js
// scripts/generate-assets.js 최상단
const THEME = process.env.ASSET_THEME ?? 'jangyeongsil'
```

이 스크립트는 `package.json` 의 `prebuild` 에서 매 빌드마다 실행된다.
즉 **빌드할 때마다 테마 파일이 `public/` 루트에 다시 깔린다.**

---

## 해결해On나로 되돌리기

### 1. 아이콘 / OG 이미지

`scripts/generate-assets.js` 의 `THEME` 기본값을 바꾼다.

```js
const THEME = process.env.ASSET_THEME ?? 'default'
```

`'default'` 면 테마 폴더를 무시하고 기존 ○□△ SVG 를 그려서 PNG 를 생성한다.

> 코드를 안 고치고 한 번만 확인하고 싶으면 환경변수로도 된다.
> `ASSET_THEME=default npm run build`
> (Vercel 이라면 프로젝트 환경변수에 `ASSET_THEME=default` 추가)

### 2. manifest / index.html 복원

```bash
cp public/manifest.default.json public/manifest.json
cp index.default.html index.html
```

`index.default.html` 에는 원래의 `favicon.svg` 링크와 `apple-touch-icon` → `/icon-192.png`
설정이 그대로 들어 있으므로, 복사만 하면 원상복구된다.

### 3. 스플래시 영상 끄기

영상 스플래시를 아예 빼고 기존 1.5초 로고 스플래시로 돌아가려면
`src/App.tsx` 에서 `LandingEntry` 를 되돌린다.

- 기존 컴포넌트 `src/components/SplashScreen.tsx` 는 지우지 않고 남겨 뒀다.
- `src/pages/Splash.tsx` 는 그대로 두고 `/` 게이트만 떼어내도 된다
  (`/splash` 로 직접 들어가야만 영상이 나온다).

### 4. 빌드

```bash
npm run build
```

`public/icon-192.png` 가 ○□△ 아이콘으로 다시 덮이면 성공.

---

## 다시 장영실로 바꾸기

1. `scripts/generate-assets.js` 의 `THEME` 을 `'jangyeongsil'` 로
   (또는 `ASSET_THEME` 환경변수를 지운다)
2. 문구/색상도 같이 바꾸려면 `index.html` 과 `public/manifest.json` 을
   장영실 값으로 되돌린다 — 되돌리기 전에 `git` 히스토리에서
   `feat: 장영실 창의과학 아카데미 테마 + 스플래시 영상` 커밋을 참고하면 빠르다
3. `npm run build`

---

## 스플래시 영상 교체

`public/theme/<테마명>/splash.mp4` 파일만 갈아끼우면 된다.
빌드 때 `public/splash.mp4` 로 복사되고, `src/pages/Splash.tsx` 가 이걸 재생한다.

- 권장 규격: 세로 720x1280, H.264/AAC, 5초 내외, 5MB 이하
- 배경색은 `#FBF4E0` 에 맞추면 로딩 순간 이음매가 안 보인다
- **소리는 나오지 않는다.** 모바일 자동재생 조건 때문에 `muted` 가 필수다
- 영상이 2초 안에 재생되지 않으면(로드 실패·자동재생 차단) 자동으로
  Landing 으로 넘어간다 — `Splash.tsx` 의 `FALLBACK_MS`
- 세션당 1회만 재생된다 — `sessionStorage` 의 `splash_seen`
  (플래그 헬퍼: `src/lib/splashSeen.ts`).
  다시 보려면 브라우저 탭을 새로 열거나 개발자도구에서 이 키를 지운다

---

## 새 테마 추가하기

1. `public/theme/<새테마명>/` 폴더를 만들고 아래 7개 파일을 넣는다
   - `icon-192.png` `icon-512.png` `favicon-16.png` `favicon-32.png`
     `og-image.png` `apple-touch-icon.png` `splash.mp4`
2. `scripts/generate-assets.js` 의 `THEME` 을 `'<새테마명>'` 으로
3. 콘솔에 예쁜 이름을 찍고 싶으면 같은 파일의 `THEME_LABEL` 에 한 줄 추가

파일이 하나라도 빠지면 빌드가 **누락된 파일 이름과 함께** 실패한다.
