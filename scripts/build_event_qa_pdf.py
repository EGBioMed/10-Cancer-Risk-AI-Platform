from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
OUT_PATH = OUT_DIR / "10_Cancer_AI_Platform_Event_QA_Test_Report.pdf"
FONT_PATH = Path("/Library/Fonts/Arial Unicode.ttf")


def register_fonts():
    if not FONT_PATH.exists():
        raise FileNotFoundError(f"Required CJK font not found: {FONT_PATH}")
    pdfmetrics.registerFont(TTFont("ArialUnicode", str(FONT_PATH)))


def p(text, style):
    return Paragraph(text, style)


def make_table(data, col_widths=None, header=True):
    cell_style = ParagraphStyle(
        "TableCellZH",
        fontName="ArialUnicode",
        fontSize=9,
        leading=12,
        textColor=colors.black,
        wordWrap="CJK",
    )
    processed = []
    for row_index, row in enumerate(data):
        if header and row_index == 0:
            processed.append(row)
        else:
            processed.append([
                Paragraph(str(cell).replace("\n", "<br/>"), cell_style)
                for cell in row
            ])

    table = Table(processed, colWidths=col_widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "ArialUnicode"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEADING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D7E0DD")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if header:
        style.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    table.setStyle(TableStyle(style))
    return table


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("ArialUnicode", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(18 * mm, 11 * mm, "10 Cancer AI Platform 展場 QA/QC 測試報告")
    canvas.drawRightString(192 * mm, 11 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUT_PATH),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="10 Cancer AI Platform 展場 QA/QC 測試報告",
        author="Codex",
    )

    styles = getSampleStyleSheet()
    base = ParagraphStyle(
        "BaseZH",
        parent=styles["BodyText"],
        fontName="ArialUnicode",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#172322"),
        wordWrap="CJK",
        spaceAfter=6,
    )
    title = ParagraphStyle(
        "TitleZH",
        parent=base,
        fontSize=18,
        leading=24,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0F3D3A"),
        spaceAfter=8,
    )
    subtitle = ParagraphStyle(
        "SubtitleZH",
        parent=base,
        fontSize=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#4B5563"),
        spaceAfter=12,
    )
    h1 = ParagraphStyle(
        "HeadingZH",
        parent=base,
        fontSize=13,
        leading=18,
        textColor=colors.HexColor("#0F766E"),
        spaceBefore=10,
        spaceAfter=6,
    )
    note = ParagraphStyle(
        "NoteZH",
        parent=base,
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#374151"),
        backColor=colors.HexColor("#F4F8F7"),
        borderColor=colors.HexColor("#CFE0DC"),
        borderWidth=0.5,
        borderPadding=7,
        spaceBefore=4,
        spaceAfter=8,
    )
    small = ParagraphStyle("SmallZH", parent=base, fontSize=8.5, leading=12)

    story = [
        p("10 Cancer AI Platform 展場 QA/QC 測試報告", title),
        p("產出時間：2026-07-13 12:35 CST", subtitle),
        p("測試目的", h1),
        p("確認正式展場流程在多人同時填寫時是否穩定，並估算使用者等待報告寄出的時間。", base),
        p("正式流程：前端表單 -> Render /api/submit -> Power Automate -> AI API -> Excel -> Email", note),
        p("最終結論", h1),
        p("目前正式流程功能面可用於展場；新版 model 後，建議採分批送出策略。每批 3-5 人最穩，6 人為測得上限，7 人以上不建議同時送出。", base),
        make_table([
            ["項目", "結論"],
            ["單筆正式流程", "通過"],
            ["新版 model 後單筆流程", "通過"],
            ["新版 model 後 5 人同時送出", "功能通過"],
            ["新版 model 後 6 人同時送出", "通過 150 秒門檻"],
            ["新版 model 後 7 人同時送出", "功能通過，但超過 150 秒門檻"],
            ["AI API", "通過，HTTP 200"],
            ["Excel 寫入", "通過，未再出現 409"],
            ["Email 寄送", "通過"],
            ["建議展場批次", "每批 3-5 人最穩，6 人為測得上限"],
            ["不建議情境", "新版 model 下 7 人以上同時送出"],
        ], [56 * mm, 112 * mm]),
        Spacer(1, 4 * mm),
        p("關鍵測試結果", h1),
        p("單筆正式流程 - 2026-07-13", h1),
        make_table([
            ["指標", "結果"],
            ["k6 checks", "100%"],
            ["HTTP failed", "0%"],
            ["k6 response time", "1.46 秒"],
            ["Power Automate 總時間", "21 秒"],
            ["AI API", "Succeeded / HTTP 200"],
            ["Excel", "Succeeded / HTTP 200"],
            ["Email", "Succeeded / HTTP 200"],
        ], [64 * mm, 104 * mm]),
        p("結論：單筆正式 E2E 通過。", note),
        p("5 人同時送出，新版 model - 2026-07-13", h1),
        make_table([
            ["指標", "結果"],
            ["送出筆數", "5"],
            ["k6 checks", "100%"],
            ["HTTP failed", "0%"],
            ["k6 response p95", "14.21 秒"],
            ["Flow 完成時間", "73、90、107、123、140 秒"],
            ["最後一筆完成", "約 2 分 20 秒"],
            ["AI API", "5/5 Succeeded"],
            ["Excel", "5/5 Succeeded"],
            ["Email", "5/5 Succeeded"],
        ], [64 * mm, 104 * mm]),
        p("結論：功能通過。5 人同時送出可承受，且仍在 150 秒門檻內。", note),
        PageBreak(),
        p("6 人同時送出，新版 model - 2026-07-13", h1),
        make_table([
            ["指標", "結果"],
            ["送出筆數", "6"],
            ["k6 checks", "100%"],
            ["HTTP failed", "0%"],
            ["k6 response p95", "13.56 秒"],
            ["Flow 完成時間", "69、85、102、118、133、148 秒"],
            ["最後一筆完成", "約 2 分 28 秒"],
            ["AI API", "6/6 Succeeded"],
            ["Excel", "6/6 Succeeded"],
            ["Email", "6/6 Succeeded"],
        ], [64 * mm, 104 * mm]),
        p("結論：功能通過，且最後一筆 148 秒，仍在 150 秒門檻內，但只剩 2 秒緩衝。6 人是目前測得的舒適等待上限。", note),
        p("7 人同時送出，新版 model - 2026-07-13", h1),
        make_table([
            ["指標", "結果"],
            ["送出筆數", "7"],
            ["k6 checks", "100%"],
            ["HTTP failed", "0%"],
            ["k6 response p95", "13.45 秒"],
            ["Flow 完成時間", "68、82、97、114、129、147、165 秒"],
            ["最後一筆完成", "約 2 分 45 秒"],
            ["AI API", "7/7 Succeeded"],
            ["Excel", "7/7 Succeeded"],
            ["Email", "7/7 Succeeded"],
        ], [64 * mm, 104 * mm]),
        p("結論：功能通過，但最後一筆 165 秒，超過 150 秒門檻。7 人以上不建議作為展場同時送出批次。", note),
        PageBreak(),
        p("10 人同時送出，舊版 model 測試參考", h1),
        make_table([
            ["指標", "結果"],
            ["送出筆數", "10"],
            ["失敗率", "0%"],
            ["最後一筆完成", "約 2 分 49 秒"],
        ], [64 * mm, 104 * mm]),
        p("結論：系統功能可承受 10 人同時送出，但等待時間超過 1-2 分鐘。新版 model 測得 7 人已超過 150 秒後，不需要再以 10 人作為展場建議批次；10 人僅作壅塞情境參考。", note),
        p("已修復問題", h1),
        p("AI API HTTP 422 - Missing Body", h1),
        p("曾發生 UnprocessableEntity，錯誤訊息為 loc: [body] / Field required。原因是 Power Automate 的 AI API HTTP action 沒有送出 body。", base),
        p("修正後 Body：body('剖析_JSON')?['ai_api_feature_row']", note),
        p("修復驗證：AI API HTTP input body present；AI API response HTTP 200；Production single E2E PASS。", base),
        p("Excel 409", h1),
        p("曾發生 Excel concurrent write conflict。短期策略為 Power Automate trigger concurrency control 開啟，Degree of parallelism 設為 1。此策略可避免多人同時寫入 Excel 造成 409，但多人送出會排隊，等待時間會拉長。", base),
        p("展場操作建議", h1),
        make_table([
            ["情境", "建議"],
            ["一般人流", "每批 3-5 人同時送出"],
            ["短時間尖峰", "6 人可承受，但已接近 150 秒上限"],
            ["7 人以上", "不建議同時送出，工作人員分批引導"],
            ["使用者等待", "告知報告會陸續寄出，尖峰可能需要 2-3 分鐘"],
        ], [52 * mm, 116 * mm]),
        p("建議現場說法：報告會寄到您的信箱。一般約 1-2 分鐘內收到；尖峰時可能需要 2-3 分鐘，請稍候並確認垃圾郵件匣。", note),
        p("上線前檢查清單", h1),
        make_table([
            ["檢查項目", "狀態"],
            ["正式 Flow 不再修改 AI API HTTP Body", "必須確認"],
            ["AI API HTTP Body 維持 body('剖析_JSON')?['ai_api_feature_row']", "必須確認"],
            ["Production Flow concurrency control 維持 On，parallelism = 1", "必須確認"],
            ["展場前最後只跑 production_single 與必要的 production_burst_5 或 production_burst_6", "建議"],
            ["不再對正式 Flow 做連續 loop 壓測", "建議"],
            ["現場工作人員了解每批 3-5 人最穩、6 人為測得上限、7 人以上不建議", "必須確認"],
            ["確認測試信件與正式信件不會進垃圾郵件匣", "必須確認"],
        ], [94 * mm, 74 * mm]),
        p("最終建議", h1),
        p("正式流程目前功能面通過，可用於展場。新版 model 後的測試顯示 6 人同時送出仍可在 150 秒內完成，但只剩 2 秒緩衝；7 人同時送出會超過 150 秒。展場應以 3-5 人分批送出為主要操作方式，6 人為可承受但接近上限的尖峰情境，避免 7 人以上同時送出。", base),
        Spacer(1, 6 * mm),
        p("資料來源：EVENT_QA_TEST_REPORT.md 與 QA_QC_LOAD_TEST_LOG.md", small),
    ]

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return OUT_PATH


if __name__ == "__main__":
    print(build())
