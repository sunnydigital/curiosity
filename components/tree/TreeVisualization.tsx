"use client";

import { useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TreeNodeMemo } from "./TreeNode";
import { TreeEdgeMemo } from "./TreeEdge";
import { computeTreeLayout } from "@/lib/tree/tree-layout";
import type { Message } from "@/types";

const nodeTypes = { chatNode: TreeNodeMemo };
const edgeTypes = { chatEdge: TreeEdgeMemo };

/** Re-fits the viewport whenever the node count stabilises.
 *  Debounced so rapid node additions during streaming don't
 *  cause the viewport to jump around or hide existing nodes. */
function FitViewOnChange({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        fitView({ duration: 300 });
      });
    }, 150);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodeCount, fitView]);
  return null;
}

// Custom component to render edges in the MiniMap
function MiniMapEdges({ edges, nodes }: { edges: Edge[]; nodes: Node[] }) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  return (
    <g className="minimap-edges">
      {edges.map((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) return null;

        // Get node positions and dimensions
        const sourceX = sourceNode.position.x + 100; // Center of node (200/2)
        const sourceY = sourceNode.position.y + 40; // Bottom of node (approximate height)
        const targetX = targetNode.position.x + 100;
        const targetY = targetNode.position.y;

        const isTrunk = (edge.data as any)?.isTrunk ?? false;

        // Create a simple bezier curve
        const midY = (sourceY + targetY) / 2;
        const path = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke={isTrunk ? "var(--tree-trunk-stroke)" : "var(--tree-branch-stroke)"}
            strokeWidth={isTrunk ? 3 : 2}
            strokeDasharray={isTrunk ? "none" : "4,4"}
            opacity={0.7}
          />
        );
      })}
    </g>
  );
}

interface TreeVisualizationProps {
  messages: Message[];
  activeIds: Set<string>;
  onNodeClick?: (messageId: string) => void;
  onDeleteBranch?: (messageId: string) => void;
}

export function TreeVisualization({
  messages,
  activeIds,
  onNodeClick,
  onDeleteBranch,
}: TreeVisualizationProps) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeTreeLayout(messages, activeIds),
    [messages, activeIds]
  );

  // Add onDelete callback to node data
  const nodesWithCallbacks = useMemo(() => {
    return layoutNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onDelete: onDeleteBranch,
      },
    }));
  }, [layoutNodes, onDeleteBranch]);

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithCallbacks as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges as Edge[]);

  // Update nodes and edges when messages change
  useEffect(() => {
    setNodes(nodesWithCallbacks as Node[]);
    setEdges(layoutEdges as Edge[]);
  }, [nodesWithCallbacks, layoutEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  const getNodeColor = useCallback((node: Node) => {
    const data = node.data as any;
    const message = data?.message;
    const isTrunk = data?.isTrunk;

    if (!message) return "var(--tree-minimap-node)";

    const isUser = message.role === "user";
    const isBranch = message.isBranchRoot;

    // Use dedicated minimap colors for better visibility in both light and dark mode
    if (isTrunk) {
      return isUser
        ? "var(--tree-minimap-trunk-user)"
        : "var(--tree-minimap-trunk-ai)";
    } else if (isBranch) {
      return "var(--tree-minimap-branch)";
    } else {
      return isUser
        ? "var(--tree-minimap-other-user)"
        : "var(--tree-minimap-other-ai)";
    }
  }, []);

  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          zoomOnScroll={true}
          zoomOnPinch={true}
          panOnScroll={false}
          panOnDrag={true}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <FitViewOnChange nodeCount={nodes.length} />
          <Controls
            className="!bg-background !border-border"
            showZoom={true}
            showFitView={true}
            showInteractive={false}
          />
          <MiniMap
            className="!bg-background !border-border"
            nodeColor={getNodeColor}
            zoomable
            pannable
          >
            <MiniMapEdges edges={edges} nodes={nodes} />
          </MiniMap>
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--tree-bg-dots)"
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
