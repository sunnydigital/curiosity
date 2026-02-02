import type { Message } from "@/types";

export interface TreeNodeData {
  id: string;
  position: { x: number; y: number };
  data: {
    message: Message;
    isActive: boolean;
    isTrunk: boolean;
  };
  type: "chatNode";
}

export interface TreeEdgeData {
  id: string;
  source: string;
  target: string;
  type: "chatEdge";
  sourceHandle?: string;
  targetHandle?: string;
  data: {
    isTrunk: boolean;
  };
}

// Layout constants
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const H_SPACING = 40;
const V_SPACING = 80;

/**
 * Extended node for layout.
 *
 * For every node we compute two extents measured outward from the node centre:
 *   leftExtent  – how far left (positive number) the subtree reaches
 *   rightExtent – how far right (positive number) the subtree reaches
 *
 * The full subtree width = leftExtent + rightExtent.
 *
 * For trunk nodes the centre stays on the trunk axis (x = 0 relative), so
 * branches placed to the left contribute to leftExtent and branches placed
 * to the right contribute to rightExtent.  The trunk child's own extents
 * propagate upward so that higher-level branch placement knows how much
 * room the lower trunk already needs.
 */
interface LayoutNode {
  message: Message;
  children: LayoutNode[];
  isTrunk?: boolean;
  // Subtree extents from this node's centre
  leftExtent: number;
  rightExtent: number;
  x?: number;
  y?: number;
}

