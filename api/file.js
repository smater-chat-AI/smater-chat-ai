import PDFDocument from "pdfkit";
import fs from "fs";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

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
      .slice(0, 80) || "smater-chat-ai"
  );
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * User command decides PDF language/style.
 *
 * No language specified:
 *   English
 *
 * Hindi requested:
 *   Hindi
 *
 * Hindi + English requested:
 *   Both
 *
 * Colour requested:
 *   Colourful
 *
 * Otherwise:
 *   Normal black/white
 */

function requestedLanguage(prompt = "") {
  const text = String(prompt).toLowerCase();

  const hindi =
    /\b(hindi|हिंदी|हिन्दी|देवनागरी)\b/i.test(text);

  const english =
    /\b(english|अंग्रेजी|अंग्रेज़ी)\b/i.test(text);

  if (hindi && english) {
    return "both";
  }

  if (hindi) {
    return "hindi";
  }

  return "english";
}

function isColourfulRequest(prompt = "") {
  return /\b(colourful|colorful|colour\s+pdf|color\s+pdf|colour\s+document|color\s+document)\b/i.test(
    String(prompt)
  );
}

function findFont(candidates = []) {
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  return null;
}

function findFonts() {
  const englishRegular = findFont([
    "/var/task/node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"
  ]);

  const englishBold = findFont([
    "/var/task/node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff"
  ]);

  const hindiRegular = findFont([
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff"
  ]);

  const hindiBold = findFont([
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
  ]);

  return {
    englishRegular,
    englishBold,
    hindiRegular,
    hindiBold
  };
}

function containsHindi(text = "") {
  return /[\u0900-\u097F]/.test(String(text));
}

function containsEnglish(text = "") {
  return /[A-Za-z]/.test(String(text));
}

