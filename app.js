import * as THREE from 'three';

const albums = [
  { title: "Erten",  artist: "Shie",     cover: "covers/21.jpg", audio: "audio/shie.mp3" },
  { title: "Before I Forget", artist: "Slipknot", cover: "covers/22.jpg",  audio: "audio/slipknot.mp3", volume: 2.0 },
  { title: "Stand By Me",     artist: "Oasis",    cover: "covers/20.jpg",  audio: "audio/oasis.mp3" }
];

let TOTAL = albums.length;

// three.js setup
const cfEl = document.getElementById('coverflow-section');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, cfEl.clientWidth / cfEl.clientHeight, 0.1, 100);
camera.position.set(0, 1.2, 5.0);
camera.lookAt(0, 0.4, 0);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true, alpha: true });
renderer.setSize(cfEl.clientWidth, cfEl.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;

// textures
const texLoader = new THREE.TextureLoader();

const alphaCanvas = document.createElement('canvas');
alphaCanvas.width = 2; 
alphaCanvas.height = 128;
const alphaCtx = alphaCanvas.getContext('2d');
const grad = alphaCtx.createLinearGradient(0, 0, 0, 128);
grad.addColorStop(0, 'rgba(255,255,255,1)'); 
grad.addColorStop(1, 'rgba(255,255,255,0)'); 
alphaCtx.fillStyle = grad; 
alphaCtx.fillRect(0, 0, 2, 128);
const reflectionAlphaMap = new THREE.CanvasTexture(alphaCanvas);

const colorCanvas = document.createElement('canvas');
colorCanvas.width = 64; 
colorCanvas.height = 64;
const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });

function placeholder(a, i) {
  const c = document.createElement('canvas'); 
  c.width = 512; 
  c.height = 512;
  const ctx = c.getContext('2d');
  const h = (i * 31 + 200) % 360; 
  
  ctx.fillStyle = `hsl(${h}, 30%, 15%)`; 
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#fff'; 
  ctx.font = '700 36px Inter'; 
  ctx.textAlign = 'center'; 
  ctx.fillText(a.title, 256, 256, 480);
  
  const t = new THREE.CanvasTexture(c); 
  t.anisotropy = 4; 
  return t;
}

function loadTex(a, i) {
  return new Promise(resolve => {
    if (a.cover) {
      texLoader.load(a.cover, t => {
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.encoding = THREE.sRGBEncoding; 
        resolve(t);
      }, undefined, () => resolve(placeholder(a, i)));
    } else {
      resolve(placeholder(a, i));
    }
  });
}

const coverGrp = new THREE.Group(); 
scene.add(coverGrp);
const refGrp = new THREE.Group(); 
scene.add(refGrp);

const covers = [];
const refs = [];
const CW = 2.0;
const CH = 2.0;
const SIDE_ANG = Math.PI / 2.4;
const SIDE_GAP = 1.3;
const SIDE_SPC = 0.35;          

async function build() {
  const geo = new THREE.PlaneGeometry(CW, CH);
  for (let i = 0; i < TOTAL; i++) {
    const t = await loadTex(albums[i], i);
    
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: true }));
    coverGrp.add(m); 
    covers.push(m);
    
    const rm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.25, depthWrite: false }));
    refGrp.add(rm); 
    refs.push(rm);
  }
  document.getElementById('loading').classList.add('hidden');
}

// upload ui logic
const modal = document.getElementById('upload-modal');
const addBtn = document.getElementById('add-track-btn');
const closeBtn = document.getElementById('close-modal-btn');
const form = document.getElementById('upload-form');

addBtn.addEventListener('click', () => modal.classList.add('visible'));
closeBtn.addEventListener('click', () => modal.classList.remove('visible'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = document.getElementById('in-title').value;
  const artist = document.getElementById('in-artist').value;
  const coverFile = document.getElementById('in-cover').files[0];
  const audioFile = document.getElementById('in-audio').files[0];

  const coverUrl = coverFile ? URL.createObjectURL(coverFile) : null;
  const audioUrl = audioFile ? URL.createObjectURL(audioFile) : null;

  const newAlbum = { title, artist, cover: coverUrl, audio: audioUrl, volume: 1.0 };
  albums.push(newAlbum);
  TOTAL = albums.length;
  const i = TOTAL - 1;

  const t = await loadTex(newAlbum, i);
  const geo = new THREE.PlaneGeometry(CW, CH);
  
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: true }));
  coverGrp.add(m); 
  covers.push(m);
  
  const rm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.25, depthWrite: false }));
  refGrp.add(rm); 
  refs.push(rm);

  modal.classList.remove('visible');
  form.reset();

  document.getElementById('cover-label').textContent = 'Select Cover Image (JPG/PNG)';
  document.getElementById('audio-label').textContent = 'Select Audio File (MP3/WAV)';
  
  tgtIdx = i; 
  scrollHandX = i / Math.max(1, TOTAL - 1); 
  smScrollX = scrollHandX;
});

