const fs = require("node:fs");
const path = require("node:path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  PageOrientation
} = require("docx");

// Splits CLINICIAN_REVIEW_BY_CANCER.md into one Word file per cancer, so each
// specialist receives only their own section plus the shared context they need
// to read it (the three caveats, the common question set, the cross-cutting
// questions, the module appendix).
//
// Generated from the Markdown rather than hand-written, for the same reason as
// build-questionnaire-review-docx.js: the Word copies handed to outside
// clinicians must never drift from the copy in the repo. Edit the Markdown and
// re-run; never edit the .docx files directly.

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "CLINICIAN_REVIEW_BY_CANCER.md");
const OUT_DIR = path.join(ROOT, "output", "clinician-review-20261118");

const FONT = "Microsoft JhengHei";
const HEADER_FILL = "EEF2F5";
const NOTE_FILL = "FFF8E1";
// A4 (11906 DXA) less the 1440 default margins on each side.
const CONTENT_WIDTH = 9026;

// Section heading -> output file prefix. Order fixes the file numbering.
const FILE_ORDER = [
  ["一、肺癌", "01_肺癌"],
  ["二、大腸直腸癌", "02_大腸直腸癌"],
  ["三、肝癌", "03_肝癌"],
  ["四、胃癌", "04_胃癌"],
  ["五、胰臟癌", "05_胰臟癌"],
  ["六、乳癌", "06_乳癌"],
  ["七、攝護腺癌", "07_攝護腺癌"],
  ["八、頭頸癌", "08_頭頸癌"],
  ["九、子宮內膜癌", "09_子宮內膜癌"],
  ["十、膀胱癌", "10_膀胱癌"]
];

// ---------------------------------------------------------------- markdown --

function splitSource() {
  const lines = fs.readFileSync(SOURCE, "utf8").split(/\r?\n/);
  const h1 = [];
  lines.forEach((line, index) => {
    if (/^# /.test(line)) h1.push({ index, title: line.slice(2).trim() });
  });

  const firstCancer = h1.findIndex((h) => h.title === FILE_ORDER[0][0]);
  const commonStart = h1.findIndex((h) => h.title.startsWith("共通問題"));
  if (firstCancer < 0 || commonStart < 0) {
    throw new Error("Cannot locate the cancer sections or the 共通問題 heading in " + SOURCE);
  }

  // Preamble: everything after the document title up to the first cancer
  // section (the three caveats and the common question set).
  const preamble = lines.slice(h1[0].index + 1, h1[firstCancer].index);
  const tail = lines.slice(h1[commonStart].index);

  const sections = new Map();
  for (let i = firstCancer; i < commonStart; i += 1) {
    const end = i + 1 < h1.length ? h1[i + 1].index : lines.length;
    sections.set(h1[i].title, lines.slice(h1[i].index, end));
  }
  return { preamble, sections, tail };
}

// ------------------------------------------------------------------ inline --

// Splits on **bold** and `code`, which is all the inline markup the source uses.
function runs(markdown, { size = 20, bold: forceBold = false, color } = {}) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match = pattern.exec(markdown);
  while (match) {
    if (match.index > cursor) {
      out.push(new TextRun({
        text: markdown.slice(cursor, match.index),
        font: FONT, size, bold: forceBold, color
      }));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(new TextRun({
        text: token.slice(2, -2), font: FONT, size, bold: true, color
      }));
    } else {
      out.push(new TextRun({
        text: token.slice(1, -1), font: "Consolas", size: size - 2, color: "1F4E5F"
      }));
    }
    cursor = match.index + token.length;
    match = pattern.exec(markdown);
  }
  if (cursor < markdown.length) {
    out.push(new TextRun({
      text: markdown.slice(cursor), font: FONT, size, bold: forceBold, color
    }));
  }
  return out.length ? out : [new TextRun({ text: "", font: FONT, size })];
}

// -------------------------------------------------------------------- cells --

function cell(children, { header = false, width, fill } = {}) {
  return new TableCell({
    children,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: header
      ? { type: ShadingType.CLEAR, fill: HEADER_FILL }
      : (fill ? { type: ShadingType.CLEAR, fill } : undefined),
    margins: { top: 60, bottom: 60, left: 108, right: 108 }
  });
}

