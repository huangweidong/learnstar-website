import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const COVER = {
  width: 900,
  height: 1200,
  background: '#DFF4EA',
  titleColor: '#16324A',
  titleLine1: '<span class="highlight">心不静</span>的家长，',
  titleLine2: '培养不出好孩子',
  highlightBg: '#FFF1A8',
  emojis: ['😵', '😮‍💨', '👀'],
  outputDir: path.join(__dirname, '..', '干货封面图', '输出'),
  outputName: '封面-心不静的家长-培养不出好孩子.png',
}

const DECORATIONS = [
  { content: '✦', className: 'star', top: 70, left: 92, size: 40, rotate: '-10deg' },
  { content: '✦', className: 'star', top: 108, right: 104, size: 34, rotate: '14deg' },
  { content: '•', className: 'dot blue', top: 214, left: 82, size: 28 },
  { content: '•', className: 'dot yellow', top: 322, right: 114, size: 24 },
  { content: '〰', className: 'swirl', bottom: 238, left: 126, size: 46, rotate: '-12deg' },
  { content: '〰', className: 'swirl', bottom: 176, right: 120, size: 40, rotate: '10deg' },
  { content: '•', className: 'dot pink', bottom: 308, right: 86, size: 18 },
]

function buildDecorationStyle(item) {
  const positions = ['top', 'right', 'bottom', 'left']
    .filter(key => item[key] !== undefined)
    .map(key => `${key}:${item[key]}px;`)
    .join('')

  return `${positions}font-size:${item.size}px;transform:rotate(${item.rotate ?? '0deg'});`
}

function buildDecorations() {
  return DECORATIONS.map(
    item =>
      `<span class="deco ${item.className}" style="${buildDecorationStyle(item)}">${item.content}</span>`,
  ).join('')
}

function buildHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      width: ${COVER.width}px;
      height: ${COVER.height}px;
      overflow: hidden;
      background: ${COVER.background};
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }

    .canvas {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .deco {
      position: absolute;
      line-height: 1;
      user-select: none;
    }

    .star {
      color: #f6d65f;
    }

    .dot.blue {
      color: #8fc8ff;
    }

    .dot.yellow {
      color: #f4cc5e;
    }

    .dot.pink {
      color: #f4a6b8;
    }

    .swirl {
      color: #f0c84d;
    }

    .content {
      position: absolute;
      top: 250px;
      left: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      text-align: center;
      padding: 0 88px;
    }

    .title {
      color: ${COVER.titleColor};
      font-family: "STKaiti", "Kaiti SC", "HanziPen SC", "PingFang SC", sans-serif;
      font-size: 82px;
      font-weight: 700;
      line-height: 1.28;
      letter-spacing: 1px;
    }

    .title-line {
      display: block;
      white-space: nowrap;
    }

    .highlight {
      display: inline-block;
      padding: 0 12px 4px;
      background: ${COVER.highlightBg};
      border-radius: 8px;
    }

    .emoji-row {
      margin-top: 54px;
      display: flex;
      gap: 24px;
      font-size: 56px;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div class="canvas">
    ${buildDecorations()}
    <div class="content">
      <div class="title">
        <span class="title-line">${COVER.titleLine1}</span>
        <span class="title-line">${COVER.titleLine2}</span>
      </div>
      <div class="emoji-row">
        ${COVER.emojis.map(emoji => `<span>${emoji}</span>`).join('')}
      </div>
    </div>
  </div>
</body>
</html>`
}

async function main() {
  fs.mkdirSync(COVER.outputDir, { recursive: true })

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  await page.setViewport({
    width: COVER.width,
    height: COVER.height,
    deviceScaleFactor: 2,
  })

  await page.setContent(buildHTML(), { waitUntil: 'networkidle0' })

  const outputPath = path.join(COVER.outputDir, COVER.outputName)
  await page.screenshot({
    path: outputPath,
    type: 'png',
  })

  await page.close()
  await browser.close()

  console.log(outputPath)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