// state & gesture logic
let tgtIdx = Math.floor(TOTAL / 2);
let smIdx = tgtIdx;
let scrollHandX = 0.5;
let smScrollX = 0.5;
let scrollActive = false;
let scrollPinch = false;
let prevScrollPinch = false;

let twoHands = false;
let effectPinch = false;
let effectHandX = 0.5;

let smEffectPX = 0, smEffectPY = 1.5, smEffectPZ = 0;
let effectPinchX = 0, effectPinchY = 1.5, effectPinchZ = 0;

let uwAmt = 0;
let smoothAudioScale = 1.0; 
let smoothColorVibe = 0.0; 

const coverWP = []; 

function pinchD(lm) { 
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y; 
  return Math.sqrt(dx * dx + dy * dy); 
}

function processHands(res) {
  if (!res.multiHandLandmarks || res.multiHandLandmarks.length === 0) {
    scrollActive = false; 
    twoHands = false; 
    return;
  }
  
  const hand1 = res.multiHandLandmarks[0];
  twoHands = res.multiHandLandmarks.length >= 2;

  if (!twoHands) {
    scrollActive = true;
    let rawX = 1 - hand1[8].x; 
    scrollHandX = Math.max(0, Math.min(1, (rawX - 0.2) / 0.6));
  } else { 
    scrollActive = false; 
  }

  const nowPinch = pinchD(hand1) < 0.06;
  if (nowPinch && !prevScrollPinch && !twoHands) {
    const idx = ((Math.round(smIdx) % TOTAL) + TOTAL) % TOTAL; 
    play(idx);
  }
  
  prevScrollPinch = nowPinch; 
  scrollPinch = nowPinch;

  if (twoHands) {
    const hand2 = res.multiHandLandmarks[1];
    effectPinch = pinchD(hand2) < 0.06; 
    effectHandX = 1 - hand2[8].x;
    
    if (effectPinch) {
      const mx = 1 - (hand2[4].x + hand2[8].x) / 2;
      const my = (hand2[4].y + hand2[8].y) / 2;
      effectPinchX = (mx - 0.5) * 8.0; 
      effectPinchY = (0.5 - my) * 4.0 + 0.5; 
      effectPinchZ = -0.5; 
    }
  } else { 
    effectPinch = false; 
  }
}

async function initMP() {
  try {
    const s1 = document.createElement('script'); 
    s1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js'; 
    document.head.appendChild(s1);
    
    const s2 = document.createElement('script'); 
    s2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js'; 
    document.head.appendChild(s2);
    
    await new Promise(r => { s2.onload = r; }); 
    await new Promise(r => setTimeout(r, 500));
    
    const v = document.getElementById('webcam');
    const h = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
    
    h.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
    h.onResults(processHands);
    
    new window.Camera(v, { 
      onFrame: async () => { await h.send({ image: v }) }, 
      width: 1280, 
      height: 720 
    }).start();
  } catch (e) { 
    console.log('MediaPipe init failed', e); 
  }
}

// audio setup
let actx, asrc, again, afilt, curAud;
let analyser, dataArray;

function initA() { 
  if (actx) return; 
  
  actx = new (window.AudioContext || window.webkitAudioContext)(); 
  again = actx.createGain(); 
  afilt = actx.createBiquadFilter(); 
  afilt.type = 'lowpass'; 
  afilt.frequency.value = 20000; 
  afilt.Q.value = 0.5; 
  
  analyser = actx.createAnalyser(); 
  analyser.fftSize = 256; 
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  again.connect(afilt); 
  afilt.connect(analyser); 
  analyser.connect(actx.destination); 
}

