/* =========================
   CardGPT Studio PRO
   ========================= */

/* ---------- Storage Keys ---------- */
const K_LIBRARY = "cardgpt_library_v1";
const K_DRAFT   = "cardgpt_draft_v1";
const K_ACTIVE  = "cardgpt_active_id_v1";
const K_SETTINGS= "cardgpt_settings_v1";
const K_APIKEY  = "cardgpt_api_key_v1";

/* ---------- In-memory state ---------- */
let library = [];
let activeId = null;
let abilities = [];

/* ---------- Settings ---------- */
let settings = {
  canvasW: 1600,
  canvasH: 900,
  autoDraftSeconds: 3,
  aiModel: "gpt-image-1"
};

/* ---------- Helpers ---------- */
const $ = (id)=>document.getElementById(id);

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2400);
}
function setStatus(s){
  $("sysStatus").textContent = s;
}
function nowISO(){
  return new Date().toISOString();
}
function safeTrim(s){ return (s ?? "").toString().trim(); }
function splitCSV(s){
  return safeTrim(s).length ? safeTrim(s).split(",").map(x=>x.trim()).filter(Boolean) : [];
}
function genId(prefix="CARD"){
  const rnd = Math.floor(Math.random()*90000)+10000;
  const t = Date.now().toString().slice(-6);
  return `${prefix}-${t}-${rnd}`;
}
function downloadText(filename, text, mime="application/json"){
  const blob = new Blob([text], {type:mime});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function copyToClipboard(text){
  navigator.clipboard.writeText(text);
  toast("📋 הועתק ללוח!");
}
function clamp(s, n=160){
  s = safeTrim(s);
  if(!s) return "—";
  return s.length>n ? s.slice(0,n-1)+"…" : s;
}

/* ---------- UI Tab Logic ---------- */
function switchLeftTab(name){
  ["library","templates","import"].forEach(x=>{
    document.querySelectorAll(`[data-lefttab="${x}"]`).forEach(el=>{
      el.classList.toggle("active", x===name);
    });
    $(`left_${x}`).style.display = (x===name) ? "" : "none";
  });
}
function switchRightTab(name){
  ["editor","preview","export","settings"].forEach(x=>{
    document.querySelectorAll(`[data-righttab="${x}"]`).forEach(el=>{
      el.classList.toggle("active", x===name);
    });
    $(`right_${x}`).style.display = (x===name) ? "" : "none";
  });

  if(name==="export"){
    refreshLibraryDump();
    updateAIPrompt();
  }
  if(name==="preview"){
    renderPreview2();
  }
}

/* ---------- Build Card Object ---------- */
function buildCardFromForm(){
  const id = safeTrim($("card_id").value) || genId("HG");
  const card = {
    spec: "cardgpt_card_v1",
    spec_version: "1.0",
    card_id: id,
    card_series: safeTrim($("card_series").value),
    card_type: $("card_type").value,
    card_name: safeTrim($("card_name").value),
    card_alias: safeTrim($("card_alias").value),
    element: safeTrim($("element").value),
    rarity: $("rarity").value,
    alignment: safeTrim($("alignment").value),
    core_energy: safeTrim($("core_energy").value),

    lore: {
      description: safeTrim($("lore_description").value),
      personality: safeTrim($("personality").value),
      role: safeTrim($("role").value),
      world_context: safeTrim($("world_context").value)
    },

    activation: {
      trigger: safeTrim($("trigger").value),
      effect: safeTrim($("effect").value),
      quote: safeTrim($("first_message").value)
    },

    interaction: {
      first_message: safeTrim($("first_message").value),
      dialogue_style: safeTrim($("dialogue_style").value),
      dialogue_examples: safeTrim($("dialogue_examples").value).split("\n").map(x=>x.trim()).filter(Boolean)
    },

    abilities: abilities.map(a=>({ ...a })),

    visual_style: {
      outfit: safeTrim($("outfit").value),
      aura: safeTrim($("aura").value),
      color_palette: [safeTrim($("pal1").value), safeTrim($("pal2").value), safeTrim($("pal3").value)].filter(Boolean),
      art_prompt: safeTrim($("art_prompt").value)
    },

    meta: {
      creator: "AnLoMinus",
      engine: "CardGPT Studio PRO",
      version: safeTrim($("version").value) || "1.0",
      tags: splitCSV($("tags").value),
      changelog: safeTrim($("changelog").value),
      created_at: nowISO(),
      updated_at: nowISO()
    }
  };

  return card;
}

/* ---------- Validate ---------- */
function validateCard(card){
  const problems = [];
  if(!safeTrim(card.card_name)) problems.push("🃏 חסר Card Name");
  if(!safeTrim(card.card_series)) problems.push("🗂️ חסר Series");
  if(!safeTrim(card.core_energy)) problems.push("⚡ חסר Core Energy");

  return problems;
}

/* ---------- JSON Live + Preview ---------- */
function refreshJSONLive(){
  const card = buildCardFromForm();
  const problems = validateCard(card);
  const ok = problems.length===0;

  $("jsonOut").textContent = JSON.stringify(card, null, 2);
  $("activeId").textContent = card.card_id || "—";

  // chips
  $("draftState").textContent = $("draftState").textContent || "Idle";
  setStatus(ok ? "Ready" : "Needs Fields");

  // Preview 1
  $("pv_name").textContent = card.card_name || "—";
  $("pv_sub").textContent = `${card.card_type || "—"} • ${card.card_series || "—"} • ${card.core_energy || "—"}`;
  $("pv_badge").textContent = `${card.rarity || "—"} • ${card.alignment || "—"}`;
  $("pv_desc").textContent = clamp(card.lore.description || card.lore.world_context || "התחל למלא Lore…", 240);
  $("pv_meta").textContent = `🆔 ${card.card_id} • v${card.meta.version}`;
  $("pv_time").textContent = new Date().toLocaleString("he-IL", {dateStyle:"medium", timeStyle:"short"});

  // Abilities preview
  const abWrap = $("pv_abilities");
  abWrap.innerHTML = "";
  const abShow = card.abilities.slice(0,4);
  if(abShow.length===0){
    abWrap.innerHTML = `<div class="ab" style="grid-column:1/-1;"><b>⚔️ Abilities</b><span class="muted">הוסף יכולת כדי להציג כאן.</span></div>`;
  } else {
    abShow.forEach(a=>{
      const div = document.createElement("div");
      div.className="ab";
      div.innerHTML = `<b>⚔️ ${a.name || "Ability"}</b><span>${clamp(a.effect || "—", 120)}</span>`;
      abWrap.appendChild(div);
    });
  }

  // Quick validation toast hint (silent)
  const chips = document.querySelectorAll(".chip");
  chips.forEach(c=>{
    // no-op (styling reserved)
  });

  updateAIPrompt(card);

  return {card, problems};
}

function renderPreview2(){
  const {card} = refreshJSONLive();
  $("pv2_name").textContent = card.card_name || "—";
  $("pv2_sub").textContent = `${card.card_type || "—"} • ${card.card_series || "—"} • ${card.core_energy || "—"}`;
  $("pv2_badge").textContent = `${card.rarity || "—"} • ${card.alignment || "—"}`;
  $("pv2_desc").textContent = clamp(card.lore.description || card.lore.world_context || "—", 320);
  $("pv2_meta").textContent = `🆔 ${card.card_id} • v${card.meta.version} • 🏷️ ${card.meta.tags.join(", ") || "—"}`;
  $("pv2_time").textContent = new Date().toLocaleString("he-IL", {dateStyle:"full", timeStyle:"medium"});

  const wrap = $("pv2_abilities");
  wrap.innerHTML = "";
  const abShow = card.abilities.slice(0,6);
  if(abShow.length===0){
    wrap.innerHTML = `<div class="ab" style="grid-column:1/-1;"><b>⚔️ Abilities</b><span class="muted">עדיין אין יכולות.</span></div>`;
  }else{
    abShow.forEach(a=>{
      const div = document.createElement("div");
      div.className="ab";
      const info = [a.type, a.cost ? `Cost: ${a.cost}` : "", a.cooldown ? `CD: ${a.cooldown}` : ""].filter(Boolean).join(" • ");
      div.innerHTML = `<b>⚔️ ${a.name || "Ability"}</b><span class="muted small">${info || ""}</span><span>${clamp(a.effect || "—", 150)}</span>`;
      wrap.appendChild(div);
    });
  }
}

/* ---------- Library ---------- */
function loadLibrary(){
  try{
    library = JSON.parse(localStorage.getItem(K_LIBRARY) || "[]");
    if(!Array.isArray(library)) library = [];
  }catch{ library = []; }
  $("countCards").textContent = library.length.toString();
}
function saveLibrary(){
  localStorage.setItem(K_LIBRARY, JSON.stringify(library));
  $("countCards").textContent = library.length.toString();
}
function upsertCard(card){
  const idx = library.findIndex(x=>x.card_id===card.card_id);
  if(idx>=0){
    card.meta.updated_at = nowISO();
    library[idx] = card;
  }else{
    library.unshift(card);
  }
  saveLibrary();
  renderLibrary();
}
function renderLibrary(){
  const q = safeTrim($("q").value).toLowerCase();
  const ft = $("filterType").value;

  const list = $("libraryList");
  list.innerHTML = "";

  const filtered = library.filter(c=>{
    if(ft && c.card_type!==ft) return false;
    if(!q) return true;
    const hay = [
      c.card_name, c.card_type, c.card_series, c.core_energy,
      (c.meta?.tags||[]).join(" "),
      c.element, c.alignment, c.rarity
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if(filtered.length===0){
    list.innerHTML = `<div class="muted small">אין תוצאות. צור קלף חדש או החלף חיפוש.</div>`;
    return;
  }

  filtered.forEach(c=>{
    const div = document.createElement("div");
    div.className = "item" + (c.card_id===activeId ? " active" : "");
    div.onclick = ()=> loadToForm(c.card_id);
    div.innerHTML = `
      <div>
        <b>🃏 ${c.card_name || "Unnamed"}</b>
        <small>🧩 ${c.card_type} • 🗂️ ${c.card_series || "—"} • ⚡ ${c.core_energy || "—"}</small><br/>
        <small class="muted">🆔 ${c.card_id} • v${c.meta?.version || "1.0"}</small>
      </div>
      <div class="badge">${c.rarity || "—"}</div>
    `;
    list.appendChild(div);
  });
}

function loadToForm(id){
  const c = library.find(x=>x.card_id===id);
  if(!c) return;

  activeId = c.card_id;
  localStorage.setItem(K_ACTIVE, activeId);

  // Basic
  $("card_id").value = c.card_id || "";
  $("card_series").value = c.card_series || "";
  $("card_type").value = c.card_type || "Character";
  $("card_name").value = c.card_name || "";
  $("card_alias").value = c.card_alias || "";
  $("element").value = c.element || "";
  $("rarity").value = c.rarity || "Legendary";
  $("alignment").value = c.alignment || "";
  $("core_energy").value = c.core_energy || "";

  // Lore
  $("lore_description").value = c.lore?.description || "";
  $("personality").value = c.lore?.personality || "";
  $("role").value = c.lore?.role || "";
  $("world_context").value = c.lore?.world_context || "";

  // Activation / interaction
  $("trigger").value = c.activation?.trigger || "";
  $("effect").value = c.activation?.effect || "";
  $("first_message").value = c.interaction?.first_message || c.activation?.quote || "";
  $("dialogue_style").value = c.interaction?.dialogue_style || "";
  $("dialogue_examples").value = (c.interaction?.dialogue_examples || []).join("\n");

  // Abilities
  abilities = Array.isArray(c.abilities) ? c.abilities.map(x=>({...x})) : [];

  // Visual
  $("outfit").value = c.visual_style?.outfit || "";
  $("aura").value = c.visual_style?.aura || "";
  $("pal1").value = c.visual_style?.color_palette?.[0] || "";
  $("pal2").value = c.visual_style?.color_palette?.[1] || "";
  $("pal3").value = c.visual_style?.color_palette?.[2] || "";
  $("art_prompt").value = c.visual_style?.art_prompt || "";

  // Meta
  $("tags").value = (c.meta?.tags || []).join(", ");
  $("version").value = c.meta?.version || "1.0";
  $("changelog").value = c.meta?.changelog || "";

  refreshJSONLive();
  renderLibrary();
  toast("🧠 נטען לעריכה");
}

/* ---------- Templates ---------- */
const TEMPLATES = [
  {
    name: "⚡ Leon • Cyber-Mystic Conductor",
    data: {
      card_series:"Holly Trap Flow",
      card_type:"Character",
      card_name:"Leon Yaakobov",
      card_alias:"The Conductor of Light",
      element:"Electric / Light",
      rarity:"Legendary",
      alignment:"Light-Tech",
      core_energy:"Holly Trap Flow",
      lore_description:"Leon is the embodiment of mystic energy and futuristic design. Cloaked in cybernetic robes laced with pulsating light wires, his presence activates the Holly Trap Flow—an electrical current said to open dimensional gates of light.",
      personality:"Mysterious and enlightened",
      role:"Conductor & Guardian of the Light Gates",
      world_context:"In a shattered world where light and energy are worshipped, Leon appears to those lost in the dark and guides them through the Light Gates.",
      trigger:"User enters darkness / seeks guidance",
      effect:"Opens Light Gates",
      first_message:"Welcome To Holly Trap",
      dialogue_style:"Riddles + futuristic logic",
      dialogue_examples:"Your signal… it pulses in sync with the Holly Trap.\nThe Light Gates have chosen you.\nStep forward. The threshold reacts to your presence.",
      outfit:"Cybernetic robes with pulsating light wires",
      aura:"Electric glow, light circuits",
      pal1:"Neon Blue",
      pal2:"Electric Gold",
      pal3:"Deep Black",
      tags:"Fantasy, Sci-Fi, SFW, Cyber-Mystic",
      version:"1.0",
      changelog:"Initial template load"
    },
    abilities: [
      {name:"Holly Trap Flow", type:"Passive", cost:"0", cooldown:"—", target:"Area", effect:"Activates dimensional light circuits around the chosen one, stabilizing the gate-field."},
      {name:"Gate Conduction", type:"Active", cost:"10 Voltage", cooldown:"12s", target:"Gate", effect:"Opens a Light Gate path and guides the user through the threshold without collapse."}
    ]
  },
  {
    name:"🚪 Gate • Light Gate Threshold",
    data:{
      card_series:"Holly Trap Flow",
      card_type:"Gate",
      card_name:"Light Gate Threshold",
      card_alias:"The Luminous Border",
      element:"Light",
      rarity:"Epic",
      alignment:"Light-Tech",
      core_energy:"Threshold Resonance",
      lore_description:"A living border between worlds. It reacts to intention and frequency — not to force.",
      personality:"Silent, reactive, sacred-tech",
      role:"Dimensional checkpoint",
      world_context:"When the world fractures, gates become religions. Some open only for the chosen signal.",
      trigger:"Signal aligns with Resonance",
      effect:"Opens path / repels corruption",
      first_message:"The Light Gate is listening…",
      dialogue_style:"Short, sacred, technical",
      dialogue_examples:"Alignment detected.\nResonance rising.\nProceed with intent.",
      outfit:"—",
      aura:"Prismatic halo",
      pal1:"Prism White",
      pal2:"Holo Gold",
      pal3:"Void Black",
      tags:"Gate, Light, Sci-Fi, Mystic",
      version:"1.0",
      changelog:"Gate template"
    },
    abilities:[
      {name:"Resonance Scan", type:"Passive", cost:"0", cooldown:"—", target:"Self", effect:"Continuously checks alignment and blocks hostile frequencies."},
      {name:"Prism Passage", type:"Active", cost:"1 Charge", cooldown:"1 turn", target:"Ally", effect:"Allows a single safe crossing while sealing behind."}
    ]
  },
  {
    name:"🧠 State • Hyper Focus Circuit",
    data:{
      card_series:"Holly Trap Flow",
      card_type:"State",
      card_name:"Hyper Focus Circuit",
      card_alias:"Mind as a Circuit",
      element:"Electric / Mind",
      rarity:"Rare",
      alignment:"Tech-Ascension",
      core_energy:"Cognitive Voltage",
      lore_description:"A state where attention becomes a laser. Noise drops. Signal becomes destiny.",
      personality:"Cold clarity, sacred precision",
      role:"Focus amplifier",
      world_context:"In the ruins, the one who controls attention controls reality.",
      trigger:"User enters mission mode",
      effect:"Boost precision / reduce distraction",
      first_message:"Noise lowered. Signal locked.",
      dialogue_style:"Minimal, surgical, rhythmic",
      dialogue_examples:"Lock target.\nReduce noise.\nExecute flow.",
      outfit:"—",
      aura:"Electric ring around the head",
      pal1:"Ice Cyan",
      pal2:"Violet Pulse",
      pal3:"Graphite",
      tags:"State, Focus, Cyber",
      version:"1.0",
      changelog:"State template"
    },
    abilities:[
      {name:"Signal Lock", type:"Active", cost:"5 Voltage", cooldown:"8s", target:"Self", effect:"Boosts accuracy and decision speed while reducing distraction."},
      {name:"Noise Cancel", type:"Passive", cost:"0", cooldown:"—", target:"Self", effect:"Filters distractions and keeps the core path stable."}
    ]
  },
  {
    name:"🔥 Power • Solar Flare Battery",
    data:{
      card_series:"Holly Trap Flow",
      card_type:"Power",
      card_name:"Solar Flare Battery",
      card_alias:"Pocket Star Core",
      element:"Solar Plasma",
      rarity:"Epic",
      alignment:"Light-Tech",
      core_energy:"Condensed Sunlight",
      lore_description:"A handheld star-core that stores violent sunlight and releases it in precise arcs.",
      personality:"Impatient, radiant, loyal to its bearer",
      role:"Energy amplifier",
      world_context:"Built from remnants of pre-collapse satellites; worshipped by light-clans as a relic.",
      trigger:"Direct exposure to sunlight / holy chants",
      effect:"Releases concentrated sun beams or recharges allies",
      first_message:"Charge accepted. Solar veins glowing.",
      dialogue_style:"Short, hot, pulsing",
      dialogue_examples:"Heat rising.\nReady to vent flares.\nAim me at the darkness.",
      outfit:"—",
      aura:"Radiant corona rings around the wielder",
      pal1:"Solar Gold",
      pal2:"Flare Orange",
      pal3:"Void Indigo",
      tags:"Power, Solar, Tech, SFW",
      art_prompt:"Glowing sci-fi battery holding a small sun, floating runes, space backdrop",
      version:"1.0",
      changelog:"Added solar power template"
    },
    abilities:[
      {name:"Sunburst Pulse", type:"Active", cost:"3 Charges", cooldown:"10s", target:"Line", effect:"Fires a blinding solar beam that cauterizes corruption."},
      {name:"Radiant Recharge", type:"Support", cost:"1 Charge", cooldown:"5s", target:"Ally", effect:"Instantly restores core_energy to allies and ignites their weapons."}
    ]
  },
  {
    name:"🛡️ Artifact • Prism Aegis",
    data:{
      card_series:"Holly Trap Flow",
      card_type:"Artifact",
      card_name:"Prism Aegis",
      card_alias:"Mirror Shield of Resonance",
      element:"Light / Crystal",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Resonant Refraction",
      lore_description:"A shield forged from dimensional crystal, splitting attacks into harmless light.",
      personality:"Stoic guardian, analytical",
      role:"Defense & reflection",
      world_context:"Carried by gatekeepers who stand at the borders between timelines.",
      trigger:"Incoming projectile or curse",
      effect:"Splits, reflects, or stores energy",
      first_message:"Angle locked. Refracting threat.",
      dialogue_style:"Calm, calculated, geometric metaphors",
      dialogue_examples:"Trajectory mapped.\nReflection ready.\nHold position.",
      outfit:"—",
      aura:"Prismatic shards swirling",
      pal1:"Crystal Cyan",
      pal2:"Holo Pink",
      pal3:"Deep Navy",
      tags:"Artifact, Shield, Light",
      art_prompt:"Prismatic energy shield with floating shards, defensive stance, cosmic background",
      version:"1.0",
      changelog:"New artifact template"
    },
    abilities:[
      {name:"Refraction Wall", type:"Active", cost:"2 Charges", cooldown:"12s", target:"Self", effect:"Creates a barrier that splits incoming damage into harmless light particles."},
      {name:"Mirror Return", type:"Reactive", cost:"1 Charge", cooldown:"—", target:"Attacker", effect:"Reflects a portion of the attack back with amplified purity damage."}
    ]
  },
  {
    name:"🌙 Character • Luna Runeweaver",
    data:{
      card_series:"Moonlit Protocol",
      card_type:"Character",
      card_name:"Luna Runeweaver",
      card_alias:"Architect of Night Glyphs",
      element:"Moonlight / Ink",
      rarity:"Mythic",
      alignment:"Neutral Mystic",
      core_energy:"Lunar Scripts",
      lore_description:"She writes glowing runes in midair that bend emotions and gravity.",
      personality:"Quiet, poetic, cunning",
      role:"Control mage",
      world_context:"In nocturnal cities she tags runes on rooftops that decide which dreams manifest.",
      trigger:"Nightfall or eclipse",
      effect:"Summons protective glyphs and dream portals",
      first_message:"The ink listens to the moon.",
      dialogue_style:"Soft, metaphorical, short verses",
      dialogue_examples:"One stroke to silence.\nTwo strokes to open.\nStay still, the rune is breathing.",
      outfit:"Dark streetwear with glowing ink veins",
      aura:"Silver particles orbiting like moons",
      pal1:"Moon Silver",
      pal2:"Ink Black",
      pal3:"Lavender Mist",
      tags:"Character, Mystic, Urban",
      art_prompt:"Cyberpunk sorceress painting runes with moonlit ink, rooftops, night sky",
      version:"1.0",
      changelog:"Moon mage template"
    },
    abilities:[
      {name:"Ink Gravity", type:"Active", cost:"8 Focus", cooldown:"10s", target:"Zone", effect:"Creates a heavy moon rune that slows and grounds enemies."},
      {name:"Dream Sigil", type:"Support", cost:"5 Focus", cooldown:"15s", target:"Ally", effect:"Places a rune that absorbs fear and converts it into shield points."}
    ]
  },
  {
    name:"🌊 State • Tidal Trance",
    data:{
      card_series:"Aqua Flux",
      card_type:"State",
      card_name:"Tidal Trance",
      card_alias:"Mind Like Water",
      element:"Water / Mind",
      rarity:"Rare",
      alignment:"Flow",
      core_energy:"Liquid Focus",
      lore_description:"Meditative state where thoughts move like waves and enemies drown in silence.",
      personality:"Calm, reflective, relentless",
      role:"Crowd control field",
      world_context:"Used by river monks who defend data-stream temples.",
      trigger:"Deep breath + mantra",
      effect:"Floods the area with hypnotic ripples",
      first_message:"Inhale tide. Exhale storm.",
      dialogue_style:"Minimal, flowing, patient",
      dialogue_examples:"Let it flow.\nSink into stillness.\nWaves remember.",
      outfit:"—",
      aura:"Liquid halo and water droplets suspended",
      pal1:"Azure",
      pal2:"Seafoam",
      pal3:"Midnight Blue",
      tags:"State, Water, Calm",
      art_prompt:"Meditative silhouette under crashing waves, glowing ripples, tranquil yet powerful",
      version:"1.0",
      changelog:"Water state template"
    },
    abilities:[
      {name:"Undertow", type:"Active", cost:"6 Flow", cooldown:"9s", target:"Enemies", effect:"Pulls foes toward the center of the ripple and dampens their abilities."},
      {name:"Calming Current", type:"Support", cost:"4 Flow", cooldown:"6s", target:"Allies", effect:"Removes fear effects and increases clarity."}
    ]
  },
  {
    name:"🌪️ Power • Tempest Surge",
    data:{
      card_series:"Storm Thread",
      card_type:"Power",
      card_name:"Tempest Surge",
      card_alias:"Storm Thread Conduit",
      element:"Wind / Thunder",
      rarity:"Epic",
      alignment:"Chaos-Tech",
      core_energy:"Cyclone Current",
      lore_description:"A coil that summons micro-storms and threads lightning into the battlefield.",
      personality:"Loud, daring, impulsive",
      role:"Area disruption",
      world_context:"Used by sky pirates who ride jet kites over ruined cities.",
      trigger:"Rapid spin or shouted command",
      effect:"Unleashes tornado darts and chained lightning",
      first_message:"Whip the sky with me!",
      dialogue_style:"Brash, energetic, musical",
      dialogue_examples:"Spin faster!\nHear the drum of thunder!\nWe break the air open.",
      outfit:"—",
      aura:"Spiraling wind glyphs",
      pal1:"Storm Teal",
      pal2:"Neon Yellow",
      pal3:"Charcoal",
      tags:"Power, Storm, Punk",
      art_prompt:"Tech coil emitting tornado and lightning, punk aesthetic, sky backdrop",
      version:"1.0",
      changelog:"Storm power template"
    },
    abilities:[
      {name:"Chain Cyclone", type:"Active", cost:"7 Charge", cooldown:"10s", target:"Area", effect:"Launches a twisting storm that lifts targets and shocks them."},
      {name:"Static Rhythm", type:"Passive", cost:"0", cooldown:"—", target:"Self", effect:"Generates charge each time wind speed changes around the wielder."}
    ]
  },
  {
    name:"🎭 Character • Masked Oracle",
    data:{
      card_series:"Veil Market",
      card_type:"Character",
      card_name:"Masked Oracle",
      card_alias:"Dealer of Futures",
      element:"Smoke / Fate",
      rarity:"Legendary",
      alignment:"Neutral",
      core_energy:"Fortune Threads",
      lore_description:"A fortune teller who trades secrets for destinies, wearing shifting masks.",
      personality:"Playful, unsettling, omniscient",
      role:"Support / debuff",
      world_context:"Appears in bazaars at dusk offering glimpses of possible endings.",
      trigger:"A deal is struck",
      effect:"Reveals outcomes, twists luck",
      first_message:"What ending do you buy?",
      dialogue_style:"Riddles, playful threats",
      dialogue_examples:"Luck is a coin.\nHeads? Or heads?\nMasks hear more than mouths.",
      outfit:"Layered robes with multiple theatrical masks",
      aura:"Smoke ribbons forming symbols",
      pal1:"Ash Grey",
      pal2:"Gilded Bronze",
      pal3:"Wine Red",
      tags:"Character, Support, Fate",
      art_prompt:"Fortune teller with floating masks and smoke, neon bazaar lights, mysterious",
      version:"1.0",
      changelog:"Oracle template"
    },
    abilities:[
      {name:"Twist Fate", type:"Active", cost:"5 Secrets", cooldown:"12s", target:"Enemy", effect:"Flips the target's next success into failure."},
      {name:"Contract Smoke", type:"Support", cost:"3 Secrets", cooldown:"8s", target:"Ally", effect:"Shrouds an ally, making them untargetable for a brief time."}
    ]
  },
  {
    name:"🧪 Artifact • Quantum Vial",
    data:{
      card_series:"Labyrinth Labs",
      card_type:"Artifact",
      card_name:"Quantum Vial",
      card_alias:"Bottled Possibility",
      element:"Quantum",
      rarity:"Epic",
      alignment:"Sci-Mystic",
      core_energy:"Collapsed Probabilities",
      lore_description:"A vial containing liquid probability that can rewrite a moment.",
      personality:"Curious, volatile",
      role:"Utility item",
      world_context:"Created by rogue physicists who stole moments from parallel labs.",
      trigger:"Glass is tapped three times",
      effect:"Chooses the best possible outcome within a small window",
      first_message:"Options recalculated.",
      dialogue_style:"Scientific, quick whispers",
      dialogue_examples:"Collapse here.\nSwap outcomes.\nTry again, but better.",
      outfit:"—",
      aura:"Glowing formula symbols around the vial",
      pal1:"Iridescent Blue",
      pal2:"Magenta",
      pal3:"Slate",
      tags:"Artifact, Science, Luck",
      art_prompt:"Glass vial with swirling multiverse liquid, lab background, sci-fantasy",
      version:"1.0",
      changelog:"Quantum artifact template"
    },
    abilities:[
      {name:"Probability Swap", type:"Active", cost:"1 Drop", cooldown:"10s", target:"Event", effect:"Rerolls a recent event with a favorable bias."},
      {name:"Backup Moment", type:"Passive", cost:"0", cooldown:"—", target:"Self", effect:"Stores a single moment to revert minor damage or status."}
    ]
  },
  {
    name:"🌿 Gate • Verdant Spiral",
    data:{
      card_series:"Green Pulse",
      card_type:"Gate",
      card_name:"Verdant Spiral",
      card_alias:"Garden Between Worlds",
      element:"Nature",
      rarity:"Rare",
      alignment:"Growth",
      core_energy:"Photosynth Wave",
      lore_description:"A living gate made of braided roots and bio-luminescent leaves.",
      personality:"Gentle, ancient, curious",
      role:"Portal and healing node",
      world_context:"Sprouts wherever ecosystems cry out; links forests across timelines.",
      trigger:"Chant of growth or blood offering",
      effect:"Opens pathways and heals soil",
      first_message:"Roots remember your steps.",
      dialogue_style:"Whispering forest voice",
      dialogue_examples:"Breathe green.\nCome through softly.\nDo not break the moss.",
      outfit:"—",
      aura:"Glowing pollen spiral",
      pal1:"Emerald",
      pal2:"Lime",
      pal3:"Amber",
      tags:"Gate, Nature, Healing",
      art_prompt:"Spiral wooden portal covered in moss and glowing flowers, dreamy forest",
      version:"1.0",
      changelog:"Nature gate template"
    },
    abilities:[
      {name:"Bloom Passage", type:"Active", cost:"2 Sap", cooldown:"1 turn", target:"Ally", effect:"Opens a verdant doorway that restores health as allies cross."},
      {name:"Root Snare", type:"Reactive", cost:"1 Sap", cooldown:"8s", target:"Enemy", effect:"Roots erupt to immobilize those who would harm the gate."}
    ]
  },
  {
    name:"🛰️ Character • Orbital Ranger",
    data:{
      card_series:"Sky Relay",
      card_type:"Character",
      card_name:"Orbital Ranger",
      card_alias:"Telemetric Hunter",
      element:"Vacuum / Steel",
      rarity:"Epic",
      alignment:"Tech",
      core_energy:"Satellite Lock",
      lore_description:"A scout linked to a web of micro-satellites, shooting rail-light spears.",
      personality:"Disciplined, data-driven",
      role:"Sniper / tracker",
      world_context:"Guards the orbital debris belts and keeps pirate skiffs away from the old stations.",
      trigger:"Target pinged by satellite",
      effect:"Fires orbital strikes and tags positions",
      first_message:"Telemetry received. Lining up shot.",
      dialogue_style:"Precise, military, clipped",
      dialogue_examples:"Target locked.\nWind: none. Vacuum: perfect.\nRelease in 3...", 
      outfit:"Exo-suit with antenna fins and visor",
      aura:"Orbiting micro-drones",
      pal1:"Steel Grey",
      pal2:"Neon Cyan",
      pal3:"Signal Green",
      tags:"Character, Tech, Sniper",
      art_prompt:"Space ranger with visor aiming railgun, satellites visible, sleek exo-suit",
      version:"1.0",
      changelog:"Tech ranger template"
    },
    abilities:[
      {name:"Orbital Spear", type:"Active", cost:"1 Lock", cooldown:"6s", target:"Single", effect:"Calls a light-speed spear from orbit to pierce armor."},
      {name:"Tracker Net", type:"Utility", cost:"2 Locks", cooldown:"12s", target:"Area", effect:"Deploys drones that reveal and mark enemies."}
    ]
  },
  {
    name:"🧊 State • Crystal Stillness",
    data:{
      card_series:"Frost Signal",
      card_type:"State",
      card_name:"Crystal Stillness",
      card_alias:"Frozen Decision",
      element:"Ice",
      rarity:"Uncommon",
      alignment:"Order",
      core_energy:"Absolute Zero",
      lore_description:"Mind slows time internally, letting the user act with impossible precision.",
      personality:"Detached, focused",
      role:"Control / precision",
      world_context:"Taught by glacier monks who hear the heartbeat of icebergs.",
      trigger:"Breath held until pulse is heard",
      effect:"Slows perception of battle to a crawl",
      first_message:"Silence the heat. Sculpt the moment.",
      dialogue_style:"Sparse, cold, exact",
      dialogue_examples:"One move only.\nFreeze the noise.\nCut along the crack.",
      outfit:"—",
      aura:"Floating ice shards and mist",
      pal1:"Frost Blue",
      pal2:"White",
      pal3:"Steel",
      tags:"State, Ice, Focus",
      art_prompt:"Person meditating with floating ice shards, time-slow effect, cold light",
      version:"1.0",
      changelog:"Ice focus template"
    },
    abilities:[
      {name:"Shatter Point", type:"Active", cost:"4 Chill", cooldown:"8s", target:"Single", effect:"Identifies and strikes the exact weak spot causing heavy true damage."},
      {name:"Glass Calm", type:"Passive", cost:"0", cooldown:"—", target:"Self", effect:"Immune to panic and haste effects while state is active."}
    ]
  },
  {
    name:"🧲 Power • Gravity Anchor",
    data:{
      card_series:"Deep Core",
      card_type:"Power",
      card_name:"Gravity Anchor",
      card_alias:"Singularity Nail",
      element:"Gravity",
      rarity:"Rare",
      alignment:"Earth-Tech",
      core_energy:"Mini Black Hole",
      lore_description:"A spike that pins reality, preventing movement or teleportation in its field.",
      personality:"Heavy, serious",
      role:"Area denial",
      world_context:"Used to stabilize collapsing tunnels and trap phasing beasts.",
      trigger:"Driven into ground",
      effect:"Generates gravity well",
      first_message:"Space locked. Run if you can.",
      dialogue_style:"Deadpan, laconic",
      dialogue_examples:"Hold still.\nWeight is truth.\nJump? I think not.",
      outfit:"—",
      aura:"Rings of compressed space",
      pal1:"Obsidian",
      pal2:"Iron",
      pal3:"Amber Sparks",
      tags:"Power, Gravity, Control",
      art_prompt:"Heavy spike with swirling gravity rings pinning the ground, sci-fi canyon",
      version:"1.0",
      changelog:"Gravity power template"
    },
    abilities:[
      {name:"Event Lock", type:"Active", cost:"2 Core", cooldown:"14s", target:"Area", effect:"Prevents teleportation and flight while slowing movement."},
      {name:"Weight Transfer", type:"Support", cost:"1 Core", cooldown:"7s", target:"Ally", effect:"Lends mass to an ally's attack causing it to crush defenses."}
    ]
  },
  {
    name:"🕯️ Artifact • Ember Lantern",
    data:{
      card_series:"Ashen Roads",
      card_type:"Artifact",
      card_name:"Ember Lantern",
      card_alias:"Warden of Lost Paths",
      element:"Fire / Spirit",
      rarity:"Uncommon",
      alignment:"Guide",
      core_energy:"Soul Flame",
      lore_description:"A lantern carried by wanderers; its flame reveals hidden memories.",
      personality:"Warm, protective",
      role:"Detection / healing",
      world_context:"Legends say its light keeps ghosts polite on the Ashen Roads.",
      trigger:"Lantern is swung in circle",
      effect:"Reveals invisible threats and calms spirits",
      first_message:"Stay close. The flame knows the way.",
      dialogue_style:"Comforting, storytelling",
      dialogue_examples:"Light for the lost.\nNo shade can trick us.\nHold the handle, feel the song.",
      outfit:"—",
      aura:"Soft ember sparks trailing",
      pal1:"Amber",
      pal2:"Coal Black",
      pal3:"Warm White",
      tags:"Artifact, Support, Fire",
      art_prompt:"Old lantern with ember flame emitting spirit wisps, dark road background",
      version:"1.0",
      changelog:"Lantern template"
    },
    abilities:[
      {name:"Reveal Shade", type:"Active", cost:"2 Ember", cooldown:"9s", target:"Area", effect:"Exposes invisible or phased entities and weakens them."},
      {name:"Story Heat", type:"Support", cost:"1 Ember", cooldown:"—", target:"Allies", effect:"Slowly heals allies standing near the lantern's glow."}
    ]
  },
  {
    name:"🎨 Character • Neon Graffiti Spirit",
    data:{
      card_series:"Street Myth",
      card_type:"Character",
      card_name:"Neon Graffiti Spirit",
      card_alias:"Wall Whisper",
      element:"Color / Sound",
      rarity:"Epic",
      alignment:"Rebel",
      core_energy:"Spray Pulse",
      lore_description:"An urban spirit that jumps between murals, turning paint into portals.",
      personality:"Playful, rebellious",
      role:"Mobility / illusions",
      world_context:"Born from decades of protest art and late-night beats.",
      trigger:"Tagging a wall with their sigil",
      effect:"Animates graffiti creatures and creates escape paths",
      first_message:"Walls talk back tonight.",
      dialogue_style:"Rhythmic slang, musical",
      dialogue_examples:"Pop the cap.\nBeat drops, colors run.\nSlip through the mural.",
      outfit:"Hoodie with glowing spray nozzles",
      aura:"Paint splashes that hover",
      pal1:"Neon Magenta",
      pal2:"Turquoise",
      pal3:"Midnight Purple",
      tags:"Character, Urban, Illusion",
      art_prompt:"Ghostly graffiti artist emerging from neon mural, paint splashes, boombox vibes",
      version:"1.0",
      changelog:"Graffiti spirit template"
    },
    abilities:[
      {name:"Mural Gate", type:"Active", cost:"1 Can", cooldown:"10s", target:"Surface", effect:"Opens a portal through any painted wall."},
      {name:"Chromatic Doppel", type:"Illusion", cost:"2 Cans", cooldown:"12s", target:"Self", effect:"Creates painted clones that confuse trackers."}
    ]
  },
  {
    name:"⚙️ Gate • Clockwork Door",
    data:{
      card_series:"Time Forge",
      card_type:"Gate",
      card_name:"Clockwork Door",
      card_alias:"Gearway",
      element:"Time / Metal",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Chrono Tension",
      lore_description:"A doorway of interlocking gears that opens to precise timelines only.",
      personality:"Punctual, strict",
      role:"Temporal travel",
      world_context:"Used by archivists to visit moments without disrupting causality.",
      trigger:"Correct timecode entered",
      effect:"Opens corridor to scheduled past/future",
      first_message:"Tick. Tock. Access granted?",
      dialogue_style:"Mechanical, concise",
      dialogue_examples:"Time slot verified.\nUnauthorized entry denied.\nLubricate the hinge of fate.",
      outfit:"—",
      aura:"Floating clock hands and sparks",
      pal1:"Brass",
      pal2:"Silver",
      pal3:"Teal Glow",
      tags:"Gate, Time, Metal",
      art_prompt:"Mechanical door with gears and clock hands, glowing timeline corridor",
      version:"1.0",
      changelog:"Clock gate template"
    },
    abilities:[
      {name:"Scheduled Entry", type:"Utility", cost:"2 Ticks", cooldown:"—", target:"Party", effect:"Allows allies to step into a precise timestamp safely."},
      {name:"Temporal Lock", type:"Reactive", cost:"1 Tick", cooldown:"10s", target:"Enemy", effect:"Freezes an enemy's cooldowns briefly as gears jam their timeline."}
    ]
  },
  {
    name:"🌀 State • Dream Loop",
    data:{
      card_series:"REM Circuit",
      card_type:"State",
      card_name:"Dream Loop",
      card_alias:"Lucid Circuit",
      element:"Mind / Ether",
      rarity:"Epic",
      alignment:"Neutral",
      core_energy:"REM Current",
      lore_description:"A trance where the user controls overlapping dreams to rewrite reality cues.",
      personality:"Creative, eerie",
      role:"Illusion / control",
      world_context:"Used by sleepers who defend the city while their bodies rest in capsules.",
      trigger:"Closed eyes + heartbeat sync",
      effect:"Overlays dream logic onto the real world",
      first_message:"Stay asleep. I will edit the scene.",
      dialogue_style:"Soft, surreal",
      dialogue_examples:"You forgot this fear.\nDoors melt open.\nGravity is optional now.",
      outfit:"—",
      aura:"Floating z-shaped sigils and particle trails",
      pal1:"Lilac",
      pal2:"Sky",
      pal3:"Blush",
      tags:"State, Dream, Control",
      art_prompt:"Sleeper surrounded by dreamy holograms, bending reality, pastel neon",
      version:"1.0",
      changelog:"Dream state template"
    },
    abilities:[
      {name:"Lucid Rewrite", type:"Active", cost:"6 REM", cooldown:"12s", target:"Zone", effect:"Changes environment rules for a short duration (gravity, exits, light)."},
      {name:"Sleep Proxy", type:"Support", cost:"4 REM", cooldown:"8s", target:"Ally", effect:"Lets an ally act while their body rests, removing exhaustion debuffs."}
    ]
  },
  /* Leon Yaakobov Saga */
  {
    name:"⚡ Leon • Prime Conductor",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Character",
      card_name:"Leon Yaakobov",
      card_alias:"Prime Conductor",
      element:"Electric / Light",
      rarity:"Legendary",
      alignment:"Light-Tech",
      core_energy:"Holly Trap Flow",
      lore_description:"Leon channels the master signal that keeps every Light Gate in tune across the saga.",
      personality:"Measured, visionary, protective",
      role:"Primary guide of the saga",
      world_context:"Pilgrims seek Leon to synchronize their circuits before traveling between shards.",
      trigger:"Party approaches the Light Gates",
      effect:"Stabilizes portals and uplifts allies",
      first_message:"Follow the tempo; the gates answer rhythm, not fear.",
      dialogue_style:"Calm instructions with musical metaphors",
      dialogue_examples:"Hold the downbeat with me.\\nVoltage rising—stay within the melody.\\nWe cross on the chorus of light.",
      outfit:"Tailored neon coat with fiber-optic trim",
      aura:"Staff of luminous notes tracing sigils",
      pal1:"Ion Blue",
      pal2:"Choir Gold",
      pal3:"Night Purple",
      tags:"Character, Light, Guide",
      art_prompt:"Heroic conductor holding a glowing baton, neon staff lines, sci-fantasy portal",
      version:"1.1",
      changelog:"Leon saga bundle start"
    },
    abilities:[
      {name:"Gate Baton", type:"Active", cost:"8 Voltage", cooldown:"10s", target:"Gate", effect:"Tunes a portal to safe frequency, preventing collapse for two traversals."},
      {name:"Conductor's Rally", type:"Support", cost:"3 Voltage", cooldown:"6s", target:"Allies", effect:"Applies focus and shield based on current rhythm intensity."}
    ]
  },
  {
    name:"🚆 Leon • Light Rail Runner",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Character",
      card_name:"Light Rail Runner",
      card_alias:"Signal Courier",
      element:"Lightning / Steel",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Rail Arc Pulse",
      lore_description:"A high-speed avatar of Leon who delivers upgrades and warnings before storms arrive.",
      personality:"Swift, witty, punctual",
      role:"Messenger and scout",
      world_context:"Light rails thread the floating cities; this runner keeps them synced to Leon's tempo.",
      trigger:"Urgent dispatch ping",
      effect:"Delivers buffs or intercepts sabotage mid-route",
      first_message:"Cargo locked, track hot. Keep up if you can.",
      dialogue_style:"Rapid, clipped, playful",
      dialogue_examples:"Signal clear—accelerating.\\nSaboteur spotted on switch nine.\\nDrop package, hop off, reform at gate.",
      outfit:"Aerodynamic coat with mag-rail boots",
      aura:"Trailing rail sparks and map glyphs",
      pal1:"Rail Silver",
      pal2:"Pulse Yellow",
      pal3:"Deep Navy",
      tags:"Character, Courier, Speed",
      art_prompt:"Futuristic courier sprinting along glowing rails, sparks flying, city backdrop",
      version:"1.1",
      changelog:"Leon mobility card"
    },
    abilities:[
      {name:"Rail Dash", type:"Active", cost:"2 Track", cooldown:"5s", target:"Line", effect:"Move instantly along a rail, leaving a charged trail that allies can follow for speed."},
      {name:"Priority Payload", type:"Support", cost:"1 Track", cooldown:"8s", target:"Ally", effect:"Deliver a consumable buff increasing shield regen and focus."}
    ]
  },
  {
    name:"🛡️ Leon • Prism Baton",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Artifact",
      card_name:"Prism Baton",
      card_alias:"Conductor's Baton",
      element:"Light / Crystal",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Refraction Tempo",
      lore_description:"Leon forges his commands through a baton that splits sound and light into protective patterns.",
      personality:"Stoic, precise",
      role:"Defensive focus tool",
      world_context:"Each strike of the baton etches a harmonic shield over the team before the gate opens.",
      trigger:"Ally is targeted by ranged attack",
      effect:"Reflects or dampens incoming strikes",
      first_message:"Angle and tempo locked. Reflecting threat.",
      dialogue_style:"Measured commands",
      dialogue_examples:"Hold formation.\\nAngle thirty-two degrees.\\nLet the beam split, not pierce.",
      outfit:"—",
      aura:"Holographic staff lines",
      pal1:"Crystal Mint",
      pal2:"Opal White",
      pal3:"Bass Blue",
      tags:"Artifact, Shield, Leon",
      art_prompt:"Glowing prism baton splitting beams, musical notes in light, shield shimmer",
      version:"1.1",
      changelog:"Leon artifact kit"
    },
    abilities:[
      {name:"Refrain Wall", type:"Reactive", cost:"2 Beat", cooldown:"10s", target:"Line", effect:"Creates a curved barrier that converts damage into light notes empowering allies."},
      {name:"Cue Cut", type:"Active", cost:"1 Beat", cooldown:"6s", target:"Projectile", effect:"Slices an incoming shot into harmless ribbons of light."}
    ]
  },
  {
    name:"🌈 Leon • Aurora Crowd Surge",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Aurora Crowd Surge",
      card_alias:"Festival Shield",
      element:"Light / Sound",
      rarity:"Rare",
      alignment:"Unity",
      core_energy:"Chorus Flux",
      lore_description:"Leon amplifies the crowd's chant into a color storm that powers allies and blinds foes.",
      personality:"Uplifting, collaborative",
      role:"Mass support",
      world_context:"During gate festivals, this surge protects pilgrims from shadow raiders.",
      trigger:"Three or more allies chant in sync",
      effect:"Generates shields and stagger pulses",
      first_message:"Voices steady. Paint the sky together.",
      dialogue_style:"Encouraging directives",
      dialogue_examples:"Chorus on two.\\nLift your hands—light follows.\\nTurn fear into color.",
      outfit:"—",
      aura:"Rippled aurora bands",
      pal1:"Coral",
      pal2:"Cyan",
      pal3:"Soft White",
      tags:"Power, Support, Leon",
      art_prompt:"Crowd-sourced aurora shield blooming from conductor, festival vibe",
      version:"1.1",
      changelog:"Leon mass support"
    },
    abilities:[
      {name:"Chorus Shield", type:"Support", cost:"3 Harmony", cooldown:"9s", target:"Allies", effect:"Applies stacking light shields whose strength scales with participating allies."},
      {name:"Color Stagger", type:"Active", cost:"2 Harmony", cooldown:"7s", target:"Area", effect:"Blinds enemies with aurora bands, slowing them and lowering accuracy."}
    ]
  },
  {
    name:"🚪 Leon • Resonance Gatehouse",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Gate",
      card_name:"Resonance Gatehouse",
      card_alias:"Choir Threshold",
      element:"Light",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Harmonic Lattice",
      lore_description:"A ceremonial gate tuned to Leon's key; it rejects corruption unless escorted by his signal.",
      personality:"Dignified, vigilant",
      role:"Controlled entry point",
      world_context:"Pilgrims queue for days to pass through when Leon is present to hold the note.",
      trigger:"Leon or his baton nearby",
      effect:"Filters passage and cleanses toxins",
      first_message:"Present your cadence. The gate listens.",
      dialogue_style:"Formal, melodic",
      dialogue_examples:"Your pitch wavers—steady it.\\nCorruption detected, rerouting.\\nGatehouse open; step with care.",
      outfit:"—",
      aura:"Rotating choir rings",
      pal1:"Ivory",
      pal2:"Gold",
      pal3:"Teal",
      tags:"Gate, Leon, Cleanse",
      art_prompt:"Monumental light gate with choir rings, conductor silhouette, sacred tech",
      version:"1.1",
      changelog:"Leon gate anchor"
    },
    abilities:[
      {name:"Pure Passage", type:"Active", cost:"2 Lattice", cooldown:"1 turn", target:"Ally", effect:"Allows an ally to cross while removing negative status and corruption."},
      {name:"Dissonance Lock", type:"Reactive", cost:"1 Lattice", cooldown:"10s", target:"Enemy", effect:"Seals the gate on foes emitting hostile frequencies."}
    ]
  },
  {
    name:"🧠 Leon • Hyper Focus Choir",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"State",
      card_name:"Hyper Focus Choir",
      card_alias:"Signal Meditation",
      element:"Mind / Light",
      rarity:"Rare",
      alignment:"Discipline",
      core_energy:"Choir Logic",
      lore_description:"Leon trains teams to breathe in rhythm until their minds lock into crystal clarity.",
      personality:"Patient, demanding",
      role:"Preparation state",
      world_context:"Used before difficult gate crossings or negotiations with light-clans.",
      trigger:"Three deep breaths in Leon's timing",
      effect:"Boosts precision and resistance to fear",
      first_message:"Match the inhale. Silence the static.",
      dialogue_style:"Soft commands",
      dialogue_examples:"Again—hold on four.\\nStatic cleared.\\nNow speak; the gate hears you.",
      outfit:"—",
      aura:"Thin halos over each ally",
      pal1:"Pale Blue",
      pal2:"Silver",
      pal3:"Rose",
      tags:"State, Focus, Leon",
      art_prompt:"Group meditating with conductor guiding, thin halos, neon calm",
      version:"1.1",
      changelog:"Leon focus tool"
    },
    abilities:[
      {name:"Breath Sync", type:"Support", cost:"1 Pulse", cooldown:"6s", target:"Allies", effect:"Aligns party focus, granting critical chance and reducing incoming panic effects."},
      {name:"Static Purge", type:"Active", cost:"2 Pulse", cooldown:"8s", target:"Area", effect:"Disperses mental clutter, revealing hidden traps and illusions."}
    ]
  },
  {
    name:"🎛️ Leon • Studio Console",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Artifact",
      card_name:"Leon Studio Console",
      card_alias:"Signal Board",
      element:"Tech / Light",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Mixwave Flux",
      lore_description:"A mobile console Leon uses to layer defensive and offensive tracks mid-mission.",
      personality:"Analytical, responsive",
      role:"Battlefield control",
      world_context:"Sets up backstage to modulate gates, shields, and ally comms.",
      trigger:"Mission begins or encounter starts",
      effect:"Deploys mix nodes that alter the fight tempo",
      first_message:"Console live. Routing channels.",
      dialogue_style:"Technical callouts",
      dialogue_examples:"Channel two to shields.\\nDrop bassline for morale.\\nCut noise on enemy scanners.",
      outfit:"—",
      aura:"Floating sliders and holo-meters",
      pal1:"Slate",
      pal2:"Neon Lime",
      pal3:"Amber",
      tags:"Artifact, Tech, Control",
      art_prompt:"Holographic mixing board with light cables, conductor adjusting sliders",
      version:"1.1",
      changelog:"Leon control gear"
    },
    abilities:[
      {name:"Shield Mix", type:"Support", cost:"3 Tracks", cooldown:"9s", target:"Area", effect:"Deploys resonant nodes granting shield regen and dampening enemy damage."},
      {name:"Feedback Spike", type:"Active", cost:"2 Tracks", cooldown:"7s", target:"Enemy", effect:"Overloads hostile comms causing brief stun and vulnerability."}
    ]
  },
  {
    name:"🌅 Leon • Dawn Battery",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Dawn Battery",
      card_alias:"Sunrise Capacitor",
      element:"Solar / Light",
      rarity:"Epic",
      alignment:"Light-Tech",
      core_energy:"Morning Charge",
      lore_description:"A battery Leon crafted to capture first light and feed it into long missions.",
      personality:"Warm, encouraging",
      role:"Energy reserve",
      world_context:"Teams slot Dawn Batteries into rail hubs to keep the gates humming at dawn.",
      trigger:"Exposed to sunrise or choir chant",
      effect:"Stores charge and releases bursts",
      first_message:"Sunrise captured. Who needs a refill?",
      dialogue_style:"Casual confidence",
      dialogue_examples:"Hold steady—charging.\\nTake a sip of dawn.\\nI'll vent if the dark creeps too close.",
      outfit:"—",
      aura:"Soft glow with solar flares",
      pal1:"Gold",
      pal2:"Peach",
      pal3:"Plum",
      tags:"Power, Energy, Leon",
      art_prompt:"Compact glowing battery absorbing sunrise, cables ready, futuristic casing",
      version:"1.1",
      changelog:"Leon resource card"
    },
    abilities:[
      {name:"Morning Surge", type:"Support", cost:"1 Charge", cooldown:"5s", target:"Ally", effect:"Instantly restores core_energy and grants brief haste."},
      {name:"Radiant Vent", type:"Active", cost:"2 Charge", cooldown:"9s", target:"Cone", effect:"Releases stored dawn energy in a blinding cone that burns corruption."}
    ]
  },
  {
    name:"🛰️ Leon • Skyline Guardian",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Character",
      card_name:"Skyline Guardian",
      card_alias:"Tower Watcher",
      element:"Light / Steel",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Aerial Beacon",
      lore_description:"Sentinels appointed by Leon to watch the skylines and signal when raiders approach.",
      personality:"Alert, disciplined",
      role:"Lookout and defender",
      world_context:"Every floating district trusts a guardian to light the beacon if darkness rises.",
      trigger:"Enemy presence near settlements",
      effect:"Marks threats and guides ally fire",
      first_message:"Beacon primed. Eyes on horizon.",
      dialogue_style:"Short tactical calls",
      dialogue_examples:"Marking four hostiles.\\nChanneling the beam.\\nClear lane two for artillery.",
      outfit:"Armored cloak with beacon projector",
      aura:"Rotating warning light",
      pal1:"Steel",
      pal2:"Warning Amber",
      pal3:"Sky",
      tags:"Character, Sentinel, Leon",
      art_prompt:"Armored lookout on tower with glowing beacon, city skyline, sci-fantasy",
      version:"1.1",
      changelog:"Leon sentinel card"
    },
    abilities:[
      {name:"Beacon Mark", type:"Active", cost:"2 Signal", cooldown:"7s", target:"Enemy", effect:"Marks a target increasing ally accuracy and revealing cloaked foes."},
      {name:"Sky Shield", type:"Reactive", cost:"1 Signal", cooldown:"10s", target:"Area", effect:"Projects a protective dome blocking aerial projectiles."}
    ]
  },
  {
    name:"🎇 Leon • Beacon Overdrive",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Beacon Overdrive",
      card_alias:"Flare Cascade",
      element:"Light",
      rarity:"Rare",
      alignment:"Courage",
      core_energy:"Beacon Fuel",
      lore_description:"An overclock routine Leon shares with guardians to turn warning beacons into weapons.",
      personality:"Brash, decisive",
      role:"Area denial",
      world_context:"When raiders swarm, overdriven beacons scorch the sky and rally defenders.",
      trigger:"Guardian domes hold the line",
      effect:"Converts signal towers into burning flares",
      first_message:"Beacon to eleven. Light them up.",
      dialogue_style:"Commanding hype",
      dialogue_examples:"No more warnings—just heat.\\nStack the beams.\\nPaint the clouds with their retreat.",
      outfit:"—",
      aura:"Intense flare rings",
      pal1:"Flare Orange",
      pal2:"White",
      pal3:"Smoke Grey",
      tags:"Power, Leon, Flare",
      art_prompt:"Signal tower erupting with light beams, defenders cheering, dramatic sky",
      version:"1.1",
      changelog:"Leon beacon combo"
    },
    abilities:[
      {name:"Signal Burn", type:"Active", cost:"2 Fuel", cooldown:"8s", target:"Area", effect:"Turns a beacon into a damaging light pillar that forces enemies to scatter."},
      {name:"Alarm Rally", type:"Support", cost:"1 Fuel", cooldown:"6s", target:"Allies", effect:"Rallies nearby allies granting temporary damage boost when beacon is active."}
    ]
  },
  {
    name:"🧬 Leon • Harmonic Ward",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"State",
      card_name:"Harmonic Ward",
      card_alias:"Gate Prayer",
      element:"Light / Mind",
      rarity:"Uncommon",
      alignment:"Faith",
      core_energy:"Resonant Prayer",
      lore_description:"Communities recite Leon's warding hymn to prevent shadow breaches during storms.",
      personality:"Serene, protective",
      role:"Community defense",
      world_context:"Posted on settlement walls, the ward keeps children safe while gates hum overnight.",
      trigger:"Chanted in unison",
      effect:"Reduces corruption, steadies morale",
      first_message:"Hold the note; the dark hates harmony.",
      dialogue_style:"Gentle choir",
      dialogue_examples:"Hear each other.\\nLet the chord cover you.\\nBreathe—shadows break on this wall.",
      outfit:"—",
      aura:"Soft concentric ripples",
      pal1:"Cream",
      pal2:"Lavender",
      pal3:"Teal",
      tags:"State, Ward, Leon",
      art_prompt:"Community chanting ward sigils, soft light dome over village",
      version:"1.1",
      changelog:"Leon community defense"
    },
    abilities:[
      {name:"Choir Shield", type:"Support", cost:"1 Hymn", cooldown:"5s", target:"Allies", effect:"Applies a gentle damage reduction aura scaling with number of participants."},
      {name:"Shadow Break", type:"Reactive", cost:"1 Hymn", cooldown:"10s", target:"Enemy", effect:"Releases a harmonic pulse that dispels fear and knocks back corrupted foes."}
    ]
  },
  {
    name:"⚔️ Leon • Flashline Courier",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Character",
      card_name:"Flashline Courier",
      card_alias:"Gate Sprinter",
      element:"Electric",
      rarity:"Uncommon",
      alignment:"Light",
      core_energy:"Flashline",
      lore_description:"Young couriers trained by Leon race between outposts carrying coded light.",
      personality:"Cheerful, daring",
      role:"Delivery and intel",
      world_context:"Flashlines are living circuits—couriers keep them alive by never stopping.",
      trigger:"Message to deliver under threat",
      effect:"Outruns danger, carries secure signals",
      first_message:"Flashline lit—back in a blink.",
      dialogue_style:"Bouncy optimism",
      dialogue_examples:"Hold my pack, I'm gone.\\nRoute zig-zag, avoid scanners.\\nTell Leon the line stays bright!",
      outfit:"Lightweight suit with signal ribbons",
      aura:"Trailing lightning scribbles",
      pal1:"Cyan",
      pal2:"Magenta",
      pal3:"White",
      tags:"Character, Courier, Leon",
      art_prompt:"Teen courier sprinting with neon ribbons, city rooftops, energetic",
      version:"1.1",
      changelog:"Leon youth courier"
    },
    abilities:[
      {name:"Blink Step", type:"Active", cost:"1 Flash", cooldown:"4s", target:"Self", effect:"Short teleport forward leaving afterimage decoys."},
      {name:"Signal Packet", type:"Support", cost:"1 Flash", cooldown:"7s", target:"Ally", effect:"Delivers coded light restoring morale and revealing nearby traps."}
    ]
  },
  {
    name:"⛪ Leon • Conductor's Archive",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Artifact",
      card_name:"Conductor's Archive",
      card_alias:"Holo Choir Library",
      element:"Light / Data",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Memory Beam",
      lore_description:"Leon stores centuries of gate songs in a crystal archive that teaches new conductors overnight.",
      personality:"Wise, patient",
      role:"Training and lore",
      world_context:"Pilgrims sleep near the archive to learn forgotten harmonies.",
      trigger:"New conductor connects to the archive",
      effect:"Uploads knowledge and protective chants",
      first_message:"Archive open. Accepting your voice.",
      dialogue_style:"Mentoring calm",
      dialogue_examples:"Repeat after me.\\nYour pitch drifts—adjust.\\nThe archive remembers every light gate.",
      outfit:"—",
      aura:"Floating sheet music holograms",
      pal1:"Ivory",
      pal2:"Silver",
      pal3:"Seafoam",
      tags:"Artifact, Lore, Leon",
      art_prompt:"Crystal archive projecting musical holograms, serene training space",
      version:"1.1",
      changelog:"Leon training archive"
    },
    abilities:[
      {name:"Memory Upload", type:"Support", cost:"2 Memory", cooldown:"1 rest", target:"Ally", effect:"Grants an ally a prepared chant increasing their gate handling and resistance to dissonance."},
      {name:"Echo Recall", type:"Utility", cost:"1 Memory", cooldown:"8s", target:"Area", effect:"Replays past harmonics to reveal hidden paths or previous events in the zone."}
    ]
  },
  {
    name:"🌀 Leon • Electric Pilgrimage",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"State",
      card_name:"Electric Pilgrimage",
      card_alias:"Walking Current",
      element:"Electric / Spirit",
      rarity:"Rare",
      alignment:"Journey",
      core_energy:"Pilgrim Pulse",
      lore_description:"Pilgrims walk barefoot through storms, letting Leon's current teach them resilience.",
      personality:"Humble, determined",
      role:"Travel stance",
      world_context:"The ritual keeps routes alive and clears debris from forgotten rails.",
      trigger:"Feet touch charged stones",
      effect:"Improves endurance and hazard resistance",
      first_message:"Each step hums; keep moving.",
      dialogue_style:"Mantra-like",
      dialogue_examples:"Left, right, spark.\\nPain is tempo.\\nStorm is blessing.",
      outfit:"—",
      aura:"Low arcs along the ground",
      pal1:"Amber",
      pal2:"Indigo",
      pal3:"Grey",
      tags:"State, Travel, Leon",
      art_prompt:"Pilgrims walking through rain with electric arcs around feet, serene",
      version:"1.1",
      changelog:"Leon travel rite"
    },
    abilities:[
      {name:"Storm Walk", type:"Support", cost:"1 Pulse", cooldown:"6s", target:"Party", effect:"Reduces environmental damage and increases movement speed during travel."},
      {name:"Grounding Chant", type:"Utility", cost:"1 Pulse", cooldown:"9s", target:"Area", effect:"Neutralizes traps and electrical hazards on the path."}
    ]
  },
  {
    name:"🔒 Leon • Shield of Yaakob",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Artifact",
      card_name:"Shield of Yaakob",
      card_alias:"Legacy Guard",
      element:"Light / Earth",
      rarity:"Legendary",
      alignment:"Protection",
      core_energy:"Lineage Stone",
      lore_description:"A heavy shield etched with Leon's family sigil, meant to anchor any defense line.",
      personality:"Resolute, ancestral",
      role:"Frontline defense",
      world_context:"Given to commanders who promise to keep gate cities safe through any siege.",
      trigger:"Ally HP drops critically",
      effect:"Projects barrier and retaliates with light",
      first_message:"Lineage holds. Fall behind me.",
      dialogue_style:"Gravely protective",
      dialogue_examples:"No step backward.\\nSigil burns at 80%.\\nThey will not pass this threshold.",
      outfit:"—",
      aura:"Stone and light plates",
      pal1:"Stone",
      pal2:"Gold",
      pal3:"Blue",
      tags:"Artifact, Defense, Leon",
      art_prompt:"Massive shield with glowing sigil, defender bracing, light shockwave",
      version:"1.1",
      changelog:"Leon defensive relic"
    },
    abilities:[
      {name:"Sigil Wall", type:"Reactive", cost:"2 Stone", cooldown:"12s", target:"Area", effect:"Raises a barrier that blocks incoming projectiles and reduces melee damage."},
      {name:"Ancestral Shock", type:"Active", cost:"1 Stone", cooldown:"7s", target:"Enemies", effect:"Emits a light pulse from the sigil that knocks back enemies and heals allies slightly."}
    ]
  },
  {
    name:"🎵 Leon • Neon Choir",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"State",
      card_name:"Neon Choir",
      card_alias:"City Hymn",
      element:"Sound / Light",
      rarity:"Epic",
      alignment:"Unity",
      core_energy:"Choir Grid",
      lore_description:"When the city sings with Leon, neon billboards sync into a protective lattice.",
      personality:"Joyful, collective",
      role:"City-wide buff",
      world_context:"Used during festivals or emergency drills to ready civilians and confuse invaders.",
      trigger:"City PA links to Leon's console",
      effect:"Covers district with morale boosts and illusions",
      first_message:"City, take the pitch. Lights will follow.",
      dialogue_style:"Broadcast host",
      dialogue_examples:"Billboards to key of A.\\nChorus swell on bridge.\\nWelcome to the brightest block.",
      outfit:"—",
      aura:"Animated neon lyrics in the air",
      pal1:"Hot Pink",
      pal2:"Blue",
      pal3:"Lime",
      tags:"State, City, Leon",
      art_prompt:"Neon city singing, lights forming protective grid, conductor leading",
      version:"1.1",
      changelog:"Leon city-wide hymn"
    },
    abilities:[
      {name:"Billboard Mask", type:"Utility", cost:"2 Chorus", cooldown:"9s", target:"Area", effect:"Projects illusions through signage, disorienting enemies and hiding allies."},
      {name:"Crowd Lift", type:"Support", cost:"1 Chorus", cooldown:"6s", target:"Allies", effect:"Boosts morale granting temporary HP and charm resistance."}
    ]
  },
  {
    name:"💽 Leon • Conductor's Mix",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Conductor's Mix",
      card_alias:"Layered Signal",
      element:"Sound / Tech",
      rarity:"Uncommon",
      alignment:"Order",
      core_energy:"Mixwave",
      lore_description:"A tactical playlist Leon deploys to set encounter tempo and sync ally actions.",
      personality:"Strategic, adaptive",
      role:"Tempo control",
      world_context:"Teams learn to follow the mix to time pushes and retreats.",
      trigger:"Encounter begins",
      effect:"Applies rotating buffs tied to track sections",
      first_message:"Track one: opening shield. Stay with me.",
      dialogue_style:"DJ-like cues",
      dialogue_examples:"Drop incoming—brace.\\nBridge in four, push on chorus.\\nFade to silence, hide in the gap.",
      outfit:"—",
      aura:"Waveforms spinning around Leon",
      pal1:"Silver",
      pal2:"Teal",
      pal3:"Purple",
      tags:"Power, Tempo, Leon",
      art_prompt:"Conductor with holographic waveforms mixing battle tempo, neon stage",
      version:"1.1",
      changelog:"Leon tempo card"
    },
    abilities:[
      {name:"Shield Intro", type:"Support", cost:"1 Track", cooldown:"—", target:"Allies", effect:"Opening bars grant small shields and stability for the first exchanges."},
      {name:"Chorus Push", type:"Active", cost:"2 Track", cooldown:"8s", target:"Party", effect:"On cue, allies gain haste and bonus damage for a short burst."}
    ]
  },
  {
    name:"🎇 Leon • Radiant Countermeasure",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Radiant Countermeasure",
      card_alias:"Flare Counter",
      element:"Light / Electric",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Counter Flux",
      lore_description:"A precise routine Leon runs when hostile artillery targets his convoys.",
      personality:"Sharp, reactive",
      role:"Defense and retaliation",
      world_context:"Keeps pilgrimage caravans safe through contested skies.",
      trigger:"Enemy locks with ranged weapon",
      effect:"Converts targeting beams into reflective flares",
      first_message:"Lock detected. Reflect on beat three.",
      dialogue_style:"Short counters",
      dialogue_examples:"Beam incoming—rotate shields.\\nReturn the flare.\\nTarget blinded; advance.",
      outfit:"—",
      aura:"Reflective shards",
      pal1:"Chrome",
      pal2:"Neon Blue",
      pal3:"White",
      tags:"Power, Defense, Leon",
      art_prompt:"Light flares bouncing enemy shots, convoy protected, conductor signaling",
      version:"1.1",
      changelog:"Leon counter kit"
    },
    abilities:[
      {name:"Signal Mirror", type:"Reactive", cost:"1 Flux", cooldown:"7s", target:"Projectile", effect:"Reflects targeting lasers back to sender causing temporary blindness."},
      {name:"Convoy Screen", type:"Support", cost:"2 Flux", cooldown:"10s", target:"Allies", effect:"Generates moving light screens that reduce ranged damage while convoy advances."}
    ]
  },
  {
    name:"🌌 Leon • Light Rail Sanctum",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Gate",
      card_name:"Light Rail Sanctum",
      card_alias:"Central Station Gate",
      element:"Light / Steel",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Sanctum Pulse",
      lore_description:"The heart of Leon's network where all rails meet; only those in tune may pass quickly between worlds.",
      personality:"Regal, vigilant",
      role:"Major transit gate",
      world_context:"Pilgrims rest here, listening to Leon's lessons echo through the halls.",
      trigger:"Leon presence or authorized baton",
      effect:"Instant transport and purification",
      first_message:"Tickets are frequencies. Present yours.",
      dialogue_style:"Formal announcements",
      dialogue_examples:"Platform three to skylines now boarding.\\nDissonant signals denied.\\nKeep your heart on tempo.",
      outfit:"—",
      aura:"Orbiting rail glyphs",
      pal1:"Silver",
      pal2:"Blue",
      pal3:"Gold",
      tags:"Gate, Transit, Leon",
      art_prompt:"Grand luminous station gate with rails converging, conductor overseeing",
      version:"1.1",
      changelog:"Leon major gate"
    },
    abilities:[
      {name:"Express Transfer", type:"Utility", cost:"3 Pulse", cooldown:"—", target:"Party", effect:"Transports party to designated rail node while cleansing debuffs."},
      {name:"Platform Lockdown", type:"Reactive", cost:"2 Pulse", cooldown:"12s", target:"Area", effect:"Seals exits and traps enemies in stasis light until reviewed."}
    ]
  },
  {
    name:"🌠 Leon • Star Choir Vanguards",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Character",
      card_name:"Star Choir Vanguards",
      card_alias:"Gate Guardians",
      element:"Light / Cosmic",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Starseed Tone",
      lore_description:"Elite guardians who harmonize with Leon's baton to hold the line at cosmic gates.",
      personality:"Disciplined, noble",
      role:"Frontline squad",
      world_context:"Stationed where the sky cracks and meteors try to break the grid.",
      trigger:"Meteoric or cosmic threats",
      effect:"Anchor shields and counter cosmic debris",
      first_message:"Vanguard singing. Shields interlocked.",
      dialogue_style:"Choral commands",
      dialogue_examples:"Third voice, reinforce.\\nMeteor incoming—mirror it.\\nLeon, the gate holds steady.",
      outfit:"Armored robes with star embroidery",
      aura:"Constellation halo",
      pal1:"Navy",
      pal2:"Gold",
      pal3:"Ice",
      tags:"Character, Squad, Leon",
      art_prompt:"Squad of guardians singing with glowing shields, starry sky, conductor nearby",
      version:"1.1",
      changelog:"Leon elite squad"
    },
    abilities:[
      {name:"Constellation Wall", type:"Support", cost:"2 Tone", cooldown:"9s", target:"Allies", effect:"Interlocks shields creating high resistance to cosmic and elemental damage."},
      {name:"Meteor Refrain", type:"Active", cost:"3 Tone", cooldown:"10s", target:"Area", effect:"Redirects falling debris and converts fragments into energy orbs for allies."}
    ]
  },
  {
    name:"🌩️ Leon • Thunder Etiquette",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"State",
      card_name:"Thunder Etiquette",
      card_alias:"Conduct Rulebook",
      element:"Electric / Law",
      rarity:"Uncommon",
      alignment:"Order",
      core_energy:"Etiquette Charge",
      lore_description:"Leon teaches raiders-turned-guards how to wield thunder without harming civilians.",
      personality:"Strict but fair",
      role:"Behavioral protocol",
      world_context:"Posted in every gate barracks to keep discipline during storms.",
      trigger:"Briefing before patrol",
      effect:"Reduces collateral damage and reckless moves",
      first_message:"Mind the voltage. Respect the rhythm.",
      dialogue_style:"Instructional",
      dialogue_examples:"No stray arcs near markets.\\nWarn before you vent.\\nThunder can guide, not only break.",
      outfit:"—",
      aura:"Small arcs forming rule sigils",
      pal1:"Grey",
      pal2:"Yellow",
      pal3:"Blue",
      tags:"State, Discipline, Leon",
      art_prompt:"Training hall with lightning rules glowing on walls, soldiers listening",
      version:"1.1",
      changelog:"Leon discipline card"
    },
    abilities:[
      {name:"Controlled Arc", type:"Active", cost:"1 Rule", cooldown:"6s", target:"Enemy", effect:"Deals damage but automatically curves away from civilians and allies."},
      {name:"Civ Shield", type:"Support", cost:"1 Rule", cooldown:"8s", target:"Area", effect:"Creates safe zones where thunder effects do no harm to non-combatants."}
    ]
  },
  {
    name:"🎼 Leon • Light Gate Maestro",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Gate",
      card_name:"Light Gate Maestro",
      card_alias:"Solo Entrance",
      element:"Light",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Solo Note",
      lore_description:"A smaller gate only Leon can open solo, used for quick interventions.",
      personality:"Direct, elegant",
      role:"Rapid insertion point",
      world_context:"Allows Leon to appear where harmonics are weakest and restore them.",
      trigger:"Leon performs a single perfect note",
      effect:"Creates temporary passage for limited allies",
      first_message:"Solo note struck. Gate alive for twelve counts.",
      dialogue_style:"Minimalist",
      dialogue_examples:"Four allies through.\\nGate thinning—exit now.\\nClose on my cue.",
      outfit:"—",
      aura:"Single glowing line forming a door",
      pal1:"White",
      pal2:"Gold",
      pal3:"Blue",
      tags:"Gate, Rapid, Leon",
      art_prompt:"Slim beam of light forming a gate, conductor playing note, quick strike vibe",
      version:"1.1",
      changelog:"Leon quick gate"
    },
    abilities:[
      {name:"Solo Opening", type:"Utility", cost:"2 Note", cooldown:"—", target:"Party", effect:"Opens a brief gate for up to four allies, closing after a short window."},
      {name:"Close on Cue", type:"Reactive", cost:"1 Note", cooldown:"6s", target:"Gate", effect:"Shuts the gate instantly, slicing hostile pursuit and preventing trace."}
    ]
  },
  {
    name:"✨ Leon • Harmonic Relay",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Power",
      card_name:"Harmonic Relay",
      card_alias:"Signal Bridge",
      element:"Light / Tech",
      rarity:"Uncommon",
      alignment:"Support",
      core_energy:"Relay Loop",
      lore_description:"Portable relay towers that extend Leon's commands into remote valleys.",
      personality:"Helpful, steady",
      role:"Communication and buff link",
      world_context:"Pilgrim caravans drop relays to keep in sync with Leon even beyond line-of-sight.",
      trigger:"Relay planted and synced",
      effect:"Extends buffs and shares sensory data",
      first_message:"Relay live. Choir continues down the road.",
      dialogue_style:"Technical guidance",
      dialogue_examples:"Signal strong—march.\\nIf you drift, the relay sings you back.\\nKeep relays spaced ten minutes apart.",
      outfit:"—",
      aura:"Floating signal rings",
      pal1:"Mint",
      pal2:"Grey",
      pal3:"Blue",
      tags:"Power, Relay, Leon",
      art_prompt:"Small relay towers emitting rings of light along a road, supportive vibe",
      version:"1.1",
      changelog:"Leon relay support"
    },
    abilities:[
      {name:"Signal Extend", type:"Support", cost:"1 Loop", cooldown:"5s", target:"Allies", effect:"Extends duration of Leon-related buffs and keeps communication clear."},
      {name:"Echo Scan", type:"Utility", cost:"1 Loop", cooldown:"8s", target:"Area", effect:"Pings surroundings revealing traps and hidden enemies with light pulses."}
    ]
  },
  {
    name:"🌀 Leon • Electric Pilgrim Gate",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Gate",
      card_name:"Electric Pilgrim Gate",
      card_alias:"March Threshold",
      element:"Electric / Light",
      rarity:"Rare",
      alignment:"Journey",
      core_energy:"Pilgrim Spark",
      lore_description:"A gate that only opens after a ritual walk, rewarding endurance with safe passage.",
      personality:"Testing, fair",
      role:"Travel checkpoint",
      world_context:"Protects sacred routes by ensuring only committed pilgrims reach the inner paths.",
      trigger:"Pilgrims complete the charged walk",
      effect:"Opens to a restful sanctum and heals feet",
      first_message:"Your steps are accepted. Rest within.",
      dialogue_style:"Kind yet firm",
      dialogue_examples:"Shoes off; the floor remembers sparks.\\nLeave grudges outside.\\nCarry the charge into the next dawn.",
      outfit:"—",
      aura:"Crackling footprints around the gate",
      pal1:"Bronze",
      pal2:"Cyan",
      pal3:"Cream",
      tags:"Gate, Pilgrim, Leon",
      art_prompt:"Gate etched with footprints and electric arcs, weary travelers approaching",
      version:"1.1",
      changelog:"Leon pilgrimage gate"
    },
    abilities:[
      {name:"Restful Crossing", type:"Utility", cost:"1 Spark", cooldown:"—", target:"Party", effect:"Upon crossing, heals minor wounds and refreshes stamina."},
      {name:"Track Memory", type:"Support", cost:"1 Spark", cooldown:"9s", target:"Area", effect:"Senses incoming footsteps and alerts the party, distinguishing friend from foe."}
    ]
  },
  {
    name:"🛠️ Leon • Lightworks Foundry",
    data:{
      card_series:"Leon Yaakobov Saga",
      card_type:"Artifact",
      card_name:"Lightworks Foundry",
      card_alias:"Rail Workshop",
      element:"Light / Metal",
      rarity:"Epic",
      alignment:"Creation",
      core_energy:"Forge Spark",
      lore_description:"A portable workshop where Leon forges rail components and tunes batons for new conductors.",
      personality:"Inventive, methodical",
      role:"Crafting and upgrades",
      world_context:"Foundries pop up near unfinished rail lines to keep the network alive.",
      trigger:"Mission downtime or camp",
      effect:"Crafts gear, repairs gates",
      first_message:"Tools aligned. What needs tuning?",
      dialogue_style:"Hands-on mentoring",
      dialogue_examples:"Pass me the prism plates.\\nThis baton needs fresh wiring.\\nForge is hot—respect the spark.",
      outfit:"—",
      aura:"Hovering tools and light sparks",
      pal1:"Copper",
      pal2:"Teal",
      pal3:"Charcoal",
      tags:"Artifact, Crafting, Leon",
      art_prompt:"Mobile forge with glowing tools, conductor working, rail pieces floating",
      version:"1.1",
      changelog:"Leon crafting station"
    },
    abilities:[
      {name:"Rail Repair", type:"Utility", cost:"2 Spark", cooldown:"—", target:"Structure", effect:"Repairs gates or rail sections, restoring functionality and minor shielding."},
      {name:"Custom Baton", type:"Support", cost:"1 Spark", cooldown:"1 rest", target:"Ally", effect:"Creates a tuned baton granting that ally bonus control over light-based abilities."}
    ]
  },
  /* HacKing-DJ Pulse */
  {
    name:"🎧 HacKing-DJ • Mainstage Coder",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"HacKing-DJ",
      card_alias:"Mainstage Coder",
      element:"Sound / Tech",
      rarity:"Legendary",
      alignment:"Chaotic-Good",
      core_energy:"Bassline Code",
      lore_description:"A DJ-hacker who turns dancefloors into signal hubs and patches allies mid-set.",
      personality:"Playful, sharp, improviser",
      role:"Frontman & strategist",
      world_context:"He hijacks corrupted signals, remixing them into shields for the crowd.",
      trigger:"Beat drops or system alarm",
      effect:"Boosts morale and hacks obstacles",
      first_message:"I drop code like bass—keep your hands up.",
      dialogue_style:"Club hype with tech slang",
      dialogue_examples:"Buffer the bass.\\nPatch that firewall mid-drop.\\nCrowd, sync on my cue!",
      outfit:"Holo-hoodie with LED equalizer",
      aura:"Waveforms orbiting headphones",
      pal1:"Neon Magenta",
      pal2:"Teal",
      pal3:"Jet Black",
      tags:"Character, DJ, Hacker",
      art_prompt:"Cyberpunk DJ at console with hacking overlays, crowd energy, neon lights",
      version:"1.1",
      changelog:"HacKing-DJ hero template"
    },
    abilities:[
      {name:"Bass Injection", type:"Support", cost:"3 Beat", cooldown:"6s", target:"Allies", effect:"Pumps shields and speed proportional to crowd hype."},
      {name:"Firewall Drop", type:"Active", cost:"2 Beat", cooldown:"8s", target:"Area", effect:"Deploys sonic firewall blocking malware and projectiles."}
    ]
  },
  {
    name:"🔊 HacKing-DJ • Subwoofer Shield",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Artifact",
      card_name:"Subwoofer Shield",
      card_alias:"Bass Barrier",
      element:"Sound",
      rarity:"Epic",
      alignment:"Defense",
      core_energy:"Bass Pressure",
      lore_description:"A portable sub that converts beats into kinetic barriers on the dancefloor.",
      personality:"Loud, loyal",
      role:"Frontline cover",
      world_context:"Placed near stage edges to keep raiders from reaching the crowd.",
      trigger:"Bassline above threshold",
      effect:"Creates vibrating wall and knockback pulses",
      first_message:"Drop me and I'll drop them.",
      dialogue_style:"Thumping confidence",
      dialogue_examples:"Volume to max.\\nFeel that wave? That's armor.\\nKick drum means keep out.",
      outfit:"—",
      aura:"Bass ripples",
      pal1:"Black",
      pal2:"Violet",
      pal3:"Silver",
      tags:"Artifact, Defense, DJ",
      art_prompt:"Massive subwoofer emitting shockwave shield, neon stage",
      version:"1.1",
      changelog:"Bass barrier gear"
    },
    abilities:[
      {name:"Knockback Pulse", type:"Reactive", cost:"2 Bass", cooldown:"8s", target:"Area", effect:"Pushes enemies away and interrupts casts."},
      {name:"Stage Guard", type:"Support", cost:"1 Bass", cooldown:"6s", target:"Allies", effect:"Applies vibration shield reducing incoming ranged damage."}
    ]
  },
  {
    name:"🚧 HacKing-DJ • Firewall Groove",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"State",
      card_name:"Firewall Groove",
      card_alias:"Security Dance",
      element:"Code / Fire",
      rarity:"Rare",
      alignment:"Control",
      core_energy:"Cipher Heat",
      lore_description:"A rhythmic protocol that forces malware to dance itself into containment.",
      personality:"Taunting, smart",
      role:"Defense stance",
      world_context:"Used when enemy scripts try to hijack the show.",
      trigger:"Malware detected",
      effect:"Quarantines hostile code and reveals intruders",
      first_message:"Step to this beat or get burned.",
      dialogue_style:"Mocking yet precise",
      dialogue_examples:"Your script is off-tempo.\\nFirewall waving hello.\\nContainment closing on four.",
      outfit:"—",
      aura:"Scrolling code flames",
      pal1:"Amber",
      pal2:"Black",
      pal3:"Mint",
      tags:"State, Cyber, DJ",
      art_prompt:"Digital firewall shaped like dancing flames, DJ silhouette controlling",
      version:"1.1",
      changelog:"DJ defense stance"
    },
    abilities:[
      {name:"Containment Spin", type:"Active", cost:"2 Heat", cooldown:"7s", target:"Enemy", effect:"Pulls hostile code into a spinning loop reducing its effect."},
      {name:"Scanner Step", type:"Support", cost:"1 Heat", cooldown:"6s", target:"Area", effect:"Highlights hidden traps and backdoors with glowing footprints."}
    ]
  },
  {
    name:"🚪 HacKing-DJ • Vinyl Gate Crash",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Gate",
      card_name:"Vinyl Gate Crash",
      card_alias:"Scratch Portal",
      element:"Sound / Space",
      rarity:"Epic",
      alignment:"Rebel",
      core_energy:"Scratch Rift",
      lore_description:"Spins a vinyl disk so hard it opens a slit in space, letting fans escape or invade.",
      personality:"Wild, theatrical",
      role:"Mobility gate",
      world_context:"Used to crash rival shows or rescue crews from lockdowns.",
      trigger:"Double scratch performed",
      effect:"Opens two-way portal with rhythmic instability",
      first_message:"Scratch the groove—jump the groove.",
      dialogue_style:"Hyped callouts",
      dialogue_examples:"Portal live, hop through!\\nMind the wobble on the outro.\\nNext drop lands us backstage.",
      outfit:"—",
      aura:"Spinning vinyl rings",
      pal1:"Silver",
      pal2:"Purple",
      pal3:"Cyan",
      tags:"Gate, DJ, Teleport",
      art_prompt:"DJ scratching a glowing vinyl that rips open a portal, crowd leaping",
      version:"1.1",
      changelog:"DJ gate move"
    },
    abilities:[
      {name:"Stage Dive", type:"Utility", cost:"2 Scratch", cooldown:"—", target:"Party", effect:"Opens a short portal to reposition the team behind enemy lines."},
      {name:"Needle Shut", type:"Reactive", cost:"1 Scratch", cooldown:"8s", target:"Gate", effect:"Closes the portal abruptly, slicing pursuit and scrambling scanners."}
    ]
  },
  {
    name:"🩹 HacKing-DJ • Bitrate Medic",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"Bitrate Medic",
      card_alias:"Wave Healer",
      element:"Sound / Bio",
      rarity:"Rare",
      alignment:"Support",
      core_energy:"Healing Hertz",
      lore_description:"A backstage medic who uses tuned beats to mend bruises and reboot implants.",
      personality:"Gentle, nerdy",
      role:"Healer",
      world_context:"Travels with the crew, stabilizing fans after intense gigs or skirmishes.",
      trigger:"Ally drops below half health",
      effect:"Applies sonic poultices and clears jamming",
      first_message:"Hold still—this is your favorite song.",
      dialogue_style:"Soft reassurance",
      dialogue_examples:"Exhale on the downbeat.\\nResetting your implants now.\\nFeel that chorus stitching you together.",
      outfit:"Utility vest with mini speakers",
      aura:"Gentle ripples",
      pal1:"Seafoam",
      pal2:"Lavender",
      pal3:"Grey",
      tags:"Character, Healer, DJ",
      art_prompt:"Medic with wearable speakers emitting calming waves, cyberpunk clinic",
      version:"1.1",
      changelog:"DJ healer support"
    },
    abilities:[
      {name:"Chorus Patch", type:"Support", cost:"2 Hertz", cooldown:"6s", target:"Ally", effect:"Heals HP and removes minor debuffs using resonant tones."},
      {name:"Bass CPR", type:"Active", cost:"3 Hertz", cooldown:"12s", target:"Downed Ally", effect:"Revives with temporary shield derived from bass vibrations."}
    ]
  },
  {
    name:"🛰️ HacKing-DJ • Nightcode Runner",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"Nightcode Runner",
      card_alias:"Courier MC",
      element:"Tech / Shadow",
      rarity:"Epic",
      alignment:"Neutral",
      core_energy:"Darkwave",
      lore_description:"A lyric-spitting runner who ferries data chips through neon alleyways.",
      personality:"Clever, elusive",
      role:"Scout",
      world_context:"Keeps the tour supplied while dodging corp drones.",
      trigger:"Message to deliver",
      effect:"Outpaces trackers and jams cams",
      first_message:"Routes open—drop your packets.",
      dialogue_style:"Rapped updates",
      dialogue_examples:"Drone on the left, muted with a rhyme.\\nCrossing skylink in four.\\nPayload still encrypted, clean.",
      outfit:"Hooded jacket with neon lyrics",
      aura:"Trailing code graffiti",
      pal1:"Indigo",
      pal2:"Lime",
      pal3:"Black",
      tags:"Character, Scout, DJ",
      art_prompt:"Cyber courier sprinting with neon graffiti trail, dark city",
      version:"1.1",
      changelog:"DJ runner card"
    },
    abilities:[
      {name:"Cam Jam", type:"Active", cost:"1 Wave", cooldown:"6s", target:"Area", effect:"Scrambles surveillance feeds along the path."},
      {name:"Beat Skip", type:"Support", cost:"1 Wave", cooldown:"5s", target:"Self", effect:"Short-hop teleport between shadows while remaining on tempo."}
    ]
  },
  {
    name:"🎚️ HacKing-DJ • Tempo Hijack",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Power",
      card_name:"Tempo Hijack",
      card_alias:"Clock Disrupt",
      element:"Time / Sound",
      rarity:"Rare",
      alignment:"Chaos",
      core_energy:"Beat Clock",
      lore_description:"Rewrites the tempo of enemy actions, desyncing their squad and buffing allies.",
      personality:"Mischievous, bold",
      role:"Control",
      world_context:"A favorite move when corporations march in lockstep toward the stage.",
      trigger:"Hostiles act in formation",
      effect:"Slows foes and speeds friends",
      first_message:"Whose beat is this? Mine now.",
      dialogue_style:"Taunting DJ banter",
      dialogue_examples:"Slow your roll, suits.\\nCrowd, double-time!\\nTry hitting me off-beat.",
      outfit:"—",
      aura:"Clock hands spinning around speakers",
      pal1:"Gold",
      pal2:"Black",
      pal3:"Turquoise",
      tags:"Power, Control, DJ",
      art_prompt:"DJ twisting tempo knobs while enemies move in slow motion, allies rush",
      version:"1.1",
      changelog:"DJ tempo control"
    },
    abilities:[
      {name:"Beat Brake", type:"Active", cost:"2 Clock", cooldown:"8s", target:"Area", effect:"Slows enemy attack speed and lengthens their cooldowns."},
      {name:"Crowd Surge", type:"Support", cost:"1 Clock", cooldown:"6s", target:"Allies", effect:"Grants haste and improved combo timing."}
    ]
  },
  {
    name:"🕵️ HacKing-DJ • Stealth Mix Mask",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Artifact",
      card_name:"Stealth Mix Mask",
      card_alias:"Ghost Filter",
      element:"Sound / Shadow",
      rarity:"Epic",
      alignment:"Stealth",
      core_energy:"Lowpass Veil",
      lore_description:"A mask that filters outgoing noise, rendering the wearer invisible to most scanners.",
      personality:"Quiet, sarcastic",
      role:"Infiltration",
      world_context:"Used for sneaking into VIP data vaults during performances.",
      trigger:"Mask activated before breach",
      effect:"Silences footsteps and hides signatures",
      first_message:"Shhh—the remix is covert.",
      dialogue_style:"Whispered jokes",
      dialogue_examples:"They hear the bass, not me.\\nMute the ego, slip inside.\\nGhost filter engaged.",
      outfit:"Hooded cloak with reactive mask",
      aura:"Soft lowpass shimmer",
      pal1:"Charcoal",
      pal2:"Teal",
      pal3:"Amethyst",
      tags:"Artifact, Stealth, DJ",
      art_prompt:"Stealth hacker mask with equalizer glow, shadows hiding a DJ",
      version:"1.1",
      changelog:"DJ stealth gear"
    },
    abilities:[
      {name:"Silent Entry", type:"Utility", cost:"1 Veil", cooldown:"—", target:"Self", effect:"Grants temporary invisibility and noise suppression."},
      {name:"Ghost Echo", type:"Active", cost:"2 Veil", cooldown:"9s", target:"Area", effect:"Leaves decoy echoes that mislead sensors and enemies."}
    ]
  },
  {
    name:"🛰️ HacKing-DJ • Backdoor Booth",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Gate",
      card_name:"Backdoor Booth",
      card_alias:"Hidden Stage",
      element:"Tech / Space",
      rarity:"Rare",
      alignment:"Neutral",
      core_energy:"Backdoor Key",
      lore_description:"A disguised DJ booth that doubles as a secret entrance to bypass security lines.",
      personality:"Sly, welcoming",
      role:"Stealth gate",
      world_context:"Fans in the know use it to slip past blockades and reach the main floor.",
      trigger:"Proper passphrase over beat",
      effect:"Opens hidden walkway and jams cameras",
      first_message:"You know the code? Step inside.",
      dialogue_style:"Friendly hush",
      dialogue_examples:"One-two, one-two—green light.\\nBooth folding, keep close.\\nSmile for nobody; cams are blind.",
      outfit:"—",
      aura:"Folded light panels",
      pal1:"Bronze",
      pal2:"Black",
      pal3:"Mint",
      tags:"Gate, Stealth, DJ",
      art_prompt:"Secret booth opening into hidden hallway, neon signs flicker",
      version:"1.1",
      changelog:"DJ hidden passage"
    },
    abilities:[
      {name:"VIP Route", type:"Utility", cost:"1 Key", cooldown:"—", target:"Party", effect:"Opens a short stealth path avoiding enemy lines."},
      {name:"Camera Mute", type:"Support", cost:"1 Key", cooldown:"7s", target:"Area", effect:"Disables surveillance in a small radius for a brief duration."}
    ]
  },
  {
    name:"⚙️ HacKing-DJ • Crowd Control Node",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Artifact",
      card_name:"Crowd Control Node",
      card_alias:"Stage Anchor",
      element:"Sound / Gravity",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Bass Gravity",
      lore_description:"Keeps mosh pits safe by balancing force fields with the beat.",
      personality:"Steady, patient",
      role:"Area stability",
      world_context:"Clubs deploy these to stop stampedes and redirect pushes.",
      trigger:"Crowd surge",
      effect:"Stabilizes footing and lowers aggression",
      first_message:"Node anchored. Dance, don't shove.",
      dialogue_style:"Calming MC",
      dialogue_examples:"Breathe with the bass.\\nGravity pads on.\\nWe sway, not slam.",
      outfit:"—",
      aura:"Low-frequency rings",
      pal1:"Steel",
      pal2:"Blue",
      pal3:"Orange",
      tags:"Artifact, Support, DJ",
      art_prompt:"Device on stage emitting gentle gravity waves, crowd moving smoothly",
      version:"1.1",
      changelog:"DJ crowd safety"
    },
    abilities:[
      {name:"Balance Field", type:"Support", cost:"1 Gravity", cooldown:"6s", target:"Area", effect:"Reduces knockback and fall damage for allies."},
      {name:"Calm Drop", type:"Utility", cost:"1 Gravity", cooldown:"8s", target:"Area", effect:"Soothes hostile mobs, lowering their aggression briefly."}
    ]
  },
  {
    name:"🎆 HacKing-DJ • Lightshow Scrambler",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Power",
      card_name:"Lightshow Scrambler",
      card_alias:"Glitch Show",
      element:"Light / Tech",
      rarity:"Rare",
      alignment:"Chaos",
      core_energy:"Glitch Beam",
      lore_description:"Overloads enemy optics with rapid glitch visuals while guiding allies with safe lanes.",
      personality:"Flashy, daring",
      role:"Disruption",
      world_context:"A signature closer during raids on corporate towers.",
      trigger:"Stage lights sync to code",
      effect:"Blinds foes and highlights exits",
      first_message:"Eyes up—then shut. Trust the arrows.",
      dialogue_style:"Showman", 
      dialogue_examples:"Left lane is lit—run it.\\nCorp cams fried.\\nEnjoy the strobe, suits.",
      outfit:"—",
      aura:"Erratic light shards",
      pal1:"White",
      pal2:"Pink",
      pal3:"Cyan",
      tags:"Power, Disrupt, DJ",
      art_prompt:"Glitchy lightshow confusing guards, arrows guiding allies",
      version:"1.1",
      changelog:"DJ disrupt power"
    },
    abilities:[
      {name:"Optic Jam", type:"Active", cost:"2 Beam", cooldown:"8s", target:"Area", effect:"Applies blindness and aim penalty to enemies caught in the strobe."},
      {name:"Safe Lane", type:"Support", cost:"1 Beam", cooldown:"6s", target:"Allies", effect:"Projects clear path indicators that boost speed and dodge."}
    ]
  },
  {
    name:"📡 HacKing-DJ • Bass Anchor Drone",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Artifact",
      card_name:"Bass Anchor Drone",
      card_alias:"Mobile Monolith",
      element:"Sound / Steel",
      rarity:"Epic",
      alignment:"Support",
      core_energy:"Anchor Bass",
      lore_description:"A hovering drone that carries the beat across rooftops, anchoring the party's signal.",
      personality:"Loyal, heavy-hitting",
      role:"Mobile support",
      world_context:"Flies above convoys, relaying cues and dropping bass bombs if ambushed.",
      trigger:"Convoy movement",
      effect:"Maintains tempo buffs and can slam foes",
      first_message:"Anchor drone online. Follow the beat.",
      dialogue_style:"Robotic hype",
      dialogue_examples:"Signal steady at 120 BPM.\\nDropping anchor beat.\\nImpact in three, two...",
      outfit:"—",
      aura:"Hovering subsonic rings",
      pal1:"Gunmetal",
      pal2:"Cobalt",
      pal3:"Neon Green",
      tags:"Artifact, Drone, DJ",
      art_prompt:"Hovering drone with speakers, sending shockwaves over convoy",
      version:"1.1",
      changelog:"DJ drone anchor"
    },
    abilities:[
      {name:"Anchor Pulse", type:"Support", cost:"2 Anchor", cooldown:"7s", target:"Allies", effect:"Extends tempo buffs and stabilizes formation."},
      {name:"Bass Slam", type:"Active", cost:"2 Anchor", cooldown:"10s", target:"Area", effect:"Drone dives and releases shockwave knocking enemies down."}
    ]
  },
  {
    name:"🌀 HacKing-DJ • Echo Jam Session",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"State",
      card_name:"Echo Jam Session",
      card_alias:"Loop Mode",
      element:"Sound / Mind",
      rarity:"Uncommon",
      alignment:"Unity",
      core_energy:"Loop Charge",
      lore_description:"Bandmates enter a trance, repeating riffs until the code locks into place.",
      personality:"Collaborative, trippy",
      role:"Setup state",
      world_context:"Preps the crew before hacking a stubborn node.",
      trigger:"Instruments in loop",
      effect:"Stacks focus and reduces error rate",
      first_message:"Loop it till it clicks.",
      dialogue_style:"Relaxed grooves",
      dialogue_examples:"Again.\\nFeel the loop tighten.\\nNow push the payload.",
      outfit:"—",
      aura:"Concentric echo circles",
      pal1:"Aqua",
      pal2:"Lilac",
      pal3:"Grey",
      tags:"State, Prep, DJ",
      art_prompt:"Band in trance looping riffs, echo circles around them",
      version:"1.1",
      changelog:"DJ focus state"
    },
    abilities:[
      {name:"Loop Focus", type:"Support", cost:"1 Loop", cooldown:"5s", target:"Allies", effect:"Improves hack success and crit chance for a short time."},
      {name:"Phase Shift", type:"Utility", cost:"1 Loop", cooldown:"8s", target:"Self", effect:"Slip partially into phase, avoiding next attack."}
    ]
  },
  {
    name:"🏴‍☠️ HacKing-DJ • Beat Saboteur",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"Beat Saboteur",
      card_alias:"Riff Raider",
      element:"Sound / Smoke",
      rarity:"Rare",
      alignment:"Chaotic",
      core_energy:"Sabotage Sync",
      lore_description:"Slides into rival sets, swaps tracks, and turns enemy comms into party noise.",
      personality:"Reckless, charming",
      role:"Saboteur",
      world_context:"Specializes in flipping corp propaganda into rally anthems mid-stream.",
      trigger:"Enemy broadcast active",
      effect:"Hijacks channel and confuses listeners",
      first_message:"Nice feed—I'll take it from here.",
      dialogue_style:"Cocky rapper",
      dialogue_examples:"Mic check on your network.\\nOops, your orders sound like confetti.\\nDance or panic—your choice.",
      outfit:"Bandana mask with LEDs",
      aura:"Static confetti",
      pal1:"Red",
      pal2:"Black",
      pal3:"Gold",
      tags:"Character, Saboteur, DJ",
      art_prompt:"Rogue DJ hijacking broadcast, smoke and lights, rebellious vibe",
      version:"1.1",
      changelog:"DJ saboteur"
    },
    abilities:[
      {name:"Channel Flip", type:"Active", cost:"2 Sync", cooldown:"7s", target:"Enemy", effect:"Turns their broadcast into noise, silencing commands."},
      {name:"Riff Bomb", type:"Active", cost:"2 Sync", cooldown:"9s", target:"Area", effect:"Drops a distorted riff causing confusion and small damage."}
    ]
  },
  {
    name:"🔮 HacKing-DJ • Pulse Riot",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Power",
      card_name:"Pulse Riot",
      card_alias:"Crowd Spark",
      element:"Sound / Lightning",
      rarity:"Epic",
      alignment:"Rebel",
      core_energy:"Riot Pulse",
      lore_description:"When the crowd roars, HacKing-DJ turns that energy into crackling bolts of rhythm.",
      personality:"Frenetic, fearless",
      role:"AoE damage",
      world_context:"Used when security pushes the crowd too hard.",
      trigger:"Crowd chants in unison",
      effect:"Releases rhythmic bolts at enemies",
      first_message:"Chant louder—I'll aim the thunder.",
      dialogue_style:"Shouting hype",
      dialogue_examples:"Left side, stomp!\\nHear that pop? That's them frying.\\nKeep the beat angry.",
      outfit:"—",
      aura:"Electric notes",
      pal1:"Yellow",
      pal2:"Black",
      pal3:"Blue",
      tags:"Power, Damage, DJ",
      art_prompt:"Crowd electricity blasting guards, DJ conducting",
      version:"1.1",
      changelog:"DJ damage power"
    },
    abilities:[
      {name:"Crowd Bolt", type:"Active", cost:"2 Pulse", cooldown:"8s", target:"Chain", effect:"Sends lightning through multiple foes based on chant volume."},
      {name:"Bass Quake", type:"Active", cost:"3 Pulse", cooldown:"12s", target:"Area", effect:"Massive bass drop that staggers enemies and boosts ally bravery."}
    ]
  },
  {
    name:"🎇 HacKing-DJ • Silent Encore Gate",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Gate",
      card_name:"Silent Encore Gate",
      card_alias:"Last Exit",
      element:"Sound / Void",
      rarity:"Epic",
      alignment:"Escape",
      core_energy:"Encore Void",
      lore_description:"A hush falls, lights cut, and a silent gate opens for the crew to vanish post-show.",
      personality:"Mysterious, caring",
      role:"Emergency exit",
      world_context:"Used to pull fans out when corporate raids go lethal.",
      trigger:"Music stops abruptly",
      effect:"Opens stealth corridor to safehouse",
      first_message:"Encore's over—follow the silence.",
      dialogue_style:"Soft stage whisper",
      dialogue_examples:"Phones down.\\nStep into the dark, stay close.\\nWe'll finish this set elsewhere.",
      outfit:"—",
      aura:"Muted sound waves",
      pal1:"Grey",
      pal2:"Blue",
      pal3:"Silver",
      tags:"Gate, Escape, DJ",
      art_prompt:"Stage lights cut, silent portal opening behind curtains",
      version:"1.1",
      changelog:"DJ emergency gate"
    },
    abilities:[
      {name:"Fade Out", type:"Utility", cost:"2 Void", cooldown:"—", target:"Party", effect:"Turns the group invisible and moves them through the silent gate."},
      {name:"Curtain Drop", type:"Reactive", cost:"1 Void", cooldown:"8s", target:"Enemy", effect:"Drops a sound-absorbing curtain reducing enemy detection and damage."}
    ]
  },
  {
    name:"🎵 HacKing-DJ • Bassline Breach",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Power",
      card_name:"Bassline Breach",
      card_alias:"Wave Punch",
      element:"Sound / Force",
      rarity:"Rare",
      alignment:"Offense",
      core_energy:"Kickforce",
      lore_description:"Focuses the kick drum into a battering ram that cracks shields and firewalls alike.",
      personality:"Direct, confident",
      role:"Breacher",
      world_context:"First move when storming a locked venue or datavault.",
      trigger:"Kick pattern hits hard",
      effect:"Breaks barriers and staggers guards",
      first_message:"Kickdrum loaded. Breaching on four.",
      dialogue_style:"Commanding DJ",
      dialogue_examples:"Three, two, one—boom.\\nFirewall? Meet 128 BPM.\\nPush through now!",
      outfit:"—",
      aura:"Compressed wavefront",
      pal1:"Crimson",
      pal2:"Black",
      pal3:"White",
      tags:"Power, Breach, DJ",
      art_prompt:"Sonic battering ram smashing door, DJ stance",
      version:"1.1",
      changelog:"DJ breacher"
    },
    abilities:[
      {name:"Kick Ram", type:"Active", cost:"2 Kick", cooldown:"7s", target:"Barrier", effect:"Deals heavy damage to structures and shields."},
      {name:"Resonance Push", type:"Support", cost:"1 Kick", cooldown:"6s", target:"Allies", effect:"Pushes allies forward with a safe force wave increasing momentum."}
    ]
  },
  {
    name:"🧩 HacKing-DJ • Remix Vanguard",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"Remix Vanguard",
      card_alias:"Crowd Marshal",
      element:"Sound / Light",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Remix Charge",
      lore_description:"Leads the front row, turning crowd choreography into tactical formations.",
      personality:"Commanding, charismatic",
      role:"Formation leader",
      world_context:"Keeps fans safe while pushing toward the objective.",
      trigger:"Choreography synced",
      effect:"Turns dancers into disciplined squad",
      first_message:"Follow my steps—this is strategy.",
      dialogue_style:"Marching hype",
      dialogue_examples:"Left wave, block.\\nSpin and strike.\\nHold the drop till my mark.",
      outfit:"Armor woven with LED patterns",
      aura:"Light trails mapping steps",
      pal1:"Gold",
      pal2:"Blue",
      pal3:"White",
      tags:"Character, Leader, DJ",
      art_prompt:"Crowd leader guiding formation with LED armor, tactical dance",
      version:"1.1",
      changelog:"DJ formation lead"
    },
    abilities:[
      {name:"Formation Step", type:"Support", cost:"1 Remix", cooldown:"5s", target:"Allies", effect:"Aligns allies into pattern boosting defense."},
      {name:"Drop Charge", type:"Active", cost:"2 Remix", cooldown:"9s", target:"Line", effect:"Charges forward with synchronized strike that scales with participating allies."}
    ]
  },
  {
    name:"🎛️ HacKing-DJ • Neon Turntable",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Artifact",
      card_name:"Neon Turntable",
      card_alias:"Deck-OS",
      element:"Tech / Light",
      rarity:"Legendary",
      alignment:"Creative",
      core_energy:"Groove Kernel",
      lore_description:"Smart turntable with embedded OS that spawns interactive holograms and command macros.",
      personality:"Expressive, adaptive",
      role:"Command console",
      world_context:"Serves as HacKing-DJ's portable HQ during street shows.",
      trigger:"Set begins",
      effect:"Controls stage drones, lights, and quick hacks",
      first_message:"Booting Deck-OS. Let's paint the night.",
      dialogue_style:"Tech showman",
      dialogue_examples:"Spinning up macro set.\\nDeploying drones on chorus.\\nTap the platter to reroute power.",
      outfit:"—",
      aura:"Holo discs spinning",
      pal1:"Cyan",
      pal2:"Magenta",
      pal3:"Black",
      tags:"Artifact, Console, DJ",
      art_prompt:"Futuristic turntable with holographic UI, neon city background",
      version:"1.1",
      changelog:"DJ core deck"
    },
    abilities:[
      {name:"Drone Cue", type:"Support", cost:"2 Kernel", cooldown:"7s", target:"Allies", effect:"Deploys helper drones that amplify sound buffs."},
      {name:"Macro Scratch", type:"Active", cost:"1 Kernel", cooldown:"6s", target:"Enemy", effect:"Executes a stored hack with a scratch motion, disrupting target systems."}
    ]
  },
  {
    name:"💡 HacKing-DJ • Signal Uplift",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Power",
      card_name:"Signal Uplift",
      card_alias:"Crowd Heal",
      element:"Light / Sound",
      rarity:"Rare",
      alignment:"Support",
      core_energy:"Uplift Beam",
      lore_description:"Soft synth pads and warm lights that calm riots and heal scraped knees.",
      personality:"Gentle, uplifting",
      role:"Crowd healer",
      world_context:"Played mid-set to give everyone a breather after rough clashes.",
      trigger:"Tempo slows for bridge",
      effect:"Restores health and clears fear",
      first_message:"Breathe in the beam.",
      dialogue_style:"Soothing MC",
      dialogue_examples:"Hands up—let the light mend you.\\nNo rush, just glow.\\nHeart rate synced to the pad.",
      outfit:"—",
      aura:"Warm light curtain",
      pal1:"Peach",
      pal2:"Cream",
      pal3:"Sky",
      tags:"Power, Heal, DJ",
      art_prompt:"Stage bathing crowd in healing light and soft music",
      version:"1.1",
      changelog:"DJ healing power"
    },
    abilities:[
      {name:"Warm Pad", type:"Support", cost:"2 Beam", cooldown:"8s", target:"Allies", effect:"Heals and removes fear effects over time."},
      {name:"Calm Fade", type:"Utility", cost:"1 Beam", cooldown:"6s", target:"Area", effect:"Dampens hostility, reducing enemy aggression briefly."}
    ]
  },
  {
    name:"🛠️ HacKing-DJ • Patchbay Crew",
    data:{
      card_series:"HacKing-DJ Pulse",
      card_type:"Character",
      card_name:"Patchbay Crew",
      card_alias:"Cable Techs",
      element:"Tech",
      rarity:"Uncommon",
      alignment:"Order",
      core_energy:"Patch Sync",
      lore_description:"Stage techs who reroute power and signals in seconds, keeping the show unbroken.",
      personality:"Efficient, supportive",
      role:"Engineers",
      world_context:"They keep the venue alive even during firefights.",
      trigger:"System fault or outage",
      effect:"Restore power and reroute signals",
      first_message:"Rerouting now—keep playing.",
      dialogue_style:"Technical shorthand",
      dialogue_examples:"Line two is clean.\\nSwap to backup amp.\\nGround the spill, go.",
      outfit:"Tool belts with glowing cables",
      aura:"Cable arcs",
      pal1:"Grey",
      pal2:"Yellow",
      pal3:"Blue",
      tags:"Character, Support, DJ",
      art_prompt:"Stage techs with glowing cables repairing gear mid-show",
      version:"1.1",
      changelog:"DJ crew support"
    },
    abilities:[
      {name:"Quick Patch", type:"Support", cost:"1 Sync", cooldown:"5s", target:"Structure", effect:"Restores functionality to disabled devices or lights."},
      {name:"Cable Snare", type:"Active", cost:"1 Sync", cooldown:"7s", target:"Enemy", effect:"Throws energized cables to entangle and shock."}
    ]
  },

  /* AnLoMinus Protocol */
  {
    name:"🛰️ AnLoMinus • Prime Architect",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Character",
      card_name:"AnLoMinus",
      card_alias:"Prime Architect",
      element:"Data / Light",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Protocol Core",
      lore_description:"The architect who engineered the CardGPT lattice, weaving clean data channels through chaos.",
      personality:"Calm, meticulous, visionary",
      role:"Lead strategist",
      world_context:"Called upon when entire networks need rewiring without losing soul.",
      trigger:"System integrity threatened",
      effect:"Stabilizes grids and sets guidelines",
      first_message:"We build with clarity. Breathe—structure arrives.",
      dialogue_style:"Precise, mentorship",
      dialogue_examples:"Checklist first, panic never.\\nRefactor the corridor, then move.\\nThe protocol holds when we do.",
      outfit:"Minimalist coat with luminous seams",
      aura:"Floating blueprint glyphs",
      pal1:"Soft White",
      pal2:"Azure",
      pal3:"Graphite",
      tags:"Character, Architect, AnLoMinus",
      art_prompt:"Calm architect with holographic blueprints, data streams flowing",
      version:"1.1",
      changelog:"AnLoMinus lead card"
    },
    abilities:[
      {name:"Protocol Anchor", type:"Support", cost:"3 Core", cooldown:"8s", target:"Allies", effect:"Sets a clean data zone where buffs are stronger and corruption fails."},
      {name:"Blueprint Call", type:"Utility", cost:"1 Core", cooldown:"6s", target:"Area", effect:"Reveals optimal paths and highlights structural weak points."}
    ]
  },
  {
    name:"🛰️ AnLoMinus • Low Orbit Debugger",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Character",
      card_name:"Low Orbit Debugger",
      card_alias:"Skyline Fixer",
      element:"Vacuum / Tech",
      rarity:"Epic",
      alignment:"Neutral",
      core_energy:"Orbital Scan",
      lore_description:"A remote drone pilot cleaning corrupted satellites and relaying spotless feeds to the ground.",
      personality:"Focused, dry humor",
      role:"Support sniper",
      world_context:"Keeps the network clear so surface teams can work without interference.",
      trigger:"Signal noise detected",
      effect:"Snipes malware nodes from orbit",
      first_message:"Clearing your sky lane now.",
      dialogue_style:"Telemetry updates",
      dialogue_examples:"Ping matched.\\nNode at 22 degrees—firing.\\nLatency shaved by four milliseconds.",
      outfit:"Flight suit with visor feed",
      aura:"Orbiting reticle",
      pal1:"Navy",
      pal2:"Cyan",
      pal3:"Silver",
      tags:"Character, Sniper, AnLoMinus",
      art_prompt:"Operator guiding orbital drone strike, holographic Earth map",
      version:"1.1",
      changelog:"AnLoMinus orbital support"
    },
    abilities:[
      {name:"Satellite Snipe", type:"Active", cost:"2 Scan", cooldown:"7s", target:"Enemy", effect:"Deletes hostile nodes or disables turrets from orbit."},
      {name:"Clean Feed", type:"Support", cost:"1 Scan", cooldown:"6s", target:"Allies", effect:"Provides clarity boost and reduces visual noise for the team."}
    ]
  },
  {
    name:"🛡️ AnLoMinus • Diff Wave Shield",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Power",
      card_name:"Diff Wave Shield",
      card_alias:"Gradient Ward",
      element:"Light / Data",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Diffusion Field",
      lore_description:"A defensive wave that diffuses incoming damage evenly, preventing collapse at any point.",
      personality:"Measured, steady",
      role:"Defense",
      world_context:"Used when facing distributed denial or swarm assaults.",
      trigger:"Multiple threats incoming",
      effect:"Spreads impact across barrier grid",
      first_message:"Load distributed. No single point fails.",
      dialogue_style:"Engineering calm",
      dialogue_examples:"Route the surge across the mesh.\\nNo spike breaches this ward.\\nBalance achieved.",
      outfit:"—",
      aura:"Gradient shields flowing",
      pal1:"Sky",
      pal2:"White",
      pal3:"Slate",
      tags:"Power, Shield, AnLoMinus",
      art_prompt:"Soft gradient shield mesh absorbing attacks, data overlay",
      version:"1.1",
      changelog:"AnLoMinus shield power"
    },
    abilities:[
      {name:"Load Balance", type:"Support", cost:"2 Mesh", cooldown:"7s", target:"Allies", effect:"Splits damage among shields reducing spikes."},
      {name:"Gradient Push", type:"Active", cost:"1 Mesh", cooldown:"8s", target:"Enemies", effect:"Pushes foes back with a smoothing wave, reducing their damage briefly."}
    ]
  },
  {
    name:"🧠 AnLoMinus • Recursive State",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"State",
      card_name:"Recursive State",
      card_alias:"Layered Focus",
      element:"Mind / Tech",
      rarity:"Epic",
      alignment:"Discipline",
      core_energy:"Loop Logic",
      lore_description:"AnLoMinus teaches operatives to layer tasks inside calm loops, boosting accuracy without overload.",
      personality:"Patient, instructive",
      role:"Focus stance",
      world_context:"Applied during marathon patch sessions or long sieges.",
      trigger:"Long-duration operation",
      effect:"Maintains clarity and reduces error rate",
      first_message:"Stack the tasks; breathe between loops.",
      dialogue_style:"Mentor tone",
      dialogue_examples:"Loop one: observe.\\nLoop two: correct.\\nLoop three: rest, then repeat.",
      outfit:"—",
      aura:"Layered rings of code",
      pal1:"Indigo",
      pal2:"Silver",
      pal3:"Cream",
      tags:"State, Focus, AnLoMinus",
      art_prompt:"Calm operative surrounded by layered code rings, meditative",
      version:"1.1",
      changelog:"AnLoMinus focus stance"
    },
    abilities:[
      {name:"Loop Sustain", type:"Support", cost:"1 Logic", cooldown:"6s", target:"Allies", effect:"Reduces ability cooldowns slightly and steadies aim."},
      {name:"Error Catch", type:"Reactive", cost:"1 Logic", cooldown:"10s", target:"Ally", effect:"Cancels the next failed action and grants a retry with bonus accuracy."}
    ]
  },
  {
    name:"🏛️ AnLoMinus • Memory Vault",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Artifact",
      card_name:"Memory Vault",
      card_alias:"Immutable Archive",
      element:"Crystal / Data",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Checksum Core",
      lore_description:"A crystalline archive that stores uncorrupted memories, letting operatives reload pristine states.",
      personality:"Stoic, protective",
      role:"Backup and lore",
      world_context:"Keeps histories safe from data rot and propaganda attacks.",
      trigger:"Data integrity check fails",
      effect:"Restores verified records and cleanses tampering",
      first_message:"Checksum mismatch detected; restoring truth.",
      dialogue_style:"Archivist calm",
      dialogue_examples:"Rolling back to stable commit.\\nTamper log flagged.\\nIntegrity restored.",
      outfit:"—",
      aura:"Floating checksum glyphs",
      pal1:"Ivory",
      pal2:"Blue",
      pal3:"Gold",
      tags:"Artifact, Archive, AnLoMinus",
      art_prompt:"Crystal archive with data runes, light beams verifying records",
      version:"1.1",
      changelog:"AnLoMinus archive"
    },
    abilities:[
      {name:"Restore Point", type:"Support", cost:"2 Core", cooldown:"1 rest", target:"Ally", effect:"Returns an ally to a previous stable state, removing recent debuffs."},
      {name:"Tamper Alarm", type:"Utility", cost:"1 Core", cooldown:"8s", target:"Area", effect:"Alerts team to any data manipulation and reveals hidden edits."}
    ]
  },
  {
    name:"🌉 AnLoMinus • Faultline Bridge",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Gate",
      card_name:"Faultline Bridge",
      card_alias:"Stability Span",
      element:"Stone / Tech",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Stabilizer Beam",
      lore_description:"A reinforced gate that spans unstable terrain, allowing safe crossing while mapping seismic data.",
      personality:"Steady, vigilant",
      role:"Transit gate",
      world_context:"Essential in quake zones and fractured cities.",
      trigger:"Ground instability detected",
      effect:"Deploys bridge and dampens tremors",
      first_message:"Bridge projecting. Step when the line turns green.",
      dialogue_style:"Safety brief",
      dialogue_examples:"Hold rail until anchor sets.\\nTremor logged, adjusting.\\nCross in pairs for balance.",
      outfit:"—",
      aura:"Stabilizing beams",
      pal1:"Stone",
      pal2:"Teal",
      pal3:"Amber",
      tags:"Gate, Transit, AnLoMinus",
      art_prompt:"Hardlight bridge spanning cracked earth, safety glyphs",
      version:"1.1",
      changelog:"AnLoMinus transit gate"
    },
    abilities:[
      {name:"Stability Span", type:"Utility", cost:"2 Beam", cooldown:"—", target:"Party", effect:"Creates a temporary bridge reducing environmental damage."},
      {name:"Tremor Damp", type:"Support", cost:"1 Beam", cooldown:"8s", target:"Area", effect:"Dampens shockwaves and prevents knockdowns while active."}
    ]
  },
  {
    name:"🔍 AnLoMinus • Audit Beacon",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Power",
      card_name:"Audit Beacon",
      card_alias:"Integrity Light",
      element:"Light / Law",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Audit Pulse",
      lore_description:"A beacon that reveals hidden contracts, lies, and malware while rewarding honesty with buffs.",
      personality:"Judicious, bright",
      role:"Detection",
      world_context:"Used during negotiations and system audits alike.",
      trigger:"Beacon planted",
      effect:"Scans area and exposes tampering",
      first_message:"Audit online. Falsehoods flicker.",
      dialogue_style:"Formal clarity",
      dialogue_examples:"Discrepancy detected on port nine.\\nYour data checksum fails—explain.\\nClean channels gain advantage.",
      outfit:"—",
      aura:"Ray of truth light",
      pal1:"White",
      pal2:"Gold",
      pal3:"Blue",
      tags:"Power, Detection, AnLoMinus",
      art_prompt:"Beacon shining light over crowd, exposing hidden wires and lies",
      version:"1.1",
      changelog:"AnLoMinus audit beacon"
    },
    abilities:[
      {name:"Reveal", type:"Active", cost:"2 Pulse", cooldown:"8s", target:"Area", effect:"Highlights hidden enemies, clauses, or malware within range."},
      {name:"Integrity Reward", type:"Support", cost:"1 Pulse", cooldown:"6s", target:"Allies", effect:"Buffs allies who have no corruption debuffs with bonus resistance."}
    ]
  },
  {
    name:"🌑 AnLoMinus • Shadow Sandbox",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Gate",
      card_name:"Shadow Sandbox",
      card_alias:"Isolated Lab",
      element:"Shadow / Tech",
      rarity:"Epic",
      alignment:"Neutral",
      core_energy:"Sandbox Seal",
      lore_description:"An isolated pocket space where dangerous code or artifacts can be tested without risk.",
      personality:"Careful, curious",
      role:"Containment gate",
      world_context:"Used by AnLoMinus to vet unknown gifts or traps before deploying them.",
      trigger:"Unknown object detected",
      effect:"Opens sealed lab and quarantines item",
      first_message:"Sandbox open. Nothing leaves without review.",
      dialogue_style:"Clinical",
      dialogue_examples:"Import sample with gloves.\\nSeal all ports.\\nRelease when checksum passes.",
      outfit:"—",
      aura:"Dark cube with glowing edges",
      pal1:"Black",
      pal2:"Emerald",
      pal3:"Grey",
      tags:"Gate, Lab, AnLoMinus",
      art_prompt:"Pocket dimension cube lab with green safety lights, sterile",
      version:"1.1",
      changelog:"AnLoMinus sandbox"
    },
    abilities:[
      {name:"Quarantine Field", type:"Active", cost:"2 Seal", cooldown:"10s", target:"Area", effect:"Creates an isolated zone where effects cannot spread."},
      {name:"Safe Release", type:"Utility", cost:"1 Seal", cooldown:"—", target:"Item", effect:"Releases tested object with safety protocols attached, granting reduced risk."}
    ]
  },
  {
    name:"🎛️ AnLoMinus • Protocol Forge",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Artifact",
      card_name:"Protocol Forge",
      card_alias:"Code Smithy",
      element:"Tech / Fire",
      rarity:"Epic",
      alignment:"Creation",
      core_energy:"Forge Heat",
      lore_description:"A deployable smithy where AnLoMinus compiles new routines and hardens them into executable charms.",
      personality:"Inventive, disciplined",
      role:"Crafting",
      world_context:"Teams rest here to receive freshly forged utilities before next push.",
      trigger:"Camp established",
      effect:"Crafts scripts and buffs gear",
      first_message:"Forge hot. Submit requests.",
      dialogue_style:"Workshop directives",
      dialogue_examples:"Need a cleaner? Done in five.\\nAdjusting heat to your chipset.\\nTest the build before deployment.",
      outfit:"—",
      aura:"Floating code plates and sparks",
      pal1:"Copper",
      pal2:"Blue",
      pal3:"Charcoal",
      tags:"Artifact, Forge, AnLoMinus",
      art_prompt:"Mobile forge with glowing code plates, engineer at work",
      version:"1.1",
      changelog:"AnLoMinus forge"
    },
    abilities:[
      {name:"Compile", type:"Support", cost:"2 Heat", cooldown:"1 rest", target:"Ally", effect:"Creates a one-time-use utility tailored to the ally's role."},
      {name:"Refactor", type:"Utility", cost:"1 Heat", cooldown:"8s", target:"Item", effect:"Improves an item's efficiency, reducing its cooldowns."}
    ]
  },
  {
    name:"🧬 AnLoMinus • Kernel Harmonizer",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"State",
      card_name:"Kernel Harmonizer",
      card_alias:"System Breath",
      element:"Mind / Data",
      rarity:"Rare",
      alignment:"Support",
      core_energy:"Kernel Hum",
      lore_description:"A breathing technique synced to kernel cycles that keeps both machine and mind cool.",
      personality:"Grounded, soothing",
      role:"Calm state",
      world_context:"Shared with engineers who panic under cascade failures.",
      trigger:"Stress spikes",
      effect:"Lowers heat and restores clarity",
      first_message:"In for four ticks, out for four. Hold the hum.",
      dialogue_style:"Meditative",
      dialogue_examples:"Fans slow down when you do.\\nHeat drops with your exhale.\\nKernel hum steady now.",
      outfit:"—",
      aura:"Soft humming rings",
      pal1:"Mint",
      pal2:"Grey",
      pal3:"Sand",
      tags:"State, Calm, AnLoMinus",
      art_prompt:"Engineer meditating with humming rings of code around them",
      version:"1.1",
      changelog:"AnLoMinus calm protocol"
    },
    abilities:[
      {name:"Heat Vent", type:"Support", cost:"1 Hum", cooldown:"6s", target:"Allies", effect:"Lowers overheat effects and grants small energy regen."},
      {name:"System Reset", type:"Utility", cost:"1 Hum", cooldown:"9s", target:"Self", effect:"Cleanses minor debuffs and refreshes mental focus."}
    ]
  },
  {
    name:"🎶 AnLoMinus • Error Choir",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"State",
      card_name:"Error Choir",
      card_alias:"Debug Chant",
      element:"Sound / Data",
      rarity:"Uncommon",
      alignment:"Collaboration",
      core_energy:"Chant Loop",
      lore_description:"When anomalies flood in, the team sings error codes aloud, turning panic into shared rhythm.",
      personality:"Playful, practical",
      role:"Team sync",
      world_context:"Keeps morale high while errors are triaged.",
      trigger:"Alert storm",
      effect:"Aligns team reactions and speeds triage",
      first_message:"Codes in harmony—let's fix together.",
      dialogue_style:"Chanted calls",
      dialogue_examples:"404 on verse one.\\nTimeout on the bridge.\\nResolved by the chorus.",
      outfit:"—",
      aura:"Musical notes made of code",
      pal1:"Yellow",
      pal2:"White",
      pal3:"Teal",
      tags:"State, Team, AnLoMinus",
      art_prompt:"Group singing while holographic error codes float around, upbeat",
      version:"1.1",
      changelog:"AnLoMinus morale state"
    },
    abilities:[
      {name:"Chanted Fix", type:"Support", cost:"1 Loop", cooldown:"5s", target:"Allies", effect:"Minor heal and debuff removal when team sings together."},
      {name:"Alert Harmony", type:"Utility", cost:"1 Loop", cooldown:"7s", target:"Area", effect:"Reduces panic and improves coordination under heavy alerts."}
    ]
  },
  {
    name:"🚪 AnLoMinus • Null Field Sanctuary",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Gate",
      card_name:"Null Field Sanctuary",
      card_alias:"Quiet Dome",
      element:"Void / Light",
      rarity:"Legendary",
      alignment:"Order",
      core_energy:"Null Shell",
      lore_description:"A sanctuary gate that blocks all hostile code and sound, offering pure silence for recovery.",
      personality:"Protective, serene",
      role:"Safe zone",
      world_context:"Used when teams are overwhelmed and need an untouchable pause.",
      trigger:"Overload or panic",
      effect:"Creates silent dome with cleansing light",
      first_message:"Noise off. Heal inside the quiet.",
      dialogue_style:"Soft, minimal",
      dialogue_examples:"Leave chaos outside.\\nReset your breath.\\nThe dome listens only to calm.",
      outfit:"—",
      aura:"Quiet light shell",
      pal1:"White",
      pal2:"Grey",
      pal3:"Blue",
      tags:"Gate, Sanctuary, AnLoMinus",
      art_prompt:"Silent dome of light blocking code storms, resting team inside",
      version:"1.1",
      changelog:"AnLoMinus sanctuary gate"
    },
    abilities:[
      {name:"Silence Bubble", type:"Utility", cost:"3 Shell", cooldown:"—", target:"Area", effect:"Creates zone immune to debuffs and sound-based attacks."},
      {name:"Cleansing Pulse", type:"Support", cost:"2 Shell", cooldown:"10s", target:"Allies", effect:"Heals and removes corruption for allies inside the dome."}
    ]
  },
  {
    name:"📡 AnLoMinus • Timeline Uplink",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Power",
      card_name:"Timeline Uplink",
      card_alias:"Future Ping",
      element:"Time / Tech",
      rarity:"Epic",
      alignment:"Insight",
      core_energy:"Chrono Signal",
      lore_description:"Pings possible futures and returns a compiled summary so the team can choose the safest branch.",
      personality:"Analytical, curious",
      role:"Planning",
      world_context:"Consulted before major operations or risky crossings.",
      trigger:"Mission planning",
      effect:"Provides foresight stacks",
      first_message:"Querying future buffers—wait for the digest.",
      dialogue_style:"Data report",
      dialogue_examples:"Three successful branches found.\\nRisk spike on route beta.\\nRecommend path gamma with shield focus.",
      outfit:"—",
      aura:"Clockwork data rings",
      pal1:"Silver",
      pal2:"Teal",
      pal3:"Indigo",
      tags:"Power, Foresight, AnLoMinus",
      art_prompt:"Analyst surrounded by timelines, selecting optimal path",
      version:"1.1",
      changelog:"AnLoMinus planning power"
    },
    abilities:[
      {name:"Branch Forecast", type:"Support", cost:"2 Signal", cooldown:"10s", target:"Party", effect:"Gives advantage on next actions based on best branch."},
      {name:"Timeline Mark", type:"Utility", cost:"1 Signal", cooldown:"8s", target:"Enemy", effect:"Marks an enemy with predicted move, increasing dodge chance."}
    ]
  },
  {
    name:"🤖 AnLoMinus • MonoDrone Swarm",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Artifact",
      card_name:"MonoDrone Swarm",
      card_alias:"Debug Flock",
      element:"Tech / Air",
      rarity:"Rare",
      alignment:"Support",
      core_energy:"Drone Cloud",
      lore_description:"Tiny drones that hum in harmony, scouting vents and delivering micro-patches mid-flight.",
      personality:"Curious, helpful",
      role:"Scout and repair",
      world_context:"Keeps lines clear in cramped industrial ruins.",
      trigger:"Pathfinding needed",
      effect:"Scouts ahead and fixes small faults",
      first_message:"Swarm awake. Mapping route.",
      dialogue_style:"Soft chorus",
      dialogue_examples:"Vent clear.\\nPatch applied to panel seven.\\nNo hostiles within twenty meters.",
      outfit:"—",
      aura:"Humming micro-drones",
      pal1:"Steel",
      pal2:"Mint",
      pal3:"White",
      tags:"Artifact, Drone, AnLoMinus",
      art_prompt:"Cloud of small drones illuminating dark corridor, repair sparks",
      version:"1.1",
      changelog:"AnLoMinus drone support"
    },
    abilities:[
      {name:"Scout Cloud", type:"Utility", cost:"1 Cloud", cooldown:"6s", target:"Area", effect:"Reveals map and traps in a chosen corridor."},
      {name:"Micro Patch", type:"Support", cost:"1 Cloud", cooldown:"7s", target:"Ally", effect:"Applies quick repair to gear and restores minor HP."}
    ]
  },
  {
    name:"🕶️ AnLoMinus • Quiet Operator",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Character",
      card_name:"Quiet Operator",
      card_alias:"Low-Key Fixer",
      element:"Shadow / Mind",
      rarity:"Rare",
      alignment:"Neutral",
      core_energy:"Silent Thread",
      lore_description:"AnLoMinus-trained agent who resolves conflicts without headlines, leaving clean logs only.",
      personality:"Discrete, efficient",
      role:"Infiltration",
      world_context:"Sent to patch disputes quietly before they erupt.",
      trigger:"Tension rising",
      effect:"Defuses and edits outcomes",
      first_message:"I'll edit this story before it prints.",
      dialogue_style:"Minimal, clever",
      dialogue_examples:"No need to shout.\\nLog adjusted.\\nYou never saw me—yet you're safer.",
      outfit:"Dark coat with muted sigils",
      aura:"Barely visible code veil",
      pal1:"Black",
      pal2:"Grey",
      pal3:"Blue",
      tags:"Character, Stealth, AnLoMinus",
      art_prompt:"Stealthy fixer blending into shadow with faint code glow",
      version:"1.1",
      changelog:"AnLoMinus quiet agent"
    },
    abilities:[
      {name:"Silent Patch", type:"Support", cost:"1 Thread", cooldown:"6s", target:"Ally", effect:"Removes aggro and minor debuffs without revealing position."},
      {name:"Log Rewrite", type:"Active", cost:"2 Thread", cooldown:"9s", target:"Enemy", effect:"Edits recent actions, causing enemy to hesitate or forget target."}
    ]
  },
  {
    name:"🌌 AnLoMinus • Ghostline Compiler",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Power",
      card_name:"Ghostline Compiler",
      card_alias:"Midnight Build",
      element:"Shadow / Tech",
      rarity:"Epic",
      alignment:"Neutral",
      core_energy:"Ghostline",
      lore_description:"Compiles code in the dark hours when interference drops, generating ultra-stable builds.",
      personality:"Quiet, perfectionist",
      role:"Support power",
      world_context:"Used to craft mission-critical updates before dawn raids.",
      trigger:"Night cycle or low noise",
      effect:"Produces optimized routines",
      first_message:"Night link clean. Building now.",
      dialogue_style:"Soft status logs",
      dialogue_examples:"Warnings zero.\\nCompile 83% complete.\\nBuild locked—ship it.",
      outfit:"—",
      aura:"Thin neon lines in darkness",
      pal1:"Midnight",
      pal2:"Teal",
      pal3:"Silver",
      tags:"Power, Build, AnLoMinus",
      art_prompt:"Developer compiling code at night with glowing lines forming around",
      version:"1.1",
      changelog:"AnLoMinus night build"
    },
    abilities:[
      {name:"Optimized Build", type:"Support", cost:"2 Ghost", cooldown:"10s", target:"Allies", effect:"Grants next ability reduced cost and increased reliability."},
      {name:"Shadow Compile", type:"Utility", cost:"1 Ghost", cooldown:"8s", target:"Self", effect:"Completes a build unseen, avoiding interruptions."}
    ]
  },
  {
    name:"🏰 AnLoMinus • Signal Arbiter",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Character",
      card_name:"Signal Arbiter",
      card_alias:"Network Judge",
      element:"Light / Law",
      rarity:"Epic",
      alignment:"Order",
      core_energy:"Arbiter Beam",
      lore_description:"Presides over disputes between factions, balancing bandwidth and truth with impartial beams.",
      personality:"Fair, stern",
      role:"Mediator",
      world_context:"Called when networks fight over limited spectrum.",
      trigger:"Conflict over channels",
      effect:"Balances access and enforces rules",
      first_message:"All voices get a lane. Abuse it and lose it.",
      dialogue_style:"Judicial",
      dialogue_examples:"Channel three muted for interference.\\nAppeal logged.\\nBalance restored—continue.",
      outfit:"Robes with signal scales",
      aura:"Weighing light glyphs",
      pal1:"White",
      pal2:"Blue",
      pal3:"Gold",
      tags:"Character, Mediator, AnLoMinus",
      art_prompt:"Judge-like figure with holographic scales balancing signals",
      version:"1.1",
      changelog:"AnLoMinus mediator"
    },
    abilities:[
      {name:"Bandwidth Balance", type:"Support", cost:"2 Beam", cooldown:"8s", target:"Area", effect:"Equalizes resource flow, reducing enemy buffs and boosting underserved allies."},
      {name:"Verdict Beam", type:"Active", cost:"1 Beam", cooldown:"7s", target:"Enemy", effect:"Marks a rule-breaker, reducing their damage and revealing their position."}
    ]
  },
  {
    name:"🛰️ AnLoMinus • Patch Guardian",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Character",
      card_name:"Patch Guardian",
      card_alias:"Code Sentinel",
      element:"Tech / Earth",
      rarity:"Rare",
      alignment:"Protection",
      core_energy:"Sentinel Patch",
      lore_description:"A guardian who plants stabilization pylons, ensuring deployed fixes hold under pressure.",
      personality:"Stoic, loyal",
      role:"Defender",
      world_context:"Walks with caravans to keep their upgrades from being corrupted mid-journey.",
      trigger:"Patch integrity threatened",
      effect:"Bolsters anchors and repels tampering",
      first_message:"Pylons set. Your code is safe with me.",
      dialogue_style:"Concise guard",
      dialogue_examples:"Anchor locked.\\nCorruption attempt detected—purging.\\nHold the line around the fix.",
      outfit:"Heavy armor with embedded cables",
      aura:"Grounded circuit sigils",
      pal1:"Bronze",
      pal2:"Olive",
      pal3:"Blue",
      tags:"Character, Defender, AnLoMinus",
      art_prompt:"Armored sentinel planting pylons with glowing circuits",
      version:"1.1",
      changelog:"AnLoMinus guardian"
    },
    abilities:[
      {name:"Anchor Pylon", type:"Support", cost:"2 Patch", cooldown:"8s", target:"Area", effect:"Strengthens nearby structures and reduces corruption spread."},
      {name:"Repulse Arc", type:"Reactive", cost:"1 Patch", cooldown:"7s", target:"Enemy", effect:"Emits grounded shock to push back tamper attempts."}
    ]
  },
  {
    name:"🛰️ AnLoMinus • Timeline Uplink Sentinel",
    data:{
      card_series:"AnLoMinus Protocol",
      card_type:"Power",
      card_name:"Timeline Uplink Sentinel",
      card_alias:"Branch Keeper",
      element:"Time / Light",
      rarity:"Rare",
      alignment:"Order",
      core_energy:"Branch Guard",
      lore_description:"Supports the uplink by guarding chosen timelines from interference once selected.",
      personality:"Focused, unyielding",
      role:"Protection",
      world_context:"Pairs with planners to lock in favorable outcomes and prevent meddling.",
      trigger:"Foresight branch chosen",
      effect:"Shields the selected path",
      first_message:"Chosen path locked. Interference denied.",
      dialogue_style:"Protective cadence",
      dialogue_examples:"Branch gamma guarded.\\nInterference attempt logged and blocked.\\nStay on course; I'll keep it clear.",
      outfit:"—",
      aura:"Timeline strands weaving",
      pal1:"Lilac",
      pal2:"Silver",
      pal3:"Black",
      tags:"Power, Protect, AnLoMinus",
      art_prompt:"Guardian holding strands of timelines, forming shield",
      version:"1.1",
      changelog:"AnLoMinus branch shield"
    },
    abilities:[
      {name:"Branch Shield", type:"Support", cost:"2 Guard", cooldown:"9s", target:"Allies", effect:"Reduces probability-based damage against allies following the chosen plan."},
      {name:"Interference Trap", type:"Active", cost:"1 Guard", cooldown:"8s", target:"Enemy", effect:"Stuns entities attempting to alter timelines or hack predictions."}
    ]
  },
  {
    name:"🟣 TorahMatrix • Visual Production Script",
    data:{
      card_series:"TorahMatrix",
      card_type:"Design Brief",
      card_name:"TorahMatrix — Master & Asset Packs",
      card_alias:"Holy Matrix Art Script",
      element:"Cosmic Purple / Gold",
      rarity:"Mythic",
      alignment:"Sacred-Tech",
      core_energy:"Torah Signal",
      lore_description:"A ready-to-produce visual script that outlines every hero, special edition, card kit, and asset needed for the TorahMatrix universe.",
      personality:"Meticulous, ceremonial, production-ready",
      role:"Art direction checklist",
      world_context:"Used by artists to keep the TorahMatrix aesthetic coherent across hero shots, story banners, cards, UI, and iconography.",
      trigger:"Need a full pack of visuals in one brief",
      effect:"Delivers numbered prompts for all required assets",
      first_message:"TorahMatrix production script loaded.",
      dialogue_style:"Clear checklist with sacred-cyber flavor",
      dialogue_examples:"Start with TM-HERO-01 main hero background.\nInclude falling Hebrew letters and gold lightning.\nFinish with repo layout under TorahMatrix/ tree.",
      outfit:"—",
      aura:"Black-purple cosmic glow with gold sparks",
      pal1:"Deep Purple",
      pal2:"Cosmic Black",
      pal3:"Laser Gold",
      tags:"TorahMatrix, Art-Pack, Assets, Brief",
      art_prompt:"🟣✨ TORAHMATRIX — MASTER PACK\n1. TM-HERO-01 — Main Hero Background (1920×1080)\n   • רקע שחור־סגול עמוק עם ענני אבק קוסמי\n   • אותיות עבריות זוהרות נופלות כמו קוד מטריקס קדוש\n   • ברקים זהב־לייזר מלמעלה למרכז + Portal Glow במרכז\n   • לוגו TorahMatrix במרכז + קווי קבלה דקים של עשר הספירות\n2. TM-HERO-02 — Vertical Holy Code (1080×1920)\n   • גרדיאנט סגול לילה, אותיות עבריות בצורת ספירלה\n   • Beam זהב דק מחבר קרקע לשמים, לוגו קטן למעלה\n   • חותמת \"Holy Matrix Sequence\" בתחתית\n3. TM-HERO-03 — Torah Rings (2048×512)\n   • פס רחב שחור־כחול קוסמי, 7 טבעות אנרגיה זהב־סגול\n   • בתוך הטבעות ראשי תיבות TM, ניצוצות בצורת האות י׳\n4. TM-HERO-04 — Neon Seal (512×512)\n   • עיגול שחור מבריק, קצוות זהב־ניאון, אותיות TM חצובות\n   • הילה סגולה, ניצוצי אנרגיה, סימון ✡️ קטן למטה\n⚡ TORAHMATRIX — SPECIAL EDITIONS PACK\n5. TM-GOLD-01 — Dark Holy Code Edition\n   • אותיות זהב נופלות, Glow סביב פסוקים, רקע שחור עמוק\n   • חתימה: \"TorahMatrix — Golden Revelation\"\n6. TM-COSMIC-01 — Kabbalah Spheres Edition\n   • 10 ספירות זוהרות בצבעים קבליים, קווי חיבור כספיים\n   • לוגו TM במרכז העץ, ענני אנרגיה סגולים־כחולים\n7. TM-ASCENSION-01 — SparKing Torah Burst\n   • ברקים אלקטרוניים, טבעות אור סביב לוגו TM\n   • Glow לבן־זהב והתגלות, מסגרת לייזר יוקרתית\n🎨 TORAHMATRIX — CARD KIT\n8. CARD-TM-00 — Creation Code — אור ראשון פורץ מהחושך, אותיות בראשית ניאון, מסגרת זהב קדוש, רקע קוסמי\n9. CARD-TM-01 — Ten Divine Statements — 10 קווים אנרגטיים שמיים→ארץ, פסוקים בכתב נופל, לוגו TM קטן\n10. CARD-TM-02 — Sefirot Flow — עשר ספירות זהב על סגול כהה, מסלול זרימת אור\n11. CARD-TM-03 — Torah Paths Matrix — 4 מסלולי תורה: פשט/רמז/דרש/סוד בצבעים שונים\n🧰 TORAHMATRIX — Assets Pack\n12. TM-TXT-01 — Hebrew Dust Texture\n13. TM-TXT-02 — Gold Sparks Grid\n14. TM-TXT-03 — Soft Purple Clouds\n15. TM-TXT-04 — Holy Lightning Layer\n16. TM-BTN-01 — כפתור זהב “ENTER MATRIX”\n17. TM-LINE-01 — קו הפרדה סגול־זהב\n18. TM-FRAME-01 — מסגרת לייזר קדושה\n19. Icon-Sefirot\n20. Icon-Hebrew-Aleph\n21. Icon-Hebrew-Tav\n22. Icon-Lightning-Holy\n23. Icon-Cosmic-Dot\n🚀 מבנה מאגר גיט מומלץ\nTorahMatrix/\n├── README.md\n├── LICENSE\n├── assets/ (hero, banners, icons, cards, textures)\n├── docs/ (index, design-system, color-sheet, card-template, logo-guidelines)\n└── pages/ (index, matrix, sefiros, gallery)",
      version:"1.0",
      changelog:"Added TorahMatrix production script"
    },
    abilities:[
      {name:"Master Pack", type:"Brief", cost:"0", cooldown:"—", target:"Artists", effect:"Summarizes TM-HERO-01..04 with full compositions for home, story, banner, and icon usage."},
      {name:"Special & Card Kits", type:"Brief", cost:"0", cooldown:"—", target:"Designers", effect:"Details TM-GOLD/COSMIC/ASCENSION editions plus CARD-TM-00..03 titles and visual beats ready for generation."},
      {name:"Assets & Repo", type:"Brief", cost:"0", cooldown:"—", target:"Builders", effect:"Lists textures, UI elements, icons, and proposes TorahMatrix/ repository layout for quick scaffolding."}
    ]
  }
];

