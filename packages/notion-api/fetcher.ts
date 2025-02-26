import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import https from "https";
import { pipeline } from "stream/promises";
import { Client, LogLevel } from "@notionhq/client";
import {
  ImageBlockObjectResponse,
  ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { BlockObjectResponseWithChildren } from "./types";
import { NOTION_API_KEY } from "./notion_api_key";

// ─── 상수 ─────────────────────────────────────────────
const DEFAULT_IMAGE_OUTPUT_DIR = "./output/imageCache";
const PAGE_CACHE_DIR = "./output/pageCache";

// ─── 이미지 다운로드 기록 인터페이스 ─────────────────────────────────────────────
interface ImageDownloadRecord {
  blockId: string;
  lastEditedTime: string;
  imagePath: string;
}

// ─── Image Cache Manager ─────────────────────────────────────────────
class ImageCacheManager {
  private records: ImageDownloadRecord[] = [];

  constructor(private recordPath: string) {}

  async loadRecords(): Promise<void> {
    try {
      await fsPromises.access(this.recordPath);
      const data = await fsPromises.readFile(this.recordPath, "utf-8");
      this.records = JSON.parse(data);
    } catch (error) {
      console.warn("이미지 다운로드 기록 로드 실패. 캐시를 새로 초기화합니다.");
      this.records = []; // 캐시를 비워두고
      // 빈 캐시 파일을 생성해서 재채워 넣음
      try {
        await this.saveRecords();
        console.info("빈 캐시 파일이 생성되었습니다.");
      } catch (saveError) {
        console.error("빈 캐시 파일 생성 실패:", saveError);
      }
    }
  }

  async saveRecords(): Promise<void> {
    // 캐시 파일 경로의 디렉토리 추출
    const directory = path.dirname(this.recordPath);
    // 디렉토리 생성 (존재하지 않으면)
    await fsPromises.mkdir(directory, { recursive: true });

    try {
      await fsPromises.writeFile(
        this.recordPath,
        JSON.stringify(this.records, null, 2),
      );
    } catch (error) {
      console.error("이미지 다운로드 기록 저장 실패:", error);
    }
  }

  async updateRecord(
    blockId: string,
    lastEditedTime: string,
    imagePath: string,
  ): Promise<void> {
    const index = this.records.findIndex(
      (record) => record.blockId === blockId,
    );
    if (index !== -1) {
      this.records[index] = { blockId, lastEditedTime, imagePath };
    } else {
      this.records.push({ blockId, lastEditedTime, imagePath });
    }
    await this.saveRecords();
  }

  isImageUpToDate(blockId: string, lastEditedTime: string): boolean {
    const record = this.records.find((record) => record.blockId === blockId);
    return record ? record.lastEditedTime === lastEditedTime : false;
  }

  getImagePath(blockId: string): string | null {
    const record = this.records.find((record) => record.blockId === blockId);
    return record ? record.imagePath : null;
  }
}

// ─── Page Cache Manager ─────────────────────────────────────────────
// Notion API로부터 가져온 페이지 블록 데이터를 페이지 ID별로 캐싱합니다.
class PageCacheManager {
  constructor(private cacheDir: string) {}

  private getCacheFilePath(pageId: string): string {
    return path.join(this.cacheDir, `${pageId}.json`);
  }

  async loadPage(
    pageId: string,
  ): Promise<BlockObjectResponseWithChildren[] | null> {
    const cacheFile = this.getCacheFilePath(pageId);
    try {
      await fsPromises.access(cacheFile);
      const data = await fsPromises.readFile(cacheFile, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.warn(`페이지 캐시 없음 (pageId: ${pageId}).`);
      return null;
    }
  }

  async updatePage(pageId: string, data: any): Promise<void> {
    const cacheFile = this.getCacheFilePath(pageId);
    // 캐시 디렉토리가 없으면 생성
    await fsPromises.mkdir(this.cacheDir, { recursive: true });
    try {
      await fsPromises.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`페이지 캐시 저장 실패 (pageId: ${pageId}):`, error);
    }
  }
}

// ─── Notion API Client ─────────────────────────────────────────────
const notion = new Client({ auth: NOTION_API_KEY, logLevel: LogLevel.DEBUG });

// ─── Notion 블록 재귀적 가져오기 ─────────────────────────────────────────────
async function fetchBlocksRecursively(
  blockId: string,
): Promise<BlockObjectResponseWithChildren[]> {
  const allBlocks: BlockObjectResponseWithChildren[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: ListBlockChildrenResponse =
      await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });
    const blocks = response.results as BlockObjectResponseWithChildren[];

    for (const block of blocks) {
      if (block.has_children) {
        block.children = await fetchBlocksRecursively(block.id);
      }
    }
    allBlocks.push(...blocks);
    cursor = response.has_more ? response.next_cursor || undefined : undefined;
  } while (cursor);

  return allBlocks;
}

