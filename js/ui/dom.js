export function requiredElement(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`화면 구성 버전이 일치하지 않습니다: ${selector}. 새 ZIP을 빈 폴더에 압축 해제한 뒤 다시 실행해 주세요.`);
  }
  return element;
}
