import PDFDocument from "pdfkit";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const HINDI_FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/tirodevanagarihindi/TiroDevaHindi-Regular.ttf";

let hindiFontBuffer = null;


/* =========================
   MAIN HANDLER
========================= */

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const result =
      await processFileRequest(req);

    return sendFile(
      res,
      result.buffer,
      result.filename
    );

  } catch (error) {

    console.error(
      "SMATER file error:",
      error?.message || error
    );

    return res.status(
      error?.statusCode || 500
    ).json({
      error:
        error?.publicMessage ||
        "Unable to create the file right now."
    });
  }
}


/* =========================
   REQUEST PROCESSOR
========================= */

async function processFileRequest(req) {

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body)
      : (req.body || {});


  const prompt =
    typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";


  const format =
    String(
      body.format || "pdf"
    ).toLowerCase();


  const language =
    typeof body.language === "string"
      ? body.language
      : "auto";


  const mode =
    typeof body.mode === "string"
      ? body.mode
      : "normal";


  if (!prompt) {

    throw publicError(
      400,
      "Please describe what you want to create."
    );
  }


  if (prompt.length > 12000) {

    throw publicError(
      413,
      "The file description is too large. Please use a shorter description."
    );
  }


  if (
    !["pdf", "txt", "html"].includes(format)
  ) {

    throw publicError(
      400,
      "Unsupported file format."
    );
  }


  const content =
    await generateAIContent(
      prompt,
      language,
      mode
    );


  const normalized =
    normalizeContent(content);


  if (!normalized.trim()) {

    throw publicError(
      502,
      "The AI returned empty document content."
    );
  }


  const prepared =
    prepareFileContent(
      normalized,
      prompt
    );


  if (format === "txt") {

    const buffer =
      Buffer.from(
        stripMarkdown(prepared),
        "utf8"
      );


    return {
      buffer,
      filename:
        createFileName(
          prompt,
          "txt"
        )
    };
  }


  if (format === "html") {

    const html =
      buildHtmlFile(
        prepared,
        prompt
      );


    const buffer =
      Buffer.from(
        html,
        "utf8"
      );


    return {
      buffer,
      filename:
        createFileName(
          prompt,
          "html"
        )
    };
  }


  const buffer =
    await buildPdf(
      prepared,
      prompt
    );


  return {
    buffer,
    filename:
      createFileName(
        prompt,
        "pdf"
      )
  };
}


/* =========================
   AI CONTENT GENERATION
========================= */