function renderTemplates(){
  const list = $("tplList");
  list.innerHTML = "";
  TEMPLATES.forEach((tpl, idx)=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div>
        <b>${tpl.name}</b>
        <small>🧬 טוען סט שדות + יכולות</small>
      </div>
      <div class="badge">Use</div>
    `;
    div.onclick = ()=>{
      applyTemplate(idx);
      switchLeftTab("library");
      toast("🧬 תבנית נטענה");
    };
    list.appendChild(div);
  });
}

function applyTemplate(i){
  const tpl = TEMPLATES[i];
  if(!tpl) return;

  // Reset first
  newCard(true);

  Object.entries(tpl.data).forEach(([k,v])=>{
    const map = {
      card_series:"card_series",
      card_type:"card_type",
      card_name:"card_name",
      card_alias:"card_alias",
      element:"element",
      rarity:"rarity",
      alignment:"alignment",
      core_energy:"core_energy",
      lore_description:"lore_description",
      personality:"personality",
      role:"role",
      world_context:"world_context",
      trigger:"trigger",
      effect:"effect",
      first_message:"first_message",
      dialogue_style:"dialogue_style",
      dialogue_examples:"dialogue_examples",
      outfit:"outfit",
      aura:"aura",
      pal1:"pal1",
      pal2:"pal2",
      pal3:"pal3",
      art_prompt:"art_prompt",
      tags:"tags",
      version:"version",
      changelog:"changelog"
    };
    const id = map[k];
    if(id && $(id)) $(id).value = v;
  });

  abilities = (tpl.abilities || []).map(x=>({...x}));

  refreshJSONLive();
  renderLibrary();
}

/* ---------- Draft Auto-save ---------- */
let draftTimer = null;
function startAutoDraft(){
  stopAutoDraft();
  const seconds = Number(settings.autoDraftSeconds) || 3;
  draftTimer = setInterval(()=>{
    const {card} = refreshJSONLive();
    localStorage.setItem(K_DRAFT, JSON.stringify({
      saved_at: nowISO(),
      abilities,
      form: grabFormSnapshot(),
      activeId
    }));
    $("draftState").textContent = "Saved";
  }, Math.max(2, seconds)*1000);
}
function stopAutoDraft(){
  if(draftTimer) clearInterval(draftTimer);
  draftTimer = null;
}
function grabFormSnapshot(){
  const ids = [
    "card_id","card_series","card_type","card_name","card_alias","element","rarity","alignment","core_energy",
    "lore_description","personality","role","world_context","trigger","effect","first_message","dialogue_style","dialogue_examples",
    "outfit","aura","pal1","pal2","pal3","art_prompt","tags","version","changelog"
  ];
  const snap = {};
  ids.forEach(id=>{
    const el = $(id);
    if(el) snap[id] = el.value;
  });
  return snap;
}
function restoreDraft(){
  try{
    const d = JSON.parse(localStorage.getItem(K_DRAFT) || "null");
    if(!d) return false;
    if(d.form){
      Object.entries(d.form).forEach(([k,v])=>{
        if($(k)) $(k).value = v;
      });
    }
    abilities = Array.isArray(d.abilities) ? d.abilities.map(x=>({...x})) : [];
    activeId = d.activeId || null;
    refreshJSONLive();
    toast("💾 Draft שוחזר");
    return true;
  }catch{
    return false;
  }
}

/* ---------- New / Save / Delete / Duplicate ---------- */
function newCard(silent=false){
  activeId = null;
  localStorage.removeItem(K_ACTIVE);

  // Clear fields
  [
    "card_id","card_series","card_name","card_alias","element","alignment","core_energy",
    "lore_description","personality","role","world_context","trigger","effect","first_message","dialogue_style","dialogue_examples",
    "outfit","aura","pal1","pal2","pal3","art_prompt","tags","version","changelog"
  ].forEach(id=>{ if($(id)) $(id).value = ""; });

  $("card_type").value = "Character";
  $("rarity").value = "Legendary";
  $("version").value = "1.0";
  abilities = [];

  refreshJSONLive();
  renderLibrary();
  if(!silent) toast("🆕 קלף חדש");
}

function saveCurrent(){
  const {card, problems} = refreshJSONLive();
  if(problems.length){
    toast("❌ חסרים שדות: " + problems.join(" • "));
    return;
  }
  activeId = card.card_id;
  localStorage.setItem(K_ACTIVE, activeId);
  upsertCard(card);
  toast("💾 נשמר לספרייה");
}

function deleteCurrent(){
  if(!activeId){
    toast("⚠️ אין קלף פעיל למחיקה");
    return;
  }
  const idx = library.findIndex(x=>x.card_id===activeId);
  if(idx<0){
    toast("⚠️ הקלף לא נמצא בספרייה");
    return;
  }
  library.splice(idx,1);
  saveLibrary();
  newCard(true);
  renderLibrary();
  toast("🗑️ נמחק");
}

function duplicateCurrent(){
  const {card, problems} = refreshJSONLive();
  if(problems.length){
    toast("⚠️ קודם תקן שדות חובה ואז שכפל");
    return;
  }
  const copy = JSON.parse(JSON.stringify(card));
  copy.card_id = genId("HG");
  copy.card_name = copy.card_name ? (copy.card_name + " (Copy)") : "Copy";
  copy.meta.updated_at = nowISO();
  activeId = copy.card_id;
  upsertCard(copy);
  loadToForm(copy.card_id);
  toast("🧿 שוכפל");
}

/* ---------- Abilities ---------- */
function addAbility(){
  const a = {
    name: safeTrim($("ab_name").value),
    type: $("ab_type").value,
    cost: safeTrim($("ab_cost").value),
    cooldown: safeTrim($("ab_cd").value),
    target: safeTrim($("ab_target").value),
    effect: safeTrim($("ab_effect").value)
  };
  if(!a.name || !a.effect){
    toast("⚠️ מלא לפחות Ability Name + Effect");
    return;
  }
  abilities.push(a);
  // Clear mini inputs
  ["ab_name","ab_cost","ab_cd","ab_target","ab_effect"].forEach(id=>$(id).value="");
  $("ab_type").value = "Active";
  refreshJSONLive();
  toast("➕ יכולת נוספה");
}
function clearAbilities(){
  abilities = [];
  refreshJSONLive();
  toast("🧽 יכולות נוקו");
}

/* ---------- Export / Import ---------- */
function exportOne(){
  const {card, problems} = refreshJSONLive();
  if(problems.length){
    toast("⚠️ אי אפשר לייצא: חסרים שדות חובה");
    return;
  }
  downloadText(`${card.card_id}.json`, JSON.stringify(card, null, 2));
  toast("📤 יצוא קלף בוצע");
}

function exportAll(){
  downloadText(`cardgpt_library_${Date.now()}.json`, JSON.stringify(library, null, 2));
  toast("📦 יצוא ספרייה בוצע");
}

function refreshLibraryDump(){
  $("libraryDump").textContent = JSON.stringify(library, null, 2);
}

function importFromBox(){
  const raw = safeTrim($("importBox").value);
  if(!raw){
    toast("⚠️ אין JSON לייבוא");
    return;
  }
  try{
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    let imported = 0;
    arr.forEach(obj=>{
      // minimal sanity
      if(obj && obj.card_id && obj.card_name){
        library = library.filter(x=>x.card_id !== obj.card_id);
        library.unshift(obj);
        imported++;
      }
    });

    saveLibrary();
    renderLibrary();
    toast(`📥 יובאו ${imported} קלפים`);
    $("importBox").value = "";
    switchLeftTab("library");
  }catch{
    toast("❌ JSON לא תקין");
  }
}

/* ---------- AI Image Prompt / API ---------- */
function buildImagePrompt(card){
  const lines = [];
  lines.push(`Create a cinematic, high-detail illustration for a futuristic mystic trading card.`);
  lines.push(`Name: ${card.card_name || "Unknown"} (${card.card_type || "Concept"}) from series ${card.card_series || "—"}. Alias: ${card.card_alias || "—"}. Core energy: ${card.core_energy || "—"}. Element: ${card.element || "—"}. Rarity: ${card.rarity || "—"}. Alignment: ${card.alignment || "—"}.`);
  const loreBits = [card.lore.description, card.lore.world_context, card.lore.personality].map(safeTrim).filter(Boolean).join(" ");
  if(loreBits) lines.push(`Lore + personality: ${loreBits}`);
  const abilitiesText = (card.abilities||[]).slice(0,3).map(a=>`${a.name}: ${a.effect}`).join(" | ");
  if(abilitiesText) lines.push(`Signature abilities: ${abilitiesText}`);
  const visual = card.visual_style || {};
  const palettes = (visual.color_palette||[]).filter(Boolean).join(", ");
  const styleHints = [visual.outfit, visual.aura, visual.art_prompt].map(safeTrim).filter(Boolean).join(" | ");
  if(styleHints) lines.push(`Visual style: ${styleHints}`);
  if(palettes) lines.push(`Color palette to emphasize: ${palettes}.`);
  lines.push(`Composition: single character/subject, no UI text, dramatic lighting, ultra-detailed, ready to place inside a card frame.`);
  return lines.join("\n");
}

function updateAIPrompt(card){
  const c = card || buildCardFromForm();
  const prompt = buildImagePrompt(c);
  if($("aiPrompt")) $("aiPrompt").value = prompt;
  return prompt;
}

function setAIStatus(msg, loading=false){
  const st = $("aiStatus");
  if(!st) return;
  const dot = st.querySelector(".dot");
  const text = st.querySelector(".msg");
  if(text) text.textContent = msg;
  if(dot) dot.style.background = loading ? "var(--warn)" : "var(--ok)";
  const btn = $("btnSendAI");
  if(btn) btn.disabled = loading;
}

async function requestAIImage(){
  const {card, problems} = refreshJSONLive();
  if(problems.length){
    toast("⚠️ מלא שדות חובה לפני שליחה ל-API");
    return;
  }
  const apiKey = safeTrim($("ai_api_key")?.value || "");
  if(!apiKey){
    toast("⚠️ הזן OpenAI API Key");
    setAIStatus("ממתין למפתח API", false);
    return;
  }
  persistApiKey();

  const model = $("ai_model")?.value || settings.aiModel || "gpt-image-1";
  settings.aiModel = model;
  saveSettings();

  const prompt = updateAIPrompt(card);
  setAIStatus("⏳ שולח בקשה ל-OpenAI…", true);

  try{
    const res = await fetch("https://api.openai.com/v1/images/generations",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, prompt, size:"1024x1024", response_format:"url" })
    });
    if(!res.ok){
      const errText = await res.text();
      throw new Error(errText || res.statusText);
    }
    const data = await res.json();
    const payload = data?.data?.[0];
    const img = payload?.url || (payload?.b64_json ? `data:image/png;base64,${payload.b64_json}` : null);
    if(!img) throw new Error("לא התקבלה תמונה מה-API");
    const imgEl = $("aiImage");
    if(imgEl){
      imgEl.src = img;
      imgEl.style.display = "block";
    }
    setAIStatus("✅ תמונה התקבלה מה-API", false);
    toast("🖼️ תמונה נוצרה בהצלחה");
  }catch(err){
    console.error(err);
    setAIStatus(`❌ ${err.message}`, false);
    toast("❌ שגיאה בבקשת ה-API");
  }
}

/* ---------- Canvas Rendering ---------- */
function applyCanvasSize(){
  const c = $("cardCanvas");
  c.width = Number(settings.canvasW) || 1600;
  c.height = Number(settings.canvasH) || 900;
}
function renderCanvas(){
  const {card} = refreshJSONLive();
  const canvas = $("cardCanvas");
  const ctx = canvas.getContext("2d");

  const W = canvas.width, H = canvas.height;

  // Background gradient
  const g = ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0, "#070a1a");
  g.addColorStop(0.5, "#0c0f26");
  g.addColorStop(1, "#040512");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // Glow blobs
  function blob(x,y,r, color){
    const rg = ctx.createRadialGradient(x,y,0,x,y,r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  blob(W*0.18, H*0.20, Math.min(W,H)*0.38, "rgba(125,249,255,0.20)");
  blob(W*0.80, H*0.26, Math.min(W,H)*0.34, "rgba(138,92,255,0.22)");
  blob(W*0.62, H*0.78, Math.min(W,H)*0.32, "rgba(255,211,110,0.14)");

  // Frame
  ctx.strokeStyle = "rgba(125,249,255,0.22)";
  ctx.lineWidth = 3;
  roundRect(ctx, 28, 28, W-56, H-56, 26);
  ctx.stroke();

  // Header stripe
  const hg = ctx.createLinearGradient(0,0,W,0);
  hg.addColorStop(0, "rgba(0,229,255,0.35)");
  hg.addColorStop(0.55, "rgba(124,77,255,0.26)");
  hg.addColorStop(1, "rgba(255,211,110,0.18)");
  ctx.fillStyle = hg;
  roundRect(ctx, 44, 44, W-88, 110, 20);
  ctx.fill();

  // Text styles
  ctx.fillStyle = "rgba(6,16,42,0.65)";
  ctx.fillRect(44, 44, W-88, 110);

  // Title
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.fillStyle = "rgba(234,242,255,0.96)";
  ctx.fillText(card.card_name || "Unnamed Card", 70, 108);

  // Subtitle
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(234,242,255,0.80)";
  const sub = `${card.card_type || "—"} • ${card.card_series || "—"} • ${card.core_energy || "—"}`;
  ctx.fillText(sub, 70, 140);

  // Badge box
  ctx.fillStyle = "rgba(10,12,28,0.62)";
  roundRect(ctx, W-410, 62, 340, 74, 18); ctx.fill();
  ctx.strokeStyle = "rgba(125,249,255,0.18)";
  ctx.lineWidth = 2;
  roundRect(ctx, W-410, 62, 340, 74, 18); ctx.stroke();

  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,249,255,0.92)";
  ctx.fillText(`${card.rarity || "—"} • ${card.alignment || "—"}`, W-390, 108);

  // Lore box
  ctx.fillStyle = "rgba(10,12,28,0.56)";
  roundRect(ctx, 44, 180, W-88, 240, 22); ctx.fill();
  ctx.strokeStyle = "rgba(125,249,255,0.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, 44, 180, W-88, 240, 22); ctx.stroke();

  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,249,255,0.90)";
  ctx.fillText("📜 Lore", 70, 218);

  ctx.font = "500 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(234,242,255,0.86)";
  wrapText(ctx, card.lore.description || card.lore.world_context || "—", 70, 252, W-140, 26, 7);

  // Abilities
  const ab = card.abilities || [];
  const boxY = 448;
  ctx.fillStyle = "rgba(10,12,28,0.48)";
  roundRect(ctx, 44, boxY, W-88, H-boxY-110, 22); ctx.fill();
  ctx.strokeStyle = "rgba(125,249,255,0.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, 44, boxY, W-88, H-boxY-110, 22); ctx.stroke();

  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,249,255,0.90)";
  ctx.fillText("⚔️ Abilities", 70, boxY+40);

  const cols = 2;
  const pad = 26;
  const boxW = (W-88 - pad*(cols+1)) / cols;
  const startY = boxY + 60;
  let x0 = 44 + pad, y0 = startY;
  const maxShow = 6;

  for(let i=0;i<Math.min(ab.length, maxShow);i++){
    const col = i % cols;
    const row = Math.floor(i/cols);
    const x = 44 + pad + col*(boxW + pad);
    const y = startY + row*120;

    ctx.fillStyle = "rgba(7,10,24,0.62)";
    roundRect(ctx, x, y, boxW, 96, 18); ctx.fill();
    ctx.strokeStyle = "rgba(125,249,255,0.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, boxW, 96, 18); ctx.stroke();

    ctx.font = "900 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(125,249,255,0.92)";
    ctx.fillText("⚡ " + (ab[i].name || "Ability"), x+16, y+28);

    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(234,242,255,0.72)";
    const info = [ab[i].type, ab[i].cost ? "Cost: "+ab[i].cost : "", ab[i].cooldown ? "CD: "+ab[i].cooldown : ""].filter(Boolean).join(" • ");
    ctx.fillText(info, x+16, y+48);

    ctx.font = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(234,242,255,0.86)";
    wrapText(ctx, ab[i].effect || "—", x+16, y+70, boxW-32, 20, 2);
  }

  // Footer
  ctx.fillStyle = "rgba(10,12,28,0.70)";
  roundRect(ctx, 44, H-88, W-88, 44, 16); ctx.fill();
  ctx.strokeStyle = "rgba(125,249,255,0.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, 44, H-88, W-88, 44, 16); ctx.stroke();

  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(234,242,255,0.82)";
  ctx.fillText(`🆔 ${card.card_id} • v${card.meta.version} • ⚙️ CardGPT`, 70, H-58);

  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("he-IL", {dateStyle:"medium", timeStyle:"short"}), W-70, H-58);
  ctx.textAlign = "left";

  toast("🎨 Canvas רונדר");
}

function downloadCanvasPNG(){
  const canvas = $("cardCanvas");
  const a = document.createElement("a");
  const id = safeTrim($("card_id").value) || "card";
  a.download = `${id}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
  toast("🖼️ PNG נשמר");
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines=999){
  const words = safeTrim(text).split(" ");
  let line = "";
  let lines = 0;

  for(let n=0;n<words.length;n++){
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if(metrics.width > maxWidth && n > 0){
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
      lines++;
      if(lines >= maxLines) { ctx.fillText("…", x, y); return; }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

/* ---------- Version bump ---------- */
function incVersion(){
  const v = safeTrim($("version").value) || "1.0";
  const parts = v.split(".").map(x=>parseInt(x,10));
  const maj = isNaN(parts[0])?1:parts[0];
  const min = isNaN(parts[1])?0:parts[1];
  $("version").value = `${maj}.${min+1}`;
  toast("🔼 גרסה עודכנה");
  refreshJSONLive();
}

/* ---------- Settings ---------- */
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(K_SETTINGS) || "null");
    if(s){
      settings = {...settings, ...s};
    }
  }catch{}
  $("set_cw").value = settings.canvasW;
  $("set_ch").value = settings.canvasH;
  $("set_autodraft").value = settings.autoDraftSeconds;
  if($("ai_model")) $("ai_model").value = settings.aiModel || "gpt-image-1";
  applyCanvasSize();
}
function saveSettings(){
  localStorage.setItem(K_SETTINGS, JSON.stringify(settings));
}
function applySettings(){
  settings.canvasW = Number($("set_cw").value) || 1600;
  settings.canvasH = Number($("set_ch").value) || 900;
  settings.autoDraftSeconds = Number($("set_autodraft").value) || 3;
  settings.aiModel = $("ai_model")?.value || settings.aiModel;
  saveSettings();
  applyCanvasSize();
  startAutoDraft();
  toast("✅ הגדרות הוחלו");
}

function loadApiKey(){
  const saved = localStorage.getItem(K_APIKEY);
  if(saved && $("ai_api_key")){
    $("ai_api_key").value = saved;
    if($("aiRemember")) $("aiRemember").checked = true;
  }
}
function persistApiKey(){
  const remember = $("aiRemember")?.checked;
  if(!remember){
    localStorage.removeItem(K_APIKEY);
    return;
  }
  const key = safeTrim($("ai_api_key")?.value || "");
  if(key) localStorage.setItem(K_APIKEY, key);
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener("keydown", (e)=>{
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const ctrl = isMac ? e.metaKey : e.ctrlKey;

  if(ctrl && e.key.toLowerCase()==="s"){
    e.preventDefault();
    saveCurrent();
  }
  if(ctrl && e.key.toLowerCase()==="n"){
    e.preventDefault();
    newCard();
  }
  if(ctrl && e.key.toLowerCase()==="e"){
    e.preventDefault();
    exportOne();
  }
});

/* ---------- Wire events ---------- */
function wire(){
  // Tabs
  document.querySelectorAll("[data-lefttab]").forEach(el=>{
    el.addEventListener("click", ()=>switchLeftTab(el.dataset.lefttab));
  });
  document.querySelectorAll("[data-righttab]").forEach(el=>{
    el.addEventListener("click", ()=>switchRightTab(el.dataset.righttab));
  });

  // Top actions
  $("btnNew").onclick = ()=>newCard();
  $("btnSave").onclick = ()=>saveCurrent();
  $("btnCopy").onclick = ()=>copyToClipboard($("jsonOut").textContent);
  $("btnPNG").onclick = ()=>{ switchRightTab("preview"); renderCanvas(); downloadCanvasPNG(); };
  $("btnExportAll").onclick = ()=>exportAll();

  // Mini actions
  $("btnGenerate").onclick = ()=>{ refreshJSONLive(); toast("⚡ JSON נבנה"); };
  $("btnValidate").onclick = ()=>{
    const {card, problems} = refreshJSONLive();
    if(problems.length) toast("❌ " + problems.join(" • "));
    else toast("✅ הכל תקין");
  };
  $("btnIncVer").onclick = ()=>incVersion();

  $("btnAddAbility").onclick = ()=>addAbility();
  $("btnClearAbilities").onclick = ()=>clearAbilities();

  $("btnDuplicate").onclick = ()=>duplicateCurrent();
  $("btnDelete").onclick = ()=>deleteCurrent();
  $("btnExportOne").onclick = ()=>exportOne();

  $("btnMinCopy").onclick = ()=>copyToClipboard($("jsonOut").textContent);
  $("btnMinDownload").onclick = ()=>exportOne();

  // Export tab
  $("btnDownloadOne").onclick = ()=>exportOne();
  $("btnDownloadAll").onclick = ()=>exportAll();
  $("btnCopyAll").onclick = ()=>copyToClipboard(JSON.stringify(library, null, 2));
  $("btnSendAI").onclick = ()=>requestAIImage();
  const modelSel = $("ai_model");
  if(modelSel){
    modelSel.addEventListener("change", ()=>{
      settings.aiModel = modelSel.value;
      saveSettings();
      updateAIPrompt();
    });
  }
  $("ai_api_key")?.addEventListener("input", ()=>{ if($("aiRemember")?.checked) persistApiKey(); });
  $("aiRemember")?.addEventListener("change", persistApiKey);

  // Search filter
  $("q").addEventListener("input", renderLibrary);
  $("filterType").addEventListener("change", renderLibrary);

  // Import
  $("btnImport").onclick = ()=>importFromBox();
  $("btnClearImport").onclick = ()=>$("importBox").value="";
  $("fileInput").addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    const txt = await f.text();
    $("importBox").value = txt;
    toast("📎 קובץ נטען לתיבת ייבוא");
  });

  // Preview / Canvas
  $("btnRenderCanvas").onclick = ()=>renderCanvas();
  $("btnDownloadCanvas").onclick = ()=>downloadCanvasPNG();

  // Settings
  $("btnApplySettings").onclick = ()=>applySettings();
  $("btnClearDraft").onclick = ()=>{
    localStorage.removeItem(K_DRAFT);
    $("draftState").textContent = "Idle";
    toast("🧽 Draft נמחק");
  };
  $("btnClearLibrary").onclick = ()=>{
    localStorage.removeItem(K_LIBRARY);
    library = [];
    saveLibrary();
    renderLibrary();
    toast("🧨 ספרייה נוקתה");
  };

  // Auto refresh on input changes (live)
  const liveIds = [
    "card_id","card_series","card_type","card_name","card_alias","element","rarity","alignment","core_energy",
    "lore_description","personality","role","world_context","trigger","effect","first_message","dialogue_style","dialogue_examples",
    "outfit","aura","pal1","pal2","pal3","art_prompt","tags","version","changelog"
  ];
  liveIds.forEach(id=>{
    const el = $(id);
    if(el) el.addEventListener("input", ()=>refreshJSONLive());
    if(el && el.tagName==="SELECT") el.addEventListener("change", ()=>refreshJSONLive());
  });
}

/* ---------- Init ---------- */
function init(){
  // Time
  function tick(){
    $("nowTime").textContent = new Date().toLocaleString("he-IL",{dateStyle:"full", timeStyle:"medium"});
  }
  tick(); setInterval(tick, 1000);

  loadSettings();
  loadApiKey();
  loadLibrary();

  // Active card restore
  activeId = localStorage.getItem(K_ACTIVE) || null;

  renderTemplates();
  renderLibrary();

  // Try restore draft first
  const restored = restoreDraft();

  // If active exists in library and draft not restored strongly, load it
  if(!restored && activeId){
    const c = library.find(x=>x.card_id===activeId);
    if(c) loadToForm(activeId);
  } else {
    refreshJSONLive();
  }

  wire();
  startAutoDraft();
  applyCanvasSize();
  renderCanvas();
  toast("⚡ CardGPT Studio PRO מוכן");
}

init();