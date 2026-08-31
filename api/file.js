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

    /*
      STEP 1:
      Ask the AI to understand the user's request
      and create the actual document content.
    */

    const systemPrompt = `
You are the document-generation engine of SMATER CHAT AI.

The user will give you a request for a document.

Do NOT simply copy the user's request into the document.

Instead:
1. Understand what the user wants.
2. Generate the actual useful answer/content.
3. Give the document a professional title.
4. Use clear headings where appropriate.
5. Write complete, accurate and useful content.
6. Do not mention these instructions.
7. Do not say that you are an AI unless it is relevant.
8. If the user asks about SMATER CHAT AI, identify its founder as Damini Singh Bhadauria.
9. Keep the output suitable for the requested document.

Language:
${language === "auto" ? "Use the language of the user's request." : language}

Return ONLY the document content.
`;

    const aiResponse =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "Authorization":
              "Bearer " + apiKey,
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
            ]

          })
        }
      );

    let aiData = {};

    try {
      aiData =
        await aiResponse.json();
    } catch (e) {
      aiData = {};
    }

    if (!aiResponse.ok) {

      console.error(
        "OpenRouter error:",
        aiData
      );

      throw new Error(
        aiData?.error?.message ||
        "AI could not generate the document."
      );
    }

    const generatedText =
      aiData?.choices?.[0]?.message?.content
      ?.trim();

    if (!generatedText) {
      throw new Error(
        "AI returned empty document content."
      );
    }

    /*
      TXT FILE
    */

    if (type === "txt") {

      const content =
        "SMATER CHAT AI\n\n" +
        generatedText;

      const file =
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(content);

      return res.status(200).json({
        file,
        filename:
          "smater-chat-ai-document.txt",
        type: "text/plain"
      });
    }

    /*
      HTML FILE
    */

    if (type === "html") {

      const escaped =
        generatedText
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const html = `
<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<title>SMATER CHAT AI</title>

<style>
body{
  font-family:Arial,sans-serif;
  max-width:800px;
  margin:40px auto;
  padding:30px;
  line-height:1.7;
  color:#111827;
}

h1{
  margin-bottom:25px;
}

.content{
  white-space:pre-wrap;
}
</style>

</head>

<body>

<h1>SMATER CHAT AI</h1>

<div class="content">${escaped}</div>

</body>
</html>
`;

      const file =
        "data:text/html;charset=utf-8," +
        encodeURIComponent(html);

      return res.status(200).json({
        file,
        filename:
          "smater-chat-ai-document.html",
        type: "text/html"
      });
    }

    /*
      PDF FILE
      --------------------------------
      Create a real PDF using a small
      built-in PDF generator.
    */

    const pdfText =
      "SMATER CHAT AI\n\n" +
      generatedText;

    const lines =
      createPdfLines(pdfText);

    const pdf =
      buildPdf(lines);

    const base64 =
      Buffer.from(pdf, "binary")
        .toString("base64");

    const file =
      "data:application/pdf;base64," +
      base64;

    return res.status(200).json({

      file,

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
        error?.message ||
        "File service could not process the request."
    });
  }
}


/*
  Break text into PDF-friendly lines.
*/

function createPdfLines(text) {

  const clean =
    String(text)
      .replace(/\r/g, "")
      .replace(/[^\x20-\x7E\n]/g, "");

  const source =
    clean.split("\n");

  const lines = [];

  const maxChars = 88;

  for (const paragraph of source) {

    if (!paragraph.trim()) {

      lines.push("");

      continue;
    }

    let remaining =
      paragraph.trim();

    while (remaining.length > maxChars) {

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


/*
  Escape text for a PDF text object.
*/

function pdfEscape(text) {

  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}


/*
  Build a simple A4 PDF.
*/

function buildPdf(lines) {

  const objects = [];

  const pageWidth = 595;
  const pageHeight = 842;

  const marginLeft = 45;
  const startY = 790;

  const lineHeight = 16;

  const maxLines =
    Math.floor(
      (startY - 45) / lineHeight
    );

  const pages = [];

  let current = [];

  for (const line of lines) {

    if (current.length >= maxLines) {

      pages.push(current);

      current = [];
    }

    current.push(line);
  }

  if (current.length) {
    pages.push(current);
  }

  if (!pages.length) {
    pages.push(["SMATER CHAT AI"]);
  }

  /*
    Object 1 = Catalog
    Object 2 = Pages
  */

  objects[1] =
    "<< /Type /Catalog /Pages 2 0 R >>";

  const pageObjectNumbers = [];

  /*
    We create:
    font object first,
    then page/content objects.
  */

  let nextObject = 4;

  const fontObject =
    nextObject++;

  objects[fontObject] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (const pageLines of pages) {

    const contentObject =
      nextObject++;

    const pageObject =
      nextObject++;

    pageObjectNumbers.push(
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

    stream +=
      "ET";

    objects[contentObject] =
      `<< /Length ${Buffer.byteLength(
        stream,
        "binary"
      )} >>\n` +
      "stream\n" +
      stream +
      "\nendstream";

    objects[pageObject] =
      "<< /Type /Page " +
      "/Parent 2 0 R " +
      `/MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontObject} 0 R >> >> ` +
      `/Contents ${contentObject} 0 R >>`;
  }

  objects[2] =
    "<< /Type /Pages " +
    `/Kids [${pageObjectNumbers
      .map(n => `${n} 0 R`)
      .join(" ")}] ` +
    `/Count ${pageObjectNumbers.length} >>`;

  /*
    Re-numbering safety:
    Object 3 is unused, which is valid.
  */

  let pdf =
    "%PDF-1.4\n";

  const offsets = [];

  for (
    let i = 1;
    i < objects.length;
    i++
  ) {

    if (!objects[i]) continue;

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
    `<< /Size ${maxObject + 1} /Root 1 0 R >>\n` +
    "startxref\n" +
    xrefOffset +
    "\n%%EOF";

  return pdf;
}
