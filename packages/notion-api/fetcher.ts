import fs from "fs";
import path from "path";
import https from "https";
import { Client, LogLevel } from "@notionhq/client";
import { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { BlockObjectResponseWithChildren } from "./types";
import { NOTION_API_KEY } from "./notion_api_key";

/**
 * 이미지 URL에서 파일을 다운로드하여 저장하는 함수
 * @param imageUrl 다운로드할 이미지 URL
 * @param outputDir 저장할 디렉토리 경로
 * @param filename 저장할 파일명 (없으면 URL에서 추출)
 * @returns 저장된 파일의 경로
 */
async function downloadImage(
  imageUrl: string,
  outputDir: string = "./temp/images",
  filename?: string,
): Promise<string> {
  try {
    // 출력 디렉토리가 없으면 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 파일명이 제공되지 않은 경우 URL에서 추출하거나 타임스탬프 사용
    if (!filename) {
      const urlParts = new URL(imageUrl).pathname.split("/");
      filename = urlParts[urlParts.length - 1] || `image-${Date.now()}.png`;
    }

    // 파일 확장자가 없는 경우 .png 추가
    if (!path.extname(filename)) {
      filename += ".png";
    }

    const outputPath = path.join(outputDir, filename);

    // 이미지 다운로드 (Node.js 기본 모듈 사용)
    return new Promise<string>((resolve, reject) => {
      https
        .get(imageUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `이미지 다운로드 실패: HTTP 상태 코드 ${response.statusCode}`,
              ),
            );
            return;
          }

          const fileStream = fs.createWriteStream(outputPath);
          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            resolve(outputPath);
          });

          fileStream.on("error", (err) => {
            fs.unlink(outputPath, () => {}); // 실패 시 파일 삭제 시도
            reject(err);
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  } catch (error) {
    console.error("이미지 다운로드 중 오류 발생:", error);
    throw error;
  }
}

/**
 * 객체 내의 모든 이미지 URL을 찾아 다운로드하고 링크를 업데이트하는 함수
 * @param obj 이미지 URL을 포함할 수 있는 객체
 * @param outputDir 이미지를 저장할 디렉토리
 */
async function downloadAllImages(
  obj: Record<string, any>,
  outputDir: string = "./temp/images",
): Promise<void> {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    // 배열인 경우 각 요소를 재귀적으로 처리
    for (const item of obj) {
      await downloadAllImages(item, outputDir);
    }
  } else {
    // 이미지 블록 처리
    if (
      obj.type === "image" &&
      obj.image?.type === "file" &&
      obj.image?.file?.url
    ) {
      try {
        const imageUrl = obj.image.file.url;
        const filename = `image-${obj.id}.png`;
        const localPath = await downloadImage(imageUrl, outputDir, filename);

        // 원래 URL 백업 후 로컬 경로로 변경
        obj.image.file.original_url = imageUrl;
        obj.image.file.url = `./images/${localPath}`;
        console.log(`이미지 다운로드 완료: ${localPath}`);
      } catch (error) {
        console.error(`이미지 다운로드 실패 (ID: ${obj.id}):`, error);
      }
    }

    // 파일 블록 처리 (첨부 파일이 이미지인 경우)
    if (
      obj.type === "file" &&
      obj.file?.type === "file" &&
      obj.file?.file?.url
    ) {
      try {
        const fileUrl = obj.file.file.url;
        // 이미지 파일인지 확인 (URL에서 추측)
        if (fileUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
          const filename = `file-${obj.id}.png`;
          const localPath = await downloadImage(fileUrl, outputDir, filename);

          // 원래 URL 백업 후 로컬 경로로 변경
          obj.file.file.original_url = fileUrl;
          obj.file.file.url = `file://${localPath}`;
          console.log(`파일 이미지 다운로드 완료: ${localPath}`);
        }
      } catch (error) {
        console.error(`파일 다운로드 실패 (ID: ${obj.id}):`, error);
      }
    }

    // 객체의 모든 속성에 대해 재귀적으로 처리
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") {
        await downloadAllImages(obj[key], outputDir);
      }
    }
  }
}

/**
 * fetchBlocksRecursively 함수와 함께 사용하여 이미지를 다운로드하는 함수
 */
export async function fetchBlocksWithImages(
  blockId: string,
  outputDir: string = "./temp/images",
): Promise<BlockObjectResponseWithChildren[]> {
  // 블록 데이터 가져오기
  const blocks = await fetchBlocksRecursively(blockId);

  // 이미지 다운로드 및 URL 업데이트
  await downloadAllImages(blocks, outputDir);

  return blocks;
}

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

const notion = new Client({ auth: NOTION_API_KEY, logLevel: LogLevel.DEBUG });

/**
 * 특정 블록(또는 페이지)의 children을 모두 가져오되,
 * has_children = true인 블록에 대해서는 재귀 호출로 자식 블록들도 모두 가져와
 * 최종적으로 'children'까지 갖춘 트리 구조를 반환한다.
 */
export async function fetchBlocksRecursively(
  blockId: string,
): Promise<BlockObjectResponseWithChildren[]> {
  const allBlocks: BlockObjectResponseWithChildren[] = [];

  let cursor: string | undefined = undefined;
  while (true) {
    const response: ListBlockChildrenResponse =
      await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });

    const blockResults = response.results as BlockObjectResponseWithChildren[];

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
): Promise<BlockObjectResponseWithChildren[]> {
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