async function fetchPageBlocksRecursively(
  pageId: string,
): Promise<BlockObjectResponseWithChildren[]> {
  const rawBlocks = await fetchBlocksRecursively(pageId);
  removePropertiesRecursively(
    rawBlocks,
    new Set([
      "created_time",
      // "last_edited_time", // 이건 필요함-!
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

function removePropertiesRecursively(obj: any, propNames: Set<string>): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => removePropertiesRecursively(item, propNames));
  } else {
    for (const key of Object.keys(obj)) {
      if (propNames.has(key)) {
        delete obj[key];
      } else {
        removePropertiesRecursively(obj[key], propNames);
      }
    }
  }
}

// ─── 이미지 다운로드 함수 ─────────────────────────────────────────────
async function downloadImage(
  imageUrl: string,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
  filename?: string,
): Promise<string> {
  console.log("이미지 다운로드:", imageUrl);

  await fsPromises.mkdir(outputDir, { recursive: true });

  if (!filename) {
    const urlParts = new URL(imageUrl).pathname.split("/");
    filename = urlParts[urlParts.length - 1] || `image-${Date.now()}.png`;
  }
  if (!path.extname(filename)) {
    filename += ".png";
  }
  const outputPath = path.join(outputDir, filename);

  return new Promise<string>((resolve, reject) => {
    https
      .get(imageUrl, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(
              `이미지 다운로드 실패: HTTP 상태 코드 ${response.statusCode}`,
            ),
          );
        }
        const fileStream = fs.createWriteStream(outputPath);
        pipeline(response, fileStream)
          .then(() => resolve(outputPath))
          .catch((err) => {
            fs.unlink(outputPath, () => {});
            reject(err);
          });
      })
      .on("error", (err) => reject(err));
  });
}

// ─── 이미지 URL 업데이트 헬퍼 ─────────────────────────────────────────────
function updateBlockImageUrl(
  block: ImageBlockObjectResponse,
  newUrl: string,
): void {
  if (block.image.type === "file") {
    block.image.file.url = newUrl;
  } else if (block.image.type === "external") {
    block.image.external.url = newUrl;
  }
}

// ─── 단일 블록 이미지 처리 ─────────────────────────────────────────────
async function handleBlockImage(
  block: { id: string; last_edited_time: string },
  imageUrl: string,
  outputDir: string,
  filename: string,
  updateUrl: (newUrl: string) => void,
  imageCacheManager: ImageCacheManager,
): Promise<void> {
  const { id: blockId, last_edited_time: lastEditedTime } = block;

  if (imageCacheManager.isImageUpToDate(blockId, lastEditedTime)) {
    const cachedPath = imageCacheManager.getImagePath(blockId);
    if (cachedPath) {
      console.log(`캐시된 이미지 사용 (블록 ${blockId}): ${cachedPath}`);
      updateUrl(`./${cachedPath}`);
      return;
    }
  }

  try {
    const downloadedPath = await downloadImage(imageUrl, outputDir, filename);
    const relativePath = path
      .relative(process.cwd(), downloadedPath)
      .replace(/\\/g, "/");
    await imageCacheManager.updateRecord(blockId, lastEditedTime, relativePath);
    updateUrl(`./${relativePath}`);
    console.log(`이미지 다운로드 완료 (블록 ${blockId}): ${relativePath}`);
  } catch (error) {
    console.error(`이미지 다운로드 실패 (블록 ${blockId}):`, error);
  }
}