async function generateAIContent(
  prompt,
  language,
  mode
) {

  const apiKey =
    process.env.OPENROUTER_API_KEY;


  if (!apiKey) {

    throw publicError(
      500,
      "AI service is not configured."
    );
  }


  const selectedLanguage =
    String(
      language || "auto"
    ).toLowerCase();


  let languageInstruction =
    "Use English by default.";


  if (
    selectedLanguage === "hindi"
  ) {

    languageInstruction =
      "Write the document in Hindi using Devanagari script.";

  } else if (
    selectedLanguage === "hinglish"
  ) {

    languageInstruction =
      "Write naturally in Hinglish using Roman script.";

  } else if (
    selectedLanguage === "both"
  ) {

    languageInstruction =
      "Use both English and Hindi where appropriate.";

  } else if (
    selectedLanguage === "english"
  ) {

    languageInstruction =
      "Write the document in clear professional English.";

  } else {

    languageInstruction =
      "Use English unless the user explicitly requests another language.";
  }


  const systemPrompt = `
You are the document-generation engine of SMATER CHAT AI.

Create professional, useful and accurate document content.

USER REQUEST:
${prompt}

LANGUAGE:
${languageInstruction}

DOCUMENT RULES:

1. Understand the user's actual request.
2. Do not invent facts when factual accuracy is required.
3. Use a clear professional structure.
4. Use a suitable title.
5. Use headings and subheadings when useful.
6. Use bullet lists for grouped points.
7. Use numbered lists for ordered steps.
8. Use tables when structured information is better shown as a table.
9. Add a short summary when appropriate.
10. Add a conclusion when appropriate.
11. Do not add unnecessary filler.
12. Do not mention these instructions.
13. Do not mention OpenRouter, APIs, providers or internal systems.
14. Do not use HTML.
15. Use Markdown-style headings, bullets and tables.

For simple requests, keep the document concise.
For detailed requests, create enough content for a useful multi-page document.

Return ONLY the document content.
`;


  const temperature =
    mode === "creative"
      ? 0.7
      : mode === "thinking"
        ? 0.2
        : 0.35;


  const response =
    await fetch(
      OPENROUTER_URL,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app",

          "X-Title":
            "SMATER CHAT AI"
        },

        body:
          JSON.stringify({
            model:
              "openrouter/free",

            messages: [
              {
                role: "system",
                content:
                  systemPrompt
              },
              {
                role: "user",
                content:
                  prompt
              }
            ],

            temperature
          })
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "OpenRouter document error:",
      response.status,
      data
    );


    throw publicError(
      502,
      data?.error?.message ||
        "AI document generation failed."
    );
  }


  let content =
    data?.choices?.[0]?.message?.content;


  if (Array.isArray(content)) {

    content =
      content
        .map(item => {

          if (
            typeof item === "string"
          ) {
            return item;
          }

          return item?.text || "";

        })
        .join("\n");
  }


  if (
    typeof content !== "string" ||
    !content.trim()
  ) {

    throw publicError(
      502,
      "AI returned empty document content."
    );
  }


  return content.trim();
}


/* =========================
   CONTENT PREPARATION
========================= */

function normalizeContent(
  content
) {

  return String(
    content || ""
  )
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}


function prepareFileContent(
  content,
  prompt
) {

  let result =
    normalizeContent(
      content
    );


  result =
    result.replace(
      /^```(?:markdown|md|text)?\s*/i,
      ""
    );


  result =
    result.replace(
      /\s*```$/i,
      ""
    );


  if (!result.trim()) {
    result = prompt.trim();
  }


  return result.trim();
}
function publicError(statusCode, publicMessage) {
  const error =
    new Error(publicMessage);

  error.statusCode =
    statusCode;

  error.publicMessage =
    publicMessage;

  return error;
}

