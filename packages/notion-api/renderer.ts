// renderBlocks.ts
import { ExtendedBlockObjectResponse } from "./types";
import type { RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints";

// 공식 클라이언트에 없네..?
interface LinkMention {
  href: string; // https://docs.aws.amazon.com/...
  title?: string; // "Code examples for Lambda ..."
  icon_url?: string; // https://docs.aws.amazon.com/assets/images/favicon.ico
  description?: string; // "Code examples that show how ..."
  link_provider?: string; // "AWS Lambda"
  thumbnail_url?: string; // ...
}

function renderLinkMentionInline(
  linkData: LinkMention,
  annotations?: RichTextItemResponse["annotations"],
): string {
  const { href, title, icon_url, link_provider, description } = linkData;

  /*
  "link_mention": {
    "href": "https://docs.aws.amazon.com/lambda/latest/dg/example-apps.html",
    "title": "Example serverless apps - AWS Lambda",
    "icon_url": "https://docs.aws.amazon.com/assets/images/favicon.ico",
    "description": "Get started with Lambda by deploying and testing a serverless app.",
    "link_provider": "AWS Lambda",
    "thumbnail_url": "https://a0.awsstatic.com/libra-css/images/logos/aws_logo_smile_179x109.png"
  }
  */

  const provider = link_provider || "";
  const linkText = title || href;
  const tooltip = description || "";

  // icon_url이 있으면, 아이콘 이미지를 작게 표시
  // (스타일링은 CSS로 조절)
  const iconImg = icon_url
    ? `<img src="${icon_url}" alt="" class="inline-link-icon" />`
    : "";

  // linkText에 annotation이 있을 경우 적용
  const text = `<span style="color: #666">${provider}</span> <strong style="color: #333;">${linkText}</strong>`;

  return `
    <a href="${href}" 
       class="inline-link-mention"
       target="_blank"
       rel="noopener noreferrer"
       title="${tooltip}">
       ${iconImg}
       ${text}
    </a>
  `;
}

/**
 * Notion의 RichText 배열을 간단히 HTML로 변환하는 함수
 */
function renderRichText(richTextArray: RichTextItemResponse[] = []): string {
  return richTextArray
    .map((rt) => {
      // 타입 오류가 불가피함; 공식 타입에 없음;;
      if (rt.type === "mention" && rt.mention?.type === "link_mention") {
        // link_mention 인라인 링크로 처리
        return renderLinkMentionInline(rt.mention.link_mention, rt.annotations);
      }

      const text = rt.plain_text || "";
      const { bold, italic, strikethrough, underline, code, color } =
        rt.annotations || {};
      let html = text;

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

      // 색상 처리 (원한다면 인라인 스타일 적용 등)
      // if (color && color !== 'default') {
      //   html = `<span style="color:${color}">${html}</span>`;
      // }

      // 링크 처리
      if (rt.href) {
        html = `<a href="${rt.href}" target="_blank">${html}</a>`;
      }

      return html;
    })
    .join("");
}

/**
 * 단일 블록을 HTML로 변환
 * - 이미 block.children가 있을 수 있으므로, 재귀적으로 render
 */
function renderBlock(block: ExtendedBlockObjectResponse): string {
  const { type, has_children, children } = block;

  // children이 있으면, 아래에서 HTML 추가
  // (fetch 단계에서 이미 children이 채워져 있으므로, 여기서는 API 호출 없음)
  const childrenHTML =
    children && children.length > 0 ? renderBlocks(children) : "";

  switch (type) {
    case "paragraph": {
      const { rich_text } = block.paragraph;
      return `<p>${renderRichText(rich_text)}</p>\n${childrenHTML}`;
    }

    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const headingData = block[type];
      const content = renderRichText(headingData.rich_text);
      const tag =
        type === "heading_1" ? "h1" : type === "heading_2" ? "h2" : "h3";
      return `<${tag}>${content}</${tag}>\n${childrenHTML}`;
    }

    case "bulleted_list_item":
    case "numbered_list_item": {
      // 실제로는 UL/OL로 감싸야 하지만 여기서는 li만 예시
      const data = block[type];

      // block.bulleted_list_item.rich_text를 HTML로 변환 (간단 예시)
      const textHTML = renderRichText(data.rich_text);

      // 자식(children) 렌더링
      // 만약 자식들이 모두 bulleted_list_item이라고 가정하면 <ul> 안에 렌더링
      // (자식 중에 paragraph 같은 게 섞여 있을 수도 있으니, 상황에 따라 처리)
      let childrenHTML = "";
      if (block.children && block.children.length > 0) {
        // 보통은 "연속된 리스트" 감싸기를 위해 상위에서 처리하기도 하지만,
        // 여기서는 간단히 <ul>로 한번에 감쌈
        childrenHTML = `<ul>${renderBlocks(block.children)}</ul>`;
      }

      // 최종적으로 li 태그
      return `<li>${textHTML}${childrenHTML}</li>`;
    }

    case "to_do": {
      const toDo = block.to_do;
      const checked = toDo.checked ? "checked" : "";
      return `
        <div>
          <input type="checkbox" ${checked} />
          <label>${renderRichText(toDo.rich_text)}</label>
        </div>
        ${childrenHTML}
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
        </div>
        ${childrenHTML}
      `;
    }

    case "quote": {
      const quote = block.quote;
      return `<blockquote>${renderRichText(quote.rich_text)}</blockquote>${childrenHTML}`;
    }

    case "code": {
      const codeData = block.code;
      const lang = codeData.language || "";
      return `
        <pre><code class="language-${lang}">
          ${renderRichText(codeData.rich_text)}
        </code></pre>
        ${childrenHTML}
      `;
    }

    case "divider": {
      return `<hr />\n`;
    }

    case "equation": {
      const eq = block.equation;
      // KaTeX 등을 이용해 렌더링 가능
      return `<div class="equation">\$begin:math:text$${eq.expression}\\$end:math:text$</div>${childrenHTML}`;
    }

    case "image": {
      const image = block.image;
      const caption = renderRichText(image.caption || []);
      const src =
        image.type === "external" ? image.external.url : image.file.url;
      return `<figure><img src="${src}" alt="" /><figcaption>${caption}</figcaption></figure>${childrenHTML}`;
    }

    case "bookmark": {
      const bookmark = block.bookmark;
      const cap = renderRichText(bookmark.caption || []);
      return `
        <div class="bookmark">
          <a href="${bookmark.url}" target="_blank">${bookmark.url}</a>
          <div>${cap}</div>
        </div>
        ${childrenHTML}
      `;
    }

    case "embed":
    case "file":
    case "pdf":
    case "video":
    case "audio": {
      // 공통적으로 external/file 나눠 처리
      const data = block[type] as any;
      const src = data.type === "external" ? data.external.url : data.file.url;
      return `<div class="${type}-block"><a href="${src}" target="_blank">${type.toUpperCase()} link</a></div>${childrenHTML}`;
    }

    case "table": {
      // table.children => table_row[]
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

    case "synced_block": {
      // synced_from이 있으면 원본 블록과 연결된 상태
      return `<div class="synced-block">${childrenHTML}</div>`;
    }

    case "child_page": {
      // child_page.title 존재. 해당 페이지의 상세 내용은 이미 fetch되었거나 pageId 별도
      return `<div class="child-page">Child page: ${block.child_page.title}</div>${childrenHTML}`;
    }

    case "child_database": {
      return `<div class="child-database">Child DB: ${block.child_database.title}</div>${childrenHTML}`;
    }

    default: {
      console.warn("Unsupported block type:", type);
      return `<div>Unsupported block type: ${type}</div>`;
    }
  }
}

/**
 * 여러 블록 배열을 순회하며 HTML로 합치는 함수
 */
export function renderBlocks(blocks: ExtendedBlockObjectResponse[]): string {
  return blocks.map((block) => renderBlock(block)).join("\n");
}