function columnWidths(count) {
  if (count === 2) return [2800, CONTENT_WIDTH - 2800];
  if (count === 3) {
    const rest = Math.floor((CONTENT_WIDTH - 2000) / 2);
    return [2000, rest, CONTENT_WIDTH - 2000 - rest];
  }
  const each = Math.floor(CONTENT_WIDTH / count);
  const widths = new Array(count).fill(each);
  widths[count - 1] = CONTENT_WIDTH - each * (count - 1);
  return widths;
}

function splitRow(line) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

function buildTable(rawRows) {
  const header = splitRow(rawRows[0]);
  const widths = columnWidths(header.length);
  const rows = [
    new TableRow({
      tableHeader: true,
      children: header.map((text, i) => cell(
        [new Paragraph({ children: runs(text, { bold: true }), spacing: { after: 0 } })],
        { header: true, width: widths[i] }
      ))
    })
  ];
  for (const raw of rawRows.slice(2)) {
    const cells = splitRow(raw);
    while (cells.length < header.length) cells.push("");
    rows.push(new TableRow({
      children: cells.slice(0, header.length).map((text, i) => cell(
        [new Paragraph({ children: runs(text), spacing: { after: 0 } })],
        { width: widths[i] }
      ))
    }));
  }
  return new Table({
    rows,
    columnWidths: widths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }
  });
}

// ------------------------------------------------------------------ blocks --

function heading(textValue, level) {
  const size = level === 1 ? 32 : level === 2 ? 26 : 23;
  return new Paragraph({
    heading: level === 1
      ? HeadingLevel.HEADING_1
      : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 360 : 260, after: 140 },
    children: runs(textValue, { size, bold: true, color: level === 1 ? "0F3D3E" : "14504F" })
  });
}

function rule() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7D3D2", space: 1 } },
    children: [new TextRun({ text: "", font: FONT, size: 2 })]
  });
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(heading(line.replace(/^#+\s*/, ""), level));
      i += 1;
      continue;
    }

    if (/^---+\s*$/.test(line)) { out.push(rule()); i += 1; continue; }

    // Table: a header row followed by a |---|---| separator.
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const block = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i += 1; }
      out.push(buildTable(block));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "", size: 2 })] }));
      continue;
    }

    if (/^> /.test(line)) {
      out.push(new Paragraph({
        spacing: { before: 80, after: 120 },
        indent: { left: 240 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "2F7D73", space: 8 } },
        children: runs(line.slice(2), { color: "2F5D58" })
      }));
      i += 1;
      continue;
    }

    if (/^- /.test(line)) {
      out.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: runs(line.slice(2))
      }));
      i += 1;
      continue;
    }

    // Numbered items keep their literal number: the reply sheet at the end of
    // each file refers to these numbers, so they must not be re-numbered by
    // Word's own list engine.
    if (/^\d+\. /.test(line)) {
      out.push(new Paragraph({
        spacing: { after: 60 },
        indent: { left: 360, hanging: 360 },
        children: runs(line)
      }));
      i += 1;
      continue;
    }

    out.push(new Paragraph({ spacing: { after: 100 }, children: runs(line) }));
    i += 1;
  }
  return out;
}

// -------------------------------------------------------------- reply sheet --

// Pulls the numbered questions out of a block so the specialist can answer them
// in a table instead of annotating prose.
function numberedQuestions(lines, headingMatcher) {
  const start = lines.findIndex((l) => /^#{1,3} /.test(l) && headingMatcher.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,3} /.test(lines[i]) || /^---+\s*$/.test(lines[i])) break;
    const match = /^(\d+)\. (.*)$/.exec(lines[i]);
    if (match) out.push({ n: Number(match[1]), text: match[2] });
  }
  return out;
}

