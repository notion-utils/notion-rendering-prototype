import fs from "fs";

export function renderPageContent(pageContent: any): string {
  let result = "";

  for (const block of pageContent.results) {
    result += renderBlockRecursively(block);
  }

  return result;
}

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

function renderTableOfContents(block: any): string {
  const color = block.table_of_contents.color || "default";
  const pageId = block.parent.page_id;
  let tocHtml = "";

  const pageContent = JSON.parse(
    fs.readFileSync("./output/page-content.json", "utf-8")
  );

  const headings = pageContent.results.filter((b: any) =>
    b.type.startsWith("heading_")
  );

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

function renderRichText(richText: any[]): string {
  if (!richText?.length) return "";
  return richText.map((text) => text.plain_text).join("");
}

function renderTable(block: any): string {
  let result = "<table style='border-collapse: collapse; width: 100%;'>\n";

  if (block.children?.results) {
    result += "<thead>\n";
    result += renderTableRow(block.children.results[0], true);
    result += "</thead>\n";

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

function renderColumnList(block: any): string {
  let result = "<div style='display: flex;'>\n";

  if (block.children?.results) {
    for (const column of block.children.results) {
      result += renderColumn(column);
    }
  }

  return result + "</div>\n\n";
}

function renderColumn(block: any): string {
  let result = "<div style='flex: 1; padding: 8px;'>\n";

  if (block.children?.results) {
    for (const child of block.children.results) {
      result += renderBlockRecursively(child);
    }
  }

  return result + "</div>\n";
}

export function renderPage() {
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
