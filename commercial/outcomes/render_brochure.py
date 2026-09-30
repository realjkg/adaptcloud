"""Render the client brochure from brochure.json. No network access required."""
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parent
FONT_DIR = ROOT / 'assets/fonts'
for weight, style in [(300, 'Light'), (400, 'Regular'), (500, 'Medium')]:
    pdfmetrics.registerFont(TTFont(f'SpaceGrotesk{weight}',
                                  str(FONT_DIR / f'SpaceGrotesk-{style}.ttf')))
INK = HexColor('#172C3C')
MUTED = HexColor('#4A5C67')
TEAL = HexColor('#16686B')
PALE = HexColor('#EDF4F3')
WIDTH, HEIGHT = 612, 792
LEFT, RIGHT = 46, 566


def paragraph(c, text, x, top, width, size=11, leading=15, color=INK, weight=300):
    style = ParagraphStyle('text', fontName=f'SpaceGrotesk{weight}',
                           fontSize=size, leading=leading, textColor=color)
    p = Paragraph(escape(text).replace('\n', '<br/>'), style)
    _, height = p.wrap(width, HEIGHT)
    if top - height < 48:
        raise ValueError(f'Content would overlap footer: {text[:60]}')
    p.drawOn(c, x, top - height)
    return top - height


def chrome(c, data, page):
    c.setFillColor(white)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.drawImage(str(ROOT / 'assets/adapt-cloud-icon.png'), LEFT-12, 708,
                width=62, height=62, preserveAspectRatio=True, mask='auto')
    paragraph(c, data['brand'], LEFT+48, 746, 360, 17, 19, weight=500)
    paragraph(c, data['tagline'], LEFT+49, 723, 360, 10, 13, MUTED)
    c.setFillColor(TEAL)
    c.rect(LEFT, 690, 30, 3, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont('SpaceGrotesk300', 8.5)
    c.drawString(LEFT, 29, data['website'] + '  |  ' + data['contact'])
    c.drawRightString(RIGHT, 29, f'{page} / 2')
    c.linkURL('https://' + data['website'], (LEFT, 24, LEFT+90, 40), relative=0)


def render():
    data = json.loads((ROOT / 'brochure.json').read_text())
    out = ROOT / 'adapt-cloud-outcomes-brochure.pdf'
    c = canvas.Canvas(str(out), pagesize=(WIDTH, HEIGHT), invariant=1)
    c.setTitle('Adapt Cloud | Ongoing AI Advisory and Engineering')
    c.setAuthor('Adapt Cloud')
    c.setSubject('Renewable advisory and engineering with PromptForce.AI')
    d = data['page_one']
    chrome(c, data, 1)
    y = paragraph(c, d['eyebrow'], LEFT, 672, 520, 9, 12, TEAL, 500)
    y = paragraph(c, d['title'], LEFT, y-18, 520, 34, 40.8, INK, 400)
    y = paragraph(c, d['intro'], LEFT, y-18, 505, 12, 17, MUTED)
    top = y-23
    c.setFillColor(INK)
    c.roundRect(LEFT, top-83, 520, 83, 8, fill=1, stroke=0)
    y = paragraph(c, d['band_title'], LEFT+18, top-15, 484, 13, 17, white, 500)
    paragraph(c, d['band_body'], LEFT+18, y-7, 484, 11, 15, white)
    y = top-104
    for offer in d['offers']:
        y = paragraph(c, offer['title'], LEFT, y, 520, 14, 18, TEAL, 500)
        y = paragraph(c, offer['body'], LEFT, y-4, 515, 11, 15, MUTED)-16
    paragraph(c, d['closing'], LEFT, y-2, 520, 10.5, 14, INK, 500)
    c.showPage()

    d = data['page_two']
    chrome(c, data, 2)
    y = paragraph(c, d['eyebrow'], LEFT, 672, 520, 9, 12, TEAL, 500)
    y = paragraph(c, d['title'], LEFT, y-15, 520, 29, 34.8, INK, 400)
    top = y-18
    c.setFillColor(PALE)
    c.roundRect(LEFT, top-128, 520, 128, 8, fill=1, stroke=0)
    y = paragraph(c, d['accelerator_title'], LEFT+17, top-14, 486, 14, 18, TEAL, 500)
    y = paragraph(c, d['accelerator_body'], LEFT+17, y-7, 486, 11, 15, INK)
    paragraph(c, d['accelerator_note'], LEFT+17, y-7, 486, 9, 12, MUTED)
    y = top-147
    for step in d['steps']:
        paragraph(c, step['label'], LEFT, y, 105, 9, 12, TEAL, 500)
        y = paragraph(c, step['body'], LEFT+111, y+1, 409, 11, 15, MUTED)-14
    y = paragraph(c, d['proof_title'], LEFT, y-1, 520, 14, 18, INK, 500)
    y = paragraph(c, d['proof_body'], LEFT, y-7, 520, 11, 15, MUTED)
    y = paragraph(c, d['renewal'], LEFT, y-10, 520, 11, 15, MUTED)
    y = paragraph(c, d['cta'], LEFT, y-19, 520, 16, 20, TEAL, 500)
    y = paragraph(c, d['cta_body'], LEFT, y-6, 520, 10.5, 14, MUTED)
    c.linkURL('mailto:' + data['contact'], (LEFT, y-1, RIGHT, y+42), relative=0)
    c.save()
    print(out)


if __name__ == '__main__':
    render()
