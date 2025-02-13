# Notion API 응답 및 블록 타입 가이드

## 1. 응답 구조

API 응답은 다음과 같은 구조를 가집니다:

| 필드        | 설명                    |
| ----------- | ----------------------- |
| object      | 응답 객체 타입 ("list") |
| results     | 블록 목록 배열          |
| next_cursor | 다음 페이지 커서        |
| has_more    | 추가 결과 존재 여부     |
| type        | 응답 타입 ("block")     |
| request_id  | 요청 ID                 |

## 2. 기본 블록 타입

Notion 페이지에서 사용할 수 있는 기본 블록 타입들입니다:

### 텍스트 관련

- `paragraph`: 일반 텍스트 단락
- `heading_1`: 대제목 (H1)
- `heading_2`: 중제목 (H2)
- `heading_3`: 소제목 (H3)

### 리스트 관련

- `bulleted_list_item`: 글머리 기호 목록
- `numbered_list_item`: 번호 매기기 목록
- `to_do`: 체크박스 목록
- `toggle`: 접을 수 있는 토글 목록

### 미디어 및 임베드

- `image`: 이미지 블록
- `video`: 비디오 블록
- `audio`: 오디오 블록
- `file`: 일반 파일
- `pdf`: PDF 문서
- `embed`: 외부 컨텐츠 임베드

### 서식 및 구조

- `code`: 코드 블록
- `quote`: 인용구
- `callout`: 강조 블록
- `divider`: 구분선
- `table`: 표 컨테이너
- `table_row`: 표의 행
- `equation`: 수식
- `table_of_contents`: 목차
- `breadcrumb`: 탐색 경로

### 레이아웃

- `column_list`: 다단 레이아웃 컨테이너
- `column`: 다단 레이아웃의 개별 단

### 링크 및 참조

- `bookmark`: 웹페이지 북마크
- `link_preview`: 링크 미리보기
- `link_to_page`: 다른 페이지로의 링크
- `synced_block`: 동기화된 블록
- `template`: 템플릿 블록

### 하위 컨테이너

- `child_page`: 하위 페이지
- `child_database`: 하위 데이터베이스
