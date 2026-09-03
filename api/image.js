// SMATER CHAT AI
// api/image.js
// Safe image-generation endpoint
//
// Required Vercel Environment Variable:
// HF_TOKEN
//
// This endpoint does NOT expose the token to the browser.
// It also refuses requests when the token is missing.

export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const token = process.env.HF_TOKEN;

    // Never expose missing/invalid server configuration details
    if (!token) {
      return res.status(503).json({
        error:
          "Image generation is not configured yet. Please add the HF_TOKEN environment variable."
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

    const referenceImage =
      typeof body.referenceImage === "string"
        ? body.referenceImage.trim()
        : "";

    // Basic validation
    if (!prompt) {
      return res.status(400).json({
        error: "Please enter an image prompt."
      });
    }

    // Prevent unnecessarily huge requests
    if (prompt.length > 4000) {
      return res.status(400).json({
        error: "Image prompt is too long. Please keep it under 4000 characters."
      });
    }

    /*
      Current generation model.

      FLUX.1-schnell is used for the first implementation
      because Hugging Face documents it for text-to-image
      through Inference Providers.
    */
    const model =
      "black-forest-labs/FLUX.1-schnell";

    /*
      Build a clean professional prompt.

      We keep the user's actual request intact.
      We do not ask the model to imitate a living artist.
    */
    let finalPrompt =
      prompt;

    if (referenceImage) {
      /*
        Reference-image editing is intentionally not sent
        through this first text-to-image path.

        The frontend may already supply referenceImage.
        We return a clear response instead of pretending
        that an edit happened.
      */
      return res.status(400).json({
        error:
          "Reference-image editing will be enabled in the dedicated image-editing step. Text-to-image generation is ready."
      });
    }

    /*
      Hugging Face JavaScript SDK is not required here.

      The SDK's documented textToImage task returns an image
      Blob. To keep the Vercel function lightweight, this
      endpoint uses the corresponding routed inference HTTP
      endpoint.
    */

    const response =
      await fetch(
        "https://router.huggingface.co/hf-inference/models/" +
          encodeURIComponent(model),
        {
          method: "POST",
          headers: {
            "Authorization":
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            inputs: finalPrompt
          })
        }
      );

    // Read binary image response safely
    const contentType =
      String(
        response.headers.get("content-type") || ""
      ).toLowerCase();

    if (!response.ok) {
      let providerMessage =
        "";

      try {
        if (contentType.includes("application/json")) {
          const errorData =
            await response.json();

          providerMessage =
            errorData?.error ||
            errorData?.message ||
            "";
        } else {
          providerMessage =
            await response.text();
        }
      } catch {
        providerMessage = "";
      }

      console.error(
        "Hugging Face image error:",
        response.status,
        providerMessage
      );

      if (response.status === 401 ||
          response.status === 403) {
        return res.status(502).json({
          error:
            "Image-generation service authentication failed. Check the HF_TOKEN configuration."
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Image-generation service is temporarily rate-limited. Please try again later."
        });
      }

      if (response.status === 503) {
        return res.status(503).json({
          error:
            "The image model is temporarily starting or unavailable. Please try again shortly."
        });
      }

      return res.status(502).json({
        error:
          "The image-generation service could not complete the request."
      });
    }

    /*
      We expect an actual image response.

      Do not accidentally return an HTML page,
      JSON error, or provider message as an image.
    */
    if (!contentType.startsWith("image/")) {
      let providerMessage = "";

      try {
        providerMessage =
          await response.text();
      } catch {
        providerMessage = "";
      }

      console.error(
        "Unexpected image response:",
        contentType,
        providerMessage.slice(0, 500)
      );

      return res.status(502).json({
        error:
          "The image service returned an unexpected response."
      });
    }

    const imageBuffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (!imageBuffer.length) {
      return res.status(502).json({
        error:
          "The image service returned an empty image."
      });
    }

    /*
      Keep generated image response bounded.
      This protects the serverless function and browser.
    */
    const MAX_IMAGE_BYTES =
      15 * 1024 * 1024;

    if (
      imageBuffer.length >
      MAX_IMAGE_BYTES
    ) {
      return res.status(502).json({
        error:
          "The generated image is too large to return safely."
      });
    }

    /*
      Return the image directly.

      Frontend can use:
      response.blob()
      and create an object URL.
    */
    res.setHeader(
      "Content-Type",
      contentType
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    return res
      .status(200)
      .send(imageBuffer);

  } catch (error) {
    console.error(
      "SMATER CHAT AI image error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while generating the image."
    });
  }
}
