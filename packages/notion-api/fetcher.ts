import fs from "fs";
import path from "path";
import https from "https";
import { Client, LogLevel } from "@notionhq/client";
import {
  ImageBlockObjectResponse,
  VideoBlockObjectResponse,
  BookmarkBlockObjectResponse,
  ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { BlockObjectResponseWithChildren } from "./types";
import { NOTION_API_KEY } from "./notion_api_key";

// 이미지 다운로드 기록을 저장할 인터페이스
interface ImageDownloadRecord {
  blockId: string;
  lastEditedTime: string;
  imagePath: string;
}

// 이미지 다운로드 기록을 저장할 파일 경로
const IMAGE_DOWNLOAD_RECORD_PATH = "./image-download-records.json";

// 기본 이미지 저장 디렉토리
const DEFAULT_IMAGE_OUTPUT_DIR = "./temp/images";

// 이미지 다운로드 기록을 불러오는 함수
function loadImageDownloadRecords(): ImageDownloadRecord[] {
  try {
    if (fs.existsSync(IMAGE_DOWNLOAD_RECORD_PATH)) {
      const data = fs.readFileSync(IMAGE_DOWNLOAD_RECORD_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("이미지 다운로드 기록 불러오기 실패:", error);
  }
  return [];
}

// 이미지 다운로드 기록을 저장하는 함수
function saveImageDownloadRecords(records: ImageDownloadRecord[]) {
  try {
    fs.writeFileSync(
      IMAGE_DOWNLOAD_RECORD_PATH,
      JSON.stringify(records, null, 2),
    );
  } catch (error) {
    console.error("이미지 다운로드 기록 저장 실패:", error);
  }
}

// 이미지 다운로드 기록을 업데이트하는 함수
function updateImageDownloadRecord(
  blockId: string,
  lastEditedTime: string,
  imagePath: string,
) {
  const records = loadImageDownloadRecords();
  const existingRecordIndex = records.findIndex(
    (record) => record.blockId === blockId,
  );

  if (existingRecordIndex !== -1) {
    // 기존 기록 업데이트
    records[existingRecordIndex] = { blockId, lastEditedTime, imagePath };
  } else {
    // 새 기록 추가
    records.push({ blockId, lastEditedTime, imagePath });
  }

  saveImageDownloadRecords(records);
}

// 이미지가 최신인지 확인하는 함수
function isImageUpToDate(blockId: string, lastEditedTime: string): boolean {
  const records = loadImageDownloadRecords();
  const record = records.find((record) => record.blockId === blockId);

  if (!record) return false;
  return record.lastEditedTime === lastEditedTime;
}

// 이미지 경로를 가져오는 함수
function getImagePathFromRecord(blockId: string): string | null {
  const records = loadImageDownloadRecords();
  const record = records.find((record) => record.blockId === blockId);
  return record ? record.imagePath : null;
}

/**
 * 이미지 URL에서 파일을 다운로드하여 저장하는 함수
 * @param imageUrl 다운로드할 이미지 URL
 * @param outputDir 저장할 디렉토리 경로
 * @param filename 저장할 파일명 (없으면 URL에서 추출)
 * @returns 저장된 파일의 경로
 */
async function downloadImage(
  imageUrl: string,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
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
 * 이미지 블록을 처리하고 캐싱 로직을 적용하는 함수
 * @param block 이미지 블록 객체
 * @param outputDir 이미지를 저장할 디렉토리 경로
 * @returns 처리된 이미지 블록 객체
 */
async function processImageBlock(
  block: ImageBlockObjectResponse,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
): Promise<ImageBlockObjectResponse> {
  // 외부 이미지인 경우에도 처리
  const imageUrl =
    block.image.type === "file"
      ? block.image.file.url
      : block.image.external?.url;

  if (!imageUrl) {
    console.warn(`이미지 URL을 찾을 수 없음 (블록 ID: ${block.id})`);
    return block;
  }

  const blockId = block.id;
  const lastEditedTime = block.last_edited_time;
  const filename = `image-${blockId}.png`;

  // 캐시된 이미지가 최신인지 확인
  if (isImageUpToDate(blockId, lastEditedTime)) {
    const cachedImagePath = getImagePathFromRecord(blockId);
    if (cachedImagePath) {
      console.log(`캐시된 이미지 사용: ${cachedImagePath}`);

      // 이미지 URL 업데이트
      if (block.image.type === "file") {
        block.image.file.url = `./${cachedImagePath}`;
      } else if (block.image.type === "external") {
        // 외부 이미지의 경우 로컬 경로로 변경
        // 원본 URL은 이미 캐싱 시스템에 저장되어 있음
        block.image.external.url = `./${cachedImagePath}`;
      }

      return block;
    }
  }

  // 캐시가 없거나 오래된 경우 새로 다운로드
  try {
    const downloadedImagePath = await downloadImage(
      imageUrl,
      outputDir,
      filename,
    );
    const relativePath = path
      .relative(process.cwd(), downloadedImagePath)
      .replace(/\\/g, "/");

    updateImageDownloadRecord(blockId, lastEditedTime, relativePath);

    // 이미지 URL 업데이트
    if (block.image.type === "file") {
      block.image.file.url = `./${relativePath}`;
    } else if (block.image.type === "external") {
      // 외부 이미지의 경우 로컬 경로로 변경
      block.image.external.url = `./${relativePath}`;
    }

    console.log(`이미지 다운로드 완료: ${relativePath}`);
  } catch (error) {
    console.error(`이미지 다운로드 실패 (블록 ID: ${blockId}):`, error);
  }

  return block;
}

/**
 * 객체 내의 모든 이미지 URL을 찾아 다운로드하고 링크를 업데이트하는 함수
 * 캐싱 시스템을 활용하여 중복 다운로드 방지
 * @param obj 이미지 URL을 포함할 수 있는 객체
 * @param outputDir 이미지를 저장할 디렉토리
 */
async function downloadAllImages(
  obj: Record<string, any>,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
): Promise<void> {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    // 배열인 경우 각 요소를 재귀적으로 처리
    for (const item of obj) {
      await downloadAllImages(item, outputDir);
    }
  } else {
    // 이미지 블록 처리
    if (obj.type === "image" && obj.image) {
      try {
        // 타입 체크 및 변환
        if (
          obj.type === "image" &&
          (obj.image.type === "file" || obj.image.type === "external") &&
          obj.id &&
          obj.last_edited_time
        ) {
          // ImageBlockObjectResponse 타입으로 처리
          await processImageBlock(obj as ImageBlockObjectResponse, outputDir);
        }
      } catch (error) {
        console.error(`이미지 블록 처리 실패 (ID: ${obj.id}):`, error);
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
        const blockId = obj.id;
        const lastEditedTime = obj.last_edited_time;

        // 이미지 파일인지 확인 (URL에서 추측)
        if (fileUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
          const filename = `file-${blockId}.png`;

          // 캐시된 파일이 최신인지 확인
          let shouldDownload = true;
          if (isImageUpToDate(blockId, lastEditedTime)) {
            const cachedImagePath = getImagePathFromRecord(blockId);
            if (cachedImagePath) {
              console.log(`캐시된 파일 이미지 사용: ${cachedImagePath}`);
              // 원본 URL은 이미 캐싱 시스템에 저장되어 있음
              obj.file.file.url = `./${cachedImagePath}`;
              shouldDownload = false;
            }
          }

          // 캐시가 없거나 오래된 경우 새로 다운로드
          if (shouldDownload) {
            const downloadedPath = await downloadImage(
              fileUrl,
              outputDir,
              filename,
            );
            const relativePath = path
              .relative(process.cwd(), downloadedPath)
              .replace(/\\/g, "/");

            // 다운로드 기록 업데이트
            updateImageDownloadRecord(blockId, lastEditedTime, relativePath);

            // 로컬 경로로 변경
            obj.file.file.url = `./${relativePath}`;
            console.log(`파일 이미지 다운로드 완료: ${relativePath}`);
          }
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
 * 캐싱 시스템을 활용하여 중복 다운로드 방지
 * @param blockId 가져올 블록 ID
 * @param outputDir 이미지를 저장할 디렉토리
 * @returns 이미지가 처리된 블록 트리
 */
export async function fetchBlocksWithImages(
  blockId: string,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
): Promise<BlockObjectResponseWithChildren[]> {
  console.log(`블록 데이터 가져오기 시작: ${blockId}`);

  // 블록 데이터 가져오기
  const blocks = await fetchBlocksRecursively(blockId);

  console.log(`블록 데이터 가져오기 완료, 이미지 처리 시작`);

  // 이미지 다운로드 및 URL 업데이트 (캐싱 시스템 활용)
  await downloadAllImages(blocks, outputDir);

  console.log(`이미지 처리 완료`);

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
