@AGENTS.md

# 운영 / 배포 정책 (확정 — 재논의 금지)

## 브랜치 정책
- **운영 브랜치 = `genspark_ai_developer`** (Render watch 대상, 진실 공급원)
- **`main` = fast-forward 미러** (히스토리 정렬용, 운영 기준 아님)
- 이 구조는 이미 오너가 결정했고 정리 끝난 사항임. **다시 옵션 제시/질문하지 말 것.**

## 표준 워크플로우
1. `genspark_ai_developer`에서 작업/커밋
2. `git push origin genspark_ai_developer` → Render 자동 재배포
3. `main`으로 체크아웃 → fast-forward merge → push (미러 동기화)
4. 다시 `genspark_ai_developer`로 복귀

## 금지 사항
- "main이 정석 아닌가요?" 류 인프라 재검토 제안 금지
- 작업 시작 전 브랜치 정책 의문 제기 금지
- 사용자가 작업 지시하면 → 브랜치 얘기 빼고 바로 진행

# UI 컴포넌트 정책 (확정)

## 핵심 원칙
- **shadcn/ui 우선 사용**. 새 UI가 필요하면 먼저 shadcn에 같은 역할 컴포넌트가 있는지 확인하고, 있으면 그걸 가져다 쓴다.
- 직접 from-scratch 구현은 shadcn에 없거나 프로젝트 도메인 전용일 때만 (예: KpiCard, SessionRow 등).
- 가져올 때는 **프로젝트 톤에 맞춰 커스터마이즈**한다 — 색은 `var(--color-*)`, radius `rounded-md`, border `border-[var(--color-border)]`, 한글 sans, 본문 13px.

## 우선 채택 대상
Dialog / Sheet / Tabs / Accordion / Select / Combobox / Command(멀티셀렉트·태그 선택) / Table / Toast(Sonner) / Tooltip / Popover / Form(+ react-hook-form + zod) / Button / Input / Textarea / Checkbox / Switch / Badge / Card / Skeleton

## 도입 절차
1. shadcn에 있는지 확인
2. `components.json` 없으면 `npx shadcn@latest init` 먼저
3. `npx shadcn@latest add <component>` 로 가져오기
4. `components/ui/*.tsx`를 프로젝트 톤(`--color-*`, radius)으로 1차 매핑
5. 도메인 컴포넌트가 이를 합성해서 사용

## 금지
- shadcn에 흔하게 있는 것(Dialog, Select, Combobox 등)을 또 from-scratch로 짜지 말 것
- 사용자에게 "shadcn 쓸까요?" 매번 묻지 말기 — 정책상 디폴트 채택
