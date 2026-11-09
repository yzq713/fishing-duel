from PIL import Image, ImageDraw, ImageFont
import os

SRC = r"D:/下载/fishprobe"
OUT = r"D:/下载/fishprobe/daymare_board.png"

# 顺序：上排 = 事件本身（天变暗 / 蝠群），下排 = 玩法（图鉴 / 观鱼台 / 钓获 / 首领）
TILES = [
    ("daymare_sky.png",  "① 白天被「吃掉」", "太阳被蝠影遮蔽：天空转灰土金、日光衰减 58%，但仍算白天（时钟照走）"),
    ("daymare_bats2.png", "② 10 → 30 只蝠群", "蝠群随时间聚集，约 13 小时制游戏时长后半段达到满额并进入高潮"),
    ("daymare_codex.png", "③ 图鉴新组 6/6", "「日魇 · 蚀日之影」独立分组，没钓到只显示「抛到 Xm 外」"),
    ("daymare_pond.png",  "④ 观鱼台 6 卡", "六种日魇鱼可放进湖里养，按分数产出积分"),
    ("daymare_haul.png",  "⑤ 钓获判定", "需挂饵，基础 22% 概率随幸运提升；首领只在高潮期出现，且一场一次"),
    ("daymare_boss.png",  "⑥ 首领三阶段", "拉扯 → 僵持 → 连点破防；张力条满即断线，进度条随张力变色"),
]

TW, TH = 800, 475
PAD, GAP = 64, 30
COLS = 3
W = PAD * 2 + TW * COLS + GAP * (COLS - 1)
CAP_H = 92
HEAD = 190
FOOT = 70
ROWS = 2
H = HEAD + ROWS * (TH + CAP_H) + GAP + FOOT

img = Image.new("RGB", (W, H), (14, 14, 13))
d = ImageDraw.Draw(img, "RGBA")

# 背景：土金日光从上方斜切 + 细网格
for i in range(320, 0, -1):
    a = int(20 * (1 - i / 320) ** 1.5)
    d.ellipse([W * 0.62 - i * 5.0, -i * 2.4, W * 0.62 + i * 5.0, i * 1.2], fill=(196, 168, 96, a))
for x in range(0, W, 48):
    d.line([(x, 0), (x, H)], fill=(255, 244, 214, 6))
for y in range(0, H, 48):
    d.line([(0, y), (W, y)], fill=(255, 244, 214, 6))

f_title = ImageFont.truetype(r"C:/Windows/Fonts/msyhbd.ttc", 58)
f_sub = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 23)
f_cap = ImageFont.truetype(r"C:/Windows/Fonts/msyhbd.ttc", 27)
f_desc = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 19)
f_tag = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 17)

d.text((PAD, 54), "日魇 · 蚀日之影", font=f_title, fill=(246, 236, 214))
d.text((PAD + 2, 126), "DAYMARE  ·  白天随机降临的蚀日事件 —— 10~30 只蝠群遮蔽太阳，深渊变异鱼借狂潮浮出水面",
       font=f_sub, fill=(198, 170, 110))
d.line([(PAD, 168), (W - PAD, 168)], fill=(150, 122, 62, 170), width=2)
# 右上角小标签
tw = d.textlength("6 鱼 + 1 首领  ·  9 项事件逻辑已验证", font=f_tag)
d.rounded_rectangle([W - PAD - tw - 26, 66, W - PAD, 98], radius=8, fill=(38, 32, 18, 220), outline=(150, 122, 62, 160))
d.text((W - PAD - tw - 13, 71), "6 鱼 + 1 首领  ·  9 项事件逻辑已验证", font=f_tag, fill=(232, 206, 148))

for i, (fn, cap, desc) in enumerate(TILES):
    r, c = divmod(i, COLS)
    x = PAD + c * (TW + GAP)
    y = HEAD + r * (TH + CAP_H + GAP)
    tile = Image.open(os.path.join(SRC, fn)).convert("RGB").resize((TW, TH), Image.LANCZOS)
    mask = Image.new("L", (TW, TH), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, TW - 1, TH - 1], radius=10, fill=255)
    img.paste(tile, (x, y), mask)
    d.rounded_rectangle([x, y, x + TW - 1, y + TH - 1], radius=10, outline=(72, 62, 38), width=2)
    # 序号
    d.rounded_rectangle([x + 14, y + 14, x + 14 + 34, y + 14 + 34], radius=8, fill=(18, 16, 10, 205), outline=(150, 122, 62, 170))
    d.text((x + 23, y + 18), str(i + 1), font=f_cap, fill=(236, 210, 150))
    d.text((x + 2, y + TH + 16), cap, font=f_cap, fill=(244, 232, 206))
    d.text((x + 3, y + TH + 52), desc, font=f_desc, fill=(168, 156, 128))

d.text((PAD, H - 44), "天亮掷骰 35% 触发明魇，入夜无条件清除；事件内不掉普通鱼，杂物侧袋照常掉落。",
       font=f_desc, fill=(128, 118, 96))
img.save(OUT, quality=95)
print("saved", OUT, img.size)
