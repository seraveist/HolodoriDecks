// Board routing uses the displayed grid: orthogonal neighbours, origin at (0, 0).
// Minimise newly selected cells, then path length; stable IDs break remaining ties.
const graphs = new WeakMap();
function graphFor(model) {
  if (!model) throw new Error('INVALID_NODE');
  if (graphs.has(model)) return graphs.get(model);
  const positions = new Map(model.nodes.map(node => [`${node.x},${node.y}`, node.id]));
  const root = positions.get('0,0');
  if (!root) throw new Error('BOARD_PATH_UNAVAILABLE');
  const edges = new Map(model.nodes.map(node => [node.id,
    [[0,1],[-1,0],[1,0],[0,-1]].map(([x,y]) => positions.get(`${node.x+x},${node.y+y}`)).filter(Boolean).sort(),
  ]));
  const graph = { root, edges };
  graphs.set(model, graph);
  return graph;
}

function reachable(graph, selected) {
  const seen = new Set();
  // The central Connect slot is the origin even when no card/selection is set.
  const queue = [graph.root]; seen.add(graph.root);
  for (const id of queue) for (const next of graph.edges.get(id)) {
    if (selected.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}

function signature(board) {
  return JSON.stringify([board?.layoutId ?? null, [...(board?.unlockedNodes ?? [])].sort(),
    Object.entries(board?.connectors ?? {}).sort(([a],[b]) => a.localeCompare(b))]);
}

export function planBoardNodeChange(state, characterId, nodeId, catalog, action = 'auto') {
  const model = catalog.board(characterId);
  if (!model?.byId.has(nodeId)) throw new Error('INVALID_NODE');
  const graph = graphFor(model), board = state.boards[characterId];
  const selected = new Set(board?.unlockedNodes ?? []);
  const connected = reachable(graph, selected);
  const selecting = action === 'select' || (action === 'auto' && (!selected.has(nodeId) || !connected.has(nodeId)));
  const added = [], removed = [], path = [];
  if (selecting) {
    const distances = new Map([[graph.root, [0, 0]]]);
    const previous = new Map(), pending = new Set([graph.root]);
    while (pending.size) {
      const current = [...pending].sort((a,b) => {
        const x = distances.get(a), y = distances.get(b);
        return x[0]-y[0] || x[1]-y[1] || a.localeCompare(b);
      })[0];
      pending.delete(current);
      if (current === nodeId) break;
      const [cost, length] = distances.get(current);
      for (const next of graph.edges.get(current)) {
        const candidate = [cost + (selected.has(next) ? 0 : 1), length + 1];
        const old = distances.get(next);
        if (!old || candidate[0] < old[0] || (candidate[0] === old[0] && candidate[1] < old[1])) {
          distances.set(next, candidate); previous.set(next, current); pending.add(next);
        }
      }
    }
    if (!distances.has(nodeId)) throw new Error('BOARD_PATH_UNAVAILABLE');
    for (let id = nodeId; id; id = previous.get(id)) path.unshift(id);
    added.push(...path.filter(id => !selected.has(id) && (id !== graph.root || nodeId === graph.root)));
  } else {
    const remaining = new Set(selected); remaining.delete(nodeId);
    const kept = reachable(graph, remaining);
    removed.push(...[...selected].filter(id => id === nodeId || !kept.has(id)).sort());
  }
  const removedCards = removed.filter(id => board?.connectors[id])
    .map(slotId => ({ slotId, cardId: board.connectors[slotId] }));
  return { characterId, nodeId, action: selecting ? 'select' : 'remove', path, added, removed, removedCards,
    before: signature(board),
    needsConfirmation: selecting ? added.some(id => id !== nodeId) : removed.length > 1 || removedCards.length > 0 };
}

export function boardCategoryStatus(state, characterId, catalog) {
  const model = catalog.board(characterId), selected = new Set(state.boards[characterId]?.unlockedNodes ?? []);
  const connected = reachable(graphFor(model), selected);
  return Object.fromEntries(['R','B','G','Y'].map(type => {
    const nodes = model.nodes.filter(node => node.type === type);
    return [type, { total: nodes.length, selected: nodes.filter(node => selected.has(node.id)).length,
      complete: nodes.every(node => selected.has(node.id) && connected.has(node.id)) }];
  }));
}

/** One transaction for a category, including required paths or disconnected cells. */
export function planBoardCategoryChange(state, characterId, category, catalog, action) {
  const model = catalog.board(characterId);
  if (!model || !['R','B','G','Y'].includes(category) || !['select','remove'].includes(action)) throw new Error('INVALID_NODE');
  const board = state.boards[characterId], selected = new Set(board?.unlockedNodes ?? []);
  const nodes = model.nodes.filter(node => node.type === category).map(node => node.id).sort();
  const added = [], removed = [];
  if (action === 'select') {
    // Only this member changes while planning. Validate once more when committing
    // the final plan, instead of cloning/revalidating the whole account per cell.
    const draftBoard = { ...board, unlockedNodes: [...selected], connectors: { ...board?.connectors } };
    const draft = { ...state, boards: { ...state.boards, [characterId]: draftBoard } };
    for (const id of nodes) {
      const change = planBoardNodeChange(draft, characterId, id, catalog, 'select');
      draftBoard.unlockedNodes.push(...change.added);
    }
    added.push(...draftBoard.unlockedNodes.filter(id => !selected.has(id)).sort());
  } else if (nodes.some(id => selected.has(id))) {
    const targets = new Set(nodes), remaining = new Set([...selected].filter(id => !targets.has(id)));
    const connected = reachable(graphFor(model), remaining);
    removed.push(...[...selected].filter(id => targets.has(id) || !connected.has(id)).sort());
  }
  const removedCards = removed.filter(id => board?.connectors[id])
    .map(slotId => ({ slotId, cardId: board.connectors[slotId] }));
  return { characterId, category, action, added, removed, removedCards, before: signature(board),
    needsConfirmation: added.length + removed.length > 0 };
}

export function applyBoardNodePlan(state, plan, catalog) {
  if (signature(state.boards[plan.characterId]) !== plan.before) throw new Error('BOARD_PATH_CHANGED');
  const fresh = plan.category
    ? planBoardCategoryChange(state, plan.characterId, plan.category, catalog, plan.action)
    : planBoardNodeChange(state, plan.characterId, plan.nodeId, catalog, plan.action);
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error('BOARD_PATH_CHANGED');
  const next = structuredClone(state);
  const board = next.boards[plan.characterId] ??= { layoutId: catalog.board(plan.characterId).id, unlockedNodes: [], connectors: {} };
  const removed = new Set(plan.removed);
  board.unlockedNodes = [...new Set([...board.unlockedNodes.filter(id => !removed.has(id)), ...plan.added])];
  for (const id of removed) delete board.connectors[id];
  return next;
}
