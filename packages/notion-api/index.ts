import {
  queryDatabase,
  fetchPageData,
  getTableOfContents,
} from "./notionFetcher";
import { renderPage } from "./notionRenderer";

const notionDatabaseId = "6b7db292c7d544cba34d965012a736a4";
const notionPageId = "18453cfa-96ad-80dd-8e50-d465ac1af643";

// await queryDatabase(notionDatabaseId);
// await fetchPageData(notionPageId);
// await getTableOfContents(notionPageId);

// 메인 실행 코드
renderPage();
