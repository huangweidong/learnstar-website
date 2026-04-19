"""
小红书封面图生成工具 — 在底图上添加3行大字标题

用法：
  python3 generate_cover.py --img 底图.png --lines "第一行" "第二行" "第三行" --color pink --align left --out 封面.png

参数：
  --img     底图文件路径
  --lines   3行文案（每行≤8字）
  --color   横条颜色: pink / yellow / green（默认 pink）
  --align   对齐方式: left / right / center（默认 left）
  --out     输出路径（默认 封面.png）

也可以作为模块导入：
  from generate_cover import generate_cover
  generate_cover("底图.png", ["第一行","第二行","第三行"], color="pink", align="left", out="封面.png")
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont

# === 固定参数 ===
TARGET_W, TARGET_H = 1080, 1440
FONT_SIZE = 100
BAR_FIXED_HEIGHT = 60
BAR_H_PAD = 40
BAR_BOTTOM_EXTRA = 30
STROKE_WIDTH = 10
STROKE_COLOR = (20, 20, 20)
TEXT_COLOR = (255, 255, 255)
LINE_GAP = 60

# 横条颜色
COLORS = {
    "pink":   (238, 170, 205, 255),  # 柔粉
    "yellow": (255, 227, 120, 255),  # 暖黄
    "green":  (115, 187, 130, 255),  # 清新绿
}

# 字体路径（相对于本脚本目录）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(SCRIPT_DIR, "fonts", "AlibabaPuHuiTi-3-105-Heavy.ttf")


def crop_center(img, tw, th):
    """居中裁剪到目标比例后缩放到 tw×th"""
    w, h = img.size
    target_ratio = tw / th
    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    return img.resize((tw, th), Image.LANCZOS)


def generate_cover(img_path, lines, color="pink", align="left", out="封面.png", font_path=None):
    """
    在底图上生成3行封面文字。

    参数：
      img_path: 底图文件路径
      lines:    3行文案列表，每行≤8字
      color:    横条颜色名 (pink/yellow/green) 或 RGBA 元组
      align:    对齐方式 (left/right/center)
      out:      输出路径
      font_path: 字体路径（可选，默认使用内置字体）
    """
    # 解析颜色
    if isinstance(color, str):
        bar_color = COLORS.get(color, COLORS["pink"])
    else:
        bar_color = color

    # 加载字体
    fp = font_path or FONT_PATH
    if not os.path.exists(fp):
        raise FileNotFoundError(f"字体文件不存在: {fp}")
    font = ImageFont.truetype(fp, FONT_SIZE)

    # 加载并裁剪底图
    img = Image.open(img_path).convert("RGBA")
    img = crop_center(img, TARGET_W, TARGET_H)
    draw = ImageDraw.Draw(img)

    # 计算每行文字尺寸
    line_bboxes = []
    for line in lines:
        bbox = font.getbbox(line)
        line_bboxes.append((bbox[2] - bbox[0], bbox[3] - bbox[1]))

    # 总高度
    total_h = sum(h for _, h in line_bboxes) + LINE_GAP * (len(lines) - 1)

    # 起始 Y（底部区域）
    start_y = TARGET_H - total_h - 120
    margin = 60

    current_y = start_y
    for i, (line, (tw, th)) in enumerate(zip(lines, line_bboxes)):
        # X 位置
        if align == "left":
            x = margin
        elif align == "right":
            x = TARGET_W - tw - margin
        else:
            x = (TARGET_W - tw) // 2

        # 第2、3行（index >= 1）添加横条
        if i >= 1:
            bar_overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            bar_draw = ImageDraw.Draw(bar_overlay)
            bar_left = x - BAR_H_PAD
            bar_top = current_y + th - BAR_FIXED_HEIGHT
            bar_right = x + tw + BAR_H_PAD
            bar_bottom = current_y + th + BAR_BOTTOM_EXTRA
            bar_draw.rectangle([bar_left, bar_top, bar_right, bar_bottom], fill=bar_color)
            img = Image.alpha_composite(img, bar_overlay)
            draw = ImageDraw.Draw(img)

        # 描边
        for dx in range(-STROKE_WIDTH, STROKE_WIDTH + 1):
            for dy in range(-STROKE_WIDTH, STROKE_WIDTH + 1):
                if dx * dx + dy * dy <= STROKE_WIDTH * STROKE_WIDTH:
                    draw.text((x + dx, current_y + dy), line, font=font, fill=STROKE_COLOR)
        # 白色文字
        draw.text((x, current_y), line, font=font, fill=TEXT_COLOR)

        current_y += th + LINE_GAP

    # 保存
    img.convert("RGB").save(out, quality=95)
    print(f"✅ 已生成: {out}")
    return out


def main():
    parser = argparse.ArgumentParser(description="小红书封面图生成工具")
    parser.add_argument("--img", required=True, help="底图文件路径")
    parser.add_argument("--lines", nargs=3, required=True, help="3行文案（每行≤8字）")
    parser.add_argument("--color", default="pink", choices=["pink", "yellow", "green"], help="横条颜色")
    parser.add_argument("--align", default="left", choices=["left", "right", "center"], help="对齐方式")
    parser.add_argument("--out", default="封面.png", help="输出路径")
    parser.add_argument("--font", default=None, help="字体路径（可选）")

    args = parser.parse_args()
    generate_cover(args.img, args.lines, color=args.color, align=args.align, out=args.out, font_path=args.font)


if __name__ == "__main__":
    main()