function splitLanguageRuns(text = "") {
  const value = String(text);
  const runs = [];

  let current = "";
  let currentHindi = null;

  for (const char of value) {
    const charHindi = /[\u0900-\u097F]/.test(char);

    if (currentHindi === null) {
      currentHindi = charHindi;
      current = char;
      continue;
    }

    if (charHindi === currentHindi) {
      current += char;
    } else {
      runs.push({
        text: current,
        hindi: currentHindi
      });

      current = char;
      currentHindi = charHindi;
    }
  }

  if (current) {
    runs.push({
      text: current,
      hindi: currentHindi
    });
  }

  return runs;
}
async function generateAIContent(prompt, language) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  let languageInstruction =
    "Write the document in clear professional English.";

  if (language === "hindi") {
    languageInstruction =
      "Write the document in proper, natural Hindi using Devanagari script.";
  }

  if (language === "both") {
    languageInstruction =
      "Write the document in both Hindi and English. Keep both languages clear and readable.";
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://smater-chat-ai.vercel.app/",
      "X-Title": "SMATER CHAT AI"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        {
          role: "system",
          content:
            "You are SMATER CHAT AI, created by Damini Singh Bhadauria. " +
            "Create professional document content from the user's command. " +
            languageInstruction +
            " Do not add explanations about these instructions. " +
            "Use useful headings, paragraphs, bullets and numbered lists when appropriate. " +
            "Return only the document content."
        },
        {
          role: "user",
          content: String(prompt || "").trim()
        }
      ],
      temperature: 0.35
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorText.slice(
        0,
        500
      )}`
    );
  }

  const data = await response.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI returned empty document content");
  }

  return content.trim();
}

function buildPdf(content, title, language, colourful) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 55,
          bottom: 55,
          left: 50,
          right: 50
        },
        bufferPages: true
      });

      const fonts = findFonts();

      if (!fonts.englishRegular) {
        throw new Error("English PDF font not found");
      }

      if (
        (language === "hindi" || language === "both") &&
        !fonts.hindiRegular
      ) {
        throw new Error("Hindi PDF font not found");
      }

      const chunks = [];

      doc.on("data", chunk => {
        chunks.push(chunk);
      });

      doc.on("error", reject);

      doc.on("end", () => {
        try {
          resolve(Buffer.concat(chunks));
        } catch (error) {
          reject(error);
        }
      });

      /*
       * Register fonts once.
       */
      doc.registerFont(
        "SMATER_EN",
        fonts.englishRegular
      );

      if (fonts.englishBold) {
        doc.registerFont(
          "SMATER_EN_BOLD",
          fonts.englishBold
        );
      }

      if (fonts.hindiRegular) {
        doc.registerFont(
          "SMATER_HI",
          fonts.hindiRegular
        );
      }

      if (fonts.hindiBold) {
        doc.registerFont(
          "SMATER_HI_BOLD",
          fonts.hindiBold
        );
      }

      const pageWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right;

      function setRunFont(text, bold = false) {
        const hindi = containsHindi(text);

        if (hindi && fonts.hindiRegular) {
          if (
            bold &&
            fonts.hindiBold
          ) {
            doc.font("SMATER_HI_BOLD");
          } else {
            doc.font("SMATER_HI");
          }

          return;
        }

        if (
          bold &&
          fonts.englishBold
        ) {
          doc.font("SMATER_EN_BOLD");
        } else {
          doc.font("SMATER_EN");
        }
      }

      function writeMixedText(
        text,
        options = {}
      ) {
        const {
          fontSize = 11,
          bold = false,
          color = "#111111",
          align = "left",
          lineGap = 4
        } = options;

        const runs = splitLanguageRuns(text);

        if (
          runs.length === 1
        ) {
          setRunFont(
            text,
            bold
          );

          doc
            .fontSize(fontSize)
            .fillColor(color)
            .text(text, {
              width: pageWidth,
              align,
              lineGap
            });

          return;
        }

        /*
         * For mixed Hindi + English lines,
         * render each language run with its
         * matching font.
         */
        let first = true;

        for (const run of runs) {
          setRunFont(
            run.text,
            bold
          );

          doc
            .fontSize(fontSize)
            .fillColor(color)
            .text(run.text, {
              width: pageWidth,
              align,
              lineGap,
              continued:
                !(
                  first === false &&
                  run === runs[runs.length - 1]
                )
            });

          first = false;
        }

        doc.text("");
      }

      function writeHeading(text, level = 2) {
        const size =
          level === 1
            ? 18
            : level === 2
              ? 15
              : 13;

        writeMixedText(
          text,
          {
            fontSize: size,
            bold: true,
            color: colourful
              ? "#1f4e79"
              : "#111111",
            align: "left",
            lineGap: 5
          }
        );

        doc.moveDown(0.35);
      }

      function writeParagraph(text) {
        writeMixedText(
          text,
          {
            fontSize: 11,
            bold: false,
            color: "#111111",
            align: "left",
            lineGap: 4
          }
        );

        doc.moveDown(0.15);
      }

      /*
       * Title
       */
      writeMixedText(
        title || "SMATER CHAT AI",
        {
          fontSize: 20,
          bold: true,
          color: colourful
            ? "#1f4e79"
            : "#111111",
          align: "center",
          lineGap: 5
        }
      );

      doc.moveDown(0.7);

      const lines =
        cleanText(content).split("\n");

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
          doc.moveDown(0.45);
          continue;
        }

        if (/^#{1,3}\s+/.test(line)) {
          const match =
            line.match(/^#+/);

          const level = Math.min(
            match
              ? match[0].length
              : 2,
            3
          );

          const heading =
            line
              .replace(
                /^#{1,3}\s+/,
                ""
              )
              .trim();

          writeHeading(
            heading,
            level
          );

          continue;
        }

        if (/^[-*]\s+/.test(line)) {
          const bullet =
            line
              .replace(
                /^[-*]\s+/,
                ""
              )
              .trim();

          writeMixedText(
            `• ${bullet}`,
            {
              fontSize: 11,
              color: "#111111",
              lineGap: 3
            }
          );

          continue;
        }

        if (/^\d+[.)]\s+/.test(line)) {
          writeMixedText(
            line,
            {
              fontSize: 11,
              color: "#111111",
              lineGap: 3
            }
          );

          continue;
        }

        writeParagraph(line);
      }
            /*
       * Prepared-by line
       */
      doc.moveDown(0.8);

      writeMixedText(
        "Prepared by: SMATER CHAT AI",
        {
          fontSize: 9,
          bold: false,
          color: "#666666",
          align: "center",
          lineGap: 2
        }
      );

      /*
       * Page numbers
       */
      const pageRange =
        doc.bufferedPageRange();

      for (
        let i = 0;
        i < pageRange.count;
        i++
      ) {
        doc.switchToPage(
          pageRange.start + i
        );

        doc
          .font("SMATER_EN")
          .fontSize(8)
          .fillColor("#666666")
          .text(
            `Page ${i + 1}`,
            50,
            doc.page.height - 30,
            {
              width:
                doc.page.width - 100,
              align: "center"
            }
          );
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

function makeTextFile(
  content,
  title
) {
  const safeTitle =
    safeFileName(
      title || "smater-chat-ai"
    );

  const text = [
    title || "SMATER CHAT AI",
    "",
    cleanText(content),
    "",
    "Prepared by: SMATER CHAT AI"
  ].join("\n");

  return {
    fileName:
      `${safeTitle}.txt`,
    mimeType:
      "text/plain;charset=utf-8",
    buffer:
      Buffer.from(
        text,
        "utf8"
      )
  };
}

function makeHtmlFile(
  content,
  title,
  colourful = false
) {
  const safeTitle =
    escapeHtml(
      title || "SMATER CHAT AI"
    );

  const body =
    cleanText(content)
      .split("\n")
      .map(line => {
        const text =
          line.trim();

        if (!text) {
          return '<div class="space"></div>';
        }

        if (
          /^#{1,3}\s+/.test(text)
        ) {
          const match =
            text.match(/^#+/);

          const level =
            Math.min(
              match
                ? match[0].length
                : 2,
              3
            );

          const heading =
            escapeHtml(
              text
                .replace(
                  /^#{1,3}\s+/,
                  ""
                )
                .trim()
            );

          return `<h${level}>${heading}</h${level}>`;
        }

        if (
          /^[-*]\s+/.test(text)
        ) {
          const bullet =
            text
              .replace(
                /^[-*]\s+/,
                ""
              )
              .trim();

          return `<div class="bullet">• ${escapeHtml(
            bullet
          )}</div>`;
        }

        if (
          /^\d+[.)]\s+/.test(text)
        ) {
          return `<div class="number">${escapeHtml(
            text
          )}</div>`;
        }

        return `<p>${escapeHtml(
          text
        )}</p>`;
      })
      .join("\n");

  const accent =
    colourful
      ? "#1f4e79"
      : "#111111";

  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>

<style>
body{
  font-family:Arial,sans-serif;
  margin:40px;
  color:#111;
  line-height:1.6;
}

h1,h2,h3{
  color:${accent};
}

h1{
  text-align:center;
  font-size:26px;
}

h2{
  font-size:20px;
}

h3{
  font-size:17px;
}

p{
  font-size:15px;
}

.bullet,
.number{
  margin:6px 0;
  font-size:15px;
}

.space{
  height:10px;
}

.footer{
  margin-top:30px;
  text-align:center;
  color:#666;
  font-size:12px;
}
</style>
</head>

<body>

<h1>${safeTitle}</h1>

${body}

<div class="footer">
Prepared by: SMATER CHAT AI
</div>

</body>
</html>`;
}
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const prompt =
      String(
        body.prompt ||
        body.description ||
        body.text ||
        ""
      ).trim();

    if (!prompt) {
      return res.status(400).json({
        error:
          "Please provide a document description."
      });
    }

    /*
     * Detect language from the user's command.
     * Default = English.
     *
     * Hindi script commands such as
     * "हिंदी PDF" are also supported.
     */
    const command =
      prompt.toLowerCase();

    const wantsHindi =
      command.includes("hindi") ||
      command.includes("हिंदी") ||
      command.includes("हिन्दी") ||
      command.includes("देवनागरी");

    const wantsEnglish =
      command.includes("english") ||
      command.includes("अंग्रेजी") ||
      command.includes("अंग्रेज़ी");

    let language = "english";

    if (
      wantsHindi &&
      wantsEnglish
    ) {
      language = "both";
    } else if (wantsHindi) {
      language = "hindi";
    }

    const colourful =
      isColourfulRequest(prompt);

    const requestedFormat =
      String(
        body.format ||
        "pdf"
      ).toLowerCase();

    /*
     * Generate the actual document content
     * with the selected language.
     */
    const content =
      await generateAIContent(
        prompt,
        language
      );

    /*
     * Use a simple professional title.
     */
    let title =
      String(
        body.title ||
        "SMATER CHAT AI"
      ).trim();

    if (!title) {
      title = "SMATER CHAT AI";
    }

    /*
     * TXT
     */
    if (
      requestedFormat === "txt" ||
      requestedFormat === "text"
    ) {
      const file =
        makeTextFile(
          content,
          title
        );

      return res.status(200).json({
        success: true,
        fileName:
          file.fileName,
        mimeType:
          file.mimeType,
        data:
          file.buffer.toString(
            "base64"
          )
      });
    }

    /*
     * HTML
     */
    if (
      requestedFormat === "html" ||
      requestedFormat === "htm"
    ) {
      const html =
        makeHtmlFile(
          content,
          title,
          colourful
        );

      return res.status(200).json({
        success: true,
        fileName:
          `${safeFileName(title)}.html`,
        mimeType:
          "text/html;charset=utf-8",
        data:
          Buffer.from(
            html,
            "utf8"
          ).toString(
            "base64"
          )
      });
    }

    /*
     * PDF
     */
    const pdf =
      await buildPdf(
        content,
        title,
        language,
        colourful
      );

    return res.status(200).json({
      success: true,
      fileName:
        `${safeFileName(title)}.pdf`,
      mimeType:
        "application/pdf",
      data:
        pdf.toString(
          "base64"
        )
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "I couldn't create that file right now. Please try again."
    });
  }
}