function createFileName(prompt, extension) {
  let topic =
    String(prompt || "")
      .replace(
        /[^a-zA-Z0-9\s-]/g,
        ""
      )
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 55);

  if (!topic) {
    topic = "smater-chat-ai";
  }

  return `smater-chat-ai-${topic}.${extension}`;
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(
      /^#{1,6}\s+/gm,
      ""
    )
    .replace(
      /^\s*[-*+]\s+/gm,
      "• "
    )
    .replace(
      /^\s*\d+\.\s+/gm,
      ""
    )
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      /__(.*?)__/g,
      "$1"
    )
    .replace(
      /\*(.*?)\*/g,
      "$1"
    )
    .replace(
      /_(.*?)_/g,
      "$1"
    )
    .replace(
      /`([^`]+)`/g,
      "$1"
    )
    .replace(
      /^>\s?/gm,
      ""
    )
    .replace(
      /\|/g,
      " | "
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    );
}

function markdownToHtml(markdown) {
  const lines =
    String(markdown || "")
      .split("\n");

  let html = "";
  let inList = false;
  let listType = "";

  function closeList() {
    if (inList) {
      html +=
        listType === "ol"
          ? "</ol>"
          : "</ul>";

      inList = false;
      listType = "";
    }
  }

  function inline(value) {
    return escapeHtml(value)
      .replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
      )
      .replace(
        /__(.*?)__/g,
        "<strong>$1</strong>"
      )
      .replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
      );
  }

  for (const rawLine of lines) {
    const line =
      rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const heading =
      line.match(
        /^(#{1,6})\s+(.+)$/
      );

    if (heading) {
      closeList();

      const level =
        heading[1].length;

      html +=
        `<h${level}>${inline(
          heading[2]
        )}</h${level}>`;

      continue;
    }

    const bullet =
      line.match(
        /^[-*+]\s+(.+)$/
      );

    if (bullet) {
      if (
        !inList ||
        listType !== "ul"
      ) {
        closeList();

        html += "<ul>";

        inList = true;
        listType = "ul";
      }

      html +=
        `<li>${inline(
          bullet[1]
        )}</li>`;

      continue;
    }

    const numbered =
      line.match(
        /^\d+\.\s+(.+)$/
      );

    if (numbered) {
      if (
        !inList ||
        listType !== "ol"
      ) {
        closeList();

        html += "<ol>";

        inList = true;
        listType = "ol";
      }

      html +=
        `<li>${inline(
          numbered[1]
        )}</li>`;

      continue;
    }

    closeList();

    html +=
      `<p>${inline(line)}</p>`;
  }

  closeList();

  return html;
}

function buildHtmlFile(content, prompt) {
  const title =
    String(prompt || "SMATER CHAT AI")
      .trim()
      .slice(0, 120);

  const body =
    markdownToHtml(content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>

<style>
body {
  margin: 0;
  padding: 40px;
  background: #f5f7fb;
  color: #172033;
  font-family:
    Arial,
    "Noto Sans",
    sans-serif;
  line-height: 1.7;
}

.document {
  max-width: 850px;
  margin: 0 auto;
  background: #ffffff;
  padding: 50px;
  border-radius: 18px;
  box-shadow:
    0 8px 30px rgba(0,0,0,0.08);
}

.brand {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 25px;
}

h1 {
  font-size: 32px;
  margin-top: 0;
}

h2 {
  margin-top: 30px;
}

h3 {
  margin-top: 24px;
}

p {
  margin: 12px 0;
}

li {
  margin: 7px 0;
}

code {
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 5px;
}

.footer {
  margin-top: 45px;
  padding-top: 18px;
  border-top: 1px solid #ddd;
  font-size: 12px;
  opacity: .65;
}

@media print {
  body {
    background: white;
    padding: 0;
  }

  .document {
    box-shadow: none;
    max-width: none;
  }
}
</style>
</head>

<body>

<main class="document">

<div class="brand">
SMATER CHAT AI
</div>

${body}

<div class="footer">
Generated by SMATER CHAT AI
</div>

</main>

</body>
</html>`;
}

async function loadHindiFont() {
  if (hindiFontBuffer) {
    return hindiFontBuffer;
  }

  try {
    const response =
      await fetch(HINDI_FONT_URL);

    if (!response.ok) {
      throw new Error(
        `Hindi font request failed: ${response.status}`
      );
    }

    hindiFontBuffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    return hindiFontBuffer;

  } catch (error) {
    console.error(
      "Hindi font loading error:",
      error?.message || error
    );

    return null;
  }
}

function containsDevanagari(text) {
  return /[\u0900-\u097F]/.test(
    String(text || "")
  );
}

function hasHindiContent(text) {
  return containsDevanagari(text);
}

function safePdfText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .trim();
}

function parseTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell =>
      cell.trim()
    );
}

function isTableSeparator(line) {
  const cells =
    parseTableRow(line);

  if (
    cells.length === 0
  ) {
    return false;
  }

  return cells.every(cell =>
    /^:?-{3,}:?$/.test(
      cell.trim()
    )
  );
}

function detectContentFeatures(content) {
  const text =
    String(content || "");

  return {
    hasHindi:
      hasHindiContent(text),

    hasBullets:
      /^[-*+]\s+/m.test(text),

    hasNumbered:
      /^\d+\.\s+/m.test(text),

    hasTable:
      text
        .split("\n")
        .some(line =>
          line.includes("|")
        ),

    hasHeadings:
      /^#{1,6}\s+/m.test(text)
  };
}