function play(i) {
  const a = albums[i]; 
  if (!a || !a.audio) return; 
  
  initA(); 
  if (actx.state === 'suspended') actx.resume(); 
  
  if (curAud) { 
    curAud.pause(); 
    if (asrc) asrc.disconnect(); 
  }
  
  curAud = new Audio(a.audio); 
  curAud.crossOrigin = 'anonymous';
  again.gain.value = a.volume || 1.0; 
  
  if (a.trimStart) {
    curAud.addEventListener('loadedmetadata', () => { curAud.currentTime = a.trimStart; });
  } else {
    curAud.currentTime = 0;
  }
  
  curAud.ontimeupdate = () => { 
    if (a.trimEnd && curAud.currentTime >= a.trimEnd) curAud.pause(); 
  };
  
  asrc = actx.createMediaElementSource(curAud); 
  asrc.connect(again);
  curAud.play().catch(e => console.log("Audio play blocked", e));
  
  const np = document.getElementById('now-playing'); 
  np.classList.add('visible'); 
  np.innerHTML = '<span class="dot"></span>PLAYING: ' + a.title;
}

function uwFilter(v) { 
  if (!afilt) return; 
  afilt.frequency.setTargetAtTime(20000 - 19600 * v, actx.currentTime, 0.1); 
}

// particles
const PC = 40000; 
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PC * 3);
const pTgt = new Float32Array(PC * 3);
const pSz = new Float32Array(PC);
const pCol = new Float32Array(PC * 3);
const cloudBaseTgt = new Float32Array(PC * 3);

for (let i = 0; i < PC; i++) {
  pPos[i*3] = 0; 
  pPos[i*3+1] = 1; 
  pPos[i*3+2] = 0;
  
  pSz[i] = 0.15 + Math.random() * 0.3; 
  
  pCol[i*3] = 1; 
  pCol[i*3+1] = 1; 
  pCol[i*3+2] = 1;
  
  const r = 3.0 + Math.pow(Math.random(), 2) * 8.0;
  const theta = Math.random() * 2 * Math.PI;
  const phi = Math.acos(2 * Math.random() - 1);
  
  cloudBaseTgt[i*3] = r * Math.sin(phi) * Math.cos(theta); 
  cloudBaseTgt[i*3+1] = r * Math.sin(phi) * Math.sin(theta) + 1.0; 
  cloudBaseTgt[i*3+2] = r * Math.cos(phi) - 4.0; 
}

pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSz, 1));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));

const pMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, colorVibe: { value: 0.0 } },
  vertexShader: `
    uniform float time;
    attribute float size; 
    attribute vec3 color; 
    varying vec3 vC; 
    varying float vA;
    
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    
    void main() {
      vec3 displacedPos = position; 
      float idIdx = float(gl_VertexID);
      
      displacedPos.x += (hash(idIdx + time * 20.0) - 0.5) * 0.01;
      displacedPos.y += (hash(idIdx * 1.3 + time * 18.0) - 0.5) * 0.01;
      displacedPos.z += (hash(idIdx * 0.7 + time * 22.0) - 0.5) * 0.01;
      
      vC = color; 
      vec4 mv = modelViewMatrix * vec4(displacedPos, 1.0);
      gl_PointSize = size * (40.0 / -mv.z); 
      gl_Position = projectionMatrix * mv; 
      vA = smoothstep(25.0, 2.0, -mv.z);
    }
  `,
  fragmentShader: `
    uniform float colorVibe; 
    varying vec3 vC; 
    varying float vA;
    
    void main() {
      float d = length(gl_PointCoord - 0.5); 
      if (d > 0.5) discard; 
      vec3 dynamicCol = vC * (1.0 + colorVibe * 1.5); 
      gl_FragColor = vec4(dynamicCol, vA);
    }
  `,
  transparent: true, 
  depthWrite: false, 
  blending: THREE.AdditiveBlending
});

const pts = new THREE.Points(pGeo, pMat); 
scene.add(pts);

let smCloudRotY = 0;
let particlesInitialized = false;

