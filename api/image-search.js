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

    const searchUrl =
      "https://commons.wikimedia.org/w/api.php" +
      "?action=query" +
      "&generator=search" +
      "&gsrnamespace=6" +
      "&gsrsearch=" +
      encodeURIComponent(query.trim()) +
      "&gsrlimit=30" +
      "&prop=imageinfo" +
      "&iiprop=url|mime|size|extmetadata" +
      "&iiurlwidth=900" +
      "&format=json";

    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error("Image search service failed.");
    }

    const data = await response.json();

    const pages = data?.query?.pages || {};

    const results = Object.values(pages)
      .map((page) => {
        const info = page?.imageinfo?.[0];

        if (!info) return null;

        const mime =
          String(info.mime || "").toLowerCase();

        // Only real image files
        const allowed = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/gif"
        ];

        if (!allowed.includes(mime)) {
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
            clean(metadata.ObjectName?.value) ||
            page.title?.replace(/^File:/, "") ||
            "Image",

          license:
            clean(
              metadata.LicenseShortName?.value
            ) || "See source",

          author:
            clean(metadata.Artist?.value),

          source:
            "https://commons.wikimedia.org/wiki/" +
            encodeURIComponent(page.title)
        };
      })
      .filter(Boolean);

    // Remove duplicate images
    const unique = [];
    const seen = new Set();

    for (const item of results) {
      if (seen.has(item.image)) continue;

      seen.add(item.image);
      unique.push(item);
    }

    return res.status(200).json({
      success: true,
      results: unique.slice(0, 20)
    });

  } catch (error) {
    console.error(
      "Image search error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Unable to search images right now."
    });
  }
}