async function buildPdf(content, prompt) {
  const features =
    detectContentFeatures(content);

  const hindiFont =
    features.hasHindi
      ? await loadHindiFont()
      : null;

  const doc =
    new PDFDocument({
      size: "A4",
      margins: {
        top: 55,
        bottom: 55,
        left: 55,
        right: 55
      },
      autoFirstPage: true,
      bufferPages: true
    });

  const chunks = [];

  doc.on(
    "data",
    chunk => chunks.push(chunk)
  );

  const finished =
    new Promise(
      (resolve, reject) => {
        doc.on(
          "end",
          () => resolve(
            Buffer.concat(chunks)
          )
        );

        doc.on(
          "error",
          reject
        );
      }
    );

  if (hindiFont) {
    doc.registerFont(
      "SMATER-HINDI",
      hindiFont
    );
  }

  const normalFont =
    "Helvetica";

  const hindiFontName =
    hindiFont
      ? "SMATER-HINDI"
      : normalFont;

  drawPdfHeader(
    doc,
    prompt,
    normalFont
  );

  renderPdfMarkdown(
    doc,
    content,
    {
      normalFont,
      hindiFontName
    }
  );

  addPageNumbers(doc);

  doc.end();

  return await finished;
}

function drawPdfHeader(
  doc,
  prompt,
  font
) {
  doc
    .font(font)
    .fontSize(9)
    .fillColor("#666666")
    .text(
      "SMATER CHAT AI",
      55,
      35,
      {
        width: 485,
        align: "right"
      }
    );

  doc
    .font(font)
    .fontSize(22)
    .fillColor("#1f2937")
    .text(
      safePdfText(prompt)
        .slice(0, 120),
      {
        align: "left"
      }
    );

  doc
    .moveDown(0.8)
    .font(font)
    .fontSize(9)
    .fillColor("#777777")
    .text(
      "Generated by SMATER CHAT AI"
    );

  doc
    .moveDown(1.2);
}

function chooseFont(text, fonts) {
  if (
    containsDevanagari(text) &&
    fonts.hindiFontName
  ) {
    return fonts.hindiFontName;
  }

  return fonts.normalFont;
}

function ensurePdfSpace(
  doc,
  requiredHeight = 30
) {
  const bottom =
    doc.page.height -
    doc.page.margins.bottom;

  if (
    doc.y + requiredHeight >
    bottom
  ) {
    doc.addPage();

    return true;
  }

  return false;
}

