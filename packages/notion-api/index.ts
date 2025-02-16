// index.ts
import { fetchPageBlocksRecursively } from "./fetcher";
import { renderBlocks } from "./renderer";
import fs from "fs";

const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

async function main() {
  try {
    // FIXME: 큰 페이지가 아닌데도 fetch가 꽤 오래 걸린다. 13~18초 가량
    // 어차피 매번 똑같은데, 캐싱해서 쓰자.
    console.time("fetch");
    const blockTree = await fetchPageBlocksRecursively(notionPageId);
    console.timeEnd("fetch");

    fs.writeFileSync(
      "./output/api-raw.json",
      JSON.stringify(blockTree, null, 2),
    );

    const html = `
      <!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="../prism/prism.css" />
          <script src="../prism/prism.js"></script>
          <link rel="stylesheet" href="./basic.css" />
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
