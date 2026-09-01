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

    const query =
      typeof body.query === "string"
        ? body.query.trim()
        : "";

    if (!query) {
      return res.status(400).json({
        error: "Please enter an image search."
      });
    }

    const url =
      "https://commons.wikimedia.org/w/api.php" +
      "?action=query" +
      "&generator=search" +
      "&gsrsearch=" +
      encodeURIComponent(query) +
      "&gsrnamespace=6" +
      "&gsrlimit=12" +
      "&prop=imageinfo" +
      "&iiprop=url|extmetadata" +
      "&iiurlwidth=700" +
      "&format=json" +
      "&origin=*";

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Image search service unavailable."
      );
    }

    const data =
      await response.json();

    const pages =
      data?.query?.pages || {};

    const results =
      Object.values(pages).map(page => {

        const meta =
          page.imageinfo?.[0] || {};

        const metadata =
          meta.extmetadata || {};

        return {
          title:
            page.title
              ?.replace(/^File:/, "") ||
            "Image",

          image:
            meta.thumburl ||
            meta.url ||
            "",

          original:
            meta.url ||
            "",

          description:
            metadata.ImageDescription?.value ||
            "",

          author:
            metadata.Artist?.value ||
            "Unknown",

          license:
            metadata.LicenseShortName?.value ||
            "See source",

          source:
            "https://commons.wikimedia.org/wiki/" +
            encodeURIComponent(page.title || "")
        };

      }).filter(item => item.image);

    return res.status(200).json({
      results
    });

  } catch (error) {

    console.error(
      "Image search error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Image search could not be completed."
    });
  }
}
