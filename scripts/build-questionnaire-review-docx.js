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
  ShadingType
} = require("docx");

// Renders the same review model as scripts/generate-questionnaire-review.js
// (which that script exports when required rather than run) into a .docx, so
// the Word copy handed to an ethics/IRB reviewer can never disagree with the
// Markdown copy in the repo. Deliberately JavaScript rather than Python: the
// Windows machines this repo is maintained on have Node but no working Python
// install, so the previous Python docx builder could not be run at all and its
// output had gone stale against the questionnaire.
const review = require("./generate-questionnaire-review.js");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "QUESTIONNAIRE_ITEM_BY_ITEM_REVIEW.docx");

const FONT = "Microsoft JhengHei";
const HEADER_FILL = "EEF2F5";

function text(value, { bold = false, size = 20, color } = {}) {
  return new TextRun({ text: String(value), bold, size, color, font: FONT });
}

function body(children, options = {}) {
  return new Paragraph({ children, spacing: { after: 80 }, ...options });
}

function labelledLine(label, value) {
  return body([text(`${label}：`, { bold: true }), text(value)]);
}

function cell(children, { header = false, width } = {}) {
  return new TableCell({
    children,
    shading: header ? { type: ShadingType.CLEAR, fill: HEADER_FILL } : undefined,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined
  });
}

function optionsTable(question) {
  const showCode = !question.excluded_from_contract;
  const headers = showCode ? ["code", "中文選項", "English"] : ["中文選項", "English"];
  const widths = showCode ? [22, 39, 39] : [50, 50];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((heading, index) => cell([body([text(heading, { bold: true })])], {
        header: true,
        width: widths[index]
      }))
    }),
    ...question.options.map((option) => new TableRow({
      children: (showCode ? [option.code, option.label_zh, option.label_en] : [option.label_zh, option.label_en])
        .map((value, index) => cell([body([text(value)])], { width: widths[index] }))
    }))
  ];

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" }
    }
  });
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
    children: [text(review.documentTitle, { bold: true, size: 32 })]
  }),
  ...review.summaryLines.map((line) => body([text(line)])),
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    children: [text("共通規則", { bold: true, size: 26 })]
  }),
  ...review.commonRules.map((rule, index) => body([text(`${index + 1}. ${rule}`)])),
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    pageBreakBefore: true,
    children: [text("知情同意告知事項全文", { bold: true, size: 26 })]
  }),
  body([text("以下為受試者在第 1 題勾選三項確認之前，畫面上必須完整捲動閱讀的告知事項原文（中英文各一份，直接取自 app.js 之同意畫面）。")]),
  ...review.consentNotices.flatMap((notice) => [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 100 },
      children: [text(notice.heading, { bold: true, size: 24 })]
    }),
    ...notice.items.map(([term, definition]) => body([
      text(`${term}${notice.separator}`, { bold: true }),
      text(definition)
    ])),
    ...(notice.warningHeading
      ? [
        body([text(notice.warningHeading, { bold: true })], { spacing: { before: 160, after: 80 } }),
        ...notice.warningParagraphs.map((paragraph) => body([text(paragraph)]))
      ]
      : [])
  ]),
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    pageBreakBefore: true,
    children: [text("逐題審核", { bold: true, size: 26 })]
  })
];

review.reviewQuestions.forEach((question, index) => {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    pageBreakBefore: index > 0,
    children: [text(`${index + 1}. ${question.title_zh}`, { bold: true, size: 24 })]
  }));

  review.reviewFields(question).forEach(([label, value]) => {
    children.push(labelledLine(label, value));
  });

  if (question.options?.length) {
    children.push(body([text(
      question.excluded_from_contract ? "選項（本題不產生正式答案代碼）" : "選項與固定代碼",
      { bold: true }
    )], { spacing: { before: 160, after: 80 } }));
    children.push(optionsTable(question));
  }

  children.push(body([text("審核結果", { bold: true })], { spacing: { before: 200, after: 80 } }));
  review.reviewChecklist.forEach((item) => {
    children.push(body([text(`☐ ${item}`)]));
  });
  children.push(body([text("修改說明：")], { spacing: { after: 200 } }));
});

const document = new Document({
  creator: "EG BioMed",
  title: review.documentTitle,
  description: `問卷版本 ${review.versions.questionnaire_version}`,
  styles: {
    default: {
      document: { run: { font: FONT, size: 20 } }
    }
  },
  sections: [{ children }]
});

Packer.toBuffer(document).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`${outputPath} (${review.reviewQuestions.length} 題, ${(buffer.length / 1024).toFixed(0)} KB)`);
});
