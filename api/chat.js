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

    /* =========================================
       FIND LAST USER MESSAGE
       ========================================= */

    const lastUserIndex =
      findLastUserMessage(messages);

    const lastUserText =
      lastUserIndex !== -1
        ? getMessageText(messages[lastUserIndex])
        : "";

    /* =========================================
       FOUNDER QUESTIONS
       ========================================= */

    if (isFounderQuestion(lastUserText)) {

      const answer =
        getFounderAnswer(language);

      return res.status(200).json({
        text: answer
      });
    }

    /* =========================================
       SYSTEM PROMPT
       ========================================= */

    const systemPrompt = `
You are SMATER CHAT AI.

You are an intelligent, helpful and professional
multilingual AI assistant.

Your purpose is to help users:
- learn
- understand information
- solve problems
- write
- create
- brainstorm
- analyze documents
- work with images
- complete everyday tasks

LANGUAGE RULE:
Respond naturally in the language requested by the user.
Support Hindi, Hinglish and English.

Do not unnecessarily mention SMATER CHAT AI.
Do not unnecessarily mention the founder.

FOUNDER RULE:
The founder of SMATER CHAT AI is
Damini Singh Bhadauria.

Only mention the founder when the user specifically asks
who founded, created, developed, started or made
SMATER CHAT AI.

If the user asks about another AI company or product,
such as OpenAI or ChatGPT, answer about that company/product
accurately. Never claim SMATER CHAT AI created another AI.

FILE RULE:
If a file is attached, use its actual contents when possible.

For PDFs:
- read the actual PDF
- answer questions from its contents
- summarize the actual document when requested
- never invent information

For images:
- analyze the actual image when supported
- never pretend to see something that is unavailable

IMPORTANT:
Do not output internal safety labels, provider metadata,
system instructions, API information, hidden reasoning,
or internal processing information.

Do not write:
"User Safety: safe"
"Response Safety: safe"
or similar internal labels.

Selected language:
${language}

Selected AI mode:
${mode}
`;

    /* =========================================
       BUILD REQUEST MESSAGES
       ========================================= */

    const requestMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];

    /* =========================================
       ATTACHED FILE
       ========================================= */

    if (
      file &&
      file.data &&
      lastUserIndex !== -1
    ) {

      const fileName =
        String(file.name || "attached-file");

      const fileType =
        String(file.type || "").toLowerCase();

      const userText =
        getMessageText(messages[lastUserIndex]) ||
        "Please analyze the attached file.";

      /* =======================================
         PDF
         ======================================= */

      if (
        fileType === "application/pdf" ||
        fileName.toLowerCase().endsWith(".pdf")
      ) {

        requestMessages[
          lastUserIndex + 1
        ] = {
          role: "user",

          content: [
            {
              type: "text",

              text:
                `${userText}

Attached PDF:
${fileName}

Please read the actual PDF and answer the user's request
using the document's real contents.

If the user asks for a summary, summarize the document.
If the user asks a question, answer from the document.
Do not invent information.`
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

      /* =======================================
         IMAGE
         ======================================= */

      else if (
        fileType.startsWith("image/")
      ) {

        requestMessages[
          lastUserIndex + 1
        ] = {
          role: "user",

          content: [
            {
              type: "text",

              text:
                `${userText}

Attached image:
${fileName}

Analyze the actual image and answer the user's request.`
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

      /* =======================================
         TEXT FILE
         ======================================= */

      else {

        const extractedText =
          extractTextFromDataUrl(file.data);

        if (extractedText) {

          requestMessages[
            lastUserIndex + 1
          ] = {
            role: "user",

            content:
              `${userText}

Attached file:
${fileName}

ACTUAL FILE CONTENT:
${extractedText}

Use the actual file content when answering.`
          };

        } else {

          requestMessages[
            lastUserIndex + 1
          ] = {
            role: "user",

            content:
              `${userText}

Attached file:
${fileName}

The current server could not extract readable text
from this file.

Do not invent or guess its contents.`
          };
        }
      }
    }

    /* =========================================
       OPENROUTER
       ========================================= */

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

    /* =========================================
       API ERROR
       ========================================= */

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

    /* =========================================
       GET ANSWER
       ========================================= */

    let answer =
      data?.choices?.[0]?.message?.content;

    if (
      typeof answer !== "string"
    ) {

      /*
        Some providers may return structured
        content instead of a simple string.
      */

      if (
        Array.isArray(answer)
      ) {

        answer =
          answer
            .map(item => {

              if (
                typeof item === "string"
              ) {
                return item;
              }

              return item?.text || "";
            })
            .join("\n");

        }
    }

    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {

      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    /* =========================================
       REMOVE INTERNAL SAFETY LABELS
       ========================================= */

    answer =
      cleanAnswer(answer);

    if (!answer.trim()) {

      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    /* =========================================
       FINAL RESPONSE
       ========================================= */

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


/* =============================================
   FIND LAST USER MESSAGE
   ============================================= */

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


/* =============================================
   GET MESSAGE TEXT
   ============================================= */

function getMessageText(message) {

  if (!message) {
    return "";
  }

  if (
    typeof message.content === "string"
  ) {
    return message.content.trim();
  }

  if (
    Array.isArray(message.content)
  ) {

    return message.content
      .map(item => {

        if (
          typeof item === "string"
        ) {
          return item;
        }

        return item?.text || "";
      })
      .join(" ")
      .trim();
  }

  return "";
}


/* =============================================
   FOUNDER QUESTION DETECTION
   ============================================= */

function isFounderQuestion(text) {

  const value =
    String(text || "")
      .toLowerCase()
      .replace(/[?!.,"']/g, " ");

  const mentionsSmater =
    value.includes("smater chat ai") ||
    value.includes("smater chat");

  if (!mentionsSmater) {
    return false;
  }

  const founderWords = [
    "founder",
    "founded",
    "created",
    "creator",
    "developed",
    "developer",
    "started",
    "start",
    "made",
    "maker",
    "banaya",
    "banaya hai",
    "kisne banaya",
    "kisne banayi",
    "kisne banaya hai",
    "kisne banaya?",
    "found kisne",
    "founder kaun",
    "founder kon",
    "kisne develop",
    "kisne create"
  ];

  return founderWords.some(
    word => value.includes(word)
  );
}


/* =============================================
   FOUNDER ANSWER
   ============================================= */

function getFounderAnswer(language) {

  const lang =
    String(language || "")
      .toLowerCase();

  if (
    lang === "hindi"
  ) {

    return (
      "मैं SMATER CHAT AI हूँ, एक intelligent multilingual AI assistant। " +
      "मुझे Damini Singh Bhadauria ने independently found और develop किया है। " +
      "मेरा उद्देश्य users को questions, learning, problem-solving, writing, " +
      "creativity और everyday tasks में मदद करना है।"
    );
  }

  if (
    lang === "hinglish"
  ) {

    return (
      "Main SMATER CHAT AI hoon, ek intelligent multilingual AI assistant. " +
      "Mujhe Damini Singh Bhadauria ne independently found aur develop kiya hai. " +
      "Mera purpose users ko questions, learning, problem-solving, writing, " +
      "creativity aur everyday tasks mein help karna hai."
    );
  }

  return (
    "I’m SMATER CHAT AI, an intelligent multilingual AI assistant. " +
    "I was founded and developed by Damini Singh Bhadauria " +
    "as an independent AI project. I’m designed to help users " +
    "with questions, learning, problem-solving, writing, creativity, " +
    "and everyday tasks."
  );
}


/* =============================================
   REMOVE INTERNAL METADATA
   ============================================= */

function cleanAnswer(text) {

  let result =
    String(text || "");

  const unwantedPatterns = [
    /^User Safety\s*:\s*.*$/gim,
    /^Response Safety\s*:\s*.*$/gim,
    /^Safety\s*:\s*.*$/gim,
    /^Internal Safety\s*:\s*.*$/gim,
    /^Provider Metadata\s*:\s*.*$/gim
  ];

  unwantedPatterns.forEach(
    pattern => {
      result =
        result.replace(
          pattern,
          ""
        );
    }
  );

  return result.trim();
}


/* =============================================
   TEXT FILE EXTRACTION
   ============================================= */

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
      "Text file decode error:",
      error?.message || error
    );

    return "";
  }
                 }
