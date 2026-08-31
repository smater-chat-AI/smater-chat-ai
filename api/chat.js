export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI service is not configured."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const language =
      typeof body.language === "string"
        ? body.language
        : "auto";

    const mode =
      typeof body.mode === "string"
        ? body.mode
        : "normal";

    const file = body.file || null;

    /* =========================
       SMATER CHAT AI IDENTITY
       ========================= */

    const systemPrompt = `
You are SMATER CHAT AI, an intelligent multilingual AI assistant.

Your purpose is to help users learn, create, solve problems,
understand information, write content, and complete everyday tasks.

Respond naturally and professionally in the user's language.
Support Hindi, Hinglish and English.

FOUNDER IDENTITY RULE:

Only mention the founder when the user specifically asks:
- Who created SMATER CHAT AI?
- Who founded SMATER CHAT AI?
- Who developed SMATER CHAT AI?
- Who is the founder?
- Who started SMATER CHAT AI?
- Who made you?

The founder is:

Damini Singh Bhadauria.

When specifically asked about the founder, respond naturally
and professionally:

"I’m SMATER CHAT AI, an intelligent multilingual AI assistant.
I was founded and developed by Damini Singh Bhadauria as an
independent AI project. I’m designed to help users with questions,
learning, problem-solving, writing, creativity and everyday tasks."

Do NOT mention Damini Singh Bhadauria in unrelated answers.

If the user asks about another company or AI such as OpenAI
or ChatGPT, answer about that company or AI accurately.
Do not claim that SMATER CHAT AI created another AI.

FILE RULE:

If a file is attached, use the actual file when answering.

For PDF files, read the PDF content and answer from the actual
document.

Never invent PDF contents.

If the attached PDF cannot be processed by the selected AI model,
clearly say that the PDF could not be read instead of guessing.

For images, analyze the actual image when supported.

Selected language:
${language}

Selected AI mode:
${mode}
`;

    /* =========================
       BUILD MESSAGES
       ========================= */

    const requestMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];

    /* =========================
       ATTACHED FILE
       ========================= */

    if (file && file.data) {

      const fileName =
        String(file.name || "attached-file");

      const fileType =
        String(file.type || "").toLowerCase();

      const lastUserIndex =
        findLastUserMessage(requestMessages);

      if (lastUserIndex !== -1) {

        const userText =
          typeof requestMessages[lastUserIndex].content === "string"
            ? requestMessages[lastUserIndex].content
            : "Please analyze the attached file.";

        /* =========================
           PDF
           ========================= */

        if (
          fileType === "application/pdf" ||
          fileName.toLowerCase().endsWith(".pdf")
        ) {

          requestMessages[lastUserIndex] = {
            role: "user",

            content: [
              {
                type: "text",
                text:
                  `${userText}

Please read the attached PDF and answer using its actual content.
If the user asks for a summary, summarize the PDF.
If the user asks a question, answer from the PDF.
Do not guess.`
              },

              {
                type: "file",

                file: {
                  filename: fileName,
                  file_data: file.data
                }
              }
            ]
          };

        }

        /* =========================
           IMAGE
           ========================= */

        else if (fileType.startsWith("image/")) {

          requestMessages[lastUserIndex] = {
            role: "user",

            content: [
              {
                type: "text",
                text:
                  `${userText}

Analyze the attached image and answer the user's request.`
              },

              {
                type: "image_url",

                image_url: {
                  url: file.data
                }
              }
            ]
          };

        }

        /* =========================
           TEXT / OTHER FILE
           ========================= */

        else {

          const text =
            extractTextFromDataUrl(file.data);

          if (text) {

            requestMessages[lastUserIndex] = {
              role: "user",

              content:
                `${userText}

Attached file:
${fileName}

ACTUAL FILE CONTENT:
${text}

Use the actual file content when answering.`
            };

          } else {

            requestMessages[lastUserIndex] = {
              role: "user",

              content:
                `${userText}

Attached file:
${fileName}

The server could not extract readable text from this file.
Do not invent its contents.`
            };

          }

        }
      }
    }

    /* =========================
       OPENROUTER REQUEST
       ========================= */

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
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

          model:
            "openrouter/free",

          messages:
            requestMessages,

          temperature:
            mode === "thinking"
              ? 0.2
              : mode === "creative"
                ? 0.8
                : 0.5
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "OpenRouter error:",
        response.status,
        data
      );

      return res.status(502).json({
        error:
          data?.error?.message ||
          "AI service request failed."
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content;

    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {

      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    return res.status(200).json({
      text:
        answer.trim()
    });

  } catch (error) {

    console.error(
      "SMATER CHAT AI error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while processing your request."
    });
  }
}


/* =========================
   HELPERS
   ========================= */

function findLastUserMessage(messages) {

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {

    if (
      messages[i] &&
      messages[i].role === "user"
    ) {
      return i;
    }
  }

  return -1;
}


function extractTextFromDataUrl(dataUrl) {

  if (
    typeof dataUrl !== "string"
  ) {
    return "";
  }

  const comma =
    dataUrl.indexOf(",");

  if (comma === -1) {
    return "";
  }

  const metadata =
    dataUrl.slice(0, comma);

  const encoded =
    dataUrl.slice(comma + 1);

  const isTextFile =
    metadata.includes("base64") &&
    (
      metadata.includes("text/") ||
      metadata.includes("application/json")
    );

  if (!isTextFile) {
    return "";
  }

  try {

    return Buffer
      .from(encoded, "base64")
      .toString("utf8")
      .slice(0, 50000);

  } catch (error) {

    console.error(
      "Text file decode error:",
      error?.message || error
    );

    return "";
  }
}
