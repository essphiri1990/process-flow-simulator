import { Edge, MarkerType } from 'reactflow';
import {
  AssetPool,
  AppNode,
  CapacityMode,
  DemandMode,
  DemandUnit,
  ResourcePool,
  SharedCapacityInputMode,
} from './types';
import { DEFAULT_RESOURCE_POOL_ID } from './capacityModel';

export interface ScenarioDefinition {
  nodes: AppNode[];
  edges: Edge[];
  demandMode?: DemandMode;
  demandUnit?: DemandUnit;
  capacityMode?: CapacityMode;
  sharedCapacityInputMode?: SharedCapacityInputMode;
  sharedCapacityValue?: number;
  resourcePools?: ResourcePool[];
  assetPools?: AssetPool[];
}

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  'empty': { nodes: [], edges: [] },
  'coffee': {
    nodes: [
      { id: 'coffee-start', type: 'startNode', position: { x: 80, y: 180 }, data: { label: 'Customer Order', processingTime: 1, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 6, batchSize: 1 } } },
      { id: 'coffee-grind', type: 'processNode', position: { x: 460, y: 180 }, data: { label: 'Grind Beans', processingTime: 3, resources: 1, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-brew', type: 'processNode', position: { x: 840, y: 180 }, data: { label: 'Brew Coffee', processingTime: 6, resources: 1, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-serve', type: 'processNode', position: { x: 1220, y: 180 }, data: { label: 'Serve Cup', processingTime: 2, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-end', type: 'endNode', position: { x: 1600, y: 180 }, data: { label: 'Customer Served', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-note', type: 'annotationNode', position: { x: 840, y: 420 }, data: { label: 'Lead = queue + processing time. Run Time = the observation window.' } },
    ],
    edges: [
      { id: 'c1', source: 'coffee-start', target: 'coffee-grind', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c2', source: 'coffee-grind', target: 'coffee-brew', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c3', source: 'coffee-brew', target: 'coffee-serve', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c4', source: 'coffee-serve', target: 'coffee-end', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'devops': {
    nodes: [
      { id: 'start', type: 'startNode', position: { x: 50, y: 150 }, data: { label: 'Backlog Input', processingTime: 2, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 20, batchSize: 1 } } },
      { id: 'design', type: 'processNode', position: { x: 450, y: 150 }, data: { label: 'UX/UI Design', processingTime: 8, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dev', type: 'processNode', position: { x: 850, y: 150 }, data: { label: 'Development', processingTime: 15, resources: 4, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'review', type: 'processNode', position: { x: 1250, y: 150 }, data: { label: 'Code Review', processingTime: 5, resources: 2, quality: 0.80, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'qa': 4 } } },
      { id: 'qa', type: 'processNode', position: { x: 1650, y: 150 }, data: { label: 'QA Testing', processingTime: 10, resources: 3, quality: 0.90, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'deploy': 5 } } },
      { id: 'deploy', type: 'processNode', position: { x: 2050, y: 150 }, data: { label: 'Deployment', processingTime: 3, resources: 1, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-live', type: 'endNode', position: { x: 2450, y: 150 }, data: { label: 'Live Production', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'note1', type: 'annotationNode', position: { x: 1250, y: 420 }, data: { label: '20% of PRs fail review and return to Dev (Rework Loop)' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1650, y: 420 }, data: { label: '10% of tickets fail QA and return to Dev' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'design', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'design', target: 'dev', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'dev', target: 'review', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4-pass', source: 'review', target: 'qa', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4-fail', source: 'review', target: 'dev', sourceHandle: 'top-source', targetHandle: 'top-target', type: 'processEdge', animated: false, style: { stroke: '#f87171' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5-pass', source: 'qa', target: 'deploy', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5-fail', source: 'qa', target: 'dev', sourceHandle: 'top-source', targetHandle: 'top-target', type: 'processEdge', animated: false, style: { stroke: '#f87171' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'deploy', target: 'end-live', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'hospital': {
    nodes: [
      { id: 'start-triage', type: 'startNode', position: { x: 50, y: 200 }, data: { label: 'Patient Arrival', processingTime: 3, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'wait': 7, 'critical': 3 }, sourceConfig: { enabled: true, interval: 15, batchSize: 1 } } },
      { id: 'wait', type: 'processNode', position: { x: 450, y: 50 }, data: { label: 'Waiting Room', processingTime: 1, resources: 50, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'critical', type: 'processNode', position: { x: 450, y: 350 }, data: { label: 'Trauma Bay', processingTime: 20, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'nurse', type: 'processNode', position: { x: 850, y: 50 }, data: { label: 'Nurse Assessment', processingTime: 8, resources: 4, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'doctor', type: 'processNode', position: { x: 1250, y: 200 }, data: { label: 'Doctor Consult', processingTime: 12, resources: 3, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'labs': 6, 'discharge': 4 } } },
      { id: 'labs', type: 'processNode', position: { x: 1650, y: 350 }, data: { label: 'Labs / X-Ray', processingTime: 25, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'treatment': 1 } } },
      { id: 'treatment', type: 'processNode', position: { x: 2050, y: 350 }, data: { label: 'Treatment', processingTime: 15, resources: 5, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'discharge': 1 } } },
      { id: 'discharge', type: 'processNode', position: { x: 2050, y: 50 }, data: { label: 'Discharge Admin', processingTime: 5, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-home', type: 'endNode', position: { x: 2450, y: 200 }, data: { label: 'Sent Home', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'note1', type: 'annotationNode', position: { x: 450, y: 560 }, data: { label: '30% Critical Cases skip Waiting Room' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1650, y: 560 }, data: { label: 'Labs act as a major bottleneck' } },
    ],
    edges: [
      { id: 'e1', source: 'start-triage', target: 'wait', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'start-triage', target: 'critical', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'critical', target: 'doctor', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4', source: 'wait', target: 'nurse', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5', source: 'nurse', target: 'doctor', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'doctor', target: 'labs', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e7', source: 'doctor', target: 'discharge', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e8', source: 'labs', target: 'treatment', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e9', source: 'treatment', target: 'discharge', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e10', source: 'discharge', target: 'end-home', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'manufacturing': {
    nodes: [
      { id: 'start-raw', type: 'startNode', position: { x: 50, y: 150 }, data: { label: 'Raw Materials', processingTime: 1, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 10, batchSize: 5 } } },
      { id: 'cut', type: 'processNode', position: { x: 450, y: 150 }, data: { label: 'Cutting & Machining', processingTime: 8, resources: 3, quality: 0.98, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'weld', type: 'processNode', position: { x: 850, y: 150 }, data: { label: 'Welding', processingTime: 12, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'paint', type: 'processNode', position: { x: 1250, y: 150 }, data: { label: 'Painting', processingTime: 15, resources: 1, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dry', type: 'processNode', position: { x: 1650, y: 150 }, data: { label: 'Drying Oven', processingTime: 20, resources: 10, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'assembly', type: 'processNode', position: { x: 2050, y: 150 }, data: { label: 'Final Assembly', processingTime: 10, resources: 4, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'qc', type: 'processNode', position: { x: 2450, y: 150 }, data: { label: 'Quality Control', processingTime: 5, resources: 2, quality: 0.90, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'ship': 9, 'scrap': 1 } } },
      { id: 'ship', type: 'processNode', position: { x: 2850, y: 50 }, data: { label: 'Shipping', processingTime: 2, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-customer', type: 'endNode', position: { x: 3250, y: 150 }, data: { label: 'Customer', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'scrap', type: 'endNode', position: { x: 2850, y: 350 }, data: { label: 'Recycle Bin', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'note1', type: 'annotationNode', position: { x: 1250, y: 420 }, data: { label: 'Painting is a specific bottleneck' } },
    ],
    edges: [
      { id: 'e1', source: 'start-raw', target: 'cut', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'cut', target: 'weld', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'weld', target: 'paint', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4', source: 'paint', target: 'dry', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5', source: 'dry', target: 'assembly', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'assembly', target: 'qc', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e7', source: 'qc', target: 'ship', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e8', source: 'qc', target: 'scrap', type: 'processEdge', animated: false, style: { stroke: '#ef4444' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e9', source: 'ship', target: 'end-customer', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'housingRepairs': {
    capacityMode: 'sharedAllocation',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    resourcePools: [
      { id: DEFAULT_RESOURCE_POOL_ID, name: 'Customer Service Center', inputMode: 'fte', capacityValue: 3, avatarId: 'orbit', colorId: 'amber' },
      { id: 'maintenance-coordinators', name: 'Maintenance Coordinators', inputMode: 'fte', capacityValue: 2, avatarId: 'brain', colorId: 'lilac' },
      { id: 'direct-maintenance', name: 'Direct Maintenance', inputMode: 'fte', capacityValue: 6, avatarId: 'stack', colorId: 'mint' },
      { id: 'contractors', name: 'Contractors', inputMode: 'fte', capacityValue: 5, avatarId: 'bot', colorId: 'orange' },
    ],
    nodes: [
      { id: 'hr-start', type: 'startNode', position: { x: 60, y: 220 }, data: { label: 'Resident Repair Contact', processingTime: 4, resources: 3, resourcePoolId: DEFAULT_RESOURCE_POOL_ID, allocationPercent: 25, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 18, batchSize: 1 } } },
      { id: 'hr-triage', type: 'processNode', position: { x: 420, y: 220 }, data: { label: 'Triage & Raise Request', processingTime: 8, resources: 3, resourcePoolId: DEFAULT_RESOURCE_POOL_ID, allocationPercent: 50, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'hr-planning': 8, 'hr-make-safe': 2 } } },
      { id: 'hr-planning', type: 'processNode', position: { x: 840, y: 120 }, data: { label: 'Repair Planning', processingTime: 10, resources: 2, resourcePoolId: 'maintenance-coordinators', allocationPercent: 45, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'hr-internal-schedule': 5, 'hr-contractor-dispatch': 5 } } },
      { id: 'hr-make-safe', type: 'processNode', position: { x: 840, y: 360 }, data: { label: 'Emergency Make Safe', processingTime: 12, resources: 2, resourcePoolId: 'direct-maintenance', allocationPercent: 35, quality: 0.98, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-internal-schedule', type: 'processNode', position: { x: 1260, y: 60 }, data: { label: 'Schedule Internal Team', processingTime: 6, resources: 2, resourcePoolId: 'maintenance-coordinators', allocationPercent: 25, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-contractor-dispatch', type: 'processNode', position: { x: 1260, y: 240 }, data: { label: 'Dispatch Contractor', processingTime: 7, resources: 2, resourcePoolId: 'maintenance-coordinators', allocationPercent: 30, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-internal-visit', type: 'processNode', position: { x: 1680, y: 60 }, data: { label: 'Internal Repair Visit', processingTime: 18, resources: 3, resourcePoolId: 'direct-maintenance', allocationPercent: 65, quality: 0.97, variability: 0.15, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-contractor-visit', type: 'processNode', position: { x: 1680, y: 240 }, data: { label: 'Contractor Repair Visit', processingTime: 24, resources: 2, resourcePoolId: 'contractors', allocationPercent: 100, quality: 0.96, variability: 0.2, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-resident-confirm', type: 'processNode', position: { x: 2100, y: 160 }, data: { label: 'Resident Confirmation', processingTime: 5, resources: 2, resourcePoolId: DEFAULT_RESOURCE_POOL_ID, allocationPercent: 25, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'hr-end': 17, 'hr-planning': 3 } } },
      { id: 'hr-end', type: 'endNode', position: { x: 2520, y: 160 }, data: { label: 'Repair Closed', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'hr-note-1', type: 'annotationNode', position: { x: 830, y: 560 }, data: { label: 'Around 20% of contacts need an immediate make-safe action before normal planning.' } },
      { id: 'hr-note-2', type: 'annotationNode', position: { x: 1700, y: 500 }, data: { label: 'Resident confirmation sends a small share of jobs back for another planned visit.' } },
    ],
    edges: [
      { id: 'hr-e1', source: 'hr-start', target: 'hr-triage', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e2', source: 'hr-triage', target: 'hr-planning', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e3', source: 'hr-triage', target: 'hr-make-safe', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e4', source: 'hr-make-safe', target: 'hr-planning', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e5', source: 'hr-planning', target: 'hr-internal-schedule', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e6', source: 'hr-planning', target: 'hr-contractor-dispatch', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e7', source: 'hr-internal-schedule', target: 'hr-internal-visit', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e8', source: 'hr-contractor-dispatch', target: 'hr-contractor-visit', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e9', source: 'hr-internal-visit', target: 'hr-resident-confirm', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e10', source: 'hr-contractor-visit', target: 'hr-resident-confirm', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e11', source: 'hr-resident-confirm', target: 'hr-end', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'hr-e12', source: 'hr-resident-confirm', target: 'hr-planning', sourceHandle: 'top-source', targetHandle: 'top-target', type: 'processEdge', animated: false, style: { stroke: '#f59e0b' }, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'complaints': {
    nodes: [
      { id: 'comp-start', type: 'startNode', position: { x: 60, y: 180 }, data: { label: 'Resident Complaint Received', processingTime: 3, resources: 2, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 24, batchSize: 1 } } },
      { id: 'comp-log', type: 'processNode', position: { x: 420, y: 180 }, data: { label: 'Log & Acknowledge', processingTime: 5, resources: 2, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-triage', type: 'processNode', position: { x: 780, y: 180 }, data: { label: 'Triage & Assign', processingTime: 7, resources: 2, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-investigate', type: 'processNode', position: { x: 1140, y: 180 }, data: { label: 'Service Investigation', processingTime: 20, resources: 3, quality: 1.0, variability: 0.15, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-draft', type: 'processNode', position: { x: 1500, y: 180 }, data: { label: 'Draft Stage 1 Response', processingTime: 8, resources: 2, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-review', type: 'processNode', position: { x: 1860, y: 180 }, data: { label: 'Manager Review', processingTime: 6, resources: 1, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'comp-issue': 8, 'comp-investigate': 2 } } },
      { id: 'comp-issue', type: 'processNode', position: { x: 2220, y: 180 }, data: { label: 'Issue Stage 1 Response', processingTime: 3, resources: 1, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'comp-end': 3, 'comp-stage2': 1 } } },
      { id: 'comp-stage2', type: 'processNode', position: { x: 2220, y: 420 }, data: { label: 'Stage 2 Review', processingTime: 15, resources: 2, quality: 1.0, variability: 0.15, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-final', type: 'processNode', position: { x: 2580, y: 420 }, data: { label: 'Final Response', processingTime: 4, resources: 1, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-end', type: 'endNode', position: { x: 2940, y: 240 }, data: { label: 'Complaint Closed', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'comp-note-1', type: 'annotationNode', position: { x: 1870, y: 500 }, data: { label: 'Some cases go back for more evidence before the Stage 1 response is approved.' } },
      { id: 'comp-note-2', type: 'annotationNode', position: { x: 2440, y: 580 }, data: { label: 'About a quarter of Stage 1 responses escalate into a Stage 2 review.' } },
    ],
    edges: [
      { id: 'comp-e1', source: 'comp-start', target: 'comp-log', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e2', source: 'comp-log', target: 'comp-triage', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e3', source: 'comp-triage', target: 'comp-investigate', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e4', source: 'comp-investigate', target: 'comp-draft', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e5', source: 'comp-draft', target: 'comp-review', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e6', source: 'comp-review', target: 'comp-issue', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e7', source: 'comp-review', target: 'comp-investigate', sourceHandle: 'top-source', targetHandle: 'top-target', type: 'processEdge', animated: false, style: { stroke: '#f59e0b' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e8', source: 'comp-issue', target: 'comp-end', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e9', source: 'comp-issue', target: 'comp-stage2', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e10', source: 'comp-stage2', target: 'comp-final', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'comp-e11', source: 'comp-final', target: 'comp-end', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  }
};

export const SCENARIO_NAMES: Record<string, string> = {
  empty: 'Untitled Canvas',
  coffee: 'Coffee Service',
  devops: 'DevOps Pipeline',
  hospital: 'Hospital ER Triage',
  manufacturing: 'Manufacturing Line',
  housingRepairs: 'Housing Repairs Process',
  complaints: 'Complaints Handling Process',
};