export function computeTreeLayout(
  messages: Message[],
  activeIds: Set<string>,
): { nodes: TreeNodeData[]; edges: TreeEdgeData[] } {
  if (messages.length === 0) return { nodes: [], edges: [] };

  /* ── build parent→children map ── */
  const childrenMap = new Map<string | null, Message[]>();

  for (const msg of messages) {
    const key = msg.parentId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(msg);
  }
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.siblingIndex - b.siblingIndex);
  }

  const root = messages.find((m) => !m.parentId);
  if (!root) return { nodes: [], edges: [] };

  /* ── identify trunk ── */
  const trunkIds = new Set<string>();
  let cur: Message | undefined = root;
  while (cur) {
    trunkIds.add(cur.id);
    const next: Message[] = childrenMap.get(cur.id) || [];
    cur = next.find((c) => !c.isBranchRoot) || undefined;
  }

  /* ── build LayoutNode tree ── */
  function buildTree(msg: Message): LayoutNode {
    const kids = childrenMap.get(msg.id) || [];
    return {
      message: msg,
      children: kids.map(buildTree),
      isTrunk: trunkIds.has(msg.id),
      leftExtent: NODE_WIDTH / 2,
      rightExtent: NODE_WIDTH / 2,
    };
  }
  const layoutRoot = buildTree(root);

  /* ──────────────────────────────────────────────────────────────────────
   * STEP 1 – bottom-up DFS: compute leftExtent / rightExtent for every
   *          node so that all descendants are accounted for.
   *
   * For a NON-TRUNK node the children are laid out left-to-right in a
   * row (standard Reingold–Tilford style).
   *
   * For a TRUNK node the trunk child stays centred and its extents
   * propagate directly.  Branch children are placed on the left or right
   * side *outside* the trunk child's extent, so higher branches wrap
   * around lower ones.
   *
   * Side assignment uses a global running accumulator so that across the
   * full trunk the left/right total weight stays balanced.
   * ────────────────────────────────────────────────────────────────────── */

  // We need raw subtree widths before we can do side assignment, but side
  // assignment itself affects the extents.  So we do TWO bottom-up passes:
  //   1. Compute a simple "total subtree span" for every node (ignoring
  //      trunk semantics) so partitioning can compare branch weights.
  //   2. After side assignment, compute the real left/rightExtent.

  // Pass 1 – simple span (just for partitioning weights)
  // Bottom-up DFS: each node's span = sum of children spans + spacing
  const spanMap = new Map<string, number>();
  function fillSpans(node: LayoutNode): number {
    if (node.children.length === 0) {
      spanMap.set(node.message.id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    let sum = 0;
    for (const c of node.children) {
      if (sum > 0) sum += H_SPACING;
      sum += fillSpans(c);
    }
    const span = Math.max(NODE_WIDTH, sum);
    spanMap.set(node.message.id, span);
    return span;
  }
  fillSpans(layoutRoot);

  /* ── Side assignment for every trunk fork point ── */
  // Key: trunk node id → { left: branch nodes, right: branch nodes }
  const sideMap = new Map<
    string,
    { left: LayoutNode[]; right: LayoutNode[] }
  >();

  {
    // Collect fork points (trunk nodes that have non-trunk children)
    const forks: { id: string; branches: LayoutNode[] }[] = [];
    let t: LayoutNode | undefined = layoutRoot;
    while (t && t.isTrunk) {
      const branches = t.children.filter((c) => !c.isTrunk);
      if (branches.length > 0) {
        forks.push({ id: t.message.id, branches });
      }
      t = t.children.find((c) => c.isTrunk);
    }

    let leftAccum = 0;
    let rightAccum = 0;

    for (const fp of forks) {
      // Sort branches descending by span for greedy balancing
      const sorted = [...fp.branches].sort(
        (a, b) =>
          (spanMap.get(b.message.id) || NODE_WIDTH) -
          (spanMap.get(a.message.id) || NODE_WIDTH),
      );

      const left: LayoutNode[] = [];
      const right: LayoutNode[] = [];
      let lSum = leftAccum;
      let rSum = rightAccum;

      for (const branch of sorted) {
        const w = spanMap.get(branch.message.id) || NODE_WIDTH;
        if (lSum <= rSum) {
          left.push(branch);
          lSum += w;
        } else {
          right.push(branch);
          rSum += w;
        }
      }

      sideMap.set(fp.id, { left, right });
      leftAccum = lSum;
      rightAccum = rSum;
    }
  }

  /* ── Pass 2 – real extents (bottom-up DFS) ──
   *
   * Compute leftExtent/rightExtent for every node.
   * For trunk nodes: the trunk child's extents propagate upward, and
   * branches placed on each side ADD to the corresponding wing.
   * This is the key: lower-trunk extents propagate up so that branches
   * originating higher on the trunk are placed further outward.
   */
  function calcWidth(node: LayoutNode): { left: number; right: number } {
    if (node.children.length === 0) {
      node.leftExtent = NODE_WIDTH / 2;
      node.rightExtent = NODE_WIDTH / 2;
      return { left: NODE_WIDTH / 2, right: NODE_WIDTH / 2 };
    }

    // Recurse children first
    for (const c of node.children) calcWidth(c);

    if (node.isTrunk) {
      const trunkChild = node.children.find((c) => c.isTrunk);
      const assignment = sideMap.get(node.message.id);

      // The trunk child's wings propagate up (the space that lower trunk
      // levels already need).
      let leftWing = trunkChild ? trunkChild.leftExtent : NODE_WIDTH / 2;
      let rightWing = trunkChild ? trunkChild.rightExtent : NODE_WIDTH / 2;

      // Ensure at minimum NODE_WIDTH / 2
      leftWing = Math.max(leftWing, NODE_WIDTH / 2);
      rightWing = Math.max(rightWing, NODE_WIDTH / 2);

      if (assignment) {
        // Left branches are placed OUTSIDE the current leftWing.
        // Each branch is offset starting from leftWing + H_SPACING,
        // so the full width stacks outward.
        let leftExtra = 0;
        for (const branch of assignment.left) {
          leftExtra += H_SPACING + branch.leftExtent + branch.rightExtent;
        }
        leftWing += leftExtra;

        let rightExtra = 0;
        for (const branch of assignment.right) {
          rightExtra += H_SPACING + branch.leftExtent + branch.rightExtent;
        }
        rightWing += rightExtra;
      }

      node.leftExtent = leftWing;
      node.rightExtent = rightWing;
      return { left: leftWing, right: rightWing };
    } else {
      // Non-trunk: lay children in a row
      let total = 0;
      for (let i = 0; i < node.children.length; i++) {
        const c = node.children[i];
        if (i > 0) total += H_SPACING;
        total += c.leftExtent + c.rightExtent;
      }
      const half = Math.max(NODE_WIDTH / 2, total / 2);
      node.leftExtent = half;
      node.rightExtent = half;
      return { left: half, right: half };
    }
  }

  calcWidth(layoutRoot);

  /* ── STEP 3 – top-down DFS: position every node ── */
  const nodes: TreeNodeData[] = [];
  const edges: TreeEdgeData[] = [];

  function addEdge(parentId: string, childId: string, isTrunk: boolean) {
    edges.push({
      id: `${parentId}-${childId}`,
      source: parentId,
      target: childId,
      type: "chatEdge",
      sourceHandle: "bottom",
      targetHandle: "top",
      data: { isTrunk },
    });
  }

  function position(node: LayoutNode, cx: number, y: number): void {
    node.x = cx;
    node.y = y;

    nodes.push({
      id: node.message.id,
      position: { x: cx - NODE_WIDTH / 2, y },
      data: {
        message: node.message,
        isActive: activeIds.has(node.message.id),
        isTrunk: node.isTrunk || false,
      },
      type: "chatNode",
    });

    if (node.children.length === 0) return;
    const childY = y + NODE_HEIGHT + V_SPACING;

    if (node.isTrunk) {
      const trunkChild = node.children.find((c) => c.isTrunk);
      const assignment = sideMap.get(node.message.id);

      // Trunk child stays on the same x axis
      if (trunkChild) {
        addEdge(node.message.id, trunkChild.message.id, true);
        position(trunkChild, cx, childY);
      }

      if (assignment) {
        // To figure out where to place branches, we need to know how
        // much space the trunk child (and its descendants) already
        // reserves on each side.
        const trunkLeftWing = trunkChild
          ? trunkChild.leftExtent
          : NODE_WIDTH / 2;
        const trunkRightWing = trunkChild
          ? trunkChild.rightExtent
          : NODE_WIDTH / 2;

        // Right branches: stack outward from the trunk's right wing
        {
          let cursor = Math.max(NODE_WIDTH / 2, trunkRightWing);
          for (const branch of assignment.right) {
            const bw = branch.leftExtent + branch.rightExtent;
            // The branch centre is at cursor + H_SPACING + branch.leftExtent
            // (its left half fits right after the gap)
            const branchCX = cx + cursor + H_SPACING + branch.leftExtent;

            addEdge(node.message.id, branch.message.id, false);
            position(branch, branchCX, childY);

            cursor += H_SPACING + bw;
          }
        }

        // Left branches: stack outward from the trunk's left wing
        {
          let cursor = Math.max(NODE_WIDTH / 2, trunkLeftWing);
          for (const branch of assignment.left) {
            const bw = branch.leftExtent + branch.rightExtent;
            const branchCX = cx - cursor - H_SPACING - branch.rightExtent;

            addEdge(node.message.id, branch.message.id, false);
            position(branch, branchCX, childY);

            cursor += H_SPACING + bw;
          }
        }
      }
    } else {
      // Non-trunk: lay children out left-to-right
      const total = node.children.reduce((s, c, i) => {
        return s + (i > 0 ? H_SPACING : 0) + c.leftExtent + c.rightExtent;
      }, 0);

      let x = cx - total / 2;
      for (const child of node.children) {
        const childCX = x + child.leftExtent;

        addEdge(node.message.id, child.message.id, false);
        position(child, childCX, childY);

        x += child.leftExtent + child.rightExtent + H_SPACING;
      }
    }
  }

  position(layoutRoot, 0, 0);

  return { nodes, edges };
}
