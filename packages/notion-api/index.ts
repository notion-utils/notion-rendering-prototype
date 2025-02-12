import fs from "fs";
import { Client } from "@notionhq/client";
import { NOTION_API_KEY } from "./notion_api_key";

const notionDatabaseId = "6b7db292c7d544cba34d965012a736a4";
const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

const notion = new Client({ auth: NOTION_API_KEY });

async function queryDatabase(databaseId: string) {
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

async function fetchPageData(pageId: string) {
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

/**
 * Notion 페이지 컨텐츠를 렌더링하는 함수
 * @param pageContent 페이지 컨텐츠 JSON
 * @returns 렌더링된 문자열
 */
function renderPageContent(pageContent: any): string {
  let result = "";

  for (const block of pageContent.results) {
    result += renderBlockRecursively(block);
  }

  return result;
}

/**
 * 블록을 재귀적으로 렌더링하는 함수
 * @param block 노션 블록 객체
 * @param depth 현재 들여쓰기 깊이
 * @returns 렌더링된 문자열
 */
function renderBlockRecursively(block: any, depth: number = 0): string {
  let result = renderBlock(block);

  if (block.children?.results) {
    for (const childBlock of block.children.results) {
      if (
        block.type === "paragraph" ||
        block.type === "heading_1" ||
        block.type === "heading_2" ||
        block.type === "heading_3"
      ) {
        result +=
          "  ".repeat(depth + 1) +
          renderBlockRecursively(childBlock, depth + 1);
      } else {
        result += renderBlockRecursively(childBlock, 0);
      }
    }
  }

  return result;
}
/**
 * 블록을 렌더링하는 함수
 * @param block 노션 블록 객체
 * @returns 렌더링된 문자열
 */
function renderBlock(block: any): string {
  switch (block.type) {
    case "paragraph":
      return renderRichText(block.paragraph.rich_text) + "\n\n";
    case "heading_1":
      return `<h1>${renderRichText(block.heading_1.rich_text)}</h1>\n\n`;
    case "heading_2":
      return `<h2>${renderRichText(block.heading_2.rich_text)}</h2>\n\n`;
    case "heading_3":
      return `<h3>${renderRichText(block.heading_3.rich_text)}</h3>\n\n`;
    case "bulleted_list_item":
      return `<li>${renderRichText(block.bulleted_list_item.rich_text)}</li>\n`;
    case "numbered_list_item":
      return `<li>${renderRichText(block.numbered_list_item.rich_text)}</li>\n`;
    case "code":
      return `<pre><code class="language-${
        block.code.language
      }">${renderRichText(block.code.rich_text)}</code></pre>\n\n`;
    case "quote":
      return `<blockquote>${renderRichText(
        block.quote.rich_text
      )}</blockquote>\n\n`;
    case "table":
      return renderTable(block);
    case "table_row":
      return "";
    case "image":
      return renderImage(block);
    case "column_list":
      return renderColumnList(block);
    case "column":
      return renderColumn(block);
    case "table_of_contents":
      return renderTableOfContents(block);
    case "callout":
      return renderCallout(block);
    default:
      return `<div class="unsupported-block">[지원되지 않는 블록 타입: ${block.type}]</div>\n\n`;
  }
}

/**
 * 목차 블록을 렌더링하는 함수
 * @param block 목차 블록 객체
 * @returns 렌더링된 문자열
 */
function renderTableOfContents(block: any): string {
  const color = block.table_of_contents.color || "default";
  const pageId = block.parent.page_id;
  let tocHtml = "";

  // 페이지의 모든 블록을 순회하며 헤딩 찾기
  const pageContent = JSON.parse(
    fs.readFileSync("./output/page-content.json", "utf-8")
  );

  const headings = pageContent.results.filter((b: any) =>
    b.type.startsWith("heading_")
  );

  // 헤딩 레벨에 따라 들여쓰기 적용하여 목차 HTML 생성
  headings.forEach((heading: any) => {
    const level = parseInt(heading.type.slice(-1));
    const text = renderRichText(heading[heading.type].rich_text);
    const indent = "  ".repeat(level - 1);

    tocHtml += `${indent}<a href="#${heading.id}" class="toc-item level-${level}">${text}</a>\n`;
  });

  return `<nav class="table-of-contents" style="color: ${color};">
  <h2>목차</h2>
  <div class="toc-content">
${tocHtml}  </div>
</nav>\n\n`;
}

/**
 * 콜아웃 블록을 렌더링하는 함수
 * @param block 콜아웃 블록 객체
 * @returns 렌더링된 문자열
 */
function renderCallout(block: any): string {
  const icon = block.callout.icon?.emoji || "💡";
  const text = renderRichText(block.callout.rich_text);
  const color = block.callout.color || "default";

  return `<div class="callout" style="background-color: var(--color-${color}-background); border-radius: 4px; padding: 16px; margin: 8px 0;">
  <div class="callout-content">
    <span class="callout-icon">${icon}</span>
    <div class="callout-text">${text}</div>
  </div>
</div>\n\n`;
}

/**
 * 리치 텍스트를 렌더링하는 함수
 * @param richText 리치 텍스트 배열
 * @returns 렌더링된 문자열
 */
function renderRichText(richText: any[]): string {
  if (!richText?.length) return "";
  return richText.map((text) => text.plain_text).join("");
}

/**
 * 테이블 블록을 렌더링하는 함수
 * @param block 테이블 블록 객체
 * @returns 렌더링된 문자열
 */
function renderTable(block: any): string {
  let result = "<table style='border-collapse: collapse; width: 100%;'>\n";

  if (block.children?.results) {
    // 헤더 행 렌더링
    result += "<thead>\n";
    result += renderTableRow(block.children.results[0], true);
    result += "</thead>\n";

    // 본문 행 렌더링
    if (block.children.results.length > 1) {
      result += "<tbody>\n";
      for (let i = 1; i < block.children.results.length; i++) {
        result += renderTableRow(block.children.results[i], false);
      }
      result += "</tbody>\n";
    }
  }

  return result + "</table>\n\n";
}

/**
 * 테이블 행 블록을 렌더링하는 함수
 * @param block 테이블 행 블록 객체
 * @param isHeader 헤더 행 여부
 * @returns 렌더링된 문자열
 */
function renderTableRow(block: any, isHeader: boolean): string {
  const cells = block.table_row.cells;
  const cellTag = isHeader ? "th" : "td";
  const cellStyle = "style='border: 1px solid #ddd; padding: 8px;'";

  return `  <tr>\n    ${cells
    .map(
      (cell: any[]) =>
        `<${cellTag} ${cellStyle}>${renderRichText(cell)}</${cellTag}>`
    )
    .join("\n    ")}\n  </tr>\n`;
}

/**
 * 이미지 블록을 렌더링하는 함수
 * @param block 이미지 블록 객체
 * @returns 렌더링된 문자열
 */
function renderImage(block: any): string {
  const caption = block.image.caption?.length
    ? renderRichText(block.image.caption)
    : "이미지";

  const url =
    block.image.type === "external"
      ? block.image.external.url
      : block.image.file.url;

  return `<img src="${url}" alt="${caption}" />\n\n`;
}

/**
 * 컬럼 리스트 블록을 렌더링하는 함수
 * @param block 컬럼 리스트 블록 객체
 * @returns 렌더링된 문자열
 */
function renderColumnList(block: any): string {
  let result = "<div style='display: flex;'>\n";

  if (block.children?.results) {
    for (const column of block.children.results) {
      result += renderColumn(column);
    }
  }

  return result + "</div>\n\n";
}

/**
 * 컬럼 블록을 렌더링하는 함수
 * @param block 컬럼 블록 객체
 * @returns 렌더링된 문자열
 */
function renderColumn(block: any): string {
  let result = "<div style='flex: 1; padding: 8px;'>\n";

  if (block.children?.results) {
    for (const child of block.children.results) {
      result += renderBlockRecursively(child);
    }
  }

  return result + "</div>\n";
}

// 사용 예시:
async function renderPage() {
  try {
    const pageContent = JSON.parse(
      fs.readFileSync("./output/page-content.json", "utf-8")
    );
    const rendered = renderPageContent(pageContent);
    fs.writeFileSync("./output/rendered-content.md", rendered);
  } catch (error) {
    console.error("페이지 렌더링 중 오류 발생:", error);
  }
}

renderPage();

// queryDatabase(notionDatabaseId);
// fetchPageData(notionPageId);

// 페이지의 모든 블록을 조회하여 heading_1, heading_2, heading_3 등의 제목 블록을 찾아 목차를 구성합니다.
async function getTableOfContents(pageId: string) {
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

// 예시 사용
// const pageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";
// await getTableOfContents(pageId);

// 그래도 ai를 쓰면 꽤 작업이 가능할 듯?
/**
 * Notion API의 블록 구조 설명
 *
 * 1. 기본 블록 구조
 * - object: "block" (항상 고정)
 * - id: 블록의 고유 식별자
 * - parent: 상위 블록/페이지 정보
 * - created_time: 생성 시간
 * - last_edited_time: 마지막 수정 시간
 * - created_by/last_edited_by: 작성/수정자 정보
 * - has_children: 하위 블록 존재 여부
 * - archived: 보관 여부
 * - type: 블록 타입 (paragraph, heading_1 등)
 *
 * 2. 블록 타입별 구조
 * - paragraph: 일반 텍스트 블록
 *   - rich_text: 텍스트 내용 배열
 *   - color: 텍스트 색상
 *
 * - heading_1/2/3: 제목 블록
 *   - rich_text: 제목 텍스트 배열
 *   - is_toggleable: 토글 가능 여부
 *   - color: 제목 색상
 *
 * - bulleted_list_item: 글머리 기호 목록
 *   - rich_text: 목록 텍스트 배열
 *   - color: 텍스트 색상
 *
 * - table: 표 블록
 *   - table_width: 열 개수
 *   - has_column_header: 열 헤더 존재 여부
 *   - has_row_header: 행 헤더 존재 여부
 *
 * - callout: 콜아웃 블록
 *   - rich_text: 콜아웃 텍스트 배열
 *   - icon: 아이콘 정보
 *   - color: 배경 색상
 *
 * 3. rich_text 구조
 * - type: 텍스트 타입 (text, mention, equation 등)
 * - text: 실제 텍스트 내용
 *   - content: 텍스트 문자열
 *   - link: 링크 정보 (있는 경우)
 * - annotations: 텍스트 스타일
 *   - bold: 굵게
 *   - italic: 기울임
 *   - strikethrough: 취소선
 *   - underline: 밑줄
 *   - code: 코드
 *   - color: 색상
 * - plain_text: 순수 텍스트
 * - href: 링크 URL
 *
 * 4. 블록 간 관계
 * - 블록은 페이지나 다른 블록의 하위에 중첩될 수 있음
 * - has_children이 true인 블록은 하위 블록을 가질 수 있음
 * - blocks.children.list API로 하위 블록 조회 가능
 * - parent 필드로 상위 블록/페이지 참조
 *
 * 5. 블록 타입별 특수 필드
 *
 * - table_of_contents: 목차 블록
 *   - color: 목차 색상
 *
 * - mention: 멘션 블록
 *   - type: 멘션 타입 (user, page, database, date, link_mention 등)
 *   - [type]_mention: 멘션 정보
 *     - link_mention의 경우:
 *       - href: 링크 URL
 *       - title: 링크 제목
 *       - icon_url: 아이콘 URL
 *       - description: 링크 설명
 *       - link_provider: 링크 제공자
 *       - thumbnail_url: 썸네일 URL
 *
 * 6. 응답 구조
 * - object: 응답 객체 타입 ("list")
 * - results: 블록 목록 배열
 * - next_cursor: 다음 페이지 커서
 * - has_more: 추가 결과 존재 여부
 * - type: 응답 타입 ("block")
 * - request_id: 요청 ID
 */
/**
 * 7. 블록 타입 목록
 *
 * - paragraph: 일반 텍스트 단락
 * - heading_1: 제목 1
 * - heading_2: 제목 2
 * - heading_3: 제목 3
 * - bulleted_list_item: 글머리 기호 목록
 * - numbered_list_item: 번호 매기기 목록
 * - to_do: 체크박스 목록
 * - toggle: 토글 목록
 * - code: 코드 블록
 * - quote: 인용구
 * - callout: 콜아웃
 * - divider: 구분선
 * - table: 표
 * - table_row: 표 행
 * - image: 이미지
 * - video: 비디오
 * - file: 파일
 * - pdf: PDF
 * - bookmark: 북마크
 * - equation: 수식
 * - table_of_contents: 목차
 * - breadcrumb: 경로
 * - column_list: 다단 레이아웃
 * - column: 다단 레이아웃의 단
 * - link_preview: 링크 미리보기
 * - synced_block: 동기화된 블록
 * - template: 템플릿
 * - link_to_page: 페이지 링크
 * - embed: 임베드
 * - child_page: 하위 페이지
 * - child_database: 하위 데이터베이스
 * - audio: 오디오
 */
/**
 * 8. 추가 블록 타입 목록
 *
 * - unsupported: 지원되지 않는 블록 타입
 * - link_mention: 링크 멘션 (callout 내부에서 사용됨)
 */
