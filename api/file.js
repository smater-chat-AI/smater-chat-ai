import PDFDocument from "pdfkit";

/* =========================================
   SMATER CHAT AI — PDF ENGINE
   PART 1 / FINAL BUILD
========================================= */

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/*
  Tiro Devanagari Hindi
  Regular TTF is used for Hindi text.

  We deliberately avoid the previous
  Noto Sans Devanagari font because the
  earlier PDF generation encountered a
  fontkit GPOS-anchor problem with it.
*/

const HINDI_FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/tirodevanagarihindi/TiroDevaHindi-Regular.ttf";

/* =========================================
   BASIC TEXT HELPERS
========================================= */

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function safeFileName(value) {
  const name =
    cleanText(value)
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        ""
      )
      .replace(/\s+/g, "-")
      .slice(0, 80);

  return (
    name ||
    "smater-chat-ai"
  );
}

/* =========================================
   LANGUAGE DETECTION
========================================= */

function detectLanguage(prompt) {
  const text =
    cleanText(prompt)
      .toLowerCase();

  const explicitlyBoth =
    (
      /\b(hindi\s*(and|&|\+)\s*english)\b/
        .test(text) ||
      /\b(english\s*(and|&|\+)\s*hindi)\b/
        .test(text) ||
      /हिंदी.*अंग्रेज़ी/
        .test(text) ||
      /अंग्रेज़ी.*हिंदी/
        .test(text)
    );

  if (explicitlyBoth) {
    return "both";
  }

  const explicitlyHindi =
    /\b(hindi|हिंदी|हिन्दी)\b/
      .test(text);

  if (explicitlyHindi) {
    return "hindi";
  }

  const explicitlyEnglish =
    /\benglish\b/
      .test(text);

  if (explicitlyEnglish) {
    return "english";
  }

  /*
    Hinglish / Roman Hindi alone
    remains English PDF.
  */

  return "english";
}

/* =========================================
   COLOUR REQUEST
========================================= */

function isColourfulRequest(prompt) {
  const text =
    cleanText(prompt)
      .toLowerCase();

  return (
    /\b(color|colour|colorful|colourful)\b/
      .test(text) &&
    (
      text.includes("pdf") ||
      text.includes("file") ||
      text.includes("document")
    )
  );
}

/* =========================================
   FORMAT REQUEST HELPERS
========================================= */

function wantsTable(prompt) {
  return /\b(table|tables|tabular)\b/i
    .test(cleanText(prompt));
}

function wantsBullets(prompt) {
  return /\b(bullet|bullets|bullet points)\b/i
    .test(cleanText(prompt));
}

function wantsNumbered(prompt) {
  return /\b(numbered|numbered points|steps|step[- ]by[- ]step)\b/i
    .test(cleanText(prompt));
}

function wantsSummary(prompt) {
  return /\b(summary|summarize|key takeaways|takeaways)\b/i
    .test(cleanText(prompt));
}

function wantsDetailed(prompt) {
  return /\b(detailed|detail|in depth|in-depth|deep)\b/i
    .test(cleanText(prompt));
}

function wantsShort(prompt) {
  return /\b(short|brief|concise|small)\b/i
    .test(cleanText(prompt));
}

/* =========================================
   PROMPT VALIDATION
========================================= */

function hasUsablePrompt(prompt) {
  const value =
    cleanText(prompt);

  if (!value) {
    return false;
  }

  return value.length >= 2;
}

/* =========================================
   MARKDOWN HELPERS
========================================= */

function isHeading(line) {
  return /^#{1,6}\s+/.test(
    cleanText(line)
  );
}

function isBullet(line) {
  return /^\s*[-*+]\s+/.test(
    cleanText(line)
  );
}

function isNumbered(line) {
  return /^\s*\d+[.)]\s+/.test(
    cleanText(line)
  );
}

function isTableLine(line) {
  const value =
    cleanText(line);

  return (
    value.includes("|") &&
    value.split("|").length >= 3
  );
}

