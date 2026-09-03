import PDFDocument from "pdfkit";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const HINDI_REGULAR_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf";

const HINDI_BOLD_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf";

/* =========================================
   BASIC HELPERS
========================================= */

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function safeFileName(value) {
  const name = cleanText(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return name || "smater-chat-ai";
}

/* =========================================
   LANGUAGE
========================================= */

function detectLanguage(prompt) {
  const text = cleanText(prompt).toLowerCase();

  const explicitlyHindi =
    /\b(hindi|हिंदी|हिन्दी)\b/.test(text);

  const explicitlyEnglish =
    /\b(english)\b/.test(text);

  const explicitlyBoth =
    (
      /\b(hindi\s*(and|&|\+)\s*english)\b/.test(text) ||
      /\b(english\s*(and|&|\+)\s*hindi)\b/.test(text) ||
      /हिंदी.*अंग्रेज़ी|अंग्रेज़ी.*हिंदी/.test(text)
    );

  if (explicitlyBoth) {
    return "both";
  }

  if (explicitlyHindi) {
    return "hindi";
  }

  if (explicitlyEnglish) {
    return "english";
  }

  /*
    Important:
    Hinglish/Roman Hindi without an explicit
    language request still produces an English PDF.
  */

  return "english";
}

/* =========================================
   COLOUR
========================================= */

function isColourfulRequest(prompt) {
  const text = cleanText(prompt).toLowerCase();

  return (
    /\b(colou?rful|colour|color|colou?r)\b/.test(text) &&
    (
      text.includes("pdf") ||
      text.includes("file") ||
      text.includes("document")
    )
  );
}

/* =========================================
   HINDI FONT
========================================= */

async function downloadFont(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Hindi font download failed: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error("Hindi font file is empty");
  }

  return buffer;
}

async function loadHindiFonts() {
  const [regular, bold] = await Promise.all([
    downloadFont(HINDI_REGULAR_URL),
    downloadFont(HINDI_BOLD_URL)
  ]);

  return {
    regular,
    bold
  };
}

/* =========================================
   HINDI DETECTION
========================================= */

function containsHindi(text) {
  return /[\u0900-\u097F]/.test(String(text || ""));
}

/* =========================================
   MIXED LANGUAGE RUNS
========================================= */

