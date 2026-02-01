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

const NODE_HEIGHT = 80;
const NODE_WIDTH = 200;
const VERTICAL_GAP = 80;
const HORIZONTAL_GAP = 240;
const TRUNK_COL = 0;

export function computeTreeLayout(
  messages: Message[],
  activeIds: Set<string>
): { nodes: TreeNodeData[]; edges: TreeEdgeData[] } {
  if (messages.length === 0) return { nodes: [], edges: [] };

  const childrenMap = new Map<string | null, Message[]>();
  const messageMap = new Map<string, Message>();

  for (const msg of messages) {
    messageMap.set(msg.id, msg);
    const key = msg.parentId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(msg);
  }

  // Sort children by sibling_index
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.siblingIndex - b.siblingIndex);
  }

  const root = messages.find((m) => !m.parentId);
  if (!root) return { nodes: [], edges: [] };

  // Find the trunk path
  const trunkIds = new Set<string>();
  let current: Message | undefined = root;
  while (current) {
    trunkIds.add(current.id);
    const nextChildren: Message[] = childrenMap.get(current.id) || [];
    current = nextChildren.find((c) => !c.isBranchRoot) || undefined;
  }

  const nodes: TreeNodeData[] = [];
  const edges: TreeEdgeData[] = [];

  // Calculate width of each subtree (number of leaf nodes / terminal paths)
  const subtreeWidthCache = new Map<string, number>();

  function calcSubtreeWidth(messageId: string): number {
    if (subtreeWidthCache.has(messageId)) {
      return subtreeWidthCache.get(messageId)!;
    }

    const children = childrenMap.get(messageId) || [];

    if (children.length === 0) {
      subtreeWidthCache.set(messageId, 1);
      return 1;
    }

    // For trunk nodes, trunk child doesn't add width (stays in same column)
    // Only branch children contribute width
    if (trunkIds.has(messageId)) {
      const trunkChild = children.find((c) => trunkIds.has(c.id));
      const branchChildren = children.filter((c) => !trunkIds.has(c.id));

      // Width needed = sum of branch widths + trunk width (which uses center)
      const branchWidth = branchChildren.reduce(
        (sum, c) => sum + calcSubtreeWidth(c.id),
        0
      );
      // Trunk needs at least 1 column in the center
      const trunkWidth = trunkChild ? calcSubtreeWidth(trunkChild.id) : 0;

      // Total width: branches spread out, trunk stays center
      // The width is max of: branch spread or what trunk needs below
      const width = Math.max(1, branchWidth, trunkWidth);
      subtreeWidthCache.set(messageId, width);
      return width;
    }

    // Non-trunk: width is sum of all children widths
    const width = children.reduce((sum, c) => sum + calcSubtreeWidth(c.id), 0);
    subtreeWidthCache.set(messageId, Math.max(1, width));
    return Math.max(1, width);
  }

  // Pre-calculate all widths
  calcSubtreeWidth(root.id);

  // Layout function - each node gets a column range [left, right] to work within
  function layoutNode(
    message: Message,
    depth: number,
    leftCol: number,
    rightCol: number
  ): void {
    const isTrunk = trunkIds.has(message.id);
    // Place node at center of its allocated range
    const col = isTrunk ? TRUNK_COL : (leftCol + rightCol) / 2;
    const x = col * HORIZONTAL_GAP - NODE_WIDTH / 2;
    const y = depth * (NODE_HEIGHT + VERTICAL_GAP);

    nodes.push({
      id: message.id,
      position: { x, y },
      data: {
        message,
        isActive: activeIds.has(message.id),
        isTrunk,
      },
      type: "chatNode",
    });

    const nodeChildren: Message[] = childrenMap.get(message.id) || [];
    if (nodeChildren.length === 0) return;

    if (isTrunk) {
      const trunkChild = nodeChildren.find((c) => trunkIds.has(c.id));
      const branchChildren = nodeChildren.filter((c) => !trunkIds.has(c.id));

      // Trunk child continues at trunk column
      if (trunkChild) {
        edges.push({
          id: `${message.id}-${trunkChild.id}`,
          source: message.id,
          target: trunkChild.id,
          type: "chatEdge",
          sourceHandle: "bottom",
          targetHandle: "top",
          data: { isTrunk: true },
        });
        // Trunk gets its own column range centered on TRUNK_COL
        layoutNode(trunkChild, depth + 1, TRUNK_COL, TRUNK_COL);
      }

      // Distribute branches left and right of trunk
      if (branchChildren.length > 0) {
        const leftBranches: Message[] = [];
        const rightBranches: Message[] = [];

        for (let i = 0; i < branchChildren.length; i++) {
          if (i % 2 === 0) {
            rightBranches.push(branchChildren[i]);
          } else {
            leftBranches.push(branchChildren[i]);
          }
        }

        // Layout right branches - each gets width proportional to its subtree
        let currentCol = TRUNK_COL + 1;
        for (const child of rightBranches) {
          const childWidth = calcSubtreeWidth(child.id);
          const childLeft = currentCol;
          const childRight = currentCol + childWidth - 1;

          edges.push({
            id: `${message.id}-${child.id}`,
            source: message.id,
            target: child.id,
            type: "chatEdge",
            sourceHandle: "bottom",
            targetHandle: "top",
            data: { isTrunk: false },
          });

          layoutNode(child, depth + 1, childLeft, childRight);
          currentCol = childRight + 1;
        }

        // Layout left branches
        currentCol = TRUNK_COL - 1;
        for (const child of leftBranches) {
          const childWidth = calcSubtreeWidth(child.id);
          const childRight = currentCol;
          const childLeft = currentCol - childWidth + 1;

          edges.push({
            id: `${message.id}-${child.id}`,
            source: message.id,
            target: child.id,
            type: "chatEdge",
            sourceHandle: "bottom",
            targetHandle: "top",
            data: { isTrunk: false },
          });

          layoutNode(child, depth + 1, childLeft, childRight);
          currentCol = childLeft - 1;
        }
      }
    } else {
      // Non-trunk node: distribute children across allocated range
      if (nodeChildren.length === 1) {
        const child = nodeChildren[0];
        edges.push({
          id: `${message.id}-${child.id}`,
          source: message.id,
          target: child.id,
          type: "chatEdge",
          sourceHandle: "bottom",
          targetHandle: "top",
          data: { isTrunk: false },
        });
        // Single child inherits parent's range
        layoutNode(child, depth + 1, leftCol, rightCol);
      } else {
        // Multiple children: divide range proportionally by subtree width
        const childWidths = nodeChildren.map((c) => calcSubtreeWidth(c.id));
        const totalWidth = childWidths.reduce((a, b) => a + b, 0);
        const rangeWidth = rightCol - leftCol + 1;

        // If range is smaller than needed, expand it
        const actualRangeWidth = Math.max(rangeWidth, totalWidth);
        const actualLeft = leftCol - Math.floor((actualRangeWidth - rangeWidth) / 2);

        let currentCol = actualLeft;
        for (let i = 0; i < nodeChildren.length; i++) {
          const child = nodeChildren[i];
          const childWidth = childWidths[i];
          const childLeft = currentCol;
          const childRight = currentCol + childWidth - 1;

          edges.push({
            id: `${message.id}-${child.id}`,
            source: message.id,
            target: child.id,
            type: "chatEdge",
            sourceHandle: "bottom",
            targetHandle: "top",
            data: { isTrunk: false },
          });

          layoutNode(child, depth + 1, childLeft, childRight);
          currentCol = childRight + 1;
        }
      }
    }
  }

  // Start layout from root
  const rootWidth = calcSubtreeWidth(root.id);
  layoutNode(root, 0, TRUNK_COL, TRUNK_COL);

  return { nodes, edges };
}
