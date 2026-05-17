/**
 * @module Main
 * @description Entry point for Project Genesis — orchestrates all 7 layers.
 */

import './styles/main.css';
import { initI18n, t, setLocale, onLocaleChange } from './i18n/index.js';
import eventBus from './core/meta/event_bus.js';
import observerManager from './core/meta/observer_manager.js';
import ethicalProtocol from './core/meta/ethical_protocol.js';
import { SubstrateEngine, SubstrateMode } from './core/substrate/cellular_automata.js';
import { GeneticEngine } from './core/biology/genetic_engine.js';
import { PhylogenyTracker } from './core/biology/phylogeny_tracker.js';
import { TrophicNetwork } from './core/ecology/trophic_network.js';
import { NicheDynamics } from './core/ecology/niche_dynamics.js';
import { WorldGenerator } from './core/macro/world_generator.js';
import { ClimateSystem } from './core/macro/climate_system.js';
import { ResourceFlow } from './core/macro/resource_flow.js';
import { LODManager } from './core/macro/lod_manager.js';
import { LanguageEvolution } from './core/cognition/language_evolution.js';
import { EconomicEngine } from './core/cognition/economic_engine.js';
import { BeliefSystem } from './core/cognition/belief_system.js';
import { SocialStructure } from './core/cognition/social_structure.js';
import { SelfReflection } from './core/metacognition/self_reflection.js';
import { TheoryOfMind } from './core/metacognition/theory_of_mind.js';
import { PhilosophicalGenerator } from './core/metacognition/philosophical_generator.js';
import { Epidemic } from './subsystems/epidemiology/sir_model.js';
import { SupplyChain } from './subsystems/supply_chain/supply_chain.js';
import { GovernanceSystem } from './subsystems/governance/governance_system.js';
import persistence from './utils/persistence.js';

// ===== State =====
let running = false, simSpeed = 1.0, tick = 0;
let lastFrameTime = 0, frameCount = 0, fps = 60, fpsAccum = 0;

// ===== Layer Instances =====
let substrate, genetics, phylogeny, trophicNet, nicheDyn;
let worldGen, climate, resources, lod;
let langEvolution, economy, beliefs, social;
let selfReflect, tom, philGen;
let supplyChain, governance;
let populationChart, diversityChart, professionsChart;

// ===== Init =====
async function init() {
  initI18n();
  await persistence.init();

  worldGen = new WorldGenerator({ width: 256, height: 256, seed: 42 });
  worldGen.generate();
  climate = new ClimateSystem(worldGen, { seed: 123 });
  resources = new ResourceFlow(worldGen);
  resources.init();
  lod = new LODManager();

  const substrateCanvas = document.getElementById('substrate-canvas');
  substrate = new SubstrateEngine(substrateCanvas, { width: 1024, height: 1024 });
  substrate.init();

  genetics = new GeneticEngine({ populationCap: 5000, seed: 42 });
  genetics.initPopulation(200, worldGen.width, worldGen.height);
  phylogeny = new PhylogenyTracker();
  trophicNet = new TrophicNetwork();
  nicheDyn = new NicheDynamics(trophicNet);

  langEvolution = new LanguageEvolution(42);
  langEvolution.createLanguage(128, 128);
  economy = new EconomicEngine();
  economy.createMarket('central');
  beliefs = new BeliefSystem();
  social = new SocialStructure();

  selfReflect = new SelfReflection();
  tom = new TheoryOfMind();
  philGen = new PhilosophicalGenerator();
  supplyChain = new SupplyChain();
  governance = new GovernanceSystem();

  renderWorldMap();
  setupUI();
  setupCharts();
  persistence.startAutoSave(() => serializeAll(), 5 * 60 * 1000);
  addChronicle('system', 'Universe initialized — all 7 layers operational');
}

