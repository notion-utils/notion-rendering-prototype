// index.ts
import fs from "fs";
import { fetchBlocksWithImages } from "./fetcher";
import { renderBlocks } from "./renderer";

const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

async function main() {
  const blockTree = await fetchBlocksWithImages(notionPageId);

  const html = `
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="../prism/prism.css" />
        <script src="../prism/prism.js"></script>
        <link rel="stylesheet" href="../basic.css" />
      </head>
      <body>
        ${renderBlocks(blockTree)}
      </body>
    </html>
  `;
  fs.writeFileSync("./output/basic.html", html);
}

main().catch(console.error);
