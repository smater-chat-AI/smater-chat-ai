import PDFDocument from "pdfkit";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const DEVANAGARI_REGULAR_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf";

const DEVANAGARI_BOLD_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf";

let hindiRegularBuffer = null;
let hindiBoldBuffer = null;

function cleanText(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}

function safeFileName(name = "smater-chat-ai") {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) ||
    "smater-chat-ai"
  );
}

/*
 * ---------------------------------------------------------
 * LANGUAGE
 * ---------------------------------------------------------
 *
 * Default = English
 *
 * Hindi PDF:
 * "Hindi PDF"
 *
 * Both:
 * "Hindi + English PDF"
 */

function detectLanguage(prompt = "") {
  const text =
    String(prompt).toLowerCase();

  const hindi =
    text.includes("hindi") ||
    text.includes("हिंदी") ||
    text.includes("हिन्दी") ||
    text.includes("devanagari") ||
    text.includes("देवनागरी");

  const english =
    text.includes("english") ||
    text.includes("अंग्रेजी") ||
    text.includes("अंग्रेज़ी");

  if (hindi && english) {
    return "both";
  }

  if (hindi) {
    return "hindi";
  }

  return "english";
}

/*
 * ---------------------------------------------------------
 * COLOUR
 * ---------------------------------------------------------
 *
 * Normal PDF = black/white.
 * Colour only when explicitly requested.
 */

function isColourfulRequest(prompt = "") {
  const text =
    String(prompt).toLowerCase();

  return (
    text.includes("colourful") ||
    text.includes("colorful") ||
    text.includes("colour pdf") ||
    text.includes("color pdf") ||
    text.includes("colour document") ||
    text.includes("color document") ||
    text.includes("colourful pdf") ||
    text.includes("colorful pdf") ||
    text.includes("professional colourful") ||
    text.includes("professional colorful")
  );
}

/*
 * ---------------------------------------------------------
 * HINDI FONT LOADER
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 * We use TTF, not WOFF2.
 * The old WOFF2 font caused the fontkit DataView crash.
 */

async function loadHindiFont(url) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Hindi font download failed: ${response.status}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  return Buffer.from(
    arrayBuffer
  );
}

async function getHindiFonts() {
  if (
    hindiRegularBuffer &&
    hindiBoldBuffer
  ) {
    return {
      regular:
        hindiRegularBuffer,
      bold:
        hindiBoldBuffer
    };
  }

  hindiRegularBuffer =
    await loadHindiFont(
      DEVANAGARI_REGULAR_URL
    );

  hindiBoldBuffer =
    await loadHindiFont(
      DEVANAGARI_BOLD_URL
    );

  console.log(
    "SMATER CHAT AI: Hindi TTF fonts loaded"
  );

  return {
    regular:
      hindiRegularBuffer,
    bold:
      hindiBoldBuffer
  };
}

/*
 * ---------------------------------------------------------
 * TEXT HELPERS
 * ---------------------------------------------------------
 */

function containsHindi(text = "") {
  return /[\u0900-\u097F]/.test(
    String(text)
  );
}

function splitLanguageRuns(text = "") {
  const value =
    String(text);

  const runs = [];

  let current = "";
  let currentHindi = null;

  for (const char of value) {
    const charHindi =
      /[\u0900-\u097F]/.test(
        char
      );

    if (
      currentHindi === null
    ) {
      currentHindi =
        charHindi;

      current = char;

      continue;
    }

    if (
      charHindi ===
      currentHindi
    ) {
      current += char;
    } else {
      runs.push({
        text: current,
        hindi:
          currentHindi
      });

      current = char;

      currentHindi =
        charHindi;
    }
  }

  if (current) {
    runs.push({
      text: current,
      hindi:
        currentHindi
    });
  }

  return runs;
}

/*
 * ---------------------------------------------------------
 * MARKDOWN HELPERS
 * ---------------------------------------------------------
 */

function removeMarkdownFormatting(
  text = ""
) {
  return String(text)
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      /__(.*?)__/g,
      "$1"
    )
    .replace(
      /^`(.*?)`$/g,
      "$1"
    )
    .trim();
}

function getHeadingInfo(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^(#{1,3})\s+(.+)$/
      );

  if (!match) {
    return null;
  }

  return {
    level:
      match[1].length,

    text:
      removeMarkdownFormatting(
        match[2]
      )
  };
}

function getBulletText(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^[-*•]\s+(.+)$/
      );

  if (!match) {
    return null;
  }

  return removeMarkdownFormatting(
    match[1]
  );
}