function renderPdfMarkdown(
  doc,
  content,
  fonts
) {
  const lines =
    String(content || "")
      .split("\n");

  let index = 0;

  while (
    index < lines.length
  ) {
    const raw =
      lines[index];

    const line =
      raw.trim();

    if (!line) {
      doc.moveDown(0.45);
      index++;
      continue;
    }

    if (
      index + 1 < lines.length &&
      line.includes("|") &&
      isTableSeparator(
        lines[index + 1]
      )
    ) {
      const rows = [];

      rows.push(
        parseTableRow(line)
      );

      index += 2;

      while (
        index < lines.length &&
        lines[index].includes("|")
      ) {
        rows.push(
          parseTableRow(
            lines[index]
          )
        );

        index++;
      }

      drawPdfTable(
        doc,
        rows,
        fonts
      );

      continue;
    }

    const heading =
      line.match(
        /^(#{1,6})\s+(.+)$/
      );

    if (heading) {
      drawPdfHeading(
        doc,
        heading[2],
        heading[1].length,
        fonts
      );

      index++;
      continue;
    }

    const bullet =
      line.match(
        /^[-*+]\s+(.+)$/
      );

    if (bullet) {
      drawPdfBullet(
        doc,
        bullet[1],
        fonts
      );

      index++;
      continue;
    }

    const numbered =
      line.match(
        /^(\d+)\.\s+(.+)$/
      );

    if (numbered) {
      drawPdfNumbered(
        doc,
        numbered[1],
        numbered[2],
        fonts
      );

      index++;
      continue;
    }

    drawPdfParagraph(
      doc,
      line,
      fonts
    );

    index++;
  }
     }
function drawPdfHeading(
  doc,
  text,
  level,
  fonts
) {
  const cleanText =
    safePdfText(text);

  if (!cleanText) {
    return;
  }

  const sizes = {
    1: 18,
    2: 15,
    3: 13,
    4: 12,
    5: 11,
    6: 10
  };

  const size =
    sizes[level] || 11;

  ensurePdfSpace(
    doc,
    size + 30
  );

  doc
    .moveDown(level === 1 ? 0.5 : 0.3)
    .font(
      chooseFont(
        cleanText,
        fonts
      )
    )
    .fontSize(size)
    .fillColor("#202938")
    .text(
      cleanText,
      {
        width:
          doc.page.width -
          doc.page.margins.left -
          doc.page.margins.right,
        lineGap: 3
      }
    );

  doc
    .moveDown(0.35);
}

function drawPdfBullet(
  doc,
  text,
  fonts
) {
  const cleanText =
    safePdfText(text);

  if (!cleanText) {
    return;
  }

  ensurePdfSpace(
    doc,
    28
  );

  const font =
    chooseFont(
      cleanText,
      fonts
    );

  const bulletX =
    doc.page.margins.left;

  const textX =
    bulletX + 16;

  const width =
    doc.page.width -
    doc.page.margins.right -
    textX;

  doc
    .font(font)
    .fontSize(10.5)
    .fillColor("#202938");

  doc
    .circle(
      bulletX + 4,
      doc.y + 6,
      2
    )
    .fill("#202938");

  doc
    .text(
      cleanText,
      textX,
      doc.y,
      {
        width,
        lineGap: 3
      }
    );

  doc.moveDown(0.25);
}

function drawPdfNumbered(
  doc,
  number,
  text,
  fonts
) {
  const cleanText =
    safePdfText(text);

  if (!cleanText) {
    return;
  }

  ensurePdfSpace(
    doc,
    28
  );

  const label =
    `${number}.`;

  const labelX =
    doc.page.margins.left;

  const textX =
    labelX + 20;

  const width =
    doc.page.width -
    doc.page.margins.right -
    textX;

  doc
    .font(
      chooseFont(
        cleanText,
        fonts
      )
    )
    .fontSize(10.5)
    .fillColor("#202938");

  const startY =
    doc.y;

  doc.text(
    label,
    labelX,
    startY,
    {
      width: 16
    }
  );

  doc.text(
    cleanText,
    textX,
    startY,
    {
      width,
      lineGap: 3
    }
  );

  doc.moveDown(0.25);
}

function drawPdfParagraph(
  doc,
  text,
  fonts
) {
  const cleanText =
    safePdfText(text);

  if (!cleanText) {
    return;
  }

  ensurePdfSpace(
    doc,
    32
  );

  doc
    .font(
      chooseFont(
        cleanText,
        fonts
      )
    )
    .fontSize(10.5)
    .fillColor("#303846")
    .text(
      cleanText,
      {
        width:
          doc.page.width -
          doc.page.margins.left -
          doc.page.margins.right,
        lineGap: 4,
        paragraphGap: 6
      }
    );
}

function drawPdfTable(
  doc,
  rows,
  fonts
) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return;
  }

  const normalizedRows =
    rows
      .filter(
        row =>
          Array.isArray(row) &&
          row.length > 0
      )
      .map(row =>
        row.map(cell =>
          safePdfText(cell)
        )
      );

  if (
    normalizedRows.length === 0
  ) {
    return;
  }

  const columnCount =
    Math.max(
      ...normalizedRows.map(
        row => row.length
      )
    );

  if (
    columnCount < 1
  ) {
    return;
  }

  for (const row of normalizedRows) {
    while (
      row.length <
      columnCount
    ) {
      row.push("");
    }
  }

  const pageWidth =
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right;

  const columnWidth =
    pageWidth /
    columnCount;

  const cellPadding = 5;
  const fontSize = 8.5;
  const lineHeight = 11;

  let y =
    doc.y;

  for (
    let rowIndex = 0;
    rowIndex < normalizedRows.length;
    rowIndex++
  ) {
    const row =
      normalizedRows[rowIndex];

    const isHeader =
      rowIndex === 0;

    let maxLines = 1;

    for (const cell of row) {
      const font =
        chooseFont(
          cell,
          fonts
        );

      doc
        .font(font)
        .fontSize(fontSize);

      const availableWidth =
        Math.max(
          20,
          columnWidth -
          cellPadding * 2
        );

      const height =
        doc.heightOfString(
          cell || " ",
          {
            width:
              availableWidth,
            lineGap: 1
          }
        );

      const lines =
        Math.max(
          1,
          Math.ceil(
            height /
            lineHeight
          )
        );

      maxLines =
        Math.max(
          maxLines,
          lines
        );
    }

    const rowHeight =
      Math.max(
        24,
        maxLines *
          lineHeight +
          cellPadding * 2
      );

    if (
      y + rowHeight >
      doc.page.height -
      doc.page.margins.bottom
    ) {
      doc.addPage();

      y =
        doc.y;
    }

    for (
      let col = 0;
      col < columnCount;
      col++
    ) {
      const x =
        doc.page.margins.left +
        col * columnWidth;

      const cell =
        row[col] || "";

      if (isHeader) {
        doc
          .rect(
            x,
            y,
            columnWidth,
            rowHeight
          )
          .fill("#e9eef7");
      } else {
        doc
          .rect(
            x,
            y,
            columnWidth,
            rowHeight
          )
          .fill("#ffffff");
      }

      doc
        .rect(
          x,
          y,
          columnWidth,
          rowHeight
        )
        .lineWidth(0.5)
        .stroke("#cfd6df");

      doc
        .font(
          chooseFont(
            cell,
            fonts
          )
        )
        .fontSize(fontSize)
        .fillColor(
          isHeader
            ? "#172033"
            : "#303846"
        )
        .text(
          cell,
          x + cellPadding,
          y + cellPadding,
          {
            width:
              Math.max(
                20,
                columnWidth -
                cellPadding * 2
              ),
            height:
              rowHeight -
              cellPadding * 2,
            lineGap: 1
          }
        );
    }

    y += rowHeight;

    if (
      y >
      doc.page.height -
      doc.page.margins.bottom
    ) {
      doc.addPage();
      y =
        doc.y;
    }
  }

  doc.y =
    y + 12;
}

