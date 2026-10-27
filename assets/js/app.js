// ==============================================================================
// PW-ADAPT: Interactive Virtual Prototype Rig & Telemetry Controller
// Supports Dual Operating Modes:
//   1. Demo Mode (Local scenario-driven simulation)
//   2. Proteus Hardware Mode (Live serial telemetry via FastAPI backend)
// ==============================================================================

const NS = "http://www.w3.org/2000/svg";

// Component Database & Metadata
const RIG_COMPONENTS = {
  raw: {
    id: "TK-01-RAW",
    name: "Raw Produced Water Tank",
    icon: "◉",
    purpose: "Receives and buffers untreated produced-water feed from the upstream separator.",
    role: "Provides side-stream feed storage, hydraulic head, and initial baseline water quality assessment.",
    io: "Inlet: Wellhead produced-water line · Outlet: Feed pump suction port via Valve V1.",
    safety: "Dual float switches prevent dry running (trips pump if level < 10%) and overflow (> 95%).",
    getReadings: (t) => [
      { label: "TANK LEVEL", val: `${t.raw_tank_level.toFixed(1)} %` },
      { label: "FEED OIL", val: `${t.oil_mg_l.toFixed(0)} mg/L` },
      { label: "TURBIDITY", val: `${t.turbidity_ntu.toFixed(0)} NTU` },
      { label: "SALINITY / EC", val: `${t.ec_ms_cm.toFixed(1)} mS/cm` },
      { label: "TEMP", val: `${t.temperature_c.toFixed(1)} °C` }
    ]
  },
  v1: {
    id: "VALVE-V1",
    name: "Feed Isolation Valve V1",
    icon: "⊗",
    purpose: "Normally-closed solenoid valve isolating raw water storage.",
    role: "Automated route gate preventing accidental leakage during standby or safe state.",
    io: "Inlet: Raw tank discharge nozzle · Outlet: Feed pump intake line.",
    safety: "Fails closed (NC de-energized) on emergency stop, power cut, or overpressure trip.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[0] ? "OPEN (ENERGIZED)" : "CLOSED (NC)" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 9 (PB1)" },
      { label: "RATED VOLTAGE", val: "12 VDC / Pilot Type" }
    ]
  },
  pump: {
    id: "PUMP-01",
    name: "Diaphragm Feed Pump",
    icon: "⟳",
    purpose: "Positive-displacement feed pump delivering 1.8 L/min nominal flow to treatment units.",
    role: "Primary fluid mover driving produced water through the sensor cell and flotation vessel.",
    io: "Suction: Valve V1 header · Discharge: Valve V2, pressure sensor, and inlet cell.",
    safety: "Overpressure interlock cuts power if line pressure exceeds 280 kPa. Dry-run cutoff at raw level < 10%.",
    getReadings: (t) => [
      { label: "PUMP MOTOR", val: t.pump_on ? "RUNNING (12V ACTIVE)" : "STOPPED (RELAY OFF)" },
      { label: "FLOW RATE", val: `${t.flow_l_min.toFixed(2)} L/min` },
      { label: "LINE PRESSURE", val: `${t.pressure_kpa.toFixed(0)} kPa (${(t.pressure_kpa/100).toFixed(2)} bar)` },
      { label: "RELAY OUTPUT", val: "MCU Digital Pin 8 (PB0)" }
    ]
  },
  v2: {
    id: "VALVE-V2",
    name: "Pump Discharge Valve V2",
    icon: "⊗",
    purpose: "Normally-closed discharge isolation valve.",
    role: "Isolates the feed pump from downstream system pressure when halted.",
    io: "Inlet: Pump discharge port · Outlet: Sensor manifold & Valve V3.",
    safety: "Fails closed immediately upon MCU interlock trip.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[1] ? "OPEN (ENERGIZED)" : "CLOSED (NC)" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 10 (PB2)" }
    ]
  },
  sensor_inlet: {
    id: "SENSOR-CELL-01",
    name: "Inlet Multi-Sensor Cell",
    icon: "⌁",
    purpose: "Real-time electrochemical and optical sensing of feed quality.",
    role: "Transmits live pH, conductivity/TDS, turbidity, oil proxy, and pressure telemetry to the MCU ADC.",
    io: "Hydraulic: Inline pressurized flow. Electric: 6x 0–5V analog voltage outputs to MCU.",
    safety: "Continuous boundary checking; triggers overpressure alarm if reading exceeds 280 kPa.",
    getReadings: (t) => [
      { label: "MEASURED pH", val: t.ph.toFixed(2) },
      { label: "EC CONDUCTIVITY", val: `${t.ec_ms_cm.toFixed(1)} mS/cm` },
      { label: "ESTIMATED TDS", val: `${t.tds_mg_l.toLocaleString()} mg/L` },
      { label: "TURBIDITY", val: `${t.turbidity_ntu.toFixed(1)} NTU` },
      { label: "OIL PROXY", val: `${t.oil_mg_l.toFixed(1)} mg/L` },
      { label: "TEMPERATURE", val: `${t.temperature_c.toFixed(1)} °C` }
    ]
  },
  v3: {
    id: "VALVE-V3",
    name: "Flotation Intake Valve V3",
    icon: "⊗",
    purpose: "Directs pressurized feed into the flotation stage.",
    role: "Route selection solenoid admitting water to the aeration / micro-bubble chamber.",
    io: "Inlet: Sensor cell manifold · Outlet: Flotation bottom diffuser nozzle.",
    safety: "Fails closed on safety trip.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[2] ? "OPEN (STAGE ENGAGED)" : "CLOSED (ISOLATED)" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 11 (PB3)" }
    ]
  },
  float: {
    id: "TK-02-FLOAT",
    name: "Micro-Bubble Flotation Chamber",
    icon: "◌",
    purpose: "Separates suspended oil droplets and light particulates via dissolved micro-bubble flotation.",
    role: "Primary treatment stage targeting free and dispersed hydrocarbons; scum layer floats to top skimmer.",
    io: "Inlet: Aerated produced water · Top Outlet: Oily scum reject · Bottom Outlet: Clarified water to V5.",
    safety: "Equipped with mechanical air-bleed relief valve and liquid boundary interlocks.",
    getReadings: (t) => [
      { label: "STAGE STATUS", val: (t.pump_on && t.valves[2]) ? "ACTIVE SEPARATION" : "IDLE / DRAINING" },
      { label: "INPUT OIL", val: `${t.oil_mg_l.toFixed(0)} mg/L` },
      { label: "OUTPUT OIL", val: (t.pump_on && t.valves[2]) ? `${(t.oil_mg_l * 0.12).toFixed(1)} mg/L` : `${t.oil_mg_l.toFixed(0)} mg/L` },
      { label: "REMOVAL RATIO", val: (t.pump_on && t.valves[2]) ? "88–92 %" : "0 %" },
      { label: "BUBBLE DIFFUSER", val: (t.pump_on && t.valves[2]) ? "SPARGING (180 kPa)" : "OFF" }
    ]
  },
  v4: {
    id: "VALVE-V4",
    name: "Recycle & Bypass Valve V4",
    icon: "⊗",
    purpose: "Allows fluid recirculation or bypassing the flotation unit during maintenance/cleaning.",
    role: "Secondary routing for flush cycles or high-pressure bypass protection.",
    io: "Inlet: Pump discharge manifold · Outlet: Return recycle line.",
    safety: "Normally closed during standard flotation run.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[3] ? "OPEN (BYPASS ACTIVE)" : "CLOSED (NORMAL ROUTE)" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 12 (PB4)" }
    ]
  },
  v5: {
    id: "VALVE-V5",
    name: "Clarified Water Transfer Valve V5",
    icon: "⊗",
    purpose: "Controls discharge of de-oiled effluent from the flotation underflow.",
    role: "Prevents oil scum ingress into downstream storage by transferring bottom clarified fluid.",
    io: "Inlet: Flotation underflow outlet · Outlet: Outlet Sensor Cell and Valve V6.",
    safety: "Fails closed on safety trip.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[4] ? "OPEN (TRANSFERRING)" : "CLOSED (HOLDING)" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 13 (PB5)" }
    ]
  },
  sensor_outlet: {
    id: "SENSOR-CELL-02",
    name: "Outlet Verification Cell",
    icon: "⌁",
    purpose: "Confirms post-treatment water quality compliance.",
    role: "Measures effluent turbidity, residual oil proxy, and line flow rate before storage admission.",
    io: "Hydraulic: Inline between flotation and treated tank. Electric: Flow pulses and turbidity to MCU.",
    safety: "Verifies water quality metrics before authorising downstream storage.",
    getReadings: (t) => [
      { label: "EFFLUENT TURBIDITY", val: (t.pump_on && t.valves[4]) ? `${(t.turbidity_ntu * 0.1).toFixed(1)} NTU` : `${t.turbidity_ntu.toFixed(1)} NTU` },
      { label: "EFFLUENT OIL", val: (t.pump_on && t.valves[4]) ? `${(t.oil_mg_l * 0.12).toFixed(1)} mg/L` : `${t.oil_mg_l.toFixed(1)} mg/L` },
      { label: "MEASURED FLOW", val: `${t.flow_l_min.toFixed(2)} L/min` }
    ]
  },
  v6: {
    id: "VALVE-V6",
    name: "Treated Tank Intake Valve V6",
    icon: "⊗",
    purpose: "Normally-closed solenoid valve admitting compliant water into the storage vessel.",
    role: "Final gate valve safeguarding treated water reservoir against non-compliant water.",
    io: "Inlet: Transfer line · Outlet: Treated water tank top sparger.",
    safety: "Fails closed on safety trip.",
    getReadings: (t) => [
      { label: "VALVE STATE", val: t.valves[5] ? "OPEN (RECEIVING)" : "CLOSED" },
      { label: "CONTROL PIN", val: "MCU Digital Pin 7 (PD7)" }
    ]
  },
  treated: {
    id: "TK-03-TREATED",
    name: "Treated Water Storage Tank",
    icon: "◉",
    purpose: "Collects and stores treated, de-oiled effluent for sampling, reuse, or approved disposal.",
    role: "Clean water buffer providing volume for testing compliance against reuse standards (e.g. reinjection/irrigation).",
    io: "Inlet: Transfer line via Valve V6 · Outlet: Sampling tap and effluent discharge header.",
    safety: "High-level float switch trips feed pump if level reaches 95% to prevent tank overflow.",
    getReadings: (t) => [
      { label: "TREATED LEVEL", val: `${t.treated_tank_level.toFixed(1)} %` },
      { label: "TREATED OIL", val: (t.pump_on && t.valves[5]) ? `${(t.oil_mg_l * 0.12).toFixed(1)} mg/L` : "< 15 mg/L (target)" },
      { label: "TREATED TURBIDITY", val: (t.pump_on && t.valves[5]) ? `${(t.turbidity_ntu * 0.1).toFixed(1)} NTU` : "< 10 NTU (target)" },
      { label: "TARGET COMPLIANCE", val: "RE-INJECTION GRADE" }
    ]
  },
  estop: {
    id: "SAFETY-ESTOP",
    name: "Emergency Stop Pushbutton",
    icon: "🛑",
    purpose: "Instant hardware emergency shutdown.",
    role: "Triggers microcontroller hardware interrupt (INT0) to immediately de-energize all pumps and valves within 20 ms.",
    io: "Normally-Closed active-LOW contact wired directly to MCU Pin 2.",
    safety: "Hardware master interlock. Latches system into SAFE state until manual operator reset.",
    getReadings: (t) => [
      { label: "E-STOP LATCH", val: t.state === "ESTOP" ? "TRIPPED (ACTIVE)" : "NORMAL / ARMED" },
      { label: "HARDWARE INT", val: "MCU Pin 2 (INT0 / FALLING EDGE)" },
      { label: "RESPONSE TIME", val: "< 20 milliseconds" }
    ]
  },
  control: {
    id: "CTRL-ENCLOSURE",
    name: "PW-ADAPT Control Enclosure",
    icon: "▣",
    purpose: "Houses the MCU, relay drivers, ADC signal conditioning, and telemetry processing module.",
    role: "Executes local safety interlocks, reads sensors, drives pump/valves, and streams telemetry.",
    io: "Power: 12V / 5V DC · Signals: 6x ADC inputs, 7x relay outputs, 3x digital inputs, serial link.",
    safety: "Autonomous local safety watchdog. Shuts down rig if communication is lost for > 3.0s.",
    getReadings: (t) => [
      { label: "SYSTEM STATE", val: t.state },
      { label: "FIRMWARE", val: t.firmware_version },
      { label: "COMMUNICATION", val: t.is_connected ? "ONLINE (SIMULATED TELEMETRY)" : "STANDALONE" },
      { label: "WATCHDOG", val: "ACTIVE (4000 ms TIMEOUT)" }
    ]
  }
};

