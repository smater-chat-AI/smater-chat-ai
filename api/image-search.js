export default async function handler(req, res) {
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

    const query =
      typeof body.query === "string"
        ? body.query.trim()
        : "";

    if (!query) {
      return res.status(400).json({
        error: "Please enter an image search query."
      });
    }

    if (query.length > 300) {
      return res.status(400).json({
        error: "Image search query is too long."
      });
    }

    const params = new URLSearchParams({
      action: "query",
      generator: "search",

      gsrnamespace: "6",
      gsrsearch: query,
      gsrlimit: "40",

      prop: "imageinfo",
      iiprop:
        "url|mime|size|extmetadata",

      iiurlwidth: "900",

      format: "json",
      formatversion: "2",
      origin: "*"
    });

    const searchUrl =
      "https://commons.wikimedia.org/w/api.php?" +
      params.toString();

    const response =
      await fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "SMATER-CHAT-AI/1.0"
        }
      });

    if (!response.ok) {
      console.error(
        "Wikimedia response:",
        response.status
      );

      return res.status(502).json({
        error:
          "Image search service is temporarily unavailable."
      });
    }

    const data =
      await response.json();

    const pages =
      Array.isArray(data?.query?.pages)
        ? data.query.pages
        : [];

    const allowedMimeTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
      ]);

    function cleanMetadata(value) {
      return String(value || "")
        .replace(
          /<[^>]*>/g,
          ""
        )
        .replace(
          /&nbsp;/gi,
          " "
        )
        .replace(
          /&amp;/gi,
          "&"
        )
        .replace(
          /&quot;/gi,
          '"'
        )
        .replace(
          /&#39;/gi,
          "'"
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();
    }

    const results = [];

    for (const page of pages) {
      const info =
        page?.imageinfo?.[0];

      if (!info) {
        continue;
      }

      const mime =
        String(
          info.mime || ""
        ).toLowerCase();

      if (
        !allowedMimeTypes.has(mime)
      ) {
        continue;
      }

      const imageUrl =
        info.thumburl ||
        info.url ||
        "";

      const originalUrl =
        info.url ||
        imageUrl;

      if (
        !imageUrl ||
        !originalUrl
      ) {
        continue;
      }

      const metadata =
        info.extmetadata || {};

      const title =
        cleanMetadata(
          metadata.ObjectName?.value
        ) ||
        String(
          page.title || ""
        )
          .replace(
            /^File:/i,
            ""
          )
          .trim() ||
        "Image";

      const license =
        cleanMetadata(
          metadata.LicenseShortName?.value
        ) ||
        "License information available at source";

      const author =
        cleanMetadata(
          metadata.Artist?.value
        );

      const description =
        cleanMetadata(
          metadata.ImageDescription?.value
        );

      const source =
        page.title
          ? "https://commons.wikimedia.org/wiki/" +
            encodeURIComponent(
              page.title
            )
          : "https://commons.wikimedia.org/";

      results.push({
        image: imageUrl,
        original: originalUrl,
        title,
        license,
        author,
        description,
        source
      });
    }

    const uniqueResults = [];
    const seen = new Set();

    for (
      const item of results
    ) {
      const key =
        item.image ||
        item.original;

      if (!key) {
        continue;
      }

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueResults.push(item);

      if (
        uniqueResults.length >= 20
      ) {
        break;
      }
    }

    return res.status(200).json({
      success: true,
      query,
      count:
        uniqueResults.length,
      results:
        uniqueResults
    });

  } catch (error) {
    console.error(
      "SMATER image search error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Unable to search images right now."
    });
  }
}
