import PDFDocument from "pdfkit";
import fs from "fs";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

function hasHindi(text = "") {
  return /[\u0900-\u097F]/.test(String(text));
}

function isColourfulRequest(prompt = "") {
  return /\b(colourful|colorful|colour\s+pdf|color\s+pdf|colourful\s+pdf|colorful\s+pdf)\b/i.test(
    String(prompt)
  );
}

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
 * Noto Sans Devanagari is used for Hindi.
 * Helvetica remains available for English.
 *
 * We check both WOFF and WOFF2 because the installed
 * font package can expose either format.
 */
function findHindiFont() {
  const candidates = [
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2"
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  return null;
}

function registerFonts(doc) {
  const hindiFont = findHindiFont();

  if (hindiFont) {
    doc.registerFont("SMATER_HINDI", hindiFont);
  }

  return hindiFont;
}

function chooseFont(doc, text, bold = false, hindiFont = null) {
  if (hasHindi(text) && hindiFont) {
    doc.font("SMATER_HINDI");
  } else {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
  }
}
async function generateAIContent(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
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
            "Create clean, useful document content from the user's request. " +
            "Understand Hindi, English and Hinglish. " +
            "When Hindi is requested, use proper Devanagari Hindi. " +
            "Use headings, paragraphs, bullets and numbered lists when useful. " +
            "Return only the document content."
        },
        {
          role: "user",
          content: String(prompt || "").trim()
        }
      ],
      temperature: 0.4
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

  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI returned empty document content");
  }

  return content.trim();
}