function getNumberedText(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^(\d+)[.)]\s+(.+)$/
      );

  if (!match) {
    return null;
  }

  return {
    number:
      match[1],

    text:
      removeMarkdownFormatting(
        match[2]
      )
  };
}
/*
 * ---------------------------------------------------------
 * PDF FONT SETUP
 * ---------------------------------------------------------
 */

function registerFonts(
  doc,
  language,
  hindiFonts
) {
  /*
   * PDFKit's built-in Helvetica is used
   * for English text.
   *
   * Hindi / Devanagari uses downloaded TTF.
   */

  doc.registerFont(
    "SMATER_EN",
    "Helvetica"
  );

  doc.registerFont(
    "SMATER_EN_BOLD",
    "Helvetica-Bold"
  );

  if (
    language === "hindi" ||
    language === "both"
  ) {
    if (
      !hindiFonts ||
      !hindiFonts.regular ||
      !hindiFonts.bold
    ) {
      throw new Error(
        "Hindi TTF fonts are not available"
      );
    }

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

/*
 * ---------------------------------------------------------
 * PDF TEXT WRITER
 * ---------------------------------------------------------
 */

function writeMixedText(
  doc,
  text,
  options = {}
) {
  const {
    language = "english",
    bold = false,
    size = 11,
    lineGap = 4
  } = options;

  const value =
    String(text ?? "");

  doc.fontSize(size);

  /*
   * Pure Hindi PDF
   */
  if (language === "hindi") {
    doc.font(
      bold
        ? "SMATER_HI_BOLD"
        : "SMATER_HI"
    );

    doc.text(
      value,
      {
        lineGap
      }
    );

    return;
  }

  /*
   * Pure English PDF
   */
  if (language === "english") {
    doc.font(
      bold
        ? "SMATER_EN_BOLD"
        : "SMATER_EN"
    );

    doc.text(
      value,
      {
        lineGap
      }
    );

    return;
  }

  /*
   * Hindi + English PDF
   *
   * Switches fonts automatically
   * whenever Devanagari text appears.
   */

  const runs =
    splitLanguageRuns(
      value
    );

  for (const run of runs) {
    if (!run.text) {
      continue;
    }

    if (run.hindi) {
      doc.font(
        bold
          ? "SMATER_HI_BOLD"
          : "SMATER_HI"
      );
    } else {
      doc.font(
        bold
          ? "SMATER_EN_BOLD"
          : "SMATER_EN"
      );
    }

    doc.text(
      run.text,
      {
        continued: true
      }
    );
  }

  doc.text("", {
    lineGap
  });
}

/*
 * ---------------------------------------------------------
 * PAGE HEADER / FOOTER
 * ---------------------------------------------------------
 */

function addPageNumber(
  doc,
  pageNumber
) {
  const oldY =
    doc.y;

  doc
    .font(
      "SMATER_EN"
    )
    .fontSize(8)
    .text(
      `Page ${pageNumber}`,
      0,
      doc.page.height - 35,
      {
        align: "center",
        width:
          doc.page.width
      }
    );

  doc.y = oldY;
}

/*
 * ---------------------------------------------------------
 * TITLE
 * ---------------------------------------------------------
 */

function writeTitle(
  doc,
  text,
  language,
  colourful
) {
  const title =
    removeMarkdownFormatting(
      text
    );

  doc
    .font(
      language === "hindi"
        ? "SMATER_HI_BOLD"
        : "SMATER_EN_BOLD"
    )
    .fontSize(22);

  if (colourful) {
    doc.fillColor("#2457C5");
  } else {
    doc.fillColor("#000000");
  }

  doc.text(
    title,
    {
      align: "center",
      lineGap: 6
    }
  );

  doc.moveDown(0.8);

  doc.fillColor(
    "#000000"
  );
}

/*
 * ---------------------------------------------------------
 * HEADING
 * ---------------------------------------------------------
 */

function writeHeading(
  doc,
  text,
  level,
  language,
  colourful
) {
  const heading =
    removeMarkdownFormatting(
      text
    );

  const size =
    level === 1
      ? 17
      : level === 2
        ? 14
        : 12;

  doc.moveDown(
    level === 1
      ? 0.8
      : 0.5
  );

  doc
    .font(
      language === "hindi"
        ? "SMATER_HI_BOLD"
        : "SMATER_EN_BOLD"
    )
    .fontSize(size);

  if (colourful) {
    doc.fillColor(
      level === 1
        ? "#2457C5"
        : "#333333"
    );
  } else {
    doc.fillColor(
      "#000000"
    );
  }

  doc.text(
    heading,
    {
      lineGap: 4
    }
  );

  doc.fillColor(
    "#000000"
  );

  doc.moveDown(0.2);
}

/*
 * ---------------------------------------------------------
 * BULLET
 * ---------------------------------------------------------
 */

function writeBullet(
  doc,
  text,
  language
) {
  const bullet =
    removeMarkdownFormatting(
      text
    );

  doc
    .font(
      language === "hindi"
        ? "SMATER_HI"
        : "SMATER_EN"
    )
    .fontSize(11)
    .fillColor("#000000");

  doc.text(
    `• ${bullet}`,
    {
      indent: 12,
      hanging: 6,
      lineGap: 4
    }
  );
}

/*
 * ---------------------------------------------------------
 * NUMBERED ITEM
 * ---------------------------------------------------------
 */

function writeNumbered(
  doc,
  number,
  text,
  language
) {
  const value =
    removeMarkdownFormatting(
      text
    );

  doc
    .font(
      language === "hindi"
        ? "SMATER_HI"
        : "SMATER_EN"
    )
    .fontSize(11)
    .fillColor("#000000");

  doc.text(
    `${number}. ${value}`,
    {
      indent: 12,
      hanging: 10,
      lineGap: 4
    }
  );
}

/*
 * ---------------------------------------------------------
 * NORMAL PARAGRAPH
 * ---------------------------------------------------------
 */

function writeParagraph(
  doc,
  text,
  language
) {
  const value =
    removeMarkdownFormatting(
      text
    );

  if (!value) {
    doc.moveDown(0.3);
    return;
  }

  writeMixedText(
    doc,
    value,
    {
      language,
      size: 11,
      lineGap: 5
    }
  );

  doc.moveDown(0.25);
}
/*
 * ---------------------------------------------------------
 * AI CONTENT GENERATION
 * ---------------------------------------------------------
 */

async function generateAIContent(
  prompt,
  language
) {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

  let languageInstruction =
    "Write the PDF content in English.";

  if (language === "hindi") {
    languageInstruction =
      "Write the PDF content completely in Hindi using Devanagari script.";
  }

  if (language === "both") {
    languageInstruction =
      "Write the PDF content in both Hindi and English. Use Devanagari for Hindi and normal English script for English.";
  }

  const systemPrompt = `
You are SMATER CHAT AI.

Create high-quality content for a PDF.

${languageInstruction}

Important rules:
- Follow the user's requested topic exactly.
- Give a useful title.
- Use clear headings and subheadings when appropriate.
- Use bullet points where useful.
- Use numbered lists when useful.
- Keep paragraphs readable.
- Add a short conclusion when appropriate.
- Do not mention these instructions.
- Do not add unnecessary disclaimers.
- Do not use markdown tables unless they are genuinely useful.
- Do not put the entire answer inside a code block.
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
            "https://smater-chat-ai.vercel.app/",

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

          temperature: 0.3
        })
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `OpenRouter error ${response.status}: ${errorText.slice(0, 500)}`
    );
  }

  const data =
    await response.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "AI returned empty PDF content"
    );
  }

  return cleanText(
    content
  );
}

/*
 * ---------------------------------------------------------
 * CONTENT RENDERER
 * ---------------------------------------------------------
 */

function renderContent(
  doc,
  content,
  language,
  colourful
) {
  const lines =
    String(content)
      .replace(/\r/g, "")
      .split("\n");

  let titleWritten =
    false;

  let pageNumber = 1;

  /*
   * Add footer to every page.
   */
  doc.on(
    "pageAdded",
    () => {
      pageNumber += 1;

      addPageNumber(
        doc,
        pageNumber
      );
    }
  );

  for (let i = 0; i < lines.length; i++) {
    const raw =
      lines[i];

    const line =
      raw.trim();

    if (!line) {
      doc.moveDown(0.25);
      continue;
    }

    /*
     * Markdown heading
     */
    const heading =
      getHeadingInfo(
        line
      );

    if (heading) {
      if (
        !titleWritten &&
        heading.level === 1
      ) {
        writeTitle(
          doc,
          heading.text,
          language,
          colourful
        );

        titleWritten = true;
      } else {
        writeHeading(
          doc,
          heading.text,
          heading.level,
          language,
          colourful
        );
      }

      continue;
    }

    /*
     * Bullet point
     */
    const bullet =
      getBulletText(
        line
      );

    if (bullet) {
      writeBullet(
        doc,
        bullet,
        language
      );

      continue;
    }

    /*
     * Numbered list
     */
    const numbered =
      getNumberedText(
        line
      );

    if (numbered) {
      writeNumbered(
        doc,
        numbered.number,
        numbered.text,
        language
      );

      continue;
    }

    /*
     * Automatically treat the first
     * short line as a possible title.
     */
    if (
      !titleWritten &&
      lines.length > 1 &&
      line.length <= 100
    ) {
      writeTitle(
        doc,
        line,
        language,
        colourful
      );

      titleWritten = true;

      continue;
    }

    /*
     * Normal paragraph
     */
    writeParagraph(
      doc,
      line,
      language
    );
  }
}

/*
 * ---------------------------------------------------------
 * PDF BUILDER
 * ---------------------------------------------------------
 */

async function buildPdf(
  content,
  language,
  colourful
) {
  let hindiFonts = null;

  /*
   * Hindi TTF fonts are needed only
   * for Hindi or mixed-language PDFs.
   */
  if (
    language === "hindi" ||
    language === "both"
  ) {
    hindiFonts =
      await getHindiFonts();
  }

  return await new Promise(
    (resolve, reject) => {
      try {
        const doc =
          new PDFDocument({
            size: "A4",

            margins: {
              top: 55,
              bottom: 55,
              left: 55,
              right: 55
            },

            bufferPages: true,

            autoFirstPage: true
          });

        const chunks = [];

        doc.on(
          "data",
          (chunk) => {
            chunks.push(
              chunk
            );
          }
        );

        doc.on(
          "error",
          (error) => {
            reject(error);
          }
        );

        doc.on(
          "end",
          () => {
            resolve(
              Buffer.concat(
                chunks
              )
            );
          }
        );

        /*
         * Register fonts.
         *
         * English = PDFKit built-in Helvetica.
         * Hindi = TTF Noto Sans Devanagari.
         */
        registerFonts(
          doc,
          language,
          hindiFonts
        );

        /*
         * Default PDF appearance:
         * black and white.
         *
         * Colour is enabled only when
         * explicitly requested.
         */
        doc.fillColor(
          "#000000"
        );

        doc.fontSize(11);

        /*
         * Document heading.
         */
        writeTitle(
          doc,
          "SMATER CHAT AI",
          "english",
          colourful
        );

        doc.moveDown(0.4);

        /*
         * Main AI-generated content.
         */
        renderContent(
          doc,
          content,
          language,
          colourful
        );

        /*
         * Prepared by line.
         */
        doc.moveDown(1);

        doc
          .font(
            "SMATER_EN_BOLD"
          )
          .fontSize(9)
          .fillColor("#000000")
          .text(
            "Prepared by: SMATER CHAT AI",
            {
              align: "center"
            }
          );

        /*
         * Finalize PDF.
         */
        doc.end();

      } catch (error) {
        reject(error);
      }
    }
  );
}
/*
 * ---------------------------------------------------------
 * REQUEST HANDLER
 * ---------------------------------------------------------
 */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error:
        "Method not allowed"
    });
  }

  try {
    const body =
      req.body || {};

    const prompt =
      body.prompt ||
      body.description ||
      body.text ||
      "";

    if (
      !String(prompt).trim()
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Please provide a PDF description."
      });
    }

    /*
     * Language rules:
     * No language specified = English.
     */
    const language =
      detectLanguage(
        prompt
      );

    /*
     * Colour only when explicitly requested.
     */
    const colourful =
      isColourfulRequest(
        prompt
      );

    console.log(
      "SMATER CHAT AI: PDF request",
      {
        language,
        colourful
      }
    );

    /*
     * Generate the actual AI-written content.
     */
    const aiContent =
      await generateAIContent(
        prompt,
        language
      );

    if (
      !aiContent ||
      !aiContent.trim()
    ) {
      throw new Error(
        "AI generated empty content"
      );
    }

    /*
     * Build the actual PDF.
     */
    const pdfBuffer =
      await buildPdf(
        aiContent,
        language,
        colourful
      );

    if (
      !pdfBuffer ||
      !pdfBuffer.length
    ) {
      throw new Error(
        "PDF buffer is empty"
      );
    }

    /*
     * Create a safe file name.
     */
    const baseName =
      safeFileName(
        "SMATER-CHAT-AI-PDF"
      );

    const fileName =
      `${baseName}.pdf`;

    /*
     * Return the PDF as base64.
     *
     * This keeps the existing frontend
     * response pattern compatible.
     */
    return res.status(200).json({
      ok: true,

      success: true,

      fileName,

      fileType:
        "application/pdf",

      mimeType:
        "application/pdf",

      data:
        pdfBuffer.toString(
          "base64"
        ),

      base64:
        pdfBuffer.toString(
          "base64"
        )
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