function splitLanguageRuns(text) {
  const value = String(text || "");

  if (!value) {
    return [];
  }

  const runs = [];

  let current = "";
  let currentHindi = containsHindi(value[0]);

  for (const char of value) {
    const isHindi = containsHindi(char);

    if (
      current &&
      isHindi !== currentHindi
    ) {
      runs.push({
        text: current,
        hindi: currentHindi
      });

      current = "";
    }

    current += char;
    currentHindi = isHindi;
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
   MARKDOWN HELPERS
========================================= */

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

function isHeading(line) {
  return /^#{1,6}\s+/.test(line);
}

function isBullet(line) {
  return /^\s*[-*+]\s+/.test(line);
}

function isNumbered(line) {
  return /^\s*\d+[.)]\s+/.test(line);
}

function cleanHeading(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

function cleanBullet(line) {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .trim();
}

function cleanNumbered(line) {
  return line
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
    }
/* =========================================
   PDF FONT REGISTRATION
========================================= */

function registerFonts(doc, hindiFonts) {
  /*
    English:
    PDFKit's built-in Helvetica is used directly.
    We intentionally do NOT register WOFF/WOFF2 fonts.
  */

  if (hindiFonts) {
    doc.registerFont(
      "SMATER_HI",
      hindiFonts.regular
    );

    doc.registerFont(
      "SMATER_HI_BOLD",
      hindiFonts.bold
    );
  }
}

/* =========================================
   FONT SELECTION
========================================= */

function setRegularFont(doc, language) {
  if (language === "hindi" || language === "both") {
    doc.font("SMATER_HI");
    return;
  }

  doc.font("Helvetica");
}

function setBoldFont(doc, language) {
  if (language === "hindi" || language === "both") {
    doc.font("SMATER_HI_BOLD");
    return;
  }

  doc.font("Helvetica-Bold");
}

/* =========================================
   SAFE PAGE BREAK
========================================= */

function ensureSpace(doc, needed = 40) {
  const bottomLimit =
    doc.page.height -
    doc.page.margins.bottom;

  if (
    doc.y + needed >
    bottomLimit
  ) {
    /*
      IMPORTANT:
      Only ONE direct addPage().
      No continueOnNewPage().
      No recursive page creation.
    */

    doc.addPage();
    return true;
  }

  return false;
}

/* =========================================
   MIXED TEXT WRITER
========================================= */

function writeMixedText(
  doc,
  text,
  options = {}
) {
  const value = String(text || "");

  if (!value) {
    return;
  }

  const language =
    options.language || "english";

  const fontSize =
    options.fontSize || 11;

  const lineGap =
    options.lineGap ?? 4;

  const width =
    options.width ||
    (
      doc.page.width -
      doc.page.margins.left -
      doc.page.margins.right
    );

  const continued =
    options.continued === true;

  doc.fontSize(fontSize);

  if (language === "both") {
    const runs =
      splitLanguageRuns(value);

    if (!runs.length) {
      doc.font("Helvetica");
      doc.text(
        value,
        {
          width,
          lineGap,
          continued
        }
      );
      return;
    }

    runs.forEach(
      (run, index) => {
        if (run.hindi) {
          doc.font("SMATER_HI");
        } else {
          doc.font("Helvetica");
        }

        doc.text(
          run.text,
          {
            width,
            lineGap,
            continued:
              index < runs.length - 1
          }
        );
      }
    );

    if (continued) {
      return;
    }

    return;
  }

  if (language === "hindi") {
    doc.font("SMATER_HI");
  } else {
    doc.font("Helvetica");
  }

  doc.text(
    value,
    {
      width,
      lineGap,
      continued
    }
  );
}

/* =========================================
   PAGE NUMBER
========================================= */

function drawPageNumber(doc, language) {
  const pageNumber =
    doc.bufferedPageRange().count;

  const text =
    `Page ${pageNumber}`;

  const oldX = doc.x;
  const oldY = doc.y;

  doc.font(
    language === "hindi" || language === "both"
      ? "SMATER_HI"
      : "Helvetica"
  );

  doc.fontSize(8);

  doc.text(
    text,
    doc.page.margins.left,
    doc.page.height - 30,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,
      align: "center",
      lineBreak: false
    }
  );

  doc.x = oldX;
  doc.y = oldY;
}

/* =========================================
   TITLE
========================================= */

function writeTitle(
  doc,
  text,
  language
) {
  ensureSpace(doc, 70);

  setBoldFont(doc, language);

  doc.fontSize(20);

  doc.text(
    stripMarkdown(text),
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,
      align: "center",
      lineGap: 5
    }
  );

  doc.moveDown(0.7);
}

/* =========================================
   HEADING
========================================= */

function writeHeading(
  doc,
  text,
  language
) {
  ensureSpace(doc, 50);

  setBoldFont(doc, language);

  doc.fontSize(14);

  doc.text(
    cleanHeading(text),
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,
      lineGap: 4
    }
  );

  doc.moveDown(0.35);
}

/* =========================================
   BULLET
========================================= */

function writeBullet(
  doc,
  text,
  language
) {
  ensureSpace(doc, 35);

  setRegularFont(doc, language);

  doc.fontSize(11);

  doc.text(
    `• ${cleanBullet(text)}`,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right -
        8,
      indent: 8,
      hanging: 8,
      lineGap: 4
    }
  );

  doc.moveDown(0.15);
}

/* =========================================
   NUMBERED ITEM
========================================= */