function initParticlesFromCovers() {
  const ci = ((Math.round(smIdx) % TOTAL) + TOTAL) % TOTAL;
  const activeTex = covers[ci].material.map;
  
  if (activeTex && activeTex.image) {
    try {
      colorCtx.drawImage(activeTex.image, 0, 0, 64, 64); 
      const data = colorCtx.getImageData(0, 0, 64, 64).data;
      
      for (let i = 0; i < PC; i++) {
        const px = Math.floor(Math.random() * 64 * 64) * 4;
        pCol[i*3] = data[px] / 255.0; 
        pCol[i*3+1] = data[px+1] / 255.0; 
        pCol[i*3+2] = data[px+2] / 255.0;
      }
      pGeo.attributes.color.needsUpdate = true;
    } catch(e) {}
  }
  
  for (let i = 0; i < PC; i++) {
    const c_idx = i % Math.max(1, coverWP.length); 
    const wp = coverWP[c_idx] || {x:0, y:1, z:0};
    
    pPos[i*3] = wp.x + (Math.random() - 0.5) * 0.5; 
    pPos[i*3+1] = wp.y + (Math.random() - 0.5) * 0.5; 
    pPos[i*3+2] = wp.z + (Math.random() - 0.5) * 0.5;
  }
  pGeo.attributes.position.needsUpdate = true; 
  particlesInitialized = true;
}

function cloudTargets() {
  for (let i = 0; i < PC; i++) { 
    pTgt[i*3] = cloudBaseTgt[i*3]; 
    pTgt[i*3+1] = cloudBaseTgt[i*3+1]; 
    pTgt[i*3+2] = cloudBaseTgt[i*3+2]; 
  }
}

function sphereTargets(cx, cy, cz, scale) {
  const sr = 0.35 * scale; 
  for (let i = 0; i < PC; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / PC);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    
    pTgt[i*3] = cx + Math.sin(phi) * Math.cos(theta) * sr; 
    pTgt[i*3+1] = cy + Math.cos(phi) * sr; 
    pTgt[i*3+2] = cz + Math.sin(phi) * Math.sin(theta) * sr;
  }
}

// render loop
function updCovers(dt) {
  if (TOTAL === 0) return; 
  
  if (!twoHands) {
    if (scrollActive) { 
      smScrollX += (scrollHandX - smScrollX) * 5.0 * dt; 
      tgtIdx = smScrollX * (Math.max(0, TOTAL - 1)); 
    }
    smIdx += (tgtIdx - smIdx) * 6.0 * dt;
    
    const ci = ((Math.round(smIdx) % TOTAL) + TOTAL) % TOTAL;
    document.getElementById('track-title').textContent = albums[ci].title; 
    document.getElementById('track-artist').textContent = albums[ci].artist;
  }
  
  coverWP.length = 0;
  
  for (let i = 0; i < covers.length; i++) {
    const off = i - smIdx;
    const ao = Math.abs(off);
    const sg = Math.sign(off) || 1;
    let x, z, ry, s, a; 
    
    if (ao < 0.5) { 
      const t = ao * 2; 
      x = off * 1.6; 
      z = 0.6 * (1 - t*t); 
      ry = -off * (Math.PI / 4); 
      s = 1.0; 
      a = 1; 
    } else { 
      const si = ao - 0.5; 
      x = sg * (SIDE_GAP + si * SIDE_SPC); 
      z = -1.0 - si * 0.05; 
      ry = -sg * SIDE_ANG; 
      s = 0.65; 
      a = Math.max(0, 1 - si * 0.1); 
    }
    
    const c = covers[i]; 
    c.position.set(x, 0.5, z); 
    c.rotation.y = ry; 
    c.scale.setScalar(s); 
    c.material.opacity = a; 
    c.visible = (ao < 12) && !twoHands; 
    
    coverWP.push({ x, y: 0.5, z });
    
    const r = refs[i]; 
    r.position.set(x, 0.5 - (CH * s) - 0.02, z); 
    r.rotation.set(0, ry, 0); 
    r.scale.set(s, -s, s); 
    r.material.opacity = a * 0.25; 
    r.visible = c.visible;
  }
}