// Global System Telemetry State
const telemetry = {
  ph: 7.3,
  ec_ms_cm: 85.0,
  tds_mg_l: 60000,
  turbidity_ntu: 82.0,
  oil_mg_l: 120.0,
  temperature_c: 31.5,
  pressure_kpa: 180.0,
  flow_l_min: 0.0,
  raw_tank_level: 80.0,
  treated_tank_level: 20.0,
  pump_on: false,
  valves: [false, false, false, false, false, false],
  state: "IDLE",
  firmware_version: "pw-adapt-sim-v1",
  is_connected: true
};

let currentMode = "demo"; // "demo" or "hardware"
let hardwarePollInterval = null;
let selectedComponentId = "raw";

function el(tag, attrs = {}, txt) {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (txt !== undefined) n.textContent = txt;
  return n;
}

// ==============================================================================
// 3-TANK STANDALONE PROTOTYPE RIG SVG BUILDER
// ==============================================================================
function renderStandaloneRig(host) {
  const svg = el("svg", {
    viewBox: "0 0 1100 480",
    role: "img",
    "aria-label": "PW-ADAPT 3-Tank Virtual Prototype Rig",
    class: "rig-svg-element"
  });

  const defs = el("defs");

  // Gradients
  const steelGrad = el("linearGradient", { id: "steel-grad", x1: "0", y1: "0", x2: "1", y2: "1" });
  steelGrad.append(el("stop", { offset: "0%", "stop-color": "#e2edf1" }));
  steelGrad.append(el("stop", { offset: "50%", "stop-color": "#7693a1" }));
  steelGrad.append(el("stop", { offset: "100%", "stop-color": "#233d4b" }));
  defs.append(steelGrad);

  const rawWaterGrad = el("linearGradient", { id: "raw-water-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  rawWaterGrad.append(el("stop", { offset: "0%", "stop-color": "#8c5e31", "stop-opacity": "0.85" }));
  rawWaterGrad.append(el("stop", { offset: "100%", "stop-color": "#382312", "stop-opacity": "0.95" }));
  defs.append(rawWaterGrad);

  const floatWaterGrad = el("linearGradient", { id: "float-water-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  floatWaterGrad.append(el("stop", { offset: "0%", "stop-color": "#3c7694", "stop-opacity": "0.8" }));
  floatWaterGrad.append(el("stop", { offset: "100%", "stop-color": "#12374b", "stop-opacity": "0.9" }));
  defs.append(floatWaterGrad);

  const treatedWaterGrad = el("linearGradient", { id: "treated-water-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  treatedWaterGrad.append(el("stop", { offset: "0%", "stop-color": "#4ecdf9", "stop-opacity": "0.85" }));
  treatedWaterGrad.append(el("stop", { offset: "100%", "stop-color": "#1272a3", "stop-opacity": "0.9" }));
  defs.append(treatedWaterGrad);

  const oilScumGrad = el("linearGradient", { id: "oil-scum-grad", x1: "0", y1: "0", x2: "1", y2: "0" });
  oilScumGrad.append(el("stop", { offset: "0%", "stop-color": "#d98a36" }));
  oilScumGrad.append(el("stop", { offset: "50%", "stop-color": "#f5b76c" }));
  oilScumGrad.append(el("stop", { offset: "100%", "stop-color": "#a85c18" }));
  defs.append(oilScumGrad);

  // Soft Contact Ground Shadow
  const shadowGrad = el("radialGradient", { id: "rig-contact-shadow", cx: "50%", cy: "50%", r: "50%" });
  shadowGrad.append(el("stop", { offset: "0%", "stop-color": "#000000", "stop-opacity": "0.32" }));
  shadowGrad.append(el("stop", { offset: "60%", "stop-color": "#000000", "stop-opacity": "0.08" }));
  shadowGrad.append(el("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": "0" }));
  defs.append(shadowGrad);

  svg.append(defs);

  // Ground shadow ellipse
  svg.append(el("ellipse", { cx: 550, cy: 442, rx: 490, ry: 24, fill: "url(#rig-contact-shadow)" }));

  const scene = el("g", { id: "rig-scene" });
  svg.append(scene);

  // Secondary Containment Tray & Base Skid
  scene.append(el("polygon", { points: "40,410 1060,410 1020,432 80,432", fill: "#152631", stroke: "#2c4856", "stroke-width": 2 }));
  scene.append(el("rect", { x: 45, y: 395, width: 1010, height: 16, rx: 3, fill: "#213947", stroke: "#4b6b7a", "stroke-width": 2 }));
  for (let x of [110, 310, 550, 780, 990]) {
    scene.append(el("rect", { x: x - 12, y: 411, width: 24, height: 16, rx: 2, fill: "#101e27", stroke: "#3d5765", "stroke-width": 1.5 }));
  }

  // ============================================================================
  // PIPING NETWORK
  // ============================================================================
  const pipePathData = "M 30,220 H 90 M 205,320 H 280 M 355,320 H 540 M 720,320 H 885 M 1015,320 H 1075";
  // Outer pipe casing
  scene.append(el("path", { d: pipePathData, fill: "none", stroke: "#122633", "stroke-width": 18, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  scene.append(el("path", { d: pipePathData, fill: "none", stroke: "#3a5665", "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  // Active animated core
  const activeFlowCore = el("path", { id: "pipe-active-flow", d: pipePathData, fill: "none", stroke: "#4ee0be", "stroke-width": 5, "stroke-linecap": "round" });
  scene.append(activeFlowCore);

  // Arrow markers for flow direction
  scene.append(el("path", { d: "M 55,214 L 63,220 L 55,226", fill: "none", stroke: "#56e0c0", "stroke-width": 2 }));
  scene.append(el("path", { d: "M 245,314 L 253,320 L 245,326", fill: "none", stroke: "#56e0c0", "stroke-width": 2 }));
  scene.append(el("path", { d: "M 460,314 L 468,320 L 460,326", fill: "none", stroke: "#56e0c0", "stroke-width": 2 }));
  scene.append(el("path", { d: "M 800,314 L 808,320 L 800,326", fill: "none", stroke: "#56e0c0", "stroke-width": 2 }));
  scene.append(el("path", { d: "M 1045,314 L 1053,320 L 1045,326", fill: "none", stroke: "#56e0c0", "stroke-width": 2 }));

  // Inlet & Outlet Labels
  scene.append(el("text", { x: 30, y: 195, fill: "#e59a4d", "font-family": "ui-monospace, monospace", "font-size": "10", "font-weight": "700", "letter-spacing": "1" }, "PRODUCED WATER IN"));
  scene.append(el("text", { x: 990, y: 300, fill: "#56e0c0", "font-family": "ui-monospace, monospace", "font-size": "10", "font-weight": "700", "letter-spacing": "1" }, "TREATED EFFLUENT ➔"));

  // ============================================================================
  // TANK 1: RAW WATER TANK
  // ============================================================================
  const rawGroup = el("g", { class: "part", "data-id": "raw", tabindex: 0, role: "button", "aria-label": "Raw Water Tank" });
  rawGroup.append(el("ellipse", { cx: 147, cy: 375, rx: 65, ry: 10, fill: "#0a151d" }));
  rawGroup.append(el("rect", { x: 85, y: 140, width: 125, height: 230, rx: 10, fill: "#13242f", stroke: "#517282", "stroke-width": 2.5 }));
  // Liquid Rect with clip path
  const rawLiquid = el("rect", { id: "raw-liquid-fill", x: 88, y: 185, width: 119, height: 180, rx: 6, fill: "url(#raw-water-grad)" });
  rawGroup.append(rawLiquid);
  // Sight glass markings
  for (let i = 0; i <= 4; i++) {
    let y = 170 + i * 45;
    rawGroup.append(el("line", { x1: 202, y1: y, x2: 208, y2: y, stroke: "#a0bcc9", "stroke-width": 2 }));
  }
  // Tank top and bottom caps
  rawGroup.append(el("ellipse", { cx: 147, cy: 140, rx: 62, ry: 11, fill: "#628291", stroke: "#9cb7c4", "stroke-width": 2 }));
  rawGroup.append(el("rect", { x: 135, y: 122, width: 24, height: 18, rx: 3, fill: "#9db7c4", stroke: "#436170" }));
  // Float sensor indicators
  rawGroup.append(el("circle", { cx: 105, cy: 345, r: 5, fill: "#ffbd69", stroke: "#ffffff", "stroke-width": 1.2 }));
  rawGroup.append(el("text", { x: 147, y: 390, "text-anchor": "middle", class: "part-label" }, "RAW WATER TANK"));
  rawGroup.append(el("text", { id: "raw-level-txt", x: 147, y: 270, "text-anchor": "middle", fill: "#ffffff", "font-family": "ui-monospace, monospace", "font-size": "13", "font-weight": "700" }, "80.0%"));
  scene.append(rawGroup);

  // ============================================================================
  // VALVE V1
  // ============================================================================
  function createValve(id, x, y, labelText) {
    const vg = el("g", { class: "part", "data-id": id, tabindex: 0, role: "button", "aria-label": labelText });
    vg.append(el("path", { d: `M${x-10} ${y-8} L${x} ${y} L${x-10} ${y+8} Z M${x+10} ${y-8} L${x} ${y} L${x+10} ${y+8} Z`, id: `${id}-body`, fill: "#597585", stroke: "#c3d5dd", "stroke-width": 1.5 }));
    vg.append(el("rect", { x: x-6, y: y-16, width: 12, height: 9, rx: 2, fill: "#1a313e", stroke: "#7493a3", "stroke-width": 1 }));
    vg.append(el("circle", { cx: x, cy: y-11, r: 3, id: `${id}-dot`, fill: "#ff5e57" }));
    vg.append(el("text", { x: x, y: y+21, "text-anchor": "middle", class: "part-label", "font-size": "10" }, labelText));
    scene.append(vg);
    return vg;
  }
  createValve("v1", 240, 320, "V1");

  // ============================================================================
  // FEED PUMP
  // ============================================================================
  const pumpGroup = el("g", { class: "part", "data-id": "pump", tabindex: 0, role: "button", "aria-label": "Feed Pump" });
  pumpGroup.append(el("rect", { x: 280, y: 285, width: 75, height: 65, rx: 12, id: "pump-housing", fill: "#2c4856", stroke: "#9db4c0", "stroke-width": 2 }));
  pumpGroup.append(el("circle", { cx: 317, cy: 317, r: 24, fill: "url(#steel-grad)", stroke: "#c2d6e0", "stroke-width": 2 }));
  // Impeller blades
  const impeller = el("g", { id: "pump-impeller" });
  impeller.append(el("circle", { cx: 317, cy: 317, r: 6, fill: "#56e0c0" }));
  for (let a = 0; a < 360; a += 90) {
    impeller.append(el("line", { x1: 317, y1: 317, x2: 317 + 16 * Math.cos(a*Math.PI/180), y2: 317 + 16 * Math.sin(a*Math.PI/180), stroke: "#56e0c0", "stroke-width": 3, "stroke-linecap": "round" }));
  }
  pumpGroup.append(impeller);
  // Pressure gauge
  pumpGroup.append(el("circle", { cx: 338, cy: 268, r: 12, fill: "#ffffff", stroke: "#2a424f", "stroke-width": 2 }));
  pumpGroup.append(el("line", { id: "gauge-needle", x1: 338, y1: 268, x2: 345, y2: 262, stroke: "#d8433f", "stroke-width": 2 }));
  pumpGroup.append(el("text", { x: 317, y: 372, "text-anchor": "middle", class: "part-label" }, "FEED PUMP"));
  scene.append(pumpGroup);

  createValve("v2", 380, 320, "V2");

  // ============================================================================
  // INLET SENSOR CELL
  // ============================================================================
  const sensorGroup = el("g", { class: "part", "data-id": "sensor_inlet", tabindex: 0, role: "button", "aria-label": "Inlet Sensor Cell" });
  sensorGroup.append(el("rect", { x: 415, y: 265, width: 55, height: 85, rx: 8, fill: "#1c3848", stroke: "#5cb4c7", "stroke-width": 2 }));
  sensorGroup.append(el("rect", { x: 422, y: 275, width: 41, height: 50, rx: 4, fill: "#0c1b24", stroke: "#3d6475" }));
  // 3 probe sticks
  for (let px of [429, 442, 455]) {
    sensorGroup.append(el("line", { x1: px, y1: 250, x2: px, y2: 305, stroke: "#56e0c0", "stroke-width": 3 }));
    sensorGroup.append(el("circle", { cx: px, cy: 305, r: 3, fill: "#38bdf8" }));
  }
  sensorGroup.append(el("circle", { cx: 442, cy: 260, r: 4, id: "sensor-led", fill: "#56e0c0" }));
  sensorGroup.append(el("text", { x: 442, y: 372, "text-anchor": "middle", class: "part-label" }, "INLET CELL"));
  scene.append(sensorGroup);

  createValve("v3", 495, 320, "V3");

  // ============================================================================
  // TANK 2: FLOTATION / DAF CELL
  // ============================================================================
  const floatGroup = el("g", { class: "part", "data-id": "float", tabindex: 0, role: "button", "aria-label": "Flotation Tank" });
  floatGroup.append(el("ellipse", { cx: 630, cy: 375, rx: 90, ry: 12, fill: "#0a151d" }));
  floatGroup.append(el("rect", { x: 540, y: 110, width: 180, height: 260, rx: 12, fill: "#112633", stroke: "#56e0c0", "stroke-width": 2 }));
  // Clarified water liquid
  floatGroup.append(el("rect", { x: 544, y: 155, width: 172, height: 210, rx: 8, fill: "url(#float-water-grad)" }));
  // Top Oil Scum Layer
  const oilLayer = el("rect", { id: "oil-scum-layer", x: 544, y: 152, width: 172, height: 24, rx: 4, fill: "url(#oil-scum-grad)", stroke: "#ffbd69", "stroke-width": 1.5 });
  floatGroup.append(oilLayer);
  // Bottom Sparger / Microbubble generator
  floatGroup.append(el("rect", { x: 560, y: 345, width: 140, height: 10, rx: 3, fill: "#446270", stroke: "#779aa9" }));
  // Rising microbubbles
  const bubbleGroup = el("g", { id: "flotation-bubbles" });
  const bubbleCoords = [
    [570, 340, 3.5, "b-del-1"], [600, 335, 4.5, "b-del-2"], [625, 342, 3, "b-del-3"],
    [650, 338, 5, "b-del-4"], [680, 344, 4, "b-del-5"], [585, 346, 3, "b-del-3"],
    [615, 340, 4, "b-del-1"], [665, 336, 4.5, "b-del-2"]
  ];
  bubbleCoords.forEach(([bx, by, br, bclass]) => {
    bubbleGroup.append(el("circle", { cx: bx, cy: by, r: br, fill: "#ffffff", opacity: "0.85", class: `bubble-anim ${bclass}` }));
  });
  floatGroup.append(bubbleGroup);
  // Top glass viewing frame
  floatGroup.append(el("ellipse", { cx: 630, cy: 110, rx: 88, ry: 13, fill: "#54798a", stroke: "#8fb6c7", "stroke-width": 2 }));
  floatGroup.append(el("text", { x: 630, y: 395, "text-anchor": "middle", class: "part-label" }, "FLOTATION / DAF CELL"));
  floatGroup.append(el("text", { x: 630, y: 142, "text-anchor": "middle", fill: "#ffbd69", "font-family": "ui-monospace, monospace", "font-size": "10", "font-weight": "700" }, "▲ OIL / SOLIDS SEPARATION"));
  scene.append(floatGroup);

  createValve("v5", 745, 320, "V5");

  // ============================================================================
  // OUTLET SENSOR CELL
  // ============================================================================
  const outletSensor = el("g", { class: "part", "data-id": "sensor_outlet", tabindex: 0, role: "button", "aria-label": "Outlet Sensor Cell" });
  outletSensor.append(el("rect", { x: 775, y: 275, width: 50, height: 75, rx: 7, fill: "#1c3848", stroke: "#5cb4c7", "stroke-width": 2 }));
  outletSensor.append(el("circle", { cx: 800, cy: 300, r: 8, fill: "#153545", stroke: "#56e0c0", "stroke-width": 2 }));
  outletSensor.append(el("circle", { cx: 800, cy: 300, r: 3, fill: "#56e0c0" }));
  outletSensor.append(el("text", { x: 800, y: 372, "text-anchor": "middle", class: "part-label" }, "OUTLET CELL"));
  scene.append(outletSensor);

  createValve("v6", 855, 320, "V6");

  // ============================================================================
  // TANK 3: TREATED WATER TANK
  // ============================================================================
  const treatedGroup = el("g", { class: "part", "data-id": "treated", tabindex: 0, role: "button", "aria-label": "Treated Water Tank" });
  treatedGroup.append(el("ellipse", { cx: 947, cy: 375, rx: 65, ry: 10, fill: "#0a151d" }));
  treatedGroup.append(el("rect", { x: 885, y: 150, width: 125, height: 220, rx: 10, fill: "#122530", stroke: "#38bdf8", "stroke-width": 2.5 }));
  // Clean liquid fill
  const treatedLiquid = el("rect", { id: "treated-liquid-fill", x: 888, y: 325, width: 119, height: 40, rx: 6, fill: "url(#treated-water-grad)" });
  treatedGroup.append(treatedLiquid);
  // Sight glass
  for (let i = 0; i <= 4; i++) {
    let y = 180 + i * 40;
    treatedGroup.append(el("line", { x1: 1002, y1: y, x2: 1008, y2: y, stroke: "#7dd3fc", "stroke-width": 2 }));
  }
  treatedGroup.append(el("ellipse", { cx: 947, cy: 150, rx: 62, ry: 11, fill: "#3ba2cd", stroke: "#7dd3fc", "stroke-width": 2 }));
  treatedGroup.append(el("text", { x: 947, y: 390, "text-anchor": "middle", class: "part-label" }, "TREATED WATER TANK"));
  treatedGroup.append(el("text", { id: "treated-level-txt", x: 947, y: 345, "text-anchor": "middle", fill: "#ffffff", "font-family": "ui-monospace, monospace", "font-size": "13", "font-weight": "700" }, "20.0%"));
  scene.append(treatedGroup);

  // ============================================================================
  // CONTROL ENCLOSURE & SAFETY HARDWARE
  // ============================================================================
  const ctrlGroup = el("g", { class: "part", "data-id": "control", tabindex: 0, role: "button", "aria-label": "Control Enclosure" });
  ctrlGroup.append(el("rect", { x: 450, y: 25, width: 180, height: 60, rx: 8, fill: "#192e3c", stroke: "#618496", "stroke-width": 2 }));
  ctrlGroup.append(el("rect", { x: 460, y: 33, width: 95, height: 42, rx: 4, fill: "#08131a", stroke: "#3d5c6c" }));
  ctrlGroup.append(el("text", { x: 507, y: 56, "text-anchor": "middle", fill: "#56e0c0", "font-family": "ui-monospace, monospace", "font-size": "11", "font-weight": "700" }, "CONTROL MCU"));
  // Status LEDs on box
  ctrlGroup.append(el("circle", { cx: 575, cy: 45, r: 5, id: "mcu-led-run", fill: "#34d399", stroke: "#ffffff", "stroke-width": 1 }));
  ctrlGroup.append(el("circle", { cx: 595, cy: 45, r: 5, id: "mcu-led-alarm", fill: "#4b1818", stroke: "#7f1d1d", "stroke-width": 1 }));
  ctrlGroup.append(el("text", { x: 540, y: 15, "text-anchor": "middle", class: "part-label", "font-size": "9" }, "MCU · RELAYS · LOCAL INTERLOCKS"));
  scene.append(ctrlGroup);

  // Prominent Emergency Stop Button on Skid
  const estopGroup = el("g", { class: "part", "data-id": "estop", tabindex: 0, role: "button", "aria-label": "Emergency Stop Pushbutton" });
  estopGroup.append(el("rect", { x: 650, y: 28, width: 44, height: 52, rx: 6, fill: "#213642", stroke: "#829ca9", "stroke-width": 1.5 }));
  estopGroup.append(el("circle", { cx: 672, cy: 48, r: 16, id: "estop-btn-circle", fill: "#ef4444", stroke: "#fee2e2", "stroke-width": 2.5 }));
  estopGroup.append(el("circle", { cx: 672, cy: 48, r: 8, fill: "#991b1b" }));
  estopGroup.append(el("text", { x: 672, y: 74, "text-anchor": "middle", fill: "#ffffff", "font-family": "ui-monospace, monospace", "font-size": "8", "font-weight": "700" }, "E-STOP"));
  scene.append(estopGroup);

  // Mount SVG into host
  host.replaceChildren(svg);

  // Click & Interaction Listeners
  svg.querySelectorAll(".part").forEach((item) => {
    item.addEventListener("click", () => {
      const cid = item.getAttribute("data-id");
      openComponentModal(cid);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openComponentModal(item.getAttribute("data-id"));
      }
    });
  });

  // Enable subtle pan/zoom rotation on scene
  let angle = 0, scale = 1.0, drag = null;
  function applyTransform() {
    scene.setAttribute("transform", `translate(550 240) rotate(${angle} 0 0) scale(${scale}) translate(-550 -240)`);
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".part")) return;
    drag = { x: e.clientX, angle };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (drag) {
      angle = drag.angle + (e.clientX - drag.x) * 0.15;
      applyTransform();
    }
  });
  svg.addEventListener("pointerup", () => drag = null);
  svg.addEventListener("pointercancel", () => drag = null);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    scale = Math.max(0.85, Math.min(1.35, scale + (e.deltaY < 0 ? 0.04 : -0.04)));
    applyTransform();
  }, { passive: false });
}

// ==============================================================================
// TELEMETRY & RIG SYNCHRONIZER
// ==============================================================================
function updateRigVisuals() {
  // 1. Update Header HUD KPIs
  const kpiOil = document.getElementById("kpi-oil");
  const kpiTurb = document.getElementById("kpi-turb");
  const kpiEc = document.getElementById("kpi-ec");
  const kpiPress = document.getElementById("kpi-press");
  const kpiFlow = document.getElementById("kpi-flow");

  if (kpiOil) kpiOil.innerHTML = `${telemetry.oil_mg_l.toFixed(0)} <small>mg/L</small>`;
  if (kpiTurb) kpiTurb.innerHTML = `${telemetry.turbidity_ntu.toFixed(0)} <small>NTU</small>`;
  if (kpiEc) kpiEc.innerHTML = `${telemetry.ec_ms_cm.toFixed(1)} <small>mS/cm</small>`;
  if (kpiPress) kpiPress.innerHTML = `${telemetry.pressure_kpa.toFixed(0)} <small>kPa</small>`;
  if (kpiFlow) kpiFlow.innerHTML = `${telemetry.flow_l_min.toFixed(2)} <small>L/min</small>`;

  // 2. Update System Status Pill
  const statusPill = document.getElementById("rig-status-pill");
  const statusText = document.getElementById("rig-status-text");
  if (statusPill && statusText) {
    statusPill.className = "status-pill";
    if (telemetry.state === "RUNNING") {
      statusPill.classList.add("status-running");
      statusText.textContent = "RUNNING";
    } else if (telemetry.state === "SAFE" || telemetry.state === "ESTOP") {
      statusPill.classList.add("status-safe");
      statusText.textContent = telemetry.state === "ESTOP" ? "EMERGENCY STOP" : "SAFE STATE";
    } else {
      statusPill.classList.add("status-idle");
      statusText.textContent = "IDLE";
    }
  }

  // 3. Update Pipe Flow Line Animation
  const activeFlow = document.getElementById("pipe-active-flow");
  if (activeFlow) {
    if (telemetry.flow_l_min > 0.05 && telemetry.pump_on) {
      activeFlow.classList.add("flow-line-active");
      activeFlow.setAttribute("stroke", "#56e0c0");
    } else {
      activeFlow.classList.remove("flow-line-active");
      activeFlow.setAttribute("stroke", "transparent");
    }
  }

  // 4. Update Pump Impeller & Gauge Needle
  const impeller = document.getElementById("pump-impeller");
  if (impeller) {
    impeller.classList.toggle("impeller-spin", telemetry.pump_on);
  }
  const needle = document.getElementById("gauge-needle");
  if (needle) {
    const angleDeg = -45 + (telemetry.pressure_kpa / 400.0) * 180;
    const rad = angleDeg * Math.PI / 180;
    needle.setAttribute("x2", String(338 + 9 * Math.cos(rad)));
    needle.setAttribute("y2", String(268 + 9 * Math.sin(rad)));
  }

  // 5. Update Tank Water Levels
  const rawFill = document.getElementById("raw-liquid-fill");
  const rawTxt = document.getElementById("raw-level-txt");
  if (rawFill && rawTxt) {
    const rawH = (telemetry.raw_tank_level / 100.0) * 210;
    rawFill.setAttribute("height", Math.max(4, rawH));
    rawFill.setAttribute("y", String(365 - rawH));
    rawTxt.textContent = `${telemetry.raw_tank_level.toFixed(1)}%`;
  }

  const treatedFill = document.getElementById("treated-liquid-fill");
  const treatedTxt = document.getElementById("treated-level-txt");
  if (treatedFill && treatedTxt) {
    const trtH = (telemetry.treated_tank_level / 100.0) * 200;
    treatedFill.setAttribute("height", Math.max(4, trtH));
    treatedFill.setAttribute("y", String(365 - trtH));
    treatedTxt.textContent = `${telemetry.treated_tank_level.toFixed(1)}%`;
  }

  // 6. Update Flotation Bubbles & Oil Layer
  const bubbles = document.getElementById("flotation-bubbles");
  if (bubbles) {
    bubbles.style.display = (telemetry.pump_on && telemetry.valves[2]) ? "inline" : "none";
  }

  // 7. Update Valves V1 - V6
  for (let i = 0; i < 6; i++) {
    const isOpen = Boolean(telemetry.valves[i]);
    const dot = document.getElementById(`v${i+1}-dot`);
    const body = document.getElementById(`v${i+1}-body`);
    if (dot) dot.setAttribute("fill", isOpen ? "#34d399" : "#ef4444");
    if (body) body.setAttribute("fill", isOpen ? "#164e3e" : "#597585");
  }

  // 8. Update MCU LEDs
  const ledRun = document.getElementById("mcu-led-run");
  const ledAlarm = document.getElementById("mcu-led-alarm");
  if (ledRun) ledRun.setAttribute("fill", telemetry.state === "RUNNING" ? "#34d399" : "#1e4e3e");
  if (ledAlarm) ledAlarm.setAttribute("fill", (telemetry.state === "SAFE" || telemetry.state === "ESTOP") ? "#ef4444" : "#4b1818");

  // 9. Update Component Modal if currently open
  updateModalReadingsIfOpen();
}

// ==============================================================================
// COMPONENT INSPECTION MODAL LOGIC
// ==============================================================================
function openComponentModal(id) {
  const comp = RIG_COMPONENTS[id];
  if (!comp) return;
  selectedComponentId = id;

  const backdrop = document.getElementById("component-modal-backdrop");
  const tagEl = document.getElementById("modal-comp-id");
  const nameEl = document.getElementById("modal-comp-name");
  const statusEl = document.getElementById("modal-comp-status");
  const purposeEl = document.getElementById("modal-comp-purpose");
  const roleEl = document.getElementById("modal-comp-role");
  const ioEl = document.getElementById("modal-comp-io");
  const safetyEl = document.getElementById("modal-comp-safety");

  if (tagEl) tagEl.textContent = comp.id;
  if (nameEl) nameEl.textContent = comp.name;
  if (purposeEl) purposeEl.textContent = comp.purpose;
  if (roleEl) roleEl.textContent = comp.role;
  if (ioEl) ioEl.textContent = comp.io;
  if (safetyEl) safetyEl.textContent = comp.safety;

  if (statusEl) {
    if (id === "pump") {
      statusEl.textContent = telemetry.pump_on ? "RUNNING (1.8 L/min)" : "STOPPED (STANDBY)";
    } else if (id.startsWith("v")) {
      const vidx = parseInt(id.replace("v","")) - 1;
      statusEl.textContent = telemetry.valves[vidx] ? "OPEN (ENERGIZED)" : "CLOSED (NC)";
    } else if (id === "float") {
      statusEl.textContent = (telemetry.pump_on && telemetry.valves[2]) ? "ACTIVE SEPARATION" : "IDLE";
    } else {
      statusEl.textContent = telemetry.state;
    }
  }

  renderModalReadings(comp);
  if (backdrop) backdrop.hidden = false;
}

function renderModalReadings(comp) {
  const container = document.getElementById("modal-comp-readings");
  if (!container || !comp.getReadings) return;
  const list = comp.getReadings(telemetry);
  container.innerHTML = list.map(item => `
    <div class="reading-item">
      <span>${item.label}</span>
      <b>${item.val}</b>
    </div>
  `).join("");
}

function updateModalReadingsIfOpen() {
  const backdrop = document.getElementById("component-modal-backdrop");
  if (backdrop && !backdrop.hidden && selectedComponentId) {
    const comp = RIG_COMPONENTS[selectedComponentId];
    if (comp) renderModalReadings(comp);
  }
}

function closeComponentModal() {
  const backdrop = document.getElementById("component-modal-backdrop");
  if (backdrop) backdrop.hidden = true;
}

// ==============================================================================
// OPERATING MODES & CONTROL ACTIONS
// ==============================================================================
function setOperatingMode(mode) {
  currentMode = mode;
  const btnDemo = document.getElementById("btn-mode-demo");
  const btnHw = document.getElementById("btn-mode-hardware");

  if (btnDemo) btnDemo.classList.toggle("active", mode === "demo");
  if (btnHw) btnHw.classList.toggle("active", mode === "hardware");

  if (mode === "hardware") {
    startHardwarePolling();
  } else {
    stopHardwarePolling();
  }
}

// Demo Simulation Loop (Scenario runner)
function tickDemoSimulation() {
  if (currentMode !== "demo") return;

  if (telemetry.state === "RUNNING" && telemetry.pump_on) {
    telemetry.flow_l_min = 1.8;
    telemetry.pressure_kpa = 180.0;
    telemetry.raw_tank_level = Math.max(8.0, telemetry.raw_tank_level - 0.2);
    telemetry.treated_tank_level = Math.min(96.0, telemetry.treated_tank_level + 0.2);

    // Automatic dry run check
    if (telemetry.raw_tank_level <= 10.0) {
      telemetry.state = "SAFE";
      telemetry.pump_on = false;
      telemetry.valves = [false, false, false, false, false, false];
      telemetry.flow_l_min = 0.0;
    }
  }

  updateRigVisuals();
}

function triggerCommand(commandName) {
  const isLocalBackendSupported = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.protocol === "http:";
  if (currentMode === "demo" || !isLocalBackendSupported) {
    if (commandName === "START") {
      telemetry.state = "RUNNING";
      telemetry.pump_on = true;
      telemetry.valves = [true, true, true, false, true, true];
      telemetry.pressure_kpa = 180.0;
      telemetry.flow_l_min = 1.8;
    } else if (commandName === "FAULT_OVERPRESSURE") {
      telemetry.pressure_kpa = 320.0;
      telemetry.state = "SAFE";
      telemetry.pump_on = false;
      telemetry.valves = [false, false, false, false, false, false];
      telemetry.flow_l_min = 0.0;
    } else if (commandName === "ESTOP") {
      telemetry.state = "ESTOP";
      telemetry.pump_on = false;
      telemetry.valves = [false, false, false, false, false, false];
      telemetry.flow_l_min = 0.0;
    } else if (commandName === "RESET") {
      telemetry.state = "IDLE";
      telemetry.pump_on = false;
      telemetry.valves = [false, false, false, false, false, false];
      telemetry.pressure_kpa = 180.0;
      telemetry.flow_l_min = 0.0;
    }
    updateRigVisuals();
  } else {
    // Send command to local FastAPI backend when running locally in hardware mode
    fetch("http://localhost:8000/api/v1/hardware/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: commandName })
    }).catch(err => console.warn("Local backend command dispatch:", err));
  }
}

// Hardware Telemetry Poller
function startHardwarePolling() {
  if (hardwarePollInterval) clearInterval(hardwarePollInterval);
  const isLocalBackendSupported = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.protocol === "http:";
  if (!isLocalBackendSupported) {
    const statusText = document.getElementById("rig-status-text");
    if (statusText) statusText.textContent = "SIMULATED";
    return;
  }
  hardwarePollInterval = setInterval(async () => {
    if (currentMode !== "hardware") return;
    try {
      const res = await fetch("http://localhost:8000/api/v1/hardware/telemetry");
      if (res.ok) {
        const data = await res.json();
        Object.assign(telemetry, data);
        updateRigVisuals();
      }
    } catch (e) {
      // Backend / bridge not reachable
    }
  }, 500);
}

function stopHardwarePolling() {
  if (hardwarePollInterval) {
    clearInterval(hardwarePollInterval);
    hardwarePollInterval = null;
  }
}

// ==============================================================================
// INITIALIZATION ON DOM READY
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
  const heroHost = document.getElementById("hero-canvas");
  if (heroHost) {
    renderStandaloneRig(heroHost);
  }

  // Setup Button Handlers
  document.getElementById("btn-mode-demo")?.addEventListener("click", () => setOperatingMode("demo"));
  document.getElementById("btn-mode-hardware")?.addEventListener("click", () => setOperatingMode("hardware"));

  document.getElementById("btn-action-start")?.addEventListener("click", () => triggerCommand("START"));
  document.getElementById("btn-action-overpressure")?.addEventListener("click", () => triggerCommand("FAULT_OVERPRESSURE"));
  document.getElementById("btn-action-estop")?.addEventListener("click", () => triggerCommand("ESTOP"));
  document.getElementById("btn-action-reset")?.addEventListener("click", () => triggerCommand("RESET"));

  // Modal Close Handlers
  document.getElementById("modal-close-btn")?.addEventListener("click", closeComponentModal);
  document.getElementById("component-modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "component-modal-backdrop") closeComponentModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeComponentModal();
  });

  // Initialize Section 02 system-canvas if present
  const sysHost = document.getElementById("system-canvas");
  if (sysHost) {
    initSection2Canvas(sysHost);
  }

  // Start demo tick loop
  setInterval(tickDemoSimulation, 500);
  updateRigVisuals();
});

// Section 02 System Canvas Renderer
function initSection2Canvas(host) {
  const sysComponents = [
    {id:'raw',name:'Raw-water tank',icon:'◉',summary:'Receives incoming produced-water sample for controlled bench testing.',role:'Feed storage',status:'Concept layout',spec:'Working volume to match sample quantity',note:'Initial buffer vessel.'},
    {id:'pump',name:'12 V diaphragm pumps',icon:'⟳',summary:'Delivers feed water through pilot treatment modules.',role:'Feed and transfer',status:'BOM-listed class',spec:'3 installed + 1 spare',note:'12 VDC positive displacement.'},
    {id:'inlet',name:'Inlet sensor cell',icon:'⌁',summary:'Measures feed conditions before treatment; high-range conductivity probe is primary salinity measurement.',role:'Feed monitoring',status:'BOM-listed sensors',spec:'K=10 EC, pH, turbidity, temp, oil proxy',note:'Transmits to MCU ADC.'},
    {id:'float',name:'Flotation chamber',icon:'◌',summary:'Separates floatable hydrocarbons and light solids using micro-bubbles.',role:'Primary treatment',status:'Conceptual layout',spec:'1 chamber; PP/HDPE',note:'Micro-bubble DAF cell.'},
    {id:'filter',name:'Media filtration column',icon:'▥',summary:'Filtration stage reducing suspended solids.',role:'Polishing',status:'Modular stage',spec:'Sand / anthracite / carbon',note:'Secondary solids reduction.'},
    {id:'ro',name:'Optional mini-RO module',icon:'▤',summary:'Polishing membrane concept for low-salinity streams.',role:'Optional polishing',status:'Optional / unvalidated',spec:'Household unit rating',note:'For post-dilution tests only.'},
    {id:'outlet',name:'Outlet sensor cell',icon:'⌁',summary:'Post-treatment quality verification before storage.',role:'Output monitoring',status:'BOM-listed sensors',spec:'Turbidity, pH, flow, temp',note:'Confirms discharge compliance.'},
    {id:'treated',name:'Treated-water tank',icon:'◉',summary:'Collects compliant treated stream for inspection or reuse.',role:'Output collection',status:'Concept layout',spec:'Volume to match test batch',note:'Effluent reservoir.'},
    {id:'control',name:'Control enclosure',icon:'▣',summary:'Houses the MCU, relays, and local safety logic.',role:'Control & interlocks',status:'Hardware integrated',spec:'MCU + 8-ch relay board',note:'Autonomous safety watchdog.'},
    {id:'valves',name:'Solenoid valves (V1-V6)',icon:'⊗',summary:'Normally-closed route selection valves.',role:'Route selection',status:'6 installed + 2 spare',spec:'12 VDC, NC pilot type',note:'Fail-safe closed.'},
    {id:'safety',name:'Safety hardware',icon:'!',summary:'Emergency stop and level/pressure interlocks.',role:'Hardware protection',status:'Required items',spec:'E-stop + 4 float switches + relief valve',note:'Hardware master interlock.'},
    {id:'tray',name:'Containment tray',icon:'▱',summary:'Secondary containment beneath bench rig.',role:'Secondary containment',status:'Required feature',spec:'Polypropylene tray',note:'Drip and leak prevention.'}
  ];

  let currentSysId = 'raw';
  function selectSysComp(id) {
    const c = sysComponents.find(x => x.id === id) || sysComponents[0];
    currentSysId = id;
    host.querySelectorAll('.sys-part').forEach(n => n.classList.toggle('selected', n.dataset.id === id));
    const idxEl = document.getElementById('component-index');
    if (idxEl) idxEl.textContent = `${String(sysComponents.indexOf(c) + 1).padStart(2, '0')} / ${String(sysComponents.length).padStart(2, '0')}`;
    const iconEl = document.getElementById('component-icon');
    if (iconEl) iconEl.textContent = c.icon;
    const nameEl = document.getElementById('component-name');
    if (nameEl) nameEl.textContent = c.name;
    const sumEl = document.getElementById('component-summary');
    if (sumEl) sumEl.textContent = c.summary;
    const roleEl = document.getElementById('component-role');
    if (roleEl) roleEl.textContent = c.role;
    const stEl = document.getElementById('component-status');
    if (stEl) stEl.textContent = c.status;
    const spEl = document.getElementById('component-spec');
    if (spEl) spEl.textContent = c.spec;
    const ntEl = document.getElementById('component-note');
    if (ntEl) ntEl.textContent = c.note;
  }

  // Build SVG for Section 2
  const svg = el('svg', { viewBox: '0 0 1000 470', role: 'img', 'aria-label': 'Conceptual 3D Rig Assembly' });
  const scene = el('g', { id: 'sys-scene' });
  svg.append(scene);

  scene.append(el('polygon', { points: '70,370 785,370 925,300 210,300', fill: '#1b3240', stroke: '#496775', 'stroke-width': 2 }));
  scene.append(el('path', { d: 'M130 295 H210 V325 H285 V300 H365 V310 H455 V300 H555 V310 H645 V300 H730 V320 H825', fill: 'none', stroke: '#3ea8d8', 'stroke-width': 7 }));

  function addSysTank(id, x, y, w, h, label) {
    const g = el('g', { class: 'part sys-part', 'data-id': id, tabindex: 0, role: 'button', 'aria-label': label });
    g.append(el('rect', { x, y, width: w, height: h, rx: 8, fill: '#243c4a', stroke: '#6c8e9f', 'stroke-width': 2 }));
    g.append(el('text', { x: x + w/2, y: y + h + 18, 'text-anchor': 'middle', class: 'part-label' }, label));
    scene.append(g);
    return g;
  }

  addSysTank('raw', 75, 190, 90, 150, 'RAW WATER');
  const p = el('g', { class: 'part sys-part', 'data-id': 'pump', tabindex: 0, role: 'button', 'aria-label': 'Feed pump' });
  p.append(el('rect', { x: 190, y: 260, width: 68, height: 48, rx: 10, fill: '#354f5d', stroke: '#a7bbc3', 'stroke-width': 2 }));
  p.append(el('circle', { cx: 224, cy: 284, r: 17, fill: '#182b35', stroke: '#56e0c0', 'stroke-width': 2 }));
  p.append(el('text', { x: 224, y: 326, 'text-anchor': 'middle', class: 'part-label' }, 'FEED PUMP'));
  scene.append(p);

  addSysTank('float', 360, 180, 92, 160, 'FLOTATION');
  addSysTank('filter', 485, 165, 76, 175, 'MEDIA FILTER');
  addSysTank('ro', 590, 215, 68, 125, 'OPTIONAL RO');
  addSysTank('treated', 765, 205, 88, 135, 'TREATED TANK');

  const cbox = el('g', { class: 'part sys-part', 'data-id': 'control', tabindex: 0, role: 'button', 'aria-label': 'Control box' });
  cbox.append(el('rect', { x: 410, y: 80, width: 140, height: 50, rx: 6, fill: '#1b3240', stroke: '#56e0c0', 'stroke-width': 2 }));
  cbox.append(el('text', { x: 480, y: 110, 'text-anchor': 'middle', fill: '#56e0c0', 'font-size': '11', 'font-weight': '700' }, 'ESP32 / MCU'));
  scene.append(cbox);

  host.replaceChildren(svg);

  svg.querySelectorAll('.sys-part').forEach(n => {
    n.addEventListener('click', () => selectSysComp(n.dataset.id));
  });

  document.getElementById('prev-component')?.addEventListener('click', () => {
    const curIdx = sysComponents.findIndex(c => c.id === currentSysId);
    selectSysComp(sysComponents[(curIdx - 1 + sysComponents.length) % sysComponents.length].id);
  });
  document.getElementById('next-component')?.addEventListener('click', () => {
    const curIdx = sysComponents.findIndex(c => c.id === currentSysId);
    selectSysComp(sysComponents[(curIdx + 1) % sysComponents.length].id);
  });
  document.getElementById('reset-camera')?.addEventListener('click', () => selectSysComp('raw'));

  selectSysComp('raw');
}


// Accessible Theme Toggle
(function () {
  const root = document.documentElement;
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  let saved = null;
  try { saved = localStorage.getItem("pwadapt-theme"); } catch (e) {}
  root.dataset.theme = saved || "dark";
  function paint() {
    const light = root.dataset.theme === "light";
    btn.textContent = light ? "☾ Dark mode" : "☼ Light mode";
    btn.setAttribute("aria-pressed", String(light));
  }
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("pwadapt-theme", root.dataset.theme); } catch (e) {}
    paint();
  });
  paint();
})();
