// index.ts
import { fetchBlocksWithImages } from "./fetcher";
import { renderBlocks } from "./renderer";
import fs from "fs";

const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

const API_RESPONSE_JSON_PATH = "./output/api-raw.json";

async function main() {
  try {
    // FIXME: 큰 페이지가 아닌데도 fetch가 꽤 오래 걸린다. 13~18초 가량
    if (!fs.existsSync(API_RESPONSE_JSON_PATH)) {
      console.time("fetch");
      const blockTree = await fetchBlocksWithImages(notionPageId);
      console.timeEnd("fetch");

      fs.writeFileSync(
        API_RESPONSE_JSON_PATH,
        JSON.stringify(blockTree, null, 2),
      );
    }

    const blockTree = JSON.parse(
      fs.readFileSync(API_RESPONSE_JSON_PATH).toString(),
    );

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
  } catch (error) {
    console.error(error);
  }
}

main();