function isTableSeparator(line) {
  const value =
    cleanText(line)
      .replace(/\|/g, "")
      .replace(/:/g, "")
      .replace(/-/g, "")
      .trim();

  return (
    value.length === 0 &&
    /-/.test(line)
  );
}

function cleanHeading(line) {
  return cleanText(line)
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

function cleanBullet(line) {
  return cleanText(line)
    .replace(/^\s*[-*+]\s+/, "")
    .trim();
}

function cleanNumbered(line) {
  return cleanText(line)
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseTableRow(line) {
  return cleanText(line)
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell =>
      stripMarkdown(cell)
        .trim()
    );
}

/* =========================================
   PAGE SETTINGS
========================================= */

const PAGE_MARGIN = {
  top: 55,
  bottom: 55,
  left: 55,
  right: 55
};

const COLORS = {
  text: "#222222",
  muted: "#666666",
  heading: "#173B57",
  accent: "#2E6F95",
  table: "#E9EEF2"
};
const __fontCache = {
  hindi: null
};

/* =========================================
   HINDI FONT LOADER
========================================= */

async function loadHindiFont() {
  if (__fontCache.hindi) {
    return __fontCache.hindi;
  }

  const response =
    await fetch(HINDI_FONT_URL);

  if (!response.ok) {
    throw new Error(
      `Hindi font download failed: ${response.status}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const fontBuffer =
    Buffer.from(arrayBuffer);

  if (
    !fontBuffer ||
    fontBuffer.length < 1000
  ) {
    throw new Error(
      "Hindi font file is invalid or empty."
    );
  }

  __fontCache.hindi =
    fontBuffer;

  return fontBuffer;
}

/* =========================================
   FONT REGISTRATION
========================================= */

async function registerDocumentFonts(
  doc,
  language
) {
  if (
    language === "hindi" ||
    language === "both"
  ) {
    const hindiFont =
      await loadHindiFont();

    doc.registerFont(
      "SMATER-Hindi",
      hindiFont
    );
  }
}

/* =========================================
   FONT SELECTION
========================================= */

function useRegularFont(
  doc,
  language,
  hasHindi = false
) {
  if (
    hasHindi &&
    (
      language === "hindi" ||
      language === "both"
    )
  ) {
    doc.font(
      "SMATER-Hindi"
    );
  } else {
    doc.font(
      "Helvetica"
    );
  }

  return doc;
}

function useBoldFont(
  doc,
  language,
  hasHindi = false
) {
  /*
    Helvetica-Bold is used for headings
    unless Hindi shaping is required.
  */

  if (
    hasHindi &&
    (
      language === "hindi" ||
      language === "both"
    )
  ) {
    doc.font(
      "SMATER-Hindi"
    );
  } else {
    doc.font(
      "Helvetica-Bold"
    );
  }

  return doc;
}

/* =========================================
   DEVANAGARI DETECTION
========================================= */

function containsHindi(text) {
  return /[\u0900-\u097F]/.test(
    String(text || "")
  );
}

/* =========================================
   MIXED LANGUAGE TEXT
========================================= */

function splitLanguageRuns(text) {
  const value =
    String(text || "");

  if (!value) {
    return [];
  }

  const runs = [];
  let current = "";
  let currentHindi = null;

  for (const char of value) {
    const hindi =
      /[\u0900-\u097F]/.test(char);

    if (
      currentHindi !== null &&
      hindi !== currentHindi
    ) {
      runs.push({
        text: current,
        hindi: currentHindi
      });

      current = "";
    }

    current += char;
    currentHindi = hindi;
  }

  if (current) {
    runs.push({
      text: current,
      hindi: currentHindi
    });
  }

  return runs;
}

/* =========================================
   SAFE TEXT WRITER
========================================= */

function writeMixedText(
  doc,
  text,
  language,
  options = {}
) {
  const value =
    String(text || "");

  if (!value) {
    return;
  }

  const runs =
    splitLanguageRuns(value);

  if (!runs.length) {
    return;
  }

  const startX =
    options.x ??
    doc.x;

  const startY =
    options.y ??
    doc.y;

  const width =
    options.width ??
    (
      doc.page.width -
      doc.page.margins.left -
      doc.page.margins.right
    );

  const fontSize =
    options.fontSize ??
    11;

  const lineGap =
    options.lineGap ??
    4;

  doc.fontSize(fontSize);

  let first = true;

  for (const run of runs) {
    if (!run.text) {
      continue;
    }

    if (
      run.hindi &&
      (
        language === "hindi" ||
        language === "both"
      )
    ) {
      doc.font(
        "SMATER-Hindi"
      );
    } else {
      doc.font(
        "Helvetica"
      );
    }

    doc.text(
      run.text,
      {
        ...(first
          ? {
              x: startX,
              y: startY
            }
          : {}),

        width,

        lineGap,

        continued:
          !(
            run ===
            runs[runs.length - 1]
          )
      }
    );

    first = false;
  }

  doc.x =
    startX;

  return doc.y;
}

/* =========================================
   PAGE SPACE CHECK
========================================= */

function ensureSpace(
  doc,
  requiredHeight
) {
  const bottomLimit =
    doc.page.height -
    doc.page.margins.bottom;

  if (
    doc.y +
      requiredHeight >
    bottomLimit
  ) {
    doc.addPage();
  }
}

/* =========================================
   PAGE NUMBER
========================================= */

function drawPageNumber(
  doc,
  pageNumber,
  totalPages
) {
  const oldY =
    doc.y;

  doc.font(
    "Helvetica"
  );

  doc.fontSize(8);

  doc.fillColor(
    COLORS.muted
  );

  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    doc.page.margins.left,
    doc.page.height - 32,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      align:
        "center",

      lineBreak:
        false
    }
  );

  doc.y =
    oldY;
}
/* =========================================
   TEXT WRITING HELPERS
========================================= */

function writeTitle(doc, text, language, colourful) {
  ensureSpace(doc, 70);

  const title =
    stripMarkdown(text);

  useBoldFont(
    doc,
    language,
    containsHindi(title)
  );

  doc.fontSize(22);

  doc.fillColor(
    colourful
      ? COLORS.accent
      : COLORS.heading
  );

  doc.text(
    title,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      align: "center",

      lineGap: 6,

      paragraphGap: 12
    }
  );

  doc.moveDown(0.5);

  doc.fillColor(
    COLORS.text
  );
}

function writeHeading(
  doc,
  text,
  level,
  language,
  colourful
) {
  ensureSpace(
    doc,
    level <= 2 ? 50 : 38
  );

  const heading =
    cleanHeading(text);

  useBoldFont(
    doc,
    language,
    containsHindi(heading)
  );

  const size =
    level === 1
      ? 17
      : level === 2
      ? 14
      : 12;

  doc.fontSize(size);

  doc.fillColor(
    colourful
      ? COLORS.accent
      : COLORS.heading
  );

  doc.text(
    heading,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      lineGap: 4,

      paragraphGap: 8
    }
  );

  doc.fillColor(
    COLORS.text
  );

  doc.moveDown(0.2);
}

function writeBullet(
  doc,
  text,
  language
) {
  const value =
    cleanBullet(text);

  ensureSpace(
    doc,
    30
  );

  useRegularFont(
    doc,
    language,
    containsHindi(value)
  );

  doc.fontSize(11);

  doc.fillColor(
    COLORS.text
  );

  const bulletX =
    doc.page.margins.left;

  const textX =
    bulletX + 14;

  doc.text(
    "•",
    bulletX,
    doc.y,
    {
      width: 10,
      lineBreak: false
    }
  );

  doc.text(
    value,
    textX,
    doc.y,
    {
      width:
        doc.page.width -
        textX -
        doc.page.margins.right,

      lineGap: 4,

      paragraphGap: 4
    }
  );
}

function writeNumbered(
  doc,
  text,
  number,
  language
) {
  const value =
    cleanNumbered(text);

  ensureSpace(
    doc,
    30
  );

  useRegularFont(
    doc,
    language,
    containsHindi(value)
  );

  doc.fontSize(11);

  doc.fillColor(
    COLORS.text
  );

  const numberX =
    doc.page.margins.left;

  const textX =
    numberX + 20;

  doc.text(
    `${number}.`,
    numberX,
    doc.y,
    {
      width: 16,
      lineBreak: false
    }
  );

  doc.text(
    value,
    textX,
    doc.y,
    {
      width:
        doc.page.width -
        textX -
        doc.page.margins.right,

      lineGap: 4,

      paragraphGap: 4
    }
  );
}

function writeParagraph(
  doc,
  text,
  language
) {
  const value =
    stripMarkdown(text);

  if (!value) {
    return;
  }

  ensureSpace(
    doc,
    32
  );

  useRegularFont(
    doc,
    language,
    containsHindi(value)
  );

  doc.fontSize(11);

  doc.fillColor(
    COLORS.text
  );

  doc.text(
    value,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      lineGap: 5,

      paragraphGap: 8,

      align: "left"
    }
  );
}

/* =========================================
   TABLE DRAWER
========================================= */

function drawTable(
  doc,
  rows,
  language,
  colourful
) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return;
  }

  const pageWidth =
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right;

  const columnCount =
    Math.max(
      ...rows.map(row =>
        Array.isArray(row)
          ? row.length
          : 0
      )
    );

  if (
    !columnCount ||
    columnCount < 2
  ) {
    return;
  }

  const colWidth =
    pageWidth /
    columnCount;

  for (
    let rowIndex = 0;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const row =
      Array.isArray(rows[rowIndex])
        ? rows[rowIndex]
        : [];

    const cells =
      Array.from(
        { length: columnCount },
        (_, index) =>
          stripMarkdown(
            row[index] || ""
          )
      );

    const cellHeight = Math.max(
      28,
      ...cells.map(cell => {
        useRegularFont(
          doc,
          language,
          containsHindi(cell)
        );

        doc.fontSize(
          rowIndex === 0
            ? 9
            : 9
        );

        return (
          doc.heightOfString(
            cell || " ",
            {
              width:
                colWidth - 10,

              lineGap: 2
            }
          ) + 12
        );
      })
    );

    ensureSpace(
      doc,
      cellHeight + 4
    );

    const y =
      doc.y;

    for (
      let column = 0;
      column < columnCount;
      column++
    ) {
      const x =
        doc.page.margins.left +
        column * colWidth;

      doc
        .rect(
          x,
          y,
          colWidth,
          cellHeight
        )
        .lineWidth(0.5)
        .stroke(
          colourful
            ? COLORS.accent
            : "#777777"
        );

      if (rowIndex === 0) {
        doc
          .rect(
            x,
            y,
            colWidth,
            cellHeight
          )
          .fillAndStroke(
            colourful
              ? COLORS.table
              : "#EEEEEE",
            colourful
              ? COLORS.accent
              : "#777777"
          );
      }

      const cell =
        cells[column];

      useBoldFont(
        doc,
        language,
        rowIndex === 0 &&
          containsHindi(cell)
      );

      if (rowIndex !== 0) {
        useRegularFont(
          doc,
          language,
          containsHindi(cell)
        );
      }

      doc.fontSize(9);

      doc.fillColor(
        COLORS.text
      );

      doc.text(
        cell || " ",
        x + 5,
        y + 6,
        {
          width:
            colWidth - 10,

          height:
            cellHeight - 10,

          lineGap: 2,

          align: "left"
        }
      );
    }

    doc.y =
      y + cellHeight;
  }

  doc.moveDown(0.8);
}

/* =========================================
   CONTENT RENDERER
========================================= */

function renderContent(
  doc,
  content,
  language,
  colourful
) {
  const lines =
    cleanText(content)
      .split("\n");

  let i = 0;

  while (
    i < lines.length
  ) {
    const line =
      cleanText(lines[i]);

    if (!line) {
      doc.moveDown(0.35);
      i++;
      continue;
    }

    /* TABLE */

    if (
      isTableLine(line) &&
      i + 1 < lines.length &&
      isTableSeparator(
        lines[i + 1]
      )
    ) {
      const tableRows = [];

      tableRows.push(
        parseTableRow(line)
      );

      i += 2;

      while (
        i < lines.length &&
        isTableLine(lines[i]) &&
        !isTableSeparator(lines[i])
      ) {
        tableRows.push(
          parseTableRow(
            lines[i]
          )
        );

        i++;
      }

      drawTable(
        doc,
        tableRows,
        language,
        colourful
      );

      continue;
    }

    /* HEADING */

    if (isHeading(line)) {
      const match =
        line.match(
          /^(#{1,6})\s+/
        );

      const level =
        match
          ? match[1].length
          : 2;

      writeHeading(
        doc,
        line,
        level,
        language,
        colourful
      );

      i++;
      continue;
    }

    /* BULLET */

    if (isBullet(line)) {
      writeBullet(
        doc,
        line,
        language
      );

      i++;
      continue;
    }

    /* NUMBERED */

    if (isNumbered(line)) {
      const match =
        line.match(
          /^\s*(\d+)[.)]\s+/
        );

      const number =
        match
          ? Number(match[1])
          : 1;

      writeNumbered(
        doc,
        line,
        number,
        language
      );

      i++;
      continue;
    }

    /* NORMAL PARAGRAPH */

    const paragraph = [line];

    i++;

    while (
      i < lines.length &&
      cleanText(lines[i]) &&
      !isHeading(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !isTableLine(lines[i])
    ) {
      paragraph.push(
        cleanText(lines[i])
      );

      i++;
    }

    writeParagraph(
      doc,
      paragraph.join(" "),
      language
    );
  }
}
/* =========================================
   PART 4 / 7
   AI CONTENT GENERATION
========================================= */

async function generateAIContent(prompt) {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  const language =
    detectLanguage(prompt);

  const instructions = [];

  if (wantsTable(prompt)) {
    instructions.push(
      "Use a useful Markdown table when the topic genuinely supports comparison or organized data."
    );
  }

  if (wantsBullets(prompt)) {
    instructions.push(
      "Use clear Markdown bullet points."
    );
  }

  if (wantsNumbered(prompt)) {
    instructions.push(
      "Use clear numbered points or steps."
    );
  }

  if (wantsSummary(prompt)) {
    instructions.push(
      "Include a clear Summary or Key Takeaways section."
    );
  }

  if (wantsDetailed(prompt)) {
    instructions.push(
      "Make the document detailed and well structured."
    );
  }

  if (wantsShort(prompt)) {
    instructions.push(
      "Keep the document short, concise and focused."
    );
  }

  let languageInstruction =
    "Write the document in English.";

  if (language === "hindi") {
    languageInstruction =
      "Write the document in Hindi using Devanagari script.";
  }

  if (language === "both") {
    languageInstruction =
      "Write the document in both English and Hindi. Keep the two languages clearly readable.";
  }

  const colourInstruction =
    isColourfulRequest(prompt)
      ? "The PDF will have professional color accents. Organize the content so headings and tables look good visually."
      : "Use a clean professional document structure.";

  const systemPrompt = `
You are the professional document-writing engine of SMATER CHAT AI.

Create polished, useful PDF content from the user's request.

LANGUAGE:
${languageInstruction}

IMPORTANT:
- English is the default.
- Roman Hindi / Hinglish alone does NOT mean a Hindi PDF.
- Explicit Hindi requests must use Devanagari Hindi.
- Explicit English + Hindi requests must contain both languages.
- Follow an explicitly requested language when possible.

DOCUMENT STRUCTURE:
- Create a meaningful title.
- Add a short introduction when appropriate.
- Use ## or ### headings for sections.
- Use paragraphs for explanations.
- Use bullet points for grouped information.
- Use numbered lists for steps or sequences.
- Use Markdown tables only when useful.
- Add Summary / Key Takeaways when requested or useful.
- Add a Conclusion when appropriate.
- Do not create unnecessary tables.

QUALITY:
- Do not simply repeat the user's command.
- Understand the topic and write useful, accurate content.
- Keep the writing professional and easy to read.
- Avoid unnecessary emojis and decorative symbols.

DESIGN:
${colourInstruction}

FORMAT:
${instructions.join("\n")}

Return ONLY the document content.
Do not mention APIs, models, OpenRouter, system prompts or internal instructions.
`;

  const response =
    await fetch(
      OPENROUTER_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,

          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app",

          "X-Title":
            "SMATER CHAT AI"
        },

        body: JSON.stringify({
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
                cleanText(prompt)
            }
          ],

          temperature: 0.35
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenRouter PDF error:",
      response.status,
      data
    );

    throw new Error(
      data?.error?.message ||
      "AI content generation failed."
    );
  }

  let content =
    data?.choices?.[0]?.message?.content;

  if (
    Array.isArray(content)
  ) {
    content =
      content
        .map(item =>
          typeof item === "string"
            ? item
            : item?.text || ""
        )
        .join("\n");
  }

  content =
    cleanText(content);

  if (!content) {
    throw new Error(
      "AI returned empty PDF content."
    );
  }

  return content;
}

/* =========================================
   PDF BUILDER
========================================= */

async function buildPdf({
  prompt,
  language,
  colourful
}) {
  const content =
    cleanText(prompt);

  if (!content) {
    throw new Error(
      "PDF content is empty."
    );
  }

  const doc =
    new PDFDocument({
      size: "A4",

      margins: PAGE_MARGIN,

      bufferPages: true,

      autoFirstPage: true,

      compress: true,

      info: {
        Title:
          "SMATER CHAT AI Document",

        Author:
          "SMATER CHAT AI",

        Creator:
          "SMATER CHAT AI"
      }
    });

  await registerDocumentFonts(
    doc,
    language
  );

  const chunks = [];

  const pdfPromise =
    new Promise(
      (resolve, reject) => {
        doc.on(
          "data",
          chunk =>
            chunks.push(chunk)
        );

        doc.on(
          "end",
          () => {
            try {
              resolve(
                Buffer.concat(chunks)
              );
            } catch (error) {
              reject(error);
            }
          }
        );

        doc.on(
          "error",
          reject
        );
      }
    );

  /* =======================================
     TITLE
  ======================================= */

  writeTitle(
    doc,
    "SMATER CHAT AI",
    language,
    colourful
  );

  /* =======================================
     CONTENT
  ======================================= */

  renderContent(
    doc,
    content,
    language,
    colourful
  );

  /* =======================================
     FOOTER
  ======================================= */

  ensureSpace(
    doc,
    40
  );

  doc.font(
    "Helvetica"
  );

  doc.fontSize(9);

  doc.fillColor(
    COLORS.muted
  );

  doc.text(
    "Prepared by: SMATER CHAT AI",
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      align: "center",

      lineGap: 3
    }
  );

  /* =======================================
     PAGE NUMBERS
  ======================================= */

  const pageRange =
    doc.bufferedPageRange();

  const totalPages =
    pageRange.count;

  for (
    let index = 0;
    index < totalPages;
    index++
  ) {
    doc.switchToPage(
      pageRange.start + index
    );

    drawPageNumber(
      doc,
      index + 1,
      totalPages
    );
  }

  doc.end();

  return await pdfPromise;
}
/* =========================================
   PART 5 / 7
   REQUEST + RESPONSE HELPERS
========================================= */

function getPromptFromRequest(req) {
  const body = req?.body;

  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return cleanText(body);
  }

  if (typeof body.prompt === "string") {
    return cleanText(body.prompt);
  }

  if (typeof body.content === "string") {
    return cleanText(body.content);
  }

  if (typeof body.message === "string") {
    return cleanText(body.message);
  }

  return "";
}

/* =========================================
   FILE NAME
========================================= */

function createPdfFileName(
  prompt,
  language
) {
  let topic =
    cleanText(prompt)
      .replace(
        /(?:please\s*)?(?:make|create|generate|prepare|write)\s+(?:a\s+)?(?:pdf|file|document)\s*(?:on|about|for|regarding)?/i,
        ""
      )
      .trim();

  topic =
    stripMarkdown(topic);

  if (!topic) {
    topic =
      language === "hindi"
        ? "Hindi-Document"
        : language === "both"
        ? "English-Hindi-Document"
        : "Document";
  }

  return `${safeFileName(topic)}.pdf`;
}

/* =========================================
   CONTENT NORMALIZATION
========================================= */

function normalizeAIContent(
  content
) {
  let value =
    cleanText(content);

  /*
    Remove accidental code fences
    if the model returns them.
  */

  value =
    value
      .replace(/^```(?:markdown|md|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

  return value;
}

/* =========================================
   CONTENT SAFETY CHECK
========================================= */

function validateGeneratedContent(
  content
) {
  const value =
    cleanText(content);

  if (!value) {
    throw new Error(
      "Generated PDF content is empty."
    );
  }

  /*
    Prevent an accidental API/system
    response from becoming the PDF.
  */

  const lower =
    value.toLowerCase();

  const unwanted =
    [
      "openrouter api key",
      "system prompt",
      "internal instruction",
      "api secret"
    ];

  if (
    unwanted.some(
      item =>
        lower.includes(item)
    )
  ) {
    throw new Error(
      "Generated content failed validation."
    );
  }

  return value;
}

/* =========================================
   AI CONTENT PIPELINE
========================================= */

async function preparePdfContent(
  prompt
) {
  if (
    !hasUsablePrompt(prompt)
  ) {
    throw new Error(
      "Please provide a topic or content for the PDF."
    );
  }

  const generated =
    await generateAIContent(
      prompt
    );

  const normalized =
    normalizeAIContent(
      generated
    );

  return validateGeneratedContent(
    normalized
  );
}

/* =========================================
   HTTP RESPONSE HELPERS
========================================= */

function sendJson(
  res,
  statusCode,
  payload
) {
  res.statusCode =
    statusCode;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.end(
    JSON.stringify(payload)
  );
}

function sendPdf(
  res,
  pdfBuffer,
  fileName
) {
  res.statusCode =
    200;

  res.setHeader(
    "Content-Type",
    "application/pdf"
  );

res.setHeader(
  "Content-Disposition",
  'attachment; filename="smater-chat-ai.pdf"'
);

  res.setHeader(
    "Content-Length",
    String(pdfBuffer.length)
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.end(
    pdfBuffer
  );
}
/* =========================================
   PART 6 / 7
   PDF REQUEST PROCESSOR
========================================= */

async function processPdfRequest(
  req,
  res
) {
  try {
    const prompt =
      getPromptFromRequest(req);

    if (
      !hasUsablePrompt(prompt)
    ) {
      return sendJson(
        res,
        400,
        {
          success: false,
          error:
            "Please provide a topic or content for the PDF."
        }
      );
    }

    const language =
      detectLanguage(prompt);

    const colourful =
      isColourfulRequest(
        prompt
      );

    /* =====================================
       AI CONTENT
    ===================================== */

    const aiContent =
      await preparePdfContent(
        prompt
      );

    /* =====================================
       BUILD PDF
    ===================================== */

    const pdfBuffer =
      await buildPdf({
        prompt: aiContent,
        language,
        colourful
      });

    if (
      !pdfBuffer ||
      !Buffer.isBuffer(pdfBuffer) ||
      pdfBuffer.length === 0
    ) {
      throw new Error(
        "PDF generation returned an empty file."
      );
    }

    /* =====================================
       FILE NAME
    ===================================== */

    const fileName =
      createPdfFileName(
        prompt,
        language
      );

    /* =====================================
       SEND PDF
    ===================================== */

    return sendPdf(
      res,
      pdfBuffer,
      fileName
    );

  } catch (error) {
    console.error(
      "SMATER CHAT AI PDF error:",
      error
    );

    return sendJson(
      res,
      500,
      {
        success: false,
        error:
          error?.message ||
          "I couldn't create that file right now. Please try again."
      }
    );
  }
}
/* =========================================
   PART 7 / 7
   VERCEL SERVERLESS HANDLER
========================================= */

export default async function handler(
  req,
  res
) {
  /*
    Only POST requests are accepted.
  */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return sendJson(
      res,
      405,
      {
        success: false,
        error:
          "Method not allowed. Use POST."
      }
    );
  }

  /*
    Generate and return the PDF.
  */

  return processPdfRequest(
    req,
    res
  );
}