function addPageNumbers(doc) {
  const range =
    doc.bufferedPageRange();

  for (
    let i = 0;
    i < range.count;
    i++
  ) {
    doc.switchToPage(
      range.start + i
    );

    const pageNumber =
      i + 1;

    const totalPages =
      range.count;

    const footer =
      `SMATER CHAT AI  •  Page ${pageNumber} of ${totalPages}`;

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#777777")
      .text(
        footer,
        doc.page.margins.left,
        doc.page.height - 32,
        {
          width:
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right,
          align: "center"
        }
      );
  }
}

function sendFile(
  res,
  buffer,
  filename
) {
  if (
    !Buffer.isBuffer(buffer)
  ) {
    return res.status(500).json({
      error:
        "Generated file is invalid."
    });
  }

  const safeName =
    String(
      filename ||
      "smater-chat-ai.pdf"
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "-"
      )
      .slice(0, 120);

  res.status(200);

  res.setHeader(
    "Content-Type",
    getContentType(safeName)
  );

  res.setHeader(
    "Content-Length",
    String(buffer.length)
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}"`
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  return res.end(buffer);
}

function getContentType(
  filename
) {
  const lower =
    String(filename || "")
      .toLowerCase();

  if (
    lower.endsWith(".html") ||
    lower.endsWith(".htm")
  ) {
    return "text/html; charset=utf-8";
  }

  if (
    lower.endsWith(".txt")
  ) {
    return "text/plain; charset=utf-8";
  }

  return "application/pdf";
}
