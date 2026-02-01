"use client";

import { memo } from "react";
import { getBezierPath, getStraightPath, type EdgeProps, Position } from "@xyflow/react";

function TreeEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, sourceHandleId } = props;

  const isTrunk = (data as any)?.isTrunk ?? false;

  // Determine if this is a side-to-side branch edge
  const isSideBranch = sourceHandleId === 'source-left' || sourceHandleId === 'source-right';

  let edgePath: string;

  if (isTrunk) {
    // Trunk edges: straight vertical lines
    [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (isSideBranch) {
    // Branch edges from sides: use bezier with horizontal control points
    const isLeftBranch = sourceHandleId === 'source-left';

    // Calculate control points for a smooth curve
    const controlOffset = Math.abs(targetX - sourceX) * 0.5;

    // Create a smooth S-curve from side to side
    const cp1x = isLeftBranch ? sourceX - controlOffset : sourceX + controlOffset;
    const cp1y = sourceY;
    const cp2x = isLeftBranch ? targetX + controlOffset : targetX - controlOffset;
    const cp2y = targetY;

    edgePath = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;
  } else {
    // Default bezier for other edges
    [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePosition || Position.Bottom,
      targetX,
      targetY,
      targetPosition: targetPosition || Position.Top,
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
