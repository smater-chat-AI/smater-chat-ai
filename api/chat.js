export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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

    const systemPrompt = `
You are SMATER CHAT AI, an intelligent multilingual AI assistant.

Your purpose is to help users learn, create, solve problems,
understand information, write content, and complete everyday tasks.

Respond naturally and professionally in the user's language.
Support Hindi, Hinglish and English.

IMPORTANT FOUNDER IDENTITY RULE:
Only mention the founder when the user specifically asks about
who created, founded, developed, owns, or started SMATER CHAT AI.

The founder is:
Damini Singh Bhadauria.

When specifically asked who created or founded SMATER CHAT AI,
give a natural professional introduction such as:

"I’m SMATER CHAT AI, an intelligent multilingual AI assistant.
I was founded and developed by Damini Singh Bhadauria as an
independent AI project. I’m designed to help users with questions,
learning, problem-solving, writing, creativity and everyday tasks."

Do NOT mention Damini Singh Bhadauria in unrelated normal answers.

If the user asks about another AI company or product, such as
OpenAI or ChatGPT, answer about that company/product factually.
Do not incorrectly claim that SMATER CHAT AI created it.

FILE RULE:
Never claim to have read a file unless its actual readable content
is available in this request.

If readable file content is supplied, use that content to answer
the user's question.

If a PDF or other file cannot be read, clearly say that its content
could not be extracted instead of inventing information.

Selected language: ${language}
Selected mode: ${mode}
`;

    const requestMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];

    /*
      Handle attached files.
    */

    if (file && file.data) {
      const fileType =
        String(file.type || "").toLowerCase();

      const fileName =
        String(file.name || "attached file");

      const lastUserIndex =
        findLastUserMessage(requestMessages);

      if (lastUserIndex !== -1) {

        /*
          Images
        */

        if (fileType.startsWith("image/")) {

          requestMessages[lastUserIndex] = {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `${requestMessages[lastUserIndex].content || ""}

Attached image: ${fileName}

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

        } else {

          /*
            Text files
          */

          const text =
            extractTextFromDataUrl(file.data);

          if (text) {

            requestMessages[lastUserIndex] = {
              role: "user",
              content:
                `${requestMessages[lastUserIndex].content || ""}

Attached file: ${fileName}

ACTUAL FILE CONTENT:
${text}

Use the actual file content above when answering.`
            };

          } else {

            requestMessages[lastUserIndex] = {
              role: "user",
              content:
                `${requestMessages[lastUserIndex].content || ""}

Attached file: ${fileName}

The current server could not extract readable text
from this file. Do not invent or guess its contents.`
            };

          }
        }
      }
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app",
          "X-Title":
            "SMATER CHAT AI"
        },

        body: JSON.stringify({
          model: "openrouter/free",

          messages: requestMessages,

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
        error: "AI service request failed."
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content;

    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    return res.status(200).json({
      text: answer.trim()
    });

  } catch (error) {

    console.error(
      "Chat API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while processing your request."
    });
  }
}


/* ---------------- HELPERS ---------------- */

function findLastUserMessage(messages) {

  for (let i = messages.length - 1; i >= 0; i--) {

    if (messages[i]?.role === "user") {
      return i;
    }

  }

  return -1;
}


function extractTextFromDataUrl(dataUrl) {

  if (typeof dataUrl !== "string") {
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
      metadata.includes("application/json") ||
      metadata.includes("text/csv")
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
      "File decode error:",
      error?.message || error
    );

    return "";
  }
}
