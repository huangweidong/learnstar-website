import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ========== 样式配置 ==========
const STYLE = {
  // 画布
  width: 900,
  height: 1200,
  // 背景
  bgColor: '#E8F4FD',
  // 白色卡片
  cardColor: '#FFFFFF',
  cardRadius: 12,
  cardMargin: 12, // 四周统一间距（px）
  cardPaddingX: 36, // 卡片内左右内边距
  cardPaddingTop: 32,
  cardPaddingBottom: 32,
  // 标题
  titleColor: '#D2691E',
  titleFontSize: 34,
  titleFontWeight: 'bold',
  titleLineHeight: 1.4,
  titleMarginBottom: 16,
  // 分隔线
  separatorColor: '#E0E0E0',
  separatorHeight: 1,
  separatorMarginBottom: 20,
  // 正文
  bodyColor: '#333333',
  bodyFontSize: 19,
  bodyFontWeight: 'normal',
  bodyLineHeight: 1.85,
  bodyParagraphGap: 18, // 段间距
  // 高亮
  highlightBg: '#FFF3B0',
  // 强调关键词
  boldColor: '#D2691E',
  // 字体
  fontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
}

// ========== 文案数据 ==========
// 标记语法：
//   ==文字== → 黄色高亮
//   **文字** → 橙红色加粗
//   __文字__ → 橙红色加粗+下划线
const SLIDES = [
  {
    title: '先把"指令"变简单，别跟孩子"讲道理"',
    paragraphs: [
      '以前我总爱说大段大段的话：\n"同学们，我们现在要安静下来了，上课时间不能随便说话，要认真听讲，不然学不到知识……"\n结果呢？我越说他们越吵，根本没人听。',
      '后来狠心改了：指令只说5个字以内，而且只说一遍。=="坐好。""看我。""手放好。"==',
      '说的时候配合手势——比如"坐好"就自己先挺直腰板，"看我"就指指自己的眼睛。',
      '刚开始得反复练，有人没反应就停下来盯着他，啥也不说，等他坐好再继续。\n现在只要我一开口，全班条件反射似的就照做，比以前省了一半力气！',
      '最绝的是**"安静信号"**：我拍三下手，他们就得回"123静"，谁没跟上就站着等。有次隔壁班老师路过，说"你们班这反应速度绝了"，偷偷得意了好久~😎',
    ],
  },
  {
    title: '调皮的孩子别硬碰硬，给他个"小任务"拴住',
    paragraphs: [
      '我们班有个男生，上课总爱扔纸团、扯女生辫子，批评他就翻白眼，气得我直发抖。',
      '前阵子突然想通了：==与其跟他对着干，不如给他找点事做。==',
      '我把他叫到办公室，递给他一个小印章："老师发现你手特别巧，想让你当\'纪律小标兵\'——上课谁坐得好，你就给他盖个章，下课统计谁的章最多，行不？"他眼睛都亮了，居然点头答应了。',
      '现在这男生上课坐得笔直，眼睛瞪得溜圆，看到谁说话还会小声提醒："别吵，不然不给你盖章了。"',
      '原来调皮的孩子不是故意捣乱，是精力没处使啊~==给他个"官"当，比骂十句都管用！==',
    ],
  },
  {
    title: '定规矩别"吓唬人"，但说了就得算',
    paragraphs: [
      '以前说狠话：\n"再吵就罚站！"\n"作业不交就告诉家长！"\n结果说了800遍，从来没真执行过，孩子们早就摸清我的套路了。',
      '这学期学"狠"了：**规矩就3条**，每条都带着"后果"，而且说了就必须做到。',
      '__上课说话__——扣掉当天的课间游戏时间（提前画好时间表，扣了就划掉，让他看得见）',
      '__作业没带__——课间在教室补，补完才能出去玩（搬个小桌子放讲台旁，让全班都看见）',
      '__打架打闹__——俩人手拉手站着反思2分钟（拿个计时器放旁边，一秒都不能少）',
      '有个女生连续两天忘带作业，课间看着别人玩，自己在教室补，第三天哭着说"老师我再也不忘了"。现在作业上交率从60%涨到了90%，真的不用天天催了~',
    ],
  },
  {
    title: '自己别生气，越冷静孩子越怕',
    paragraphs: [
      '以前一看到课堂乱糟糟，我就忍不住炸毛，吼到嗓子哑，结果孩子要么吓哭，要么跟我对着干，最后自己气到头晕。',
      '现在被逼出个"绝招"：\n快发火时就深呼吸，在心里数"1、2、3"，然后笑着说句话。',
      '比如有人在下面打闹，我不吼，反而笑着说："哟，这两位同学精力真好，要不上来给大家表演个节目？"他们立马红着脸坐下，比骂他们管用10倍。',
      '再比如有人故意插嘴，我就停下来盯着他：\n"我猜你肯定有特别棒的想法，等别人说完你再举手，老师第一个叫你，行不？"他乖乖点头，后面真举手了还特意夸了他。',
      '发现没？咱女老师其实不用凶，温柔点说话，反而更有威慑力~孩子==不怕你大吼大叫==，就怕你==笑着跟他"讲道理"==，那种时候他们心里才发慌呢！',
    ],
  },
]

