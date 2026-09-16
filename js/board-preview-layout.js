/**
 * UI-only reference layout. NOT a character-specific master-data export.
 * Coordinates: HolodoriDB/holodori-db-kor-diff, commit
 * 9234a7d99c5cfba9b71803c24a6de4c005c4842f, SkillTreeNodePosition.json,
 * tree-model-001. Other models, character overrides, effects and unlock rules
 * are deliberately deferred. Do not consume this module in the score engine.
 */
export const BOARD_LAYOUT_ID = "tree-model-001-ui-reference-v1";
const coordinates = {
  B: [[-1,0],[-2,0],[-2,-1],[-2,1],[-3,0],[-4,0],[-5,0],[-6,0],[-7,-1],[-7,-2],[-7,-3],[-6,-3],[-5,-3],[-8,-3],[-9,-3],[-7,1],[-7,2],[-7,3],[-6,3],[-5,3],[-8,3],[-9,3],[-8,0],[-8,-1],[-8,1],[-9,0],[-10,0],[-10,-1],[-10,-2],[-10,1],[-10,2]],
  G: [[0,-1],[0,-2],[-1,-2],[1,-2],[0,-3],[0,-4],[0,-5],[0,-6],[-1,-6],[1,-6],[0,-7],[-1,-7],[-2,-7],[-3,-7],[1,-7],[2,-7],[3,-7],[0,-8],[-1,-8],[1,-8],[0,-9],[-1,-9],[1,-9],[-1,-10]],
  R: [[0,1],[0,2],[-1,2],[1,2],[0,3],[0,4],[0,5],[0,6],[-1,7],[-2,7],[-3,7],[-4,7],[-5,7],[-6,7],[-3,6],[-3,5],[-4,5],[-5,5],[1,7],[2,7],[0,8],[-1,8],[-2,8],[-3,8],[-4,8],[-5,8],[-6,8],[-3,9],[-3,10],[-4,10],[-5,10],[1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[4,7],[4,6],[5,6],[6,6],[7,6],[4,9],[4,10],[5,10],[6,10],[0,9],[0,10],[0,11],[0,12],[-1,12],[1,12],[0,13],[-1,13],[-2,13],[1,13],[2,13],[-1,14],[1,14],[7,10],[9,8]],
  S: [[0,0],[0,7],[-7,0],[7,0]],
  Y: [[1,0],[2,0],[2,-1],[2,1],[3,0],[4,0],[5,0],[6,0],[7,-1],[7,-2],[7,-3],[6,-3],[5,-3],[8,-3],[9,-3],[7,1],[7,2],[7,3],[6,3],[5,3],[8,3],[9,3],[8,0],[8,-1],[8,1],[9,0],[10,0],[10,-1],[10,-2],[10,1],[10,2]],
};
export const BOARD_NODES = Object.freeze(Object.entries(coordinates).flatMap(([type, rows]) =>
  rows.map(([x, y], index) => Object.freeze({
    id: `${type}-${String(index + 1).padStart(3, "0")}`, type, x, y,
  }))));
export const CONNECTOR_IDS = Object.freeze(BOARD_NODES.filter(node => node.type === "S").map(node => node.id));
