import { Client } from "@notionhq/client";
import fs from "fs";
import { NOTION_API_KEY } from "./notion_api_key";

const notion = new Client({ auth: NOTION_API_KEY });

export async function queryDatabase(databaseId: string) {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
    });
    fs.writeFileSync(
      "./output/database.json",
      JSON.stringify(response, null, 2)
    );
  } catch (error) {
    console.error(error);
  }
}

export async function fetchPageData(pageId: string) {
  const [pageMetadata, pageContent] = await Promise.all([
    notion.pages.retrieve({ page_id: pageId }),
    fetchBlocksRecursively(pageId),
  ]);

  fs.writeFileSync(
    "./output/page-metadata.json",
    JSON.stringify(pageMetadata, null, 2)
  );
  fs.writeFileSync(
    "./output/page-content.json",
    JSON.stringify(pageContent, null, 2)
  );
}

async function fetchBlocksRecursively(blockId: string) {
  const blocks = await notion.blocks.children.list({ block_id: blockId });

  const results = await Promise.all(
    blocks.results.map(async (block: any) => {
      if (block.has_children) {
        const children = await fetchBlocksRecursively(block.id);
        return { ...block, children };
      }
      return block;
    })
  );

  return {
    ...blocks,
    results,
  };
}

export async function getTableOfContents(pageId: string) {
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    const headings = response.results.filter((block: any) => {
      return block.type.startsWith("heading_");
    });

    const toc = headings.map((heading: any) => {
      const level = parseInt(heading.type.slice(-1));
      const text = heading[heading.type].rich_text[0].plain_text;

      return {
        level,
        text,
        id: heading.id,
      };
    });

    fs.writeFileSync("./output/toc.json", JSON.stringify(toc, null, 2));

    return toc;
  } catch (error) {
    console.error("목차 생성 중 오류 발생:", error);
    throw error;
  }
}
