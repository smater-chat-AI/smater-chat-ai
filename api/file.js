import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function hasHindi(text = "") {
  return /[\u0900-\u097F]/.test(text);
}

function isColourfulRequest(prompt = "") {
  return /\b(colourful|colorful|colour\s+pdf|color\s+pdf|colourful\s+pdf|colorful\s+pdf)\b/i.test(prompt);
}

function cleanText(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}

function findHindiFont() {
  const candidates = [
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2",
    "/var/task/node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }

  return null;
}

function chooseFont(doc, text, bold = false) {
  const hindi = hasHindi(text);

  if (hindi) {
    const font = findHindiFont();
    if (font) {
      doc.font(font);
      return;
    }
  }

  doc.font(bold ? "Helvetica-Bold" : "Helvetica");
}

function safeFileName(name = "smater-chat-ai") {
  return String(name)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80) || "smater-chat-ai";
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
async function generateAIContent(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
            "Understand Hindi, Hinglish and English. " +
            "For Hindi requests, write proper Devanagari Hindi. " +
            "Do not include unnecessary meta-commentary. " +
            "Use clear headings, paragraphs, bullets and numbered lists when useful. " +
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
      `OpenRouter request failed (${response.status}): ${errorText.slice(0, 500)}`
    );
  }

  const data = await response.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI returned empty document content");
  }

  return content.trim();
}

function addPageNumber(doc, pageNumber) {
  const savedY = doc.y;

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#666666")
    .text(
      `Page ${pageNumber}`,
      40,
      doc.page.height - 30,
      {
        width: doc.page.width - 80,
        align: "center"
      }
    );

  doc.y = savedY;
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

      const chunks = [];

      doc.on("data", chunk => chunks.push(chunk));

      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          resolve(pdfBuffer);
        } catch (error) {
          reject(error);
        }
      });

      doc.on("error", reject);

      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      function normalText(text) {
        chooseFont(doc, text, false);

        doc
          .fontSize(11)
          .fillColor("#111111")
          .text(text, {
            width: pageWidth,
            align: "left",
            lineGap: 4
          });
      }

      function headingText(text, level = 2) {
        chooseFont(doc, text, true);

        doc
          .fontSize(level === 1 ? 18 : 14)
          .fillColor(colourful ? "#1f4e79" : "#111111")
          .text(text, {
            width: pageWidth,
            lineGap: 5
          });

        doc.moveDown(0.35);
      }

      chooseFont(doc, title, true);

      doc
        .fontSize(20)
        .fillColor(colourful ? "#1f4e79" : "#111111")
        .text(title || "SMATER CHAT AI Document", {
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
          const level = line.match(/^#+/)[0].length;
          const text = line.replace(/^#{1,3}\s+/, "").trim();
          headingText(text, level);
          continue;
        }

        if (/^[-*]\s+/.test(line)) {
          const text = line.replace(/^[-*]\s+/, "").trim();
          chooseFont(doc, text, false);

          doc
            .fontSize(11)
            .fillColor("#111111")
            .text(`• ${text}`, {
              width: pageWidth - 15,
              indent: 8,
              lineGap: 3
            });

          continue;
        }

        if (/^\d+[.)]\s+/.test(line)) {
          chooseFont(doc, line, false);

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

        normalText(line);
        doc.moveDown(0.15);
      }

      doc.moveDown(0.8);

      chooseFont(doc, "Prepared by: SMATER CHAT AI", false);

      doc
        .fontSize(9)
        .fillColor("#666666")
        .text("Prepared by: SMATER CHAT AI", {
          width: pageWidth,
          align: "center"
        });

      const range = doc.bufferedPageRange();

      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        addPageNumber(doc, i + 1);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
    }
function makeTextFile(content, title) {
  const safeTitle = safeFileName(title || "smater-chat-ai");

  return {
    fileName: `${safeTitle}.txt`,
    mimeType: "text/plain;charset=utf-8",
    buffer: Buffer.from(
      `${title || "SMATER CHAT AI"}\n\n${cleanText(content)}\n\nPrepared by: SMATER CHAT AI`,
      "utf8"
    )
  };
}

function makeHtmlFile(content, title, colourful = false) {
  const safeTitle = escapeHtml(title || "SMATER CHAT AI");
  const body = cleanText(content)
    .split("\n")
    .map(line => {
      const text = line.trim();

      if (!text) return "<div class=\"space\"></div>";

      if (/^#{1,3}\s+/.test(text)) {
        const level = Math.min(text.match(/^#+/)[0].length, 3);
        const heading = escapeHtml(
          text.replace(/^#{1,3}\s+/, "").trim()
        );

        return `<h${level}>${heading}</h${level}>`;
      }

      if (/^[-*]\s+/.test(text)) {
        return `<div class="bullet">• ${escapeHtml(
          text.replace(/^[-*]\s+/, "").trim()
        )}</div>`;
      }

      if (/^\d+[.)]\s+/.test(text)) {
        return `<div class="number">${escapeHtml(text)}</div>`;
      }

      return `<p>${escapeHtml(text)}</p>`;
    })
    .join("\n");

  const accent = colourful ? "#1f4e79" : "#111111";

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
<div class="footer">Prepared by: SMATER CHAT AI</div>
</body>
</html>`;
}

function makeDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function makeResult(buffer, mimeType, fileName) {
  return {
    fileName,
    mimeType,
    size: buffer.length,
    url: makeDataUrl(buffer, mimeType),
    file: makeDataUrl(buffer, mimeType)
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
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "SMATER CHAT AI";

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Please provide a document description."
      });
    }

    const aiContent = await generateAIContent(prompt);

    const safeTitle = safeFileName(title);

    if (format === "txt" || format === "text") {
      const textFile = makeTextFile(aiContent, title);

      return res.status(200).json({
        ok: true,
        type: "txt",
        fileName: textFile.fileName,
        mimeType: textFile.mimeType,
        size: textFile.buffer.length,
        url: makeDataUrl(
          textFile.buffer,
          textFile.mimeType
        ),
        file: makeDataUrl(
          textFile.buffer,
          textFile.mimeType
        )
      });
    }

    if (format === "html") {
      const colourful = isColourfulRequest(prompt);

      const html = makeHtmlFile(
        aiContent,
        title,
        colourful
      );

      const htmlBuffer = Buffer.from(html, "utf8");

      return res.status(200).json({
        ok: true,
        type: "html",
        fileName: `${safeTitle}.html`,
        mimeType: "text/html;charset=utf-8",
        size: htmlBuffer.length,
        url: makeDataUrl(
          htmlBuffer,
          "text/html;charset=utf-8"
        ),
        file: makeDataUrl(
          htmlBuffer,
          "text/html;charset=utf-8"
        )
      });
    }

    const pdfBuffer = await buildPdf(
      aiContent,
      title,
      prompt
    );

    const pdfResult = makeResult(
      pdfBuffer,
      "application/pdf",
      `${safeTitle}.pdf`
    );

    return res.status(200).json({
      ok: true,
      type: "pdf",
      ...pdfResult
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "I couldn't create that file right now. Please try again.",
      details:
        process.env.NODE_ENV === "development"
          ? String(error?.message || error)
          : undefined
    });
  }
}
