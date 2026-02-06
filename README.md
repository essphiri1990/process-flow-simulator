# Process Flow Simulator

A visual, interactive process flow simulation tool for modeling business processes, identifying bottlenecks, and analyzing efficiency metrics using Value Stream Mapping (VSM) principles.

![Process Flow Simulator](https://img.shields.io/badge/React-19.x-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Drag-and-drop canvas** - Build process flows visually with ReactFlow
- **Discrete-event simulation** - Run tick-based simulations with configurable speed
- **Demand-driven mode** - Specify exact demand per hour/day/week/month (working hours, per-node schedules)
- **Real-time VSM metrics** - Lead time, value-added time, process cycle efficiency (PCE), throughput
- **Bottleneck detection** - Visual indicators for queue buildup and capacity issues
- **Weighted routing** - Configure probability-based routing between nodes
- **Pre-built scenarios** - DevOps pipeline, Hospital ER, Manufacturing line templates
- **Import/Export** - Save and load flows as JSON

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| ReactFlow | Node-based canvas |
| Zustand | State management |
| Recharts | Analytics charts |
| Tailwind CSS | Styling |
| Vite | Build tool |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/process-flow-simulator.git
cd process-flow-simulator

# Install dependencies (use --legacy-peer-deps for React 19)
npm install --legacy-peer-deps

# Start development server
npm run dev
```

The app will be available at http://localhost:3000

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Add nodes** - Use the toolbar to add Start, Process, End, or Annotation nodes
2. **Connect nodes** - Drag from handles to create edges between nodes
3. **Configure** - Click nodes to edit processing time, capacity, and quality settings
4. **Simulate** - Toggle auto-injection and press Play to run the simulation
5. **Analyze** - Monitor VSM metrics and identify bottlenecks

## Node Types

| Type | Description |
|------|-------------|
| Start | Entry point - generates items at configurable intervals |
| Process | Processing station - has capacity, processing time, and quality rate |
| End | Terminal sink - collects completed items |
| Annotation | Text notes for documentation |

## VSM Metrics

- **Lead Time** - Total time items spend in the system
- **Value Added Time (VAT)** - Time spent actively processing
- **Non-Value Added Time (NVAT)** - Queue wait time (transit is visual-only)
- **Process Cycle Efficiency (PCE)** - VAT / Lead Time (higher is better)
- **Throughput** - Items completed per completion window (default 50)
- **WIP** - Work in progress (items currently in system)

## Project Structure

```
process-flow-simulator/
├── App.tsx              # Main component with ReactFlow canvas
├── store.ts             # Zustand store with simulation engine
├── types.ts             # TypeScript interfaces
├── components/
│   ├── ProcessNode.tsx  # Process station nodes
│   ├── StartNode.tsx    # Entry point nodes
│   ├── EndNode.tsx      # Terminal nodes
│   ├── ProcessEdge.tsx  # Animated edges with routing
│   ├── Controls.tsx     # Playback controls
│   ├── ConfigPanel.tsx  # Node configuration
│   ├── VSMStats.tsx     # Real-time metrics
│   └── AnalyticsDashboard.tsx
└── CLAUDE.md            # Detailed project documentation
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
