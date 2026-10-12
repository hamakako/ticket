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

async function renderHtmlToPngPages(html, outputPathForPage) {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--enable-gpu"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await page.addStyleTag({ content: ".print-button{display:none!important}" });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pages = await page.$$(".page");
    if (!pages.length) throw new Error("The generated quotation contains no printable pages.");
    const outputPaths = [];
    for (let index = 0; index < pages.length; index += 1) {
      const outputPath = outputPathForPage(index + 1, pages.length);
      await pages[index].screenshot({ path: outputPath, type: "png" });
      outputPaths.push(outputPath);
    }
    return outputPaths;
  } finally {
    await browser.close();
  }
}

module.exports = {
  renderHtmlToPdf,
  renderHtmlToPngPages
};
