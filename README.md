# 班宠乐园官网

班宠乐园官网是 `learnstar.cn / www.learnstar.cn` 的独立静态站点，用于产品介绍、搜索收录和小红书流量承接。这个项目不是主应用 `class_pet` 的一部分，定位是单页营销落地页。

## 项目定位

- 面向从小红书、微信等渠道进入的小学老师用户
- 核心目标是“介绍产品特点 -> 引导扫码/访问使用”
- 页面风格强调可爱插画感、低模板味、强移动端适配

## 技术栈

- `HTML5`：页面结构全部写在 [index.html](./index.html)
- `Tailwind CSS v4`：样式源文件是 [input.css](./input.css)
- `原生 JavaScript`：交互逻辑在 [js/main.js](./js/main.js)
- `自托管字体`：`/fonts`
- `Cloudflare Pages`：静态部署

当前线上入口实际引用的是 [dist/style.css](./dist/style.css)。

## 目录结构

```text
learnstar-website/
├── index.html
├── input.css
├── dist/
│   └── style.css
├── js/
│   └── main.js
├── fonts/
├── images/
│   ├── pets/
│   └── screenshots/
├── svg/
├── _redirects
├── robots.txt
├── sitemap.xml
└── package.json
```

补充说明：

- `dist/style.css`：当前生效的编译产物
- `css/style.css`：历史保留文件，当前 `index.html` 不引用它

## 本地开发

安装依赖：

```bash
pnpm install
```

监听 Tailwind 编译：

```bash
pnpm dev
```

生产构建：

```bash
pnpm build
```

如果需要本地预览静态页面，可以在项目根目录启动一个简单静态服务，例如：

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 修改入口

常见改动对应文件如下：

- 页面文案、SEO、区块结构：`index.html`
- 字体、动画、组件样式、公用视觉变量：`input.css`
- 滚动入场、导航阴影、锚点滚动、图片预览、移动端 CTA：`js/main.js`
- 宠物图、产品截图、二维码：`images/`
- SVG 装饰素材：`svg/`

## 页面结构

当前页面大致分为这些区块：

1. 顶部导航
2. Hero 首屏
3. 痛点共鸣
4. 核心功能展示
5. 产品亮点
6. 使用场景时间线
7. FAQ
8. CTA 获取区域
9. Footer

## 修改注意事项

- 不要手改 `dist/style.css`，样式应优先改 `input.css` 后重新构建
- 页面依赖自托管字体和本地图片，新增资源尽量继续放本项目内，避免引入新的外部 CDN
- 当前唯一明确的外部资源依赖是 Twemoji 的 `jsdelivr` SVG 链接
- `js-cta` 按钮在移动端会被脚本替换成小红书跳转链接，改 CTA 时要同时检查桌面和移动逻辑
- 页面是纯静态站，没有框架层的路由、状态管理和构建注入机制，修改时需要手动核对资源路径

## 发布方式

构建完成后可用 Cloudflare Pages 部署：

```bash
npx wrangler pages deploy . --project-name=learnstar-website --commit-dirty=true
```

如果只改了文案、图片或 HTML，也建议重新执行一次 `pnpm build`，确保 `dist/style.css` 与当前源码一致。

## 上线前自查

- 页面在桌面端和移动端都能正常打开
- `index.html` 引用的资源路径真实存在
- 首屏图片、二维码、宠物图正常显示
- CTA 跳转和锚点滚动正常
- `robots.txt`、`sitemap.xml`、canonical、结构化数据没有被误改
- 构建后 `dist/style.css` 已更新
