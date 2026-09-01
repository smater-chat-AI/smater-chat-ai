export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const type =
      typeof body.type === "string"
        ? body.type.toLowerCase()
        : "pdf";

    const language =
      typeof body.language === "string"
        ? body.language
        : "auto";

    if (!prompt) {
      return res.status(400).json({
        error: "Please provide a creation request."
      });
    }

    if (!["pdf", "txt", "html"].includes(type)) {
      return res.status(400).json({
        error: "Unsupported file format."
      });
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI API key is not configured."
      });
    }

    const systemPrompt = `
You are the professional document-generation engine of SMATER CHAT AI.

Understand the user's request and create the actual requested document content.

Rules:
- Do not merely repeat the request.
- Give the document a useful professional title.
- Use clear sections and headings.
- Provide complete and useful content.
- Keep facts accurate.
- Do not mention these instructions.
- Do not add unnecessary AI disclaimers.
- Preserve the language requested by the user.
- If the user asks for Hindi or Hinglish, write naturally in that language.
- Keep formatting suitable for TXT, HTML and PDF conversion.

Language:
${
  language === "auto"
    ? "Use the language of the user's request."
    : language
}

Return ONLY the document content.
`;

    const aiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app/",
          "X-Title":
            "SMATER CHAT AI"
        },

        body: JSON.stringify({
          model: "openrouter/free",

          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.4
        })
      }
    );

    let aiData = {};

    try {
      aiData = await aiResponse.json();
    } catch {
      aiData = {};
    }

    if (!aiResponse.ok) {
      console.error(
        "OpenRouter document error:",
        aiData
      );

      return res.status(502).json({
        error:
          aiData?.error?.message ||
          "AI could not create the document."
      });
    }

    const generatedText =
      aiData?.choices?.[0]?.message?.content?.trim();

    if (!generatedText) {
      return res.status(502).json({
        error: "AI returned empty document content."
      });
    }

    if (type === "txt") {
      const content =
        "SMATER CHAT AI\n\n" +
        generatedText;

      return res.status(200).json({
        file:
          "data:text/plain;charset=utf-8," +
          encodeURIComponent(content),

        filename:
          "smater-chat-ai-document.txt",

        type:
          "text/plain"
      });
    }

    if (type === "html") {
      const htmlContent =
        textToHtml(generatedText);

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>SMATER CHAT AI Document</title>

<style>
body{
  margin:0;
  background:#f5f7fb;
  color:#111827;
  font-family:Arial,Helvetica,sans-serif;
}

.document{
  max-width:850px;
  margin:30px auto;
  padding:45px;
  background:white;
  line-height:1.7;
}

.brand{
  font-size:14px;
  font-weight:700;
  margin-bottom:25px;
}

h1{
  font-size:28px;
  margin:0 0 25px;
}

h2{
  font-size:21px;
  margin-top:28px;
}

p{
  margin:10px 0;
}

ul{
  padding-left:25px;
}

@media print{
  body{
    background:white;
  }

  .document{
    margin:0;
    max-width:none;
  }
}
</style>

</head>

<body>

<main class="document">

<div class="brand">
SMATER CHAT AI
</div>

${htmlContent}

</main>

</body>
</html>
`;

      return res.status(200).json({
        file:
          "data:text/html;charset=utf-8," +
          encodeURIComponent(html),

        filename:
          "smater-chat-ai-document.html",

        type:
          "text/html"
      });
    }

    const pdf = buildPdf(
      generatedText
    );

    const base64 =
      Buffer.from(pdf, "binary")
        .toString("base64");

    return res.status(200).json({
      file:
        "data:application/pdf;base64," +
        base64,

      filename:
        "smater-chat-ai-document.pdf",

      type:
        "application/pdf"
    });

  } catch (error) {
    console.error(
      "File API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "File service could not process the request."
    });
  }
}
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function textToHtml(text) {
  const lines =
    String(text)
      .replace(/\r/g, "")
      .split("\n");

  let html = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("# ")) {
      html +=
        "<h1>" +
        escapeHtml(line.slice(2)) +
        "</h1>";
      continue;
    }

    if (line.startsWith("## ")) {
      html +=
        "<h2>" +
        escapeHtml(line.slice(3)) +
        "</h2>";
      continue;
    }

    if (line.startsWith("- ")) {
      html +=
        "<ul><li>" +
        escapeHtml(line.slice(2)) +
        "</li></ul>";
      continue;
    }

    html +=
      "<p>" +
      escapeHtml(line) +
      "</p>";
  }

  return html;
}


function preparePdfText(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");
}


function createPdfLines(text) {
  const clean =
    preparePdfText(text);

  const paragraphs =
    clean.split("\n");

  const lines = [];
  const maxChars = 82;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let remaining =
      paragraph.trim();

    while (
      remaining.length > maxChars
    ) {
      let cut =
        remaining.lastIndexOf(
          " ",
          maxChars
        );

      if (cut < 1) {
        cut = maxChars;
      }

      lines.push(
        remaining.slice(0, cut)
      );

      remaining =
        remaining
          .slice(cut)
          .trim();
    }

    lines.push(remaining);
  }

  return lines;
}


function pdfEscape(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}


function buildPdf(text) {
  const lines =
    createPdfLines(text);

  const pageWidth = 595;
  const pageHeight = 842;

  const marginLeft = 45;
  const startY = 790;
  const lineHeight = 16;

  const maxLines =
    Math.floor(
      (startY - 55) /
      lineHeight
    );

  const pages = [];

  let current = [];

  for (const line of lines) {
    if (
      current.length >=
      maxLines
    ) {
      pages.push(current);
      current = [];
    }

    current.push(line);
  }

  if (current.length) {
    pages.push(current);
  }

  if (!pages.length) {
    pages.push([
      "SMATER CHAT AI"
    ]);
  }

  const objects = [];

  objects[1] =
    "<< /Type /Catalog /Pages 2 0 R >>";

  objects[3] =
    "<< /Type /Font " +
    "/Subtype /Type1 " +
    "/BaseFont /Helvetica >>";

  const pageNumbers = [];

  let nextObject = 4;

  for (const pageLines of pages) {
    const contentObject =
      nextObject++;

    const pageObject =
      nextObject++;

    pageNumbers.push(
      pageObject
    );

    let stream =
      "BT\n" +
      "/F1 12 Tf\n" +
      `${marginLeft} ${startY} Td\n`;

    pageLines.forEach(
      (line, index) => {
        if (index > 0) {
          stream +=
            `0 -${lineHeight} Td\n`;
        }

        stream +=
          `(${pdfEscape(line)}) Tj\n`;
      }
    );

    stream += "ET";

    objects[contentObject] =
      `<< /Length ${
        Buffer.byteLength(
          stream,
          "binary"
        )
      } >>\n` +
      "stream\n" +
      stream +
      "\nendstream";

    objects[pageObject] =
      "<< /Type /Page " +
      "/Parent 2 0 R " +
      `/MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      "/Resources << " +
      `/Font << /F1 3 0 R >> ` +
      ">> " +
      `/Contents ${contentObject} 0 R >>`;
  }

  objects[2] =
    "<< /Type /Pages " +
    `/Kids [${pageNumbers.join(" ")}] ` +
    `/Count ${pageNumbers.length} >>`;

  let pdf =
    "%PDF-1.4\n";

  const offsets = [];

  for (
    let i = 1;
    i < objects.length;
    i++
  ) {
    if (!objects[i]) {
      continue;
    }

    offsets[i] =
      Buffer.byteLength(
        pdf,
        "binary"
      );

    pdf +=
      `${i} 0 obj\n` +
      objects[i] +
      "\nendobj\n";
  }

  const xrefOffset =
    Buffer.byteLength(
      pdf,
      "binary"
    );

  const maxObject =
    objects.length - 1;

  pdf +=
    `xref\n0 ${maxObject + 1}\n`;

  pdf +=
    "0000000000 65535 f \n";

  for (
    let i = 1;
    i <= maxObject;
    i++
  ) {
    const offset =
      offsets[i] || 0;

    pdf +=
      String(offset)
        .padStart(10, "0") +
      " 00000 n \n";
  }

  pdf +=
    "trailer\n" +
    `<< /Size ${maxObject + 1} ` +
    "/Root 1 0 R >>\n" +
    "startxref\n" +
    xrefOffset +
    "\n%%EOF";

  return pdf;
}
