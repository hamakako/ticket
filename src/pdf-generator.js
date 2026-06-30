const puppeteer = require("puppeteer");

async function renderHtmlToPdf(html, outputPath) {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--enable-gpu"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const frames = await page.$$("iframe");
    for (const frame of frames) {
      try {
        const screenshot = await frame.screenshot({ encoding: "base64" });
        const dataUri = `data:image/png;base64,${screenshot}`;
        await frame.evaluate((node, src) => {
          const image = document.createElement("img");
          image.src = src;
          image.alt = node.title || "Map preview";
          node.replaceWith(image);
        }, dataUri);
      } catch {
        // A remote map should never prevent the itinerary PDF from being created.
      }
    }

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  renderHtmlToPdf
};