function buildPdf(content, title, originalPrompt) {
  return new Promise((resolve, reject) => {
    try {
      const colourful = isColourfulRequest(originalPrompt);

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

      const hindiFont = registerFonts(doc);
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

      const pageWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right;

      function writeParagraph(text) {
        chooseFont(doc, text, false, hindiFont);

        doc
          .fontSize(11)
          .fillColor("#111111")
          .text(text, {
            width: pageWidth,
            align: "left",
            lineGap: 4
          });

        doc.moveDown(0.15);
      }

      function writeHeading(text, level) {
        chooseFont(doc, text, true, hindiFont);

        doc
          .fontSize(level === 1 ? 18 : 14)
          .fillColor(
            colourful ? "#1f4e79" : "#111111"
          )
          .text(text, {
            width: pageWidth,
            lineGap: 5
          });

        doc.moveDown(0.35);
      }

      chooseFont(doc, title, true, hindiFont);

      doc
        .fontSize(20)
        .fillColor(
          colourful ? "#1f4e79" : "#111111"
        )
        .text(title || "SMATER CHAT AI", {
          width: pageWidth,
          align: "center",
          lineGap: 5
        });

      doc.moveDown(0.7);

      const lines = cleanText(content).split("\n");

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
          doc.moveDown(0.45);
          continue;
        }

        if (/^#{1,3}\s+/.test(line)) {
          const match = line.match(/^#+/);
          const level = Math.min(
            match ? match[0].length : 2,
            3
          );

          const heading = line
            .replace(/^#{1,3}\s+/, "")
            .trim();

          writeHeading(heading, level);
          continue;
        }

        if (/^[-*]\s+/.test(line)) {
          const bullet = line
            .replace(/^[-*]\s+/, "")
            .trim();

          chooseFont(doc, bullet, false, hindiFont);

          doc
            .fontSize(11)
            .fillColor("#111111")
            .text(`• ${bullet}`, {
              width: pageWidth - 15,
              indent: 8,
              lineGap: 3
            });

          continue;
        }

        if (/^\d+[.)]\s+/.test(line)) {
          chooseFont(doc, line, false, hindiFont);

          doc
            .fontSize(11)
            .fillColor("#111111")
            .text(line, {
              width: pageWidth - 10,
              indent: 5,
              lineGap: 3
            });

          continue;
        }

        writeParagraph(line);
          }
            doc.moveDown(0.8);

      const preparedText =
        "Prepared by: SMATER CHAT AI";

      chooseFont(
        doc,
        preparedText,
        false,
        hindiFont
      );

      doc
        .fontSize(9)
        .fillColor("#666666")
        .text(preparedText, {
          width: pageWidth,
          align: "center"
        });

      const pageRange = doc.bufferedPageRange();

      for (
        let i = 0;
        i < pageRange.count;
        i++
      ) {
        doc.switchToPage(
          pageRange.start + i
        );

        doc
          .font("Helvetica")
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

function makeTextFile(content, title) {
  const safeTitle = safeFileName(
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
    fileName: `${safeTitle}.txt`,
    mimeType: "text/plain;charset=utf-8",
    buffer: Buffer.from(text, "utf8")
  };
}

function makeHtmlFile(
  content,
  title,
  colourful = false
) {
  const safeTitle = escapeHtml(
    title || "SMATER CHAT AI"
  );

  const body = cleanText(content)
    .split("\n")
    .map(line => {
      const text = line.trim();

      if (!text) {
        return '<div class="space"></div>';
      }

      if (/^#{1,3}\s+/.test(text)) {
        const match = text.match(/^#+/);
        const level = Math.min(
          match ? match[0].length : 2,
          3
        );

        const heading = escapeHtml(
          text.replace(
            /^#{1,3}\s+/,
            ""
          ).trim()
        );

        return `<h${level}>${heading}</h${level}>`;
      }

      if (/^[-*]\s+/.test(text)) {
        return `<div class="bullet">• ${escapeHtml(
          text.replace(
            /^[-*]\s+/,
            ""
          ).trim()
        )}</div>`;
      }

      if (/^\d+[.)]\s+/.test(text)) {
        return `<div class="number">${escapeHtml(
          text
        )}</div>`;
      }

      return `<p>${escapeHtml(text)}</p>`;
    })
    .join("\n");

  const accent = colourful
    ? "#1f4e79"
    : "#111111";

  const html = `<!doctype html>
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
.bullet,.number{
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

  return html;
}
function makeDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function makeResult(buffer, mimeType, fileName) {
  const url = makeDataUrl(buffer, mimeType);

  return {
    fileName,
    mimeType,
    size: buffer.length,
    url,
    file: url
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : typeof body.description === "string"
          ? body.description.trim()
          : "";

    const format =
      typeof body.format === "string"
        ? body.format.toLowerCase().trim()
        : "pdf";

    const title =
      typeof body.title === "string" &&
      body.title.trim()
        ? body.title.trim()
        : "SMATER CHAT AI";

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Please provide a document description."
      });
    }

    const aiContent =
      await generateAIContent(prompt);

    const safeTitle =
      safeFileName(title);

    if (
      format === "txt" ||
      format === "text"
    ) {
      const textFile =
        makeTextFile(
          aiContent,
          title
        );

      const url = makeDataUrl(
        textFile.buffer,
        textFile.mimeType
      );

      return res.status(200).json({
        ok: true,
        type: "txt",
        fileName: textFile.fileName,
        mimeType: textFile.mimeType,
        size: textFile.buffer.length,
        url,
        file: url
      });
    }

    if (format === "html") {
      const html =
        makeHtmlFile(
          aiContent,
          title,
          isColourfulRequest(prompt)
        );

      const htmlBuffer =
        Buffer.from(
          html,
          "utf8"
        );

      const url = makeDataUrl(
        htmlBuffer,
        "text/html;charset=utf-8"
      );

      return res.status(200).json({
        ok: true,
        type: "html",
        fileName:
          `${safeTitle}.html`,
        mimeType:
          "text/html;charset=utf-8",
        size: htmlBuffer.length,
        url,
        file: url
      });
    }

    const pdfBuffer =
      await buildPdf(
        aiContent,
        title,
        prompt
      );

    const result =
      makeResult(
        pdfBuffer,
        "application/pdf",
        `${safeTitle}.pdf`
      );

    return res.status(200).json({
      ok: true,
      type: "pdf",
      ...result
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "I couldn't create that file right now. Please try again."
    });
  }
}