function updPart(dt) {
  const currentTime = performance.now() * 0.001;
  pMat.uniforms.time.value = currentTime; 

  uwAmt += ((twoHands ? 1 : 0) - uwAmt) * 4.0 * dt; 
  document.getElementById('underwater-overlay').classList.toggle('active', uwAmt > 0.1); 
  uwFilter(uwAmt);
  
  if (twoHands) {
    pts.visible = true;
    if (!particlesInitialized && coverWP.length > 0) initParticlesFromCovers();
  } else { 
    pts.visible = false; 
    particlesInitialized = false; 
    return; 
  }

  if (effectPinch) {
    smEffectPX += (effectPinchX - smEffectPX) * 25.0 * dt;
    smEffectPY += (effectPinchY - smEffectPY) * 25.0 * dt;
    smEffectPZ += (effectPinchZ - smEffectPZ) * 25.0 * dt;
    
    let audioVibeIntensity = 0.0;
    
    if (analyser && curAud && !curAud.paused) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0; 
      for (let i = 0; i < 20; i++) sum += dataArray[i]; 
      
      let avg = sum / 20.0;
      audioVibeIntensity = Math.pow(avg / 255.0, 2); 
    }

    let dynamicBase = 2.0 + Math.pow(audioVibeIntensity, 2) * 8.0; 
    let vibeOffset = 1.0 + audioVibeIntensity * 0.5 * Math.sin(performance.now() * 0.05);
    let targetScale = Math.max(0.3, dynamicBase * vibeOffset);

    if (targetScale > smoothAudioScale) {
        smoothAudioScale += (targetScale - smoothAudioScale) * 25.0 * dt; 
    } else {
        smoothAudioScale += (targetScale - smoothAudioScale) * 15.0 * dt; 
    }
    
    smoothColorVibe += (audioVibeIntensity - smoothColorVibe) * 20.0 * dt;
    pMat.uniforms.colorVibe.value = smoothColorVibe;

    sphereTargets(smEffectPX, smEffectPY, smEffectPZ, smoothAudioScale);
  } else {
    cloudTargets(); 
    smCloudRotY += (((effectHandX - 0.5) * Math.PI * 2) - smCloudRotY) * 5.0 * dt; 
    pts.rotation.y = smCloudRotY;
    pMat.uniforms.colorVibe.value = 0.0; 
  }

  const pos = pGeo.attributes.position.array;
  const ms = effectPinch ? 35.0 : 5.0; 
  
  for (let i = 0; i < PC; i++) {
    pos[i*3] += (pTgt[i*3] - pos[i*3]) * ms * dt; 
    pos[i*3+1] += (pTgt[i*3+1] - pos[i*3+1]) * ms * dt; 
    pos[i*3+2] += (pTgt[i*3+2] - pos[i*3+2]) * ms * dt;
    
    if (!effectPinch) { 
      pos[i*3] += Math.sin(currentTime * 0.8 + i) * 0.005; 
      pos[i*3+1] += Math.cos(currentTime * 0.7 + i) * 0.005; 
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

let pt = performance.now();

function anim() {
  requestAnimationFrame(anim);
  const n = performance.now();
  const dt = Math.min((n - pt) / 1000, 0.05); 
  pt = n;
  
  if (covers.length > 0) { 
    updCovers(dt); 
    updPart(dt); 
  } 
  renderer.render(scene, camera);
}

// events
window.addEventListener('resize', () => { 
  camera.aspect = cfEl.clientWidth / cfEl.clientHeight; 
  camera.updateProjectionMatrix(); 
  renderer.setSize(cfEl.clientWidth, cfEl.clientHeight); 
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  
  if (e.key === 'ArrowLeft') tgtIdx = Math.max(0, Math.round(tgtIdx) - 1); 
  if (e.key === 'ArrowRight') tgtIdx = Math.min(TOTAL - 1, Math.round(tgtIdx) + 1);
  if (e.key === ' ') { e.preventDefault(); twoHands = !twoHands; } 
  if (e.key === 'p' || e.key === 'P') effectPinch = !effectPinch;
});

cfEl.addEventListener('mousemove', e => {
  if (twoHands || TOTAL <= 1) return;
  const r = cfEl.getBoundingClientRect(); 
  scrollHandX = Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width - 0.2) / 0.6)); 
  scrollActive = true;
});

cfEl.addEventListener('click', () => { 
  if (TOTAL > 0) play(((Math.round(smIdx) % TOTAL) + TOTAL) % TOTAL); 
}); 

cfEl.addEventListener('mouseleave', () => { scrollActive = false; });

document.getElementById('in-cover').addEventListener('change', e => {
  document.getElementById('cover-label').textContent = e.target.files[0] ? e.target.files[0].name : 'Select Cover Image (JPG/PNG)';
});

document.getElementById('in-audio').addEventListener('change', e => {
  document.getElementById('audio-label').textContent = e.target.files[0] ? e.target.files[0].name : 'Select Audio File (MP3/WAV)';
});

build().then(() => { 
  anim(); 
  initMP(); 
});