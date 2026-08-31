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

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI service is not configured."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        error: "Image prompt is required."
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/images/generations",
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
          prompt: prompt
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "Image provider status:",
        response.status
      );

      return res.status(502).json({
        error:
          "Image generation service is unavailable."
      });
    }

    const imageData =
      data?.data?.[0]?.b64_json;

    if (!imageData) {

      return res.status(502).json({
        error:
          "The image service returned no image."
      });
    }

    return res.status(200).json({
      image:
        `data:image/png;base64,${imageData}`
    });

  } catch (error) {

    console.error(
      "Image API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while generating the image."
    });

  }
}