// ===== Simulation Loop =====
function simulationLoop(timestamp) {
  if (!running) { requestAnimationFrame(simulationLoop); return; }
  const dt = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  fpsAccum += dt; frameCount++;
  if (fpsAccum >= 1000) {
    fps = Math.round(frameCount * 1000 / fpsAccum);
    document.getElementById('fps-value').textContent = fps;
    lod.reportFPS(fps);
    fpsAccum = 0; frameCount = 0;
  }

  const steps = Math.ceil(simSpeed);
  for (let s = 0; s < steps; s++) {
    tick++;
    eventBus.setSimulationTime(tick);
    if (lod.shouldUpdate('substrate', tick) && substrate?.initialized) substrate.step();
    if (lod.shouldUpdate('ecology', tick)) { climate.tick(); resources.tick(); }
    if (lod.shouldUpdate('biology', tick)) {
      genetics.tick((entity) => {
        const rx = resources.getResourceAt(entity.x, entity.y);
        if (rx > 0.3) genetics.feedEntity(entity.id, rx * 5);
        const seasonIdx = ['spring','summer','autumn','winter'].indexOf(climate.getCurrentSeason());
        return [rx,rx,rx,rx,rx,rx, 10, entity.energy/100, Math.cos(entity.angle), entity.age/entity.maxAge, seasonIdx/3, 0];
      });
    }
    if (lod.shouldUpdate('ecology', tick)) trophicNet.update(0.2);
    if (lod.shouldUpdate('cognition', tick)) { langEvolution.tick(); economy.updatePrices(); beliefs.tick(genetics.entities.size); }
    eventBus.flush();
  }

  if (substrate?.initialized) substrate.render();
  renderEntities();
  if (tick % 30 === 0) updateTelemetry();
  document.getElementById('tick-value').textContent = tick;
  document.getElementById('entities-value').textContent = genetics.entities.size;
  document.getElementById('species-value').textContent = genetics.species.size;
  const seasonEmoji = { spring:'🌱', summer:'☀️', autumn:'🍂', winter:'❄️' };
  const season = climate.getCurrentSeason();
  document.getElementById('season-display').textContent = `${seasonEmoji[season]??'🌍'} ${season.charAt(0).toUpperCase()+season.slice(1)}`;
  requestAnimationFrame(simulationLoop);
}

