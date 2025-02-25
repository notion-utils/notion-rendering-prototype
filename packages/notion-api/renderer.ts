import { BlockObjectResponseWithChildren } from "./types";
import type { RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints";

// NOTE: 현재 공식 클라이언트에 타입이 없어서 인위적으로 추가
interface LinkMentionResponse {
  href: string;
  title?: string;
  icon_url?: string;
  description?: string;
  link_provider?: string;
  thumbnail_url?: string;
}

function renderLinkMentionInline(
  linkData: LinkMentionResponse,
  annotations: RichTextItemResponse["annotations"],
): string {
  const { href, title, icon_url, link_provider, description } = linkData;

  const provider = link_provider || "";
  const linkText = title || href;
  const tooltip = description || "";

  const iconImg = icon_url
    ? `<img src="${icon_url}" alt="" class="inline-link-icon" />`
    : "";

  const text = `<span class="link-mention-provider">${provider}</span> <strong class="link-mention-text">${linkText}</strong>`;

  // FIXME: PC에서 hover 시 제대로 표시하기
  return `
    <a href="${href}" 
       class="inline-link-mention"
       target="_blank"
       rel="noopener noreferrer"
       title="${tooltip}">
       ${iconImg}
       ${applyRichTextStyles(text, annotations)}
    </a>
  `;
}

function applyRichTextStyles(
  html: string,
  annotations: RichTextItemResponse["annotations"],
) {
  const { bold, italic, strikethrough, underline, code, color } = annotations;

  if (bold) {
    html = `<strong>${html}</strong>`;
  }
  if (italic) {
    html = `<em>${html}</em>`;
  }
  if (strikethrough) {
    html = `<s>${html}</s>`;
  }
  if (underline) {
    html = `<u>${html}</u>`;
  }
  if (code) {
    html = `<code>${html}</code>`;
  }
  if (color && color !== "default") {
    html = `<span style="color:${color}">${html}</span>`;
  }

  return html;
}

function renderRichText(richTextArray: RichTextItemResponse[] = []): string {
  // 별도의 스타일이 적용된 구간마다 해당 배열의 요소로 담김
  return richTextArray
    .map((richText) => {
      // NOTE: 타입 오류 불가피 - API 문서 및 NotionHQ 라이브러리 타입에서 누락된 상태
      if (
        richText.type === "mention" &&
        richText.mention.type === "link_mention"
      ) {
        return renderLinkMentionInline(
          richText.mention.link_mention,
          richText.annotations,
        );
      }

      const text = richText.plain_text || "";
      const annotated = applyRichTextStyles(text, richText.annotations || {});
      return !richText.href
        ? annotated
        : `<a href="${richText.href}" target="_blank">${annotated}</a>`;
    })
    .join("");
}

// 목차 생성을 위한 헤딩 정보를 저장하는 인터페이스
interface HeadingInfo {
  id: string;
  text: string;
  level: number;
}

// 문서의 모든 헤딩을 추출하는 함수
function extractHeadings(
  blocks: BlockObjectResponseWithChildren[],
): HeadingInfo[] {
  const headings: HeadingInfo[] = [];

  function traverse(blockList: BlockObjectResponseWithChildren[]) {
    for (const block of blockList) {
      if (block.type === "heading_1") {
        headings.push({
          id: block.id,
          text: block.heading_1.rich_text.map((rt) => rt.plain_text).join(""),
          level: 1,
        });
      } else if (block.type === "heading_2") {
        headings.push({
          id: block.id,
          text: block.heading_2.rich_text.map((rt) => rt.plain_text).join(""),
          level: 2,
        });
      } else if (block.type === "heading_3") {
        headings.push({
          id: block.id,
          text: block.heading_3.rich_text.map((rt) => rt.plain_text).join(""),
          level: 3,
        });
      }

      if (block.has_children && block.children && block.children.length > 0) {
        traverse(block.children);
      }
    }
  }

  traverse(blocks);
  return headings;
}

// 목차 HTML 생성 함수
function generateTableOfContents(
  blocks: BlockObjectResponseWithChildren[],
): string {
  const headings = extractHeadings(blocks);

  if (headings.length === 0) {
    return '<div class="toc-empty">목차 항목이 없습니다</div>';
  }

  let tocHTML = '<nav class="toc">';
  tocHTML += '<h3 class="toc-title">목차</h3>';
  tocHTML += '<ul class="toc-list">';

  headings.forEach((heading) => {
    // 들여쓰기 계산 (h1은 들여쓰기 없음, h2는 1단계, h3는 2단계)
    const indentClass = `toc-level-${heading.level}`;

    tocHTML += `
      <li class="toc-item ${indentClass}">
        <a href="#${heading.id}" class="toc-link">
          <span class="toc-text">${heading.text}</span>
        </a>
      </li>
    `;
  });

  tocHTML += "</ul>";
  tocHTML += "</nav>";
  return tocHTML;
}

export function renderBlocks(
  blocks: BlockObjectResponseWithChildren[],
): string {
  return blocks.map((block) => renderBlock(block, blocks)).join("\n");
}

function renderBlock(
  block: BlockObjectResponseWithChildren,
  allBlocks: BlockObjectResponseWithChildren[],
): string {
  const { type, has_children, children } = block;

  const childrenHTML =
    has_children && children && children.length > 0
      ? renderBlocks(children)
      : "";

  switch (type) {
    case "table_of_contents": {
      const color = block.table_of_contents.color || "default";
      return `
        <div class="table-of-contents block color-${color}">
          ${generateTableOfContents(allBlocks)}
          ${childrenHTML}
        </div>
      `;
    }

    case "paragraph": {
      const { rich_text } = block.paragraph;
      return `<p>${renderRichText(rich_text)}${childrenHTML}</p>\n`;
    }

    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const headingData = block[type];
      const content = renderRichText(headingData.rich_text);
      const tag = "h" + type.split("_")[1];
      return `<${tag}>${content}${childrenHTML}</${tag}>\n`;
    }

    case "bulleted_list_item":
    case "numbered_list_item": {
      const data = block[type];
      const textHTML = renderRichText(data.rich_text);

      let childrenHTML = "";
      if (block.children && block.children.length > 0) {
        // NOTE: 첫 자식을 확인해 list_item의 타입을 알아내야 함 (bulleted vs numbered)
        const childrenListType =
          block.children[0].type === "bulleted_list_item" ? "ul" : "ol";
        childrenHTML = `<${childrenListType}>${renderBlocks(block.children)}</${childrenListType}>`;
      }

      return `<li>${textHTML}${childrenHTML}</li>`;
    }

    case "to_do": {
      const toDo = block.to_do;
      const checked = toDo.checked ? "checked" : "";

      return `
        <div>
          <input type="checkbox" ${checked} onclick="return false;" />
          <label>${renderRichText(toDo.rich_text)}</label>
          ${childrenHTML}
        </div>
      `;
    }

    case "toggle": {
      const toggle = block.toggle;
      return `
        <div class="toggle">
          <div class="toggle-title">${renderRichText(toggle.rich_text)}</div>
          <div class="toggle-children">${childrenHTML}</div>
        </div>
      `;
    }

    case "callout": {
      const { rich_text, icon, color } = block.callout;
      const iconHTML = icon?.type === "emoji" ? icon.emoji : "";
      return `
        <div class="callout callout-${color}">
          <span class="callout-icon">${iconHTML}</span>
          <div class="callout-content">${renderRichText(rich_text)}</div>
          ${childrenHTML}
        </div>
      `;
    }

    case "quote": {
      const quote = block.quote;
      return `<blockquote>${renderRichText(quote.rich_text)}${childrenHTML}</blockquote>`;
    }

    case "code": {
      const codeData = block.code;
      const lang = codeData.language || "";
      // NOTE: \t를 일단 2탭으로 변환 (FIXME: 추후 이슈 발생 시 개선 필요)
      return `
        <pre><code class="language-${lang}">${renderRichText(codeData.rich_text).replaceAll("\t", "  ")}${childrenHTML}</code></pre>
      `;
    }

    case "divider": {
      return `<hr />\n`;
    }

    case "image": {
      const image = block.image;
      const caption = renderRichText(image.caption || []);
      const src =
        image.type === "external" ? image.external.url : image.file.url;
      return `<figure><img src="${src}" alt="" /><figcaption>${caption}${childrenHTML}</figcaption></figure>`;
    }

    case "bookmark": {
      const bookmark = block.bookmark;
      const cap = renderRichText(bookmark.caption || []);
      return `
        <div class="bookmark">
          <a href="${bookmark.url}" target="_blank">${bookmark.url}</a>
          <div>${cap}</div>
          ${childrenHTML}
        </div>
      `;
    }

    case "table": {
      return `<table>${childrenHTML}</table>`;
    }

    case "table_row": {
      const { cells } = block.table_row;
      const rowHTML = cells
        .map((cell) => `<td>${renderRichText(cell)}</td>`)
        .join("");
      return `<tr>${rowHTML}</tr>`;
    }

    case "column_list": {
      return `<div class="column-list">${childrenHTML}</div>`;
    }

    case "column": {
      return `<div class="column">${childrenHTML}</div>`;
    }

    default: {
      console.warn("Unsupported block type:", type);
      return `<div>Unsupported block type: ${type}</div>`;
    }
  }
}