function writeNumbered(
  doc,
  number,
  text,
  language
) {
  ensureSpace(doc, 35);

  setRegularFont(doc, language);

  doc.fontSize(11);

  doc.text(
    `${number}. ${cleanNumbered(text)}`,
    {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right -
        8,
      indent: 8,
      hanging: 8,
      lineGap: 4
    }
  );

  doc.moveDown(0.15);
}

/* =========================================
   PARAGRAPH
========================================= */

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

  ensureSpace(doc, 40);

  setRegularFont(doc, language);

  doc.fontSize(11);

  writeMixedText(
    doc,
    value,
    {
      language,
      fontSize: 11,
      lineGap: 4
    }
  );

  doc.moveDown(0.45);
}
/* =========================================
   AI CONTENT GENERATION
========================================= */

async function generateAIContent(prompt) {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

  const response = await fetch(
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

      body: JSON.stringify({
        model: "openrouter/free",

        messages: [
          {
            role: "system",

            content: `
You are SMATER CHAT AI.

Create clean, useful document content
for a PDF.

IMPORTANT LANGUAGE RULE:
- Default language is English.
- If the user explicitly asks for Hindi,
  write in Hindi.
- If the user explicitly asks for English,
  write in English.
- If the user explicitly asks for Hindi
  and English together, write both.
- Hinglish/Roman Hindi alone does NOT mean
  Hindi PDF. Keep the PDF in English.

IMPORTANT FORMAT RULE:
Return document content only.
Do not add explanations about these instructions.
Do not add internal metadata.
Do not add safety labels.

Use clear headings, paragraphs,
bullet points and numbered lists
when useful.

Do not use unnecessary emojis.
Do not use decorative characters
that may break PDF rendering.
`
          },

          {
            role: "user",

            content:
              cleanText(prompt)
          }
        ],

        temperature: 0.4
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenRouter PDF content error:",
      response.status,
      data
    );

    throw new Error(
      data?.error?.message ||
      "AI content generation failed"
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
      "AI returned empty PDF content"
    );
  }

  return content;
}

/* =========================================
   PDF CONTENT RENDERING
========================================= */

function renderContent(
  doc,
  content,
  language
) {
  const lines =
    String(content || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n");

  let numberedCounter = 0;

  for (const rawLine of lines) {
    const line =
      rawLine.trim();

    if (!line) {
      doc.moveDown(0.3);
      continue;
    }

    /*
      Heading
    */

    if (isHeading(line)) {
      numberedCounter = 0;

      writeHeading(
        doc,
        line,
        language
      );

      continue;
    }

    /*
      Bullet
    */

    if (isBullet(line)) {
      numberedCounter = 0;

      writeBullet(
        doc,
        line,
        language
      );

      continue;
    }

    /*
      Numbered list
    */

    if (isNumbered(line)) {
      numberedCounter += 1;

      writeNumbered(
        doc,
        numberedCounter,
        line,
        language
      );

      continue;
    }

    /*
      Normal paragraph
    */

    numberedCounter = 0;

    writeParagraph(
      doc,
      line,
      language
    );
  }
}

/* =========================================
   PDF CREATION
========================================= */

async function buildPdf({
  prompt,
  language,
  colourful
}) {
  let hindiFonts = null;

  /*
    Hindi font is downloaded ONLY when
    Hindi output is actually required.
  */

  if (
    language === "hindi" ||
    language === "both"
  ) {
    hindiFonts =
      await loadHindiFonts();
  }

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

      bufferPages: true,

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

  /*
    Register ONLY the actual Hindi TTF.
    English uses PDFKit's built-in Helvetica.
  */

  registerFonts(
    doc,
    hindiFonts
  );

  const chunks = [];

  const pdfPromise =
    new Promise(
      (resolve, reject) => {

        doc.on(
          "data",
          chunk => {
            chunks.push(chunk);
          }
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
          error => {
            reject(error);
          }
        );
      }
    );

  /*
    Default PDF appearance:
    simple black/white.

    Colour is used only when the user
    explicitly requested a colourful PDF.
  */

  if (colourful) {
    doc.fillColor("#222222");
  } else {
    doc.fillColor("#000000");
  }

  /*
    Main title
  */

  writeTitle(
    doc,
    "SMATER CHAT AI",
    language
  );

  /*
    Document content
  */

  renderContent(
    doc,
    contentForPdf(prompt, language),
    language
  );

  /*
    Prepared by
  */

  ensureSpace(doc, 45);

  setRegularFont(
    doc,
    language
  );

  doc.fontSize(9);

  doc.fillColor(
    colourful
      ? "#555555"
      : "#000000"
  );

  doc.text(
    "Prepared by: SMATER CHAT AI",
    {
      align: "center",

      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right,

      lineGap: 3
    }
  );

  /*
    Page numbers are written AFTER all
    content has been created.

    This is deliberately NOT done through
    pageAdded / addPage / continueOnNewPage.

    Therefore there is no recursive page
    creation.
  */

  const range =
    doc.bufferedPageRange();

  for (
    let i = range.start;
    i < range.start + range.count;
    i++
  ) {
    doc.switchToPage(i);

    drawPageNumber(
      doc,
      language
    );
  }

  /*
    Return to the final page before ending.
  */

  if (range.count > 0) {
    doc.switchToPage(
      range.start + range.count - 1
    );
  }

  doc.end();

  return await pdfPromise;
}

/* =========================================
   PDF CONTENT PREPARATION
========================================= */

function contentForPdf(
  prompt,
  language
) {
  /*
    This function is intentionally simple.
    The AI-generated document content is
    supplied by the handler later.

    It is kept separate so rendering logic
    stays predictable.
  */

  return cleanText(prompt);
}
/* =========================================
   API HANDLER
========================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    console.log(
      "SMATER CHAT AI: PDF request"
    );

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const prompt =
      cleanText(
        body.prompt ||
        body.description ||
        body.text ||
        ""
      );

    if (!prompt) {
      return res.status(400).json({
        error:
          "Please enter a description for the PDF."
      });
    }

    const language =
      detectLanguage(prompt);

    const colourful =
      isColourfulRequest(prompt);

    console.log(
      "SMATER CHAT AI PDF settings:",
      {
        language,
        colourful
      }
    );

    /* =======================================
       GENERATE ACTUAL AI DOCUMENT CONTENT
    ======================================= */

    const aiContent =
      await generateAIContent(
        prompt
      );

    if (!aiContent) {
      throw new Error(
        "AI did not generate document content."
      );
    }

    /* =======================================
       BUILD PDF
       
       IMPORTANT:
       buildPdf() receives the generated
       content as its prompt value.
    ======================================= */

    const pdfBuffer =
      await buildPdf({
        prompt: aiContent,
        language,
        colourful
      });

    if (
      !pdfBuffer ||
      !pdfBuffer.length
    ) {
      throw new Error(
        "PDF buffer is empty."
      );
    }

    /* =======================================
       FILE NAME
    ======================================= */

    const firstLine =
      cleanText(aiContent)
        .split("\n")
        .find(Boolean) ||
      "SMATER CHAT AI";

    const baseName =
      safeFileName(
        firstLine
          .replace(/^#+\s*/, "")
          .slice(0, 60)
      );

    const fileName =
      `${baseName}.pdf`;

    /* =======================================
       BASE64
    ======================================= */

    const base64 =
      pdfBuffer.toString("base64");

    /* =======================================
       FINAL RESPONSE
       
       Keep all common field names so the
       existing frontend can continue to work.
    ======================================= */

    return res.status(200).json({
      ok: true,

      success: true,

      fileName,

      fileType:
        "application/pdf",

      mimeType:
        "application/pdf",

      data:
        base64,

      base64:
        base64
    });

  } catch (error) {

    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      ok: false,

      success: false,

      error:
        "I couldn't create that file right now. Please try again."
    });
  }
}