// ─── 이미지 블록 및 파일 블록 처리 ─────────────────────────────────────────────
async function processImageBlock(
  block: ImageBlockObjectResponse,
  outputDir: string,
  imageCacheManager: ImageCacheManager,
): Promise<ImageBlockObjectResponse> {
  const imageUrl =
    block.image.type === "file"
      ? block.image.file.url
      : block.image.external?.url;

  if (!imageUrl) {
    console.warn(`이미지 URL을 찾을 수 없음 (블록 ID: ${block.id})`);
    return block;
  }

  const filename = `image-${block.id}.png`;
  await handleBlockImage(
    block,
    imageUrl,
    outputDir,
    filename,
    (newUrl: string) => updateBlockImageUrl(block, newUrl),
    imageCacheManager,
  );
  return block;
}

async function processFileBlock(
  block: any,
  outputDir: string,
  imageCacheManager: ImageCacheManager,
): Promise<void> {
  if (
    block.file?.type === "file" &&
    block.file?.file?.url &&
    /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(block.file.file.url)
  ) {
    const filename = `file-${block.id}.png`;
    await handleBlockImage(
      block,
      block.file.file.url,
      outputDir,
      filename,
      (newUrl: string) => {
        block.file.file.url = newUrl;
      },
      imageCacheManager,
    );
  }
}

async function downloadAllImages(
  obj: any,
  outputDir: string,
  imageCacheManager: ImageCacheManager,
): Promise<void> {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      await downloadAllImages(item, outputDir, imageCacheManager);
    }
    return;
  }

  // 이미지 블록 처리
  if (obj.type === "image" && obj.image && obj.id && obj.last_edited_time) {
    await processImageBlock(
      obj as ImageBlockObjectResponse,
      outputDir,
      imageCacheManager,
    );
  }

  // 파일 블록 처리 (첨부파일이 이미지인 경우)
  if (obj.type === "file" && obj.id && obj.last_edited_time) {
    await processFileBlock(obj, outputDir, imageCacheManager);
  }

  // 객체 내 모든 속성 재귀 순회
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      await downloadAllImages(obj[key], outputDir, imageCacheManager);
    }
  }
}

// ─── 내부 캐시 매니저 인스턴스 (외부 노출 없음) ─────────────────────────────
const imageCacheManager = new ImageCacheManager(
  path.join(DEFAULT_IMAGE_OUTPUT_DIR, "image-download-records.json"),
);

const pageCacheManager = new PageCacheManager(PAGE_CACHE_DIR);

// 초기화: 캐시 로드
(async () => {
  await imageCacheManager.loadRecords();
})();

// ─── 외부에 노출할 함수 ─────────────────────────────────────────────

// 페이지 전체 블록을 가져오되, 캐시가 있다면 사용하고 없으면 Notion API 호출
export async function fetchAllPageBlocks(
  pageId: string,
): Promise<BlockObjectResponseWithChildren[]> {
  let blockTree = await pageCacheManager.loadPage(pageId);
  if (!blockTree) {
    console.log(`page cache miss: ${pageId} - fetching!`);
    console.time("fetch");
    blockTree = await fetchPageBlocksRecursively(pageId);
    console.timeEnd("fetch");
    await pageCacheManager.updatePage(pageId, blockTree);
  }
  return blockTree;
}

// 페이지 내의 이미지들을 다운로드 및 URL 업데이트
export async function fetchImagesOfPage(
  blockTree: any,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
): Promise<void> {
  console.log("checking all images to download if needed");
  await downloadAllImages(blockTree, outputDir, imageCacheManager);
  console.log("image check done.");
}

// 두 함수를 조합한 메인 진입점 함수
export async function fetchBlocksWithImages(
  pageId: string,
  outputDir: string = DEFAULT_IMAGE_OUTPUT_DIR,
): Promise<BlockObjectResponseWithChildren[]> {
  const blockTree = await fetchAllPageBlocks(pageId);
  await fetchImagesOfPage(blockTree, outputDir);
  return blockTree;
}
