# -*- coding: utf-8 -*-
"""
生成应用图标 build/icon.ico

设计：玻璃拟态风格的圆角方块 + 青紫渐变 + 中心星芒，
与程序内 `✦` 标识和强调色体系保持一致。

运行：python scripts/make-icon.py
依赖：Pillow
"""
import os
from PIL import Image, ImageDraw

# 与 src/shared/themes.ts 中的暗黑主题保持一致
ACCENT = (124, 140, 255)
ACCENT2 = (77, 212, 192)
SIZE = 1024          # 内部以 1024 渲染，最后降采样保证抗锯齿
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_gradient(size, c1, c2):
    """对角线渐变"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = lerp(c1, c2, t)
    return img


def rounded_mask(size, radius_ratio=0.23):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def star_polygon(cx, cy, outer, inner, points=4, rotation=-90):
    """生成多角星多边形坐标"""
    import math

    coords = []
    for i in range(points * 2):
        radius = outer if i % 2 == 0 else inner
        angle = math.radians(rotation + i * (360 / (points * 2)))
        coords.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return coords


def build_icon():
    size = SIZE
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # 1. 渐变主体 + 圆角蒙版
    gradient = make_gradient(size, ACCENT, ACCENT2).convert("RGBA")
    base.paste(gradient, (0, 0), rounded_mask(size))

    # 2. 顶部高光：模拟玻璃受光
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.ellipse(
        [-size * 0.35, -size * 0.85, size * 1.35, size * 0.42],
        fill=(255, 255, 255, 58),
    )
    base.alpha_composite(Image.composite(highlight, Image.new("RGBA", (size, size), (0, 0, 0, 0)), rounded_mask(size)))

    # 3. 细描边，增强玻璃边缘
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(
        [size * 0.012, size * 0.012, size * 0.988, size * 0.988],
        radius=int(size * 0.225),
        outline=(255, 255, 255, 92),
        width=max(2, int(size * 0.012)),
    )
    base.alpha_composite(border)

    # 4. 中心星芒
    star_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(star_layer)
    cx = cy = size / 2
    sd.polygon(star_polygon(cx, cy, outer=size * 0.30, inner=size * 0.108), fill=(255, 255, 255, 242))
    sd.polygon(star_polygon(cx, cy, outer=size * 0.17, inner=size * 0.062, rotation=-45 + 180),
               fill=(255, 255, 255, 150))
    base.alpha_composite(star_layer)

    return base


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_dir = os.path.join(root, "build")
    os.makedirs(target_dir, exist_ok=True)

    icon = build_icon()
    ico_path = os.path.join(target_dir, "icon.ico")
    icon.save(ico_path, format="ICO", sizes=ICO_SIZES)

    # 同时输出一张 PNG，方便制作安装包封面或文档插图
    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(target_dir, "icon.png"))

    print(f"已生成：{ico_path}")
    print("尺寸：" + ", ".join(f"{w}x{h}" for w, h in ICO_SIZES))


if __name__ == "__main__":
    main()