// ========== 文本标记解析 ==========
function parseMarkedText(text) {
  // 将标记文本转为 HTML
  let html = text
    // 换行
    .replace(/\n/g, '<br>')
    // ==高亮==
    .replace(/==(.+?)==/g, `<span style="background:${STYLE.highlightBg};padding:2px 4px;border-radius:3px;">$1</span>`)
    // __加粗下划线__
    .replace(/__(.+?)__/g, `<span style="color:${STYLE.boldColor};font-weight:bold;text-decoration:underline;">$1</span>`)
    // **加粗**
    .replace(/\*\*(.+?)\*\*/g, `<span style="color:${STYLE.boldColor};font-weight:bold;">$1</span>`)
  return html
}

// ========== 生成 HTML ==========
function buildHTML(slide) {
  const s = STYLE
  const cardWidth = s.width - s.cardMargin * 2
  const cardHeight = s.height - s.cardMargin * 2

  const paragraphsHTML = slide.paragraphs
    .map(p => `<div style="margin-bottom:${s.bodyParagraphGap}px;">${parseMarkedText(p)}</div>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${s.width}px;
    height: ${s.height}px;
    background: ${s.bgColor};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ${s.fontFamily};
  }
  .card {
    width: ${cardWidth}px;
    height: ${cardHeight}px;
    background: ${s.cardColor};
    border-radius: ${s.cardRadius}px;
    padding: ${s.cardPaddingTop}px ${s.cardPaddingX}px ${s.cardPaddingBottom}px;
    overflow: hidden;
  }
  .title {
    color: ${s.titleColor};
    font-size: ${s.titleFontSize}px;
    font-weight: ${s.titleFontWeight};
    line-height: ${s.titleLineHeight};
    text-align: center;
    margin-bottom: ${s.titleMarginBottom}px;
  }
  .separator {
    height: ${s.separatorHeight}px;
    background: ${s.separatorColor};
    margin-bottom: ${s.separatorMarginBottom}px;
  }
  .body {
    color: ${s.bodyColor};
    font-size: ${s.bodyFontSize}px;
    font-weight: ${s.bodyFontWeight};
    line-height: ${s.bodyLineHeight};
  }
</style>
</head>
<body>
  <div class="card">
    <div class="title">${slide.title}</div>
    <div class="separator"></div>
    <div class="body">${paragraphsHTML}</div>
  </div>
</body>
</html>`
}

// ========== 主函数 ==========
async function main() {
  const outputDir = path.join(__dirname, '..', '小红书3月17日', 'cards')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const browser = await puppeteer.launch({ headless: true })

  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i]
    const html = buildHTML(slide)
    const page = await browser.newPage()
    await page.setViewport({ width: STYLE.width, height: STYLE.height, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const outputPath = path.join(outputDir, `${String(i + 1).padStart(2, '0')}-${slide.title.slice(0, 10)}.png`)
    await page.screenshot({ path: outputPath, type: 'png' })
    await page.close()
    console.log(`✅ 第${i + 1}张: ${outputPath}`)
  }

  await browser.close()
  console.log(`\n🎉 全部生成完毕，共 ${SLIDES.length} 张，保存在: ${outputDir}`)
}

main().catch(console.error)
