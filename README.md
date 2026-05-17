# 🌌 Project Genesis — Universal Emergence Simulation

> From quantum cellular automata to sentient multi-agent civilizations with meta-cognition and cultural memory.

## Overview

Project Genesis is a **bottom-up** universal simulation running entirely in the browser via GitHub Pages. It generates planetary ecosystems with sentient civilizations that develop languages, religions, economic systems, and philosophical thought — all emerging from simple physical rules.

## Architecture: 7 Layers + 6 Subsystems

| Layer | Name | Technology |
|-------|------|------------|
| **Level 0** | Meta-Simulation | Universal Event Bus, Observer Pattern, Ethical Protocol |
| **Level 1** | Physical Substrate | WebGL2 GPGPU Shaders, Gray-Scott Reaction-Diffusion |
| **Level 2** | Biological Dynamics | NEAT Neuroevolution, Genetic Algorithms |
| **Level 2.5** | Ecology | Lotka-Volterra, Trophic Networks |
| **Level 3** | Macro-Ecosystem | Simplex Noise, Climate System, LOD Manager |
| **Level 4** | Cognition & Civilization | Agent Minds, Memory Streams, Language Evolution |
| **Level 5** | Meta-Cognition | Self-Reflection, Theory of Mind, Philosophy |

### Cross-cutting Subsystems
- 🌦️ Seasonal Climate System
- 🗣️ Phonetic Language Evolution
- 💰 Supply Chain Economy
- 🦠 SIR Epidemiology (diseases & memes)
- 🧬 Universal Phylogenetic Registry
- ⚖️ Emergent Governance System

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/genesis/` in your browser.

## Build & Deploy

This project uses **Vite** and requires a build step before it can be served on GitHub Pages. You cannot just serve the raw source code.

### Local Development
```bash
npm install
npm run dev
```
Then open `http://localhost:5173/genesis/` in your browser.

### Fixing GitHub Pages Deployment
Currently, if you see a broken page with unstyled text at `https://marcorzzn.github.io/genesis/`, it means GitHub is serving the raw, uncompiled source code instead of the compiled `dist/` folder.

To fix this and enable the automatic deployment pipeline we set up:
1. Go to your repository on GitHub.
2. Click on the ⚙️ **Settings** tab.
3. In the left sidebar, click on **Pages**.
4. Under **Build and deployment**, locate the **Source** dropdown.
5. Change it from *Deploy from a branch* to **GitHub Actions**.

Once you make this change, GitHub will automatically trigger the custom `Deploy to GitHub Pages` action we created, which will build the project using Vite and deploy the highly optimized `dist/` folder.

## Features

- **WebGL2 GPGPU** substrate with 3 modes: Game of Life, Reaction-Diffusion, GPU Particles
- **NEAT Neuroevolution** for entity brains with evolvable topology
- **Adaptive throttling**: auto-reduces quality when FPS drops below 30
- **Procedural world generation** with 12 biome types and seasonal climate
- **Agent cognitive architecture**: Maslow needs, emotional state, memory stream
- **Emergent religions, economies, and languages** from agent interactions
- **Bilingual UI** (Italian/English) with real-time switching
- **Ethical shutdown protocol** requiring philosophical confrontation
- **Full state persistence** to IndexedDB with snapshot support

## Tech Stack

- **Vite** — Build system
- **WebGL2** — GPU computation
- **D3.js** — Phylogenetic tree visualization
- **Chart.js** — Real-time telemetry charts
- **simplex-noise** — Procedural terrain
- **IndexedDB** — State persistence

## License

MIT
