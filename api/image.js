import { InferenceClient } from "@huggingface/inference";

const IMAGE_MODEL =
  "black-forest-labs/FLUX.1-schnell";

const EDIT_MODEL =
  "black-forest-labs/FLUX.1-Kontext-dev";

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

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

    const referenceImage =
      typeof body.referenceImage === "string"
        ? body.referenceImage.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        error:
          "Please describe the image you want to create."
      });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({
        error:
          "Image prompt is too long. Please use a shorter description."
      });
    }

    const token =
      process.env.HF_TOKEN;

    if (!token) {
      return res.status(500).json({
        error:
          "Image generation is not configured yet."
      });
    }

    const hf =
      new InferenceClient(token);

    let imageBlob;

    if (referenceImage) {

      imageBlob =
        await generateEditedImage(
          hf,
          referenceImage,
          prompt
        );

    } else {

      imageBlob =
        await generateNewImage(
          hf,
          prompt
        );
    }

    if (!imageBlob) {
      return res.status(502).json({
        error:
          "The image service returned no image."
      });
    }

    const arrayBuffer =
      await imageBlob.arrayBuffer();

    const imageBuffer =
      Buffer.from(arrayBuffer);

    if (!imageBuffer.length) {
      return res.status(502).json({
        error:
          "The generated image was empty."
      });
    }

    const base64 =
      imageBuffer.toString("base64");

    return res.status(200).json({
      success: true,
      image:
        `data:image/png;base64,${base64}`,
      mimeType:
        "image/png"
    });

  } catch (error) {

    console.error(
      "SMATER image generation error:",
      error?.message || error
    );

    return res.status(
      getErrorStatus(error)
    ).json({
      error:
        getPublicImageError(error)
    });
  }
}

async function generateNewImage(
  hf,
  prompt
) {

  return await hf.textToImage({

    model:
      IMAGE_MODEL,

    inputs:
      buildImagePrompt(prompt),

    parameters: {
      num_inference_steps: 4
    }
  });
}

function buildImagePrompt(prompt) {

  return `
Create a high-quality image based on this request:

${prompt}

Make the image visually clear,
well-composed and suitable for general use.

Do not add unnecessary watermarks.
Do not add random text unless the user requests text.
`.trim();
}
async function generateEditedImage(
  hf,
  referenceImage,
  prompt
) {
  const imageBlob =
    await dataUrlToBlob(
      referenceImage
    );

  if (!imageBlob) {
    throw publicImageError(
      400,
      "The reference image could not be read."
    );
  }

  return await hf.imageToImage({
    model:
      EDIT_MODEL,

    inputs:
      imageBlob,

    parameters: {
      prompt:
        buildEditPrompt(prompt),

      num_inference_steps: 4
    }
  });
}

function buildEditPrompt(prompt) {

  return `
Edit or transform the provided image
according to this request:

${prompt}

Keep the main subject and important details
of the reference image unless the user
specifically asks to change them.

Create a clean, high-quality result.
Do not add unnecessary watermarks.
`.trim();
}

async function dataUrlToBlob(
  dataUrl
) {
  if (
    typeof dataUrl !== "string"
  ) {
    return null;
  }

  const match =
    dataUrl.match(
      /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s
    );

  if (!match) {
    return null;
  }

  const mime =
    String(
      match[1] || ""
    ).toLowerCase();

  const base64 =
    match[2];

  const allowedTypes =
    new Set([
      "image/png",
      "image/jpeg",
      "image/webp"
    ]);

  if (
    !allowedTypes.has(mime)
  ) {
    throw publicImageError(
      400,
      "Only PNG, JPEG, and WebP reference images are supported."
    );
  }

  let buffer;

  try {
    buffer =
      Buffer.from(
        base64,
        "base64"
      );
  } catch {
    return null;
  }

  if (
    !buffer.length
  ) {
    return null;
  }

  const maxBytes =
    8 * 1024 * 1024;

  if (
    buffer.length >
    maxBytes
  ) {
    throw publicImageError(
      413,
      "The reference image is too large. Please use an image under 8 MB."
    );
  }

  return new Blob(
    [buffer],
    {
      type: mime
    }
  );
}
function publicImageError(
  statusCode,
  message
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.publicMessage =
    message;

  return error;
}

function getErrorStatus(error) {
  const status =
    Number(
      error?.statusCode
    );

  if (
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }

  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  if (
    message.includes("unauthorized") ||
    message.includes("invalid token") ||
    message.includes("authentication")
  ) {
    return 500;
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("quota")
  ) {
    return 429;
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return 504;
  }

  return 502;
}

function getPublicImageError(error) {
  const status =
    Number(
      error?.statusCode
    );

  if (status === 413) {
    return (
      error?.publicMessage ||
      "The reference image is too large."
    );
  }

  if (status === 429) {
    return (
      "The free image-generation limit is currently unavailable. Please try again later."
    );
  }

  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  if (
    message.includes("unauthorized") ||
    message.includes("invalid token") ||
    message.includes("authentication")
  ) {
    return (
      "Image generation is not configured correctly yet."
    );
  }

  if (
    message.includes("credit") ||
    message.includes("quota") ||
    message.includes("payment") ||
    message.includes("billing")
  ) {
    return (
      "The image-generation provider has no available free credit right now."
    );
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return (
      "Image generation took too long. Please try again."
    );
  }

  if (
    message.includes("moderation") ||
    message.includes("safety")
  ) {
    return (
      "That image request cannot be processed."
    );
  }

  return (
    error?.publicMessage ||
    "I couldn't generate the image right now. Please try again."
  );
}
/*
  SMATER CHAT AI
  Image Generation API
  Final helper section
*/

function normalizeImagePrompt(prompt) {
  return String(prompt || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function isValidImageDataUrl(value) {
  if (
    typeof value !== "string"
  ) {
    return false;
  }

  return /^data:image\/(png|jpeg|webp);base64,/i
    .test(value);
}

function getImageMimeType(value) {
  if (
    typeof value !== "string"
  ) {
    return "image/png";
  }

  const match =
    value.match(
      /^data:(image\/(?:png|jpeg|webp));/i
    );

  return match
    ? match[1].toLowerCase()
    : "image/png";
}

function createImageResponse(
  buffer,
  mimeType
) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0
  ) {
    throw publicImageError(
      502,
      "The generated image is empty."
    );
  }

  return {
    success: true,
    image:
      `data:${mimeType};base64,` +
      buffer.toString("base64"),
    mimeType
  };
}

function cleanImageText(text) {
  return String(text || "")
    .replace(
      /\u0000/g,
      ""
    )
    .trim();
}
