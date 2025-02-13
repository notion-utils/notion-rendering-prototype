import fs from "fs";

export function trimPropertiesRecursively(
  obj: Record<string, any>,
  propNames: Set<string>,
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    // 배열인 경우 각 요소를 재귀적으로 탐색
    for (const item of obj) {
      trimPropertiesRecursively(item, propNames);
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
        trimPropertiesRecursively(obj[key], propNames);
      }
    }
  }
}

// trimPropertiesRecursively(
//   data,
//   new Set([
//     "created_time",
//     "last_edited_time",
//     "created_by",
//     "last_edited_by",
//     "has_children",
//     "archived",
//     "in_trash",
//     "parent",
//     "object",
//   ]),
// );

// fs.writeFileSync("./output/test", JSON.stringify(data, null, 2));
