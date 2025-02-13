// types.ts
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

/**
 * Notion의 BlockObjectResponse를 확장해서
 * children 배열을 포함하도록 한 사용자 정의 타입
 */
export interface ExtendedBlockObjectResponse
  extends Omit<BlockObjectResponse, "type"> {
  type: string;
  children?: ExtendedBlockObjectResponse[];
}