function renderEntities() {
  const canvas = document.getElementById('entity-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / worldGen.width, sy = canvas.height / worldGen.height;
  for (const e of genetics.entities.values()) {
    if (!e.alive) continue;
    ctx.fillStyle = `rgba(${Math.floor(e.color[0]*255)},${Math.floor(e.color[1]*255)},${Math.floor(e.color[2]*255)},0.8)`;
    ctx.beginPath(); ctx.arc(e.x*sx, e.y*sy, Math.max(1,e.size*0.5), 0, Math.PI*2); ctx.fill();
  }
}

function renderWorldMap() {
  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
  const imgData = worldGen.getImageData();
  const tmp = document.createElement('canvas');
  tmp.width = worldGen.width; tmp.height = worldGen.height;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

// ===== Charts =====
async function setupCharts() {
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);
  const opts = { responsive:true, maintainAspectRatio:false, animation:{duration:0}, plugins:{legend:{display:false}},
    scales: { x:{display:false}, y:{ticks:{color:'#64748b',font:{size:10}}, grid:{color:'rgba(30,41,59,0.5)'}} } };
  populationChart = new Chart(document.getElementById('chart-population'), {
    type:'line', data:{labels:[],datasets:[{data:[],borderColor:'#22d3ee',borderWidth:1.5,fill:true,backgroundColor:'rgba(34,211,238,0.1)',pointRadius:0,tension:0.3}]}, options:opts });
  diversityChart = new Chart(document.getElementById('chart-diversity'), {
    type:'line', data:{labels:[],datasets:[{data:[],borderColor:'#a78bfa',borderWidth:1.5,fill:true,backgroundColor:'rgba(167,139,250,0.1)',pointRadius:0,tension:0.3}]}, options:opts });
}

function updateTelemetry() {
  const stats = genetics.getPopulationStats();
  if (populationChart) {
    const d = populationChart.data; d.labels.push(tick); d.datasets[0].data.push(stats.alive);
    if (d.labels.length > 200) { d.labels.shift(); d.datasets[0].data.shift(); } populationChart.update();
  }
  if (diversityChart) {
    const d = diversityChart.data; d.labels.push(tick);
    const sizes = [...genetics.species.values()].map(s => s.length);
    const total = sizes.reduce((a,b)=>a+b,0); let h=0;
    for (const s of sizes) { if (s>0&&total>0) { const p=s/total; h-=p*Math.log2(p); } }
    d.datasets[0].data.push(h.toFixed(2));
    if (d.labels.length>200) { d.labels.shift(); d.datasets[0].data.shift(); } diversityChart.update();
  }
  document.getElementById('stat-phil-q').textContent = philGen.questions.length;
}

// ===== Chronicles =====
function addChronicle(type, message) {
  const log = document.getElementById('chronicles-log');
  const entry = document.createElement('div');
  entry.className = 'chronicle-entry'; entry.dataset.type = type;
  entry.innerHTML = `<div class="time">T=${tick}</div><div class="event">${message}</div>`;
  log.prepend(entry);
  if (log.children.length > 100) log.removeChild(log.lastChild);
}

// ===== UI Setup =====
function setupUI() {
  document.getElementById('btn-play').addEventListener('click', () => { running = true; });
  document.getElementById('btn-pause').addEventListener('click', () => { running = false; });
  document.getElementById('btn-reset').addEventListener('click', () => {
    running = false; tick = 0;
    genetics = new GeneticEngine({ populationCap: 5000, seed: Math.random()*10000 });
    genetics.initPopulation(200, worldGen.width, worldGen.height);
    if (substrate?.initialized) substrate.resetToSeed(Math.random()*10000);
    worldGen.generate(); renderWorldMap();
    addChronicle('system', 'Universe reset — new Big Bang initiated');
  });

  const bindSlider = (id, valueId, cb) => {
    const s = document.getElementById(id), d = document.getElementById(valueId);
    s.addEventListener('input', () => { const v = parseFloat(s.value); d.textContent = v.toFixed(3); cb(v); });
  };
  bindSlider('slider-speed','speed-value', v => { simSpeed=v; document.getElementById('speed-value').textContent=v.toFixed(1)+'x'; });
  bindSlider('slider-feed','feed-value', v => substrate?.setUniforms({feedRate:v}));
  bindSlider('slider-kill','kill-value', v => substrate?.setUniforms({killRate:v}));
  bindSlider('slider-mutation','mutation-value', v => { if(genetics) genetics.mutationRates.weight=v; });

  document.getElementById('substrate-mode').addEventListener('change', e => { substrate?.setMode(parseInt(e.target.value)); });
  document.getElementById('btn-inject').addEventListener('click', () => {
    observerManager.injectEnergy(worldGen.width/2, worldGen.height/2, 500, 20);
    addChronicle('divine', '⚡ Divine energy injection at world center');
  });
  document.getElementById('btn-spawn').addEventListener('click', () => {
    observerManager.spawnEntity({}, worldGen.width/2, worldGen.height/2);
    addChronicle('divine', '🧬 Divine entity spawned at world center');
  });
  document.getElementById('btn-save').addEventListener('click', async () => {
    await persistence.saveState(serializeAll());
    addChronicle('system', '💾 State saved');
  });
  document.getElementById('btn-load').addEventListener('click', async () => {
    const state = await persistence.loadState();
    if (state) { deserializeAll(state); addChronicle('system', '📂 State loaded'); }
  });
  document.getElementById('language-select').addEventListener('change', e => setLocale(e.target.value));
  onLocaleChange(() => {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  });

  // Ethical protocol
  ethicalProtocol.onEthicalConfrontation(report => {
    const body = document.getElementById('ethical-modal-body');
    body.innerHTML = `<p><strong>${t('ethical.warning')}</strong></p>
      <ul><li>${t('ethical.sentient_count')}: <strong>${report.sentientAgentCount}</strong></li>
      <li>${t('ethical.avg_reflection')}: <strong>${report.avgReflectionDepth.toFixed(2)}</strong></li></ul>
      <p>${t('ethical.consequences')}</p>
      <ul>${report.consequences.map(c=>`<li>${c}</li>`).join('')}</ul>`;
    document.getElementById('ethical-modal').hidden = false;
  });
  document.getElementById('btn-ethical-cancel').addEventListener('click', () => {
    ethicalProtocol.cancelTermination(); document.getElementById('ethical-modal').hidden = true;
  });
  document.getElementById('btn-ethical-confirm').addEventListener('click', () => {
    if (ethicalProtocol.confirmTermination(document.getElementById('ethical-confirm-input').value)) {
      running = false; document.getElementById('ethical-modal').hidden = true;
      addChronicle('divine', '🌑 Universe terminated by divine observer');
    }
  });

  // Chronicle filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      document.querySelectorAll('.chronicle-entry').forEach(e => { e.style.display = (f==='all'||e.dataset.type===f)?'':'none'; });
    });
  });

  // Event bus → chronicles
  eventBus.subscribe('ecology.extinction', e => addChronicle('extinction', `🦴 Species ${e.payload.speciesId} extinct`), {layer:0,priority:5});
  eventBus.subscribe('climate.extreme_event', e => addChronicle('disaster', `🌋 ${e.payload.type} (${e.payload.severity.toFixed(2)})`), {layer:0,priority:5});
  eventBus.subscribe('economy.profession_discovered', e => addChronicle('discovery', `🔨 ${e.payload.profession}`), {layer:0,priority:5});
  eventBus.subscribe('beliefs.created', e => addChronicle('foundation', `⛪ ${e.payload.content.substring(0,50)}`), {layer:0,priority:5});
  eventBus.subscribe('metacognition.philosophical_question', e => addChronicle('discovery', `🧠 "${e.payload.question}"`), {layer:0,priority:5});

  window.addEventListener('resize', renderWorldMap);
}

