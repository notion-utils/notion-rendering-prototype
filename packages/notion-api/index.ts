// index.ts
import { fetchPageBlocksRecursively } from "./fetcher";
import { renderBlocks } from "./renderer";
import fs from "fs";

const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

async function main() {
  try {
    // 1) 페이지의 모든 블록(및 자식 블록) 재귀적으로 한 번에 Fetch
    console.time("fetch");
    const blockTree = await fetchPageBlocksRecursively(notionPageId);
    console.timeEnd("fetch");

    fs.writeFileSync(
      "./output/api-raw.json",
      JSON.stringify(blockTree, null, 2),
    );

    // 2) 블록 트리를 HTML로 렌더링
    const html =
      // link-mention 스타일을 css로 추가함 (html에 안넣어도 되긴 함)
      `<style>
  a,
  a:hover,
  a:focus,
  a:active {
    text-decoration: none;
    color: inherit;
  }

  .inline-link-mention {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }

  .inline-link-icon {
    width: 16px;
    height: 16px;
    vertical-align: middle;
  }
</style>` + renderBlocks(blockTree);

    // 3) 결과 확인
    fs.writeFileSync("./output/test.html", html);
  } catch (error) {
    console.error(error);
  }
}

main();
