export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { query } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: "Image search query is required."
      });
    }

    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: query.trim(),
      gsrlimit: "30",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "900",
      format: "json",
      origin: "*"
    });

    const searchUrl =
      "https://commons.wikimedia.org/w/api.php?" +
      params.toString();

    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.error(
        "Wikimedia status:",
        response.status
      );

      return res.status(502).json({
        error: "Image search service failed."
      });
    }

    const data = await response.json();

    const pages =
      data?.query?.pages || {};

    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ]);

    const results = Object.values(pages)
      .map((page) => {
        const info =
          page?.imageinfo?.[0];

        if (!info) return null;

        const mime =
          String(info.mime || "").toLowerCase();

        if (!allowedTypes.has(mime)) {
          return null;
        }

        const metadata =
          info.extmetadata || {};

        const clean = (value) =>
          String(value || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/gi, " ")
            .trim();

        return {
          image:
            info.thumburl || info.url,

          original:
            info.url,

          title:
            clean(
              metadata.ObjectName?.value
            ) ||
            page.title
              ?.replace(/^File:/, "") ||
            "Image",

          license:
            clean(
              metadata.LicenseShortName?.value
            ) ||
            "See source",

          author:
            clean(
              metadata.Artist?.value
            ),

          source:
            "https://commons.wikimedia.org/wiki/" +
            encodeURIComponent(page.title)
        };
      })
      .filter(Boolean);

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      if (seen.has(item.image)) continue;

      seen.add(item.image);
      unique.push(item);
    }

    return res.status(200).json({
      success: true,
      query: query.trim(),
      results: unique.slice(0, 20)
    });

  } catch (error) {
    console.error(
      "Image search error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to search images right now."
    });
  }
}