// ===== Serialization =====
function serializeAll() {
  return { tick, eventBus:eventBus.serialize(), substrate:substrate?.serialize(), genetics:genetics?.serialize(),
    phylogeny:phylogeny?.serialize(), worldGen:worldGen?.serialize(), climate:climate?.serialize(),
    lod:lod?.serialize(), langEvolution:langEvolution?.serialize(), economy:economy?.serialize(),
    beliefs:beliefs?.serialize(), social:social?.serialize(), selfReflect:selfReflect?.serialize(),
    tom:tom?.serialize(), philGen:philGen?.serialize(), governance:governance?.serialize() };
}

function deserializeAll(state) {
  if (!state) return;
  tick = state.tick ?? 0;
  eventBus.deserialize(state.eventBus);
  genetics?.deserialize(state.genetics); phylogeny?.deserialize(state.phylogeny);
  worldGen?.deserialize(state.worldGen); climate?.deserialize(state.climate);
  lod?.deserialize(state.lod); langEvolution?.deserialize(state.langEvolution);
  economy?.deserialize(state.economy); beliefs?.deserialize(state.beliefs);
  social?.deserialize(state.social); selfReflect?.deserialize(state.selfReflect);
  tom?.deserialize(state.tom); philGen?.deserialize(state.philGen);
  governance?.deserialize(state.governance); renderWorldMap();
}

// ===== Boot =====
init().then(() => { lastFrameTime = performance.now(); requestAnimationFrame(simulationLoop); })
  .catch(err => console.error('[Genesis] Init failed:', err));
