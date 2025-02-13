import { Client } from "@notionhq/client";
import { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { ExtendedBlockObjectResponse } from "./types";
import { NOTION_API_KEY } from "./notion_api_key";

function removePropertiesRecursively(
  obj: Record<string, any>,
  propNames: Set<string>,
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    // 배열인 경우 각 요소를 재귀적으로 탐색
    for (const item of obj) {
      removePropertiesRecursively(item, propNames);
    }
  } else {
    // 객체인 경우
    for (const key of Object.keys(obj)) {
      if (propNames.has(key)) {
        // 지정된 프로퍼티명과 일치하면 제거
        delete obj[key];
        // 제거된 프로퍼티 내부는 더 이상 탐색하지 않음
      } else {
        // 일치하지 않으면 하위 객체(또는 배열)을 재귀적으로 탐색
        removePropertiesRecursively(obj[key], propNames);
      }
    }
  }
}

const notion = new Client({ auth: NOTION_API_KEY });

/**
 * 특정 블록(또는 페이지)의 children을 모두 가져오되,
 * has_children = true인 블록에 대해서는 재귀 호출로 자식 블록들도 모두 가져와
 * 최종적으로 'children'까지 갖춘 트리 구조를 반환한다.
 */
export async function fetchBlocksRecursively(
  blockId: string,
): Promise<ExtendedBlockObjectResponse[]> {
  const allBlocks: ExtendedBlockObjectResponse[] = [];

  let cursor: string | undefined = undefined;
  while (true) {
    const response: ListBlockChildrenResponse =
      await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });

    const blockResults = response.results as ExtendedBlockObjectResponse[];

    // 각 블록을 순회하면서, has_children = true이면 또 재귀적으로 children을 fetch
    for (const block of blockResults) {
      if (block.has_children) {
        // 자식 블록들을 가져온 뒤, block.children 필드에 저장
        const childBlocks = await fetchBlocksRecursively(block.id);
        block.children = childBlocks;
      }
    }

    allBlocks.push(...blockResults);

    if (!response.has_more) {
      break;
    }
    cursor = response.next_cursor || undefined;
  }

  return allBlocks;
}

/**
 * 페이지(최상위) 블록들을 트리 형태로 한 번에 가져오는 함수
 */
export async function fetchPageBlocksRecursively(
  pageId: string,
): Promise<ExtendedBlockObjectResponse[]> {
  const rawBlocks = fetchBlocksRecursively(pageId);

  removePropertiesRecursively(
    rawBlocks,
    new Set([
      "created_time",
      "last_edited_time",
      "created_by",
      "last_edited_by",
      "has_children",
      "archived",
      "in_trash",
      "parent",
      "object",
    ]),
  );

  return rawBlocks;
}
