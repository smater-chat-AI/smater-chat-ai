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
        : "txt";

    if (!prompt) {
      return res.status(400).json({
        error: "Please provide file content."
      });
    }

    if (!["txt", "html", "pdf"].includes(type)) {
      return res.status(400).json({
        error: "Unsupported file format."
      });
    }


    /* =========================
       TXT
       ========================= */

    if (type === "txt") {

      const content =
        "SMATER CHAT AI\n\n" + prompt;

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


    /* =========================
       HTML
       ========================= */

    if (type === "html") {

      const escaped =
        prompt
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
  padding:20px;
  line-height:1.6;
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
</html>`;

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


    /* =========================
       SIMPLE PDF GENERATOR
       ========================= */

    if (type === "pdf") {

      const lines = [];

      const cleanText =
        prompt
          .replace(/\r/g, "")
          .replace(/[^\x20-\x7E\n]/g, "");

      const allLines =
        cleanText.split("\n");

      allLines.forEach(line => {

        if (!line.trim()) {
          lines.push("");
          return;
        }

        let remaining = line;

        while (remaining.length > 85) {

          let cut =
            remaining.lastIndexOf(" ", 85);

          if (cut < 1)
            cut = 85;

          lines.push(
            remaining.slice(0, cut)
          );

          remaining =
            remaining.slice(cut + 1);
        }

        lines.push(remaining);
      });


      const pageWidth = 595;
      const pageHeight = 842;

      const left = 50;
      const top = 790;

      const lineHeight = 18;

      const maxLines = 40;

      const pages = [];

      for (
        let i = 0;
        i < lines.length;
        i += maxLines
      ) {

        pages.push(
          lines.slice(i, i + maxLines)
        );

      }

      if (!pages.length) {
        pages.push([""]);
      }


      const objects = [];

      objects.push(
        "<< /Type /Catalog /Pages 2 0 R >>"
      );

      const pageObjectNumbers = [];

      let nextObject = 3;

      pages.forEach(() => {

        const pageNumber =
          nextObject++;

        const contentNumber =
          nextObject++;

        pageObjectNumbers.push({
          pageNumber,
          contentNumber
        });

      });


      const kids =
        pageObjectNumbers
          .map(x => `${x.pageNumber} 0 R`)
          .join(" ");

      objects.push(
        `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`
      );


      const escapePdfText = value =>
        value
          .replace(/\\/g, "\\\\")
          .replace(/\(/g, "\\(")
          .replace(/\)/g, "\\)");


      pages.forEach((pageLines, pageIndex) => {

        const pageInfo =
          pageObjectNumbers[pageIndex];

        const commands = [];

        commands.push(
          "BT"
        );

        commands.push(
          "/F1 16 Tf"
        );

        commands.push(
          `${left} ${top} Td`
        );

        commands.push(
          `(SMATER CHAT AI) Tj`
        );

        commands.push(
          "0 -28 Td"
        );

        commands.push(
          "/F1 11 Tf"
        );

        pageLines.forEach((line, index) => {

          if (index > 0) {
            commands.push(
              `0 -${lineHeight} Td`
            );
          }

          commands.push(
            `(${escapePdfText(line)}) Tj`
          );

        });

        commands.push(
          "ET"
        );

        const stream =
          commands.join("\n");

        const pageObject =
          `<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 ${pageWidth} ${pageHeight}]
/Resources <<
  /Font <<
    /F1 <<
      /Type /Font
      /Subtype /Type1
      /BaseFont /Helvetica
    >>
  >>
>>
/Contents ${pageInfo.contentNumber} 0 R
>>`;

        objects[pageInfo.pageNumber - 1] =
          pageObject;

        objects[pageInfo.contentNumber - 1] =
          `<< /Length ${stream.length} >>
stream
${stream}
endstream`;
      });


      let pdf =
        "%PDF-1.4\n";

      const offsets = [0];

      for (let i = 0; i < objects.length; i++) {

        offsets[i + 1] =
          pdf.length;

        pdf +=
          `${i + 1} 0 obj\n`;

        pdf +=
          objects[i];

        pdf +=
          "\nendobj\n";
      }


      const xref =
        pdf.length;

      pdf +=
        `xref\n0 ${objects.length + 1}\n`;

      pdf +=
        "0000000000 65535 f \n";

      for (let i = 1; i <= objects.length; i++) {

        pdf +=
          String(offsets[i])
            .padStart(10, "0") +
          " 00000 n \n";
      }


      pdf +=
        `trailer
<<
/Size ${objects.length + 1}
/Root 1 0 R
>>
startxref
${xref}
%%EOF`;


      const file =
        "data:application/pdf;base64," +
        Buffer
          .from(pdf, "binary")
          .toString("base64");


      return res.status(200).json({
        file,
        filename:
          "smater-chat-ai-document.pdf",
        type:
          "application/pdf"
      });

    }

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
