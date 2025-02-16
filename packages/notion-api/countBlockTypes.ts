import fs from "fs";

const raw = fs.readFileSync("./output/o1-raw.json").toString();
const json = JSON.parse(raw);

function collectBlockTypes(data: unknown): Map<string, number> {
  const typeCountMap = new Map<string, number>();

  function traverse(value: unknown) {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item);
      }
      return;
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj.object === "block" && typeof obj.type === "string") {
        const currentCount = typeCountMap.get(obj.type) || 0;
        typeCountMap.set(obj.type, currentCount + 1);
      }

      // 객체의 모든 필드에 대해 재귀 호출
      for (const key of Object.keys(obj)) {
        traverse(obj[key]);
      }
    }
  }

  traverse(data);
  return typeCountMap;
}

const result = collectBlockTypes(json);
console.log(result);