function plain(markdown) {
  return markdown.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function replySheet(specific, common) {
  const blocks = [
    heading("醫師回覆欄", 2),
    new Paragraph({
      spacing: { after: 160 },
      children: runs(
        "可直接在右欄填寫，或在會談時口頭回覆由我方記錄。沒有意見的欄位留白即可。"
          + "「專」為本癌別專屬問題，「共」為每位醫師都會被問到的共通問題。"
      )
    })
  ];

  const widths = [900, 4200, CONTENT_WIDTH - 900 - 4200];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ["題號", "問題", "您的意見"].map((t, i) => cell(
        [new Paragraph({ children: runs(t, { bold: true }), spacing: { after: 0 } })],
        { header: true, width: widths[i] }
      ))
    })
  ];

  const add = (prefix, items) => {
    for (const q of items) {
      rows.push(new TableRow({
        children: [
          cell([new Paragraph({ children: runs(`${prefix} ${q.n}`, { bold: true }), spacing: { after: 0 } })], { width: widths[0] }),
          cell([new Paragraph({ children: runs(plain(q.text), { size: 18 }), spacing: { after: 0 } })], { width: widths[1] }),
          cell([new Paragraph({ children: runs(""), spacing: { after: 0 } })], { width: widths[2] })
        ]
      }));
    }
  };
  add("專", specific);
  add("共", common);

  blocks.push(new Table({ rows, columnWidths: widths, width: { size: CONTENT_WIDTH, type: WidthType.DXA } }));
  return blocks;
}

// ------------------------------------------------------------------- build --

function coverNote(cancerTitle) {
  const rows = [new TableRow({
    children: [cell(
      [
        new Paragraph({
          spacing: { after: 80 },
          children: runs("請先讀這一段", { bold: true, color: "7A4F01" })
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: runs(
            "本問卷不是按癌別設計的。93 題依身體系統分組，十個癌別模型共用同一組特徵向量，"
              + "程式中沒有「哪一題屬於哪個癌」的設定。本文件中「"
              + cancerTitle
              + "涵蓋的題目」是依臨床風險因子所做的對照整理，"
              + "不是模型對該癌別的輸入清單。", { size: 19 }
          )
        }),
        new Paragraph({
          spacing: { after: 0 },
          children: runs(
            "另有 32 個欄位問卷已在收集、但尚未納入模型，文中標記為「（已收集，尚未進模型）」。"
              + "若您認為其中某項重要，正好可作為我們優先納入的依據。", { size: 19 }
          )
        })
      ],
      { fill: NOTE_FILL, width: CONTENT_WIDTH }
    )]
  })];
  return new Table({
    rows,
    columnWidths: [CONTENT_WIDTH],
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }
  });
}

async function main() {
  const { preamble, sections, tail } = splitSource();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const commonQuestions = numberedQuestions(tail, /共通問題/);
  const written = [];

  for (const [sectionTitle, filePrefix] of FILE_ORDER) {
    const section = sections.get(sectionTitle);
    if (!section) throw new Error(`Missing section in Markdown: ${sectionTitle}`);

    const cancerName = sectionTitle.replace(/^[一二三四五六七八九十]+、/, "");
    const specialty = (section.find((l) => /^> 建議請教科別/.test(l)) || "")
      .replace(/^> 建議請教科別：/, "").trim();

    const specificQuestions = numberedQuestions(section, /想請教醫師的問題/);

    const children = [
      new Paragraph({
        spacing: { after: 60 },
        children: runs(`${cancerName} — 問卷涵蓋對照表`, { size: 36, bold: true, color: "0F3D3E" })
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: runs("AI 十大癌症健康風險因子評估平台／供專科醫師審閱", { size: 20, color: "4A6866" })
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: runs(
          `建議請教科別：${specialty}　｜　問卷版本 questionnaire/2026-11-16-v19.14-phase1　｜　整理日期 2026-11-18`,
          { size: 18, color: "4A6866" }
        )
      }),
      coverNote(cancerName),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "", size: 2 })] }),
      ...renderBlocks(preamble),
      ...renderBlocks(section),
      ...renderBlocks(tail),
      rule(),
      ...replySheet(specificQuestions, commonQuestions)
    ];

    const doc = new Document({
      creator: "EG BioMed",
      title: `${cancerName} — 問卷涵蓋對照表`,
      description: "AI 十大癌症健康風險因子評估平台：供專科醫師審閱的問卷涵蓋對照",
      styles: { default: { document: { run: { font: FONT, size: 20 } } } },
      sections: [{
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children
      }]
    });

    const fileName = `${filePrefix}_問卷涵蓋對照_供醫師審閱.docx`;
    const target = path.join(OUT_DIR, fileName);
    fs.writeFileSync(target, await Packer.toBuffer(doc));
    written.push({ fileName, specialty, specific: specificQuestions.length });
  }

  console.log(`輸出目錄：${OUT_DIR}\n`);
  for (const w of written) {
    console.log(`  ${w.fileName}  (${w.specialty}；專屬問題 ${w.specific} 題 + 共通 ${commonQuestions.length} 題)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
