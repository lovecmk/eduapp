// '버튼 안의 버튼' 찾기 — 화면을 렌더한 트리에서 직접 센다.
//
// 왜 이런 검사가 필요한가: 웹(react-native-web)은 accessibilityRole="button" 을
// 진짜 <button> 엘리먼트로 그린다. 그래서 버튼 안에 버튼을 담으면 유효하지 않은
// DOM 이 되고(React 가 매 렌더마다 validateDOMNesting 오류를 찍는다), 무엇보다
// 스크린 리더가 중첩된 컨트롤을 제대로 읽어 주지 못한다 — 안쪽 버튼이 바깥 버튼의
// 이름에 묻힌다.
//
// 구현이 아니라 **결과 구조**만 고정하므로, 나중에 레이아웃을 어떻게 손봐도
// 이 검사는 계속 유효하다.

/**
 * react-test-renderer 의 트리 노드 — 이 검사에 필요한 만큼만 추렸다.
 * (@types/react-test-renderer 를 새로 들이지 않는다. SDK 52 의존성은 고정이다.)
 */
export type TreeNode = {
  type: unknown;
  props: Record<string, unknown>;
  parent: TreeNode | null;
  findAll: (predicate: (n: TreeNode) => boolean) => TreeNode[];
};

/**
 * 호스트 노드(타입이 문자열)만 버튼으로 센다.
 *
 * Pressable 은 트리에 '컴포넌트 + 그것이 그린 View' 두 번 나타나고 둘 다 같은 role 을
 * 들고 있어서, 걸러 내지 않으면 버튼 하나가 저 자신을 감싼 것처럼 보인다.
 * 실제로 DOM 이 되는 것은 호스트 쪽이다.
 */
export const isButton = (node: TreeNode): boolean =>
  typeof node.type === 'string' && node.props?.accessibilityRole === 'button';

/** 자신이 버튼이면서 조상 중에도 버튼이 있는 노드 — 곧 '버튼 안의 버튼'. */
export function nestedButtons(root: TreeNode): TreeNode[] {
  return root.findAll(isButton).filter((node) => {
    for (let p = node.parent; p; p = p.parent) if (isButton(p)) return true;
    return false;
  });
}

/**
 * 노드가 품고 있는 이름/글 — 실패 메시지에서 어느 버튼인지 알아보려고.
 *
 * 여기서도 호스트 노드만 센다. Text 역시 '컴포넌트 + 호스트' 두 번 나타나므로
 * 걸러 내지 않으면 모든 글자가 '추천 추천' 처럼 두 번씩 찍힌다.
 */
export const labelOf = (n: TreeNode): string =>
  (n.props?.accessibilityLabel as string | undefined) ??
  n
    .findAll((x) => typeof x.type === 'string' && typeof x.props?.children === 'string')
    .map((x) => x.props.children as string)
    .join(' ')
    .slice(0, 40);

/** 화면 전체에서 찾은 '버튼 안의 버튼'의 이름 목록. 없으면 빈 배열. */
export const nestedButtonLabels = (root: TreeNode): string[] => nestedButtons(root).map(labelOf);
