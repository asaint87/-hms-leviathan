import { Router, type IRouter } from "express";
import https from "https";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/generate-avatar
 * Accepts a selfie photo and returns an AI-stylized cartoon crew portrait
 * using OpenAI's gpt-image-1 model.
 *
 * Body: { photoBase64: string, mediaType: "image/jpeg" | "image/png" }
 * Returns: { success: true, imageBase64: string } or { success: false, error: string }
 */
router.post("/generate-avatar", async (req, res) => {
  try {
    const { photoBase64, mediaType } = req.body as {
      photoBase64?: string;
      mediaType?: string;
    };

    if (!photoBase64 || !mediaType) {
      res.status(400).json({ success: false, error: "Missing photoBase64 or mediaType" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY not set");
      res.status(500).json({ success: false, error: "Server not configured for avatar generation" });
      return;
    }

    const prompt = [
      "Stylize this person as a bold graphic novel submarine crew member.",
      "Military uniform with naval insignia, cinematic lighting,",
      "dark teal and amber color palette, comic book ink lines, heroic pose.",
      "Keep the person's face and likeness accurate.",
      "Style: dramatic illustration, thick outlines, deep shadows,",
      "like a movie poster for a submarine thriller.",
      "Background: dark steel interior of a submarine control room with",
      "glowing amber instruments and teal sonar screens.",
    ].join(" ");

    // Call OpenAI Images API (gpt-image-1 via /v1/images/edits)
    const imageBuffer = Buffer.from(photoBase64, "base64");

    // Build multipart/form-data manually
    const boundary = "----AvatarBoundary" + Date.now();
    const parts: Buffer[] = [];

    // model
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1\r\n`
    ));

    // prompt
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`
    ));

    // image file
    const ext = mediaType === "image/png" ? "png" : "jpg";
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="selfie.${ext}"\r\nContent-Type: ${mediaType}\r\n\r\n`
    ));
    parts.push(imageBuffer);
    parts.push(Buffer.from("\r\n"));

    // size
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024\r\n`
    ));

    // quality
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nmedium\r\n`
    ));

    // closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const result = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.openai.com",
          path: "/v1/images/edits",
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (d) => chunks.push(d));
          resp.on("end", () => {
            const raw = Buffer.concat(chunks).toString();
            try {
              const json = JSON.parse(raw);
              if (json.error) {
                reject(new Error(json.error.message || JSON.stringify(json.error)));
                return;
              }
              // gpt-image-1 returns b64_json by default, or url
              const imgData = json.data?.[0];
              if (imgData?.b64_json) {
                resolve(imgData.b64_json);
              } else if (imgData?.url) {
                // Fetch the URL and convert to base64
                fetchUrlAsBase64(imgData.url).then(resolve).catch(reject);
              } else {
                reject(new Error("No image data in response"));
              }
            } catch (e) {
              reject(new Error(`Failed to parse OpenAI response: ${raw.slice(0, 200)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    res.json({
      success: true,
      imageBase64: result,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Avatar generation failed");
    res.status(500).json({
      success: false,
      error: err.message || "Avatar generation failed",
    });
  }
});

function fetchUrlAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      const chunks: Buffer[] = [];
      resp.on("data", (d) => chunks.push(d));
      resp.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      resp.on("error", reject);
    });
  });
}

export default router;
