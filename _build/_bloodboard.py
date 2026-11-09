from PIL import Image, ImageDraw, ImageFont
import os

TILES = r"D:/下载/fishprobe/tiles2"
OUT = r"D:/下载/fishprobe/blood_fish_board.png"
FISH = [
    ("赤鳍影", "神话", 640, 14, "t0.png"),
    ("夜魇石斑", "远古", 980, 26, "t1.png"),
    ("血月鳗", "远古", 1260, 34, "t2.png"),
    ("绯红潮蛇", "深渊", 2100, 44, "t3.png"),
    ("朱红裂口", "神域", 3400, 54, "t4.png"),
]
TW, TH = 560, 292
W, H = 1920, 1120
BG = (10, 4, 7)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")

# 顶部血红辉光
for i in range(260, 0, -1):
    a = int(26 * (1 - i / 260) ** 1.6)
    d.ellipse([W / 2 - i * 4.2, -i * 2.0, W / 2 + i * 4.2, i * 1.5], fill=(150, 20, 20, a))
# 细网格纹理
for x in range(0, W, 48):
    d.line([(x, 0), (x, H)], fill=(255, 255, 255, 5))
for y in range(0, H, 48):
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 5))

f_title = ImageFont.truetype(r"C:/Windows/Fonts/msyhbd.ttc", 56)
f_sub = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 22)
f_name = ImageFont.truetype(r"C:/Windows/Fonts/msyhbd.ttc", 30)
f_meta = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 19)
f_tag = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 18)

# 标题
d.text((64, 54), "血夜 · 月下异种", font=f_title, fill=(246, 232, 228))
d.text((66, 126), "BLOOD-NIGHT SPECIES  ·  血月升起后才有概率出现的 5 种深水异种（需挂饵）", font=f_sub, fill=(190, 120, 120))
d.line([(64, 162), (W - 64, 162)], fill=(140, 30, 30, 160), width=2)

rows = [FISH[:3], FISH[3:]]
y = 200
for row in rows:
    total = len(row) * TW + (len(row) - 1) * 44
    x = (W - total) // 2
    for (name, tier, pts, dist, fn) in row:
        p = os.path.join(TILES, fn)
        tile = Image.open(p).convert("RGB").resize((TW, TH), Image.LANCZOS)
        # 圆角遮罩
        mask = Image.new("L", (TW, TH), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, TW - 1, TH - 1], radius=10, fill=255)
        img.paste(tile, (x, y), mask)
        d.rounded_rectangle([x, y, x + TW - 1, y + TH - 1], radius=10, outline=(70, 16, 20), width=2)
        # 左上角品质标签
        tw = d.textlength(tier, font=f_tag)
        d.rounded_rectangle([x + 14, y + 14, x + 26 + tw + 10, y + 42], radius=6, fill=(28, 6, 10, 210), outline=(150, 30, 40, 180))
        d.text((x + 21, y + 19), tier, font=f_tag, fill=(255, 120, 110))
        # 文案
        d.text((x + 4, y + TH + 14), name, font=f_name, fill=(250, 240, 236))
        d.text((x + 4, y + TH + 52), f"+{pts} 分   ·   抛到 {dist}m 外   ·   血夜专属", font=f_meta, fill=(168, 140, 140))
        x += TW + 44
    y += TH + 74 + 62

d.text((64, H - 44), "钓到即入图鉴「血夜 · 月下异种」分组；白天不会出现，天亮自动消失。", font=f_meta, fill=(120, 96, 96))
img.save(OUT, quality=95)
print("saved", OUT, img.size)
