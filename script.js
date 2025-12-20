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