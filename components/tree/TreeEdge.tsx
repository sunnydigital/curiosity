"use client";

import { memo } from "react";
import { getBezierPath, getStraightPath, type EdgeProps, Position } from "@xyflow/react";

function TreeEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, data } = props;

  const isTrunk = (data as any)?.isTrunk ?? false;

  let edgePath: string;

  if (isTrunk && sourceX === targetX) {
    // Trunk edges with no horizontal offset: straight vertical lines
    [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else {
    // All other edges: smooth bezier from bottom to top
    [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Bottom,
      targetX,
      targetY,
      targetPosition: Position.Top,
    });
  }

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke={isTrunk ? "var(--tree-trunk-stroke)" : "var(--tree-branch-stroke)"}
      strokeWidth={isTrunk ? 2 : 1.5}
      strokeDasharray={isTrunk ? "none" : "5,5"}
      className="react-flow__edge-path"
    />
  );
}

export const TreeEdgeMemo = memo(TreeEdgeComponent);
