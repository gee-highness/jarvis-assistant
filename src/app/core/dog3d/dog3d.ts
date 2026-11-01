/**
 * Real-time 3D dog: a rigged, procedurally built model (assets/pet/dog.glb) drawn with a fur-shell shader.
 * three.js is imported lazily so it never touches the main bundle. Everything runs on the phone; nothing is downloaded.
 */
type T = typeof import('three');
import type * as THREE from 'three';

export type DogClip = 'idle' | 'walk' | 'sit' | 'lie' | 'happy' | 'bark' | 'sniff';
export interface DogCoat { fur: string; patch: string; belly?: string; bandana: string; accessory: string }
export interface DogOptions { shells?: number; pixelRatio?: number; alpha?: boolean }

const VERT = /* glsl */ `
uniform float uShell; uniform float uFurScale; uniform vec3 uGravity; uniform float uTime; uniform float uSway;
attribute float _furlen; attribute vec4 _mask;
varying vec3 vRest; varying float vH; varying vec4 vMask; varying vec3 vN; varying vec3 vV; varying float vLen;
#include <common>
#include <skinning_pars_vertex>
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  float L = _furlen * uFurScale;
  vec3 n = normalize(objectNormal);
  float h = uShell;
  // strands lean with gravity and sway gently with a slow wind; long feathers move more
  vec3 wind = vec3(sin(uTime * 1.3 + transformed.z * 6.0), 0.0, cos(uTime * 1.1 + transformed.x * 5.0)) * uSway * (0.4 + _mask.a);
  transformed += n * L * h + (uGravity + wind) * L * h * h;
  vRest = position; vH = h; vMask = _mask; vLen = _furlen;
  vN = normalize(normalMatrix * objectNormal);
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uFur; uniform vec3 uPatch; uniform vec3 uBelly; uniform vec3 uLight; uniform float uDensity; uniform float uShells;
varying vec3 vRest; varying float vH; varying vec4 vMask; varying vec3 vN; varying vec3 vV; varying float vLen;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  float h = vH;
  float dens = uDensity * (vLen < 0.01 ? 1.5 : 1.0);
  vec3 cell = vRest * dens;
  vec3 id = floor(cell);
  vec3 f = fract(cell) - 0.5;
  float r = hash(id);
  float r2 = hash(id + 7.7);
  float strand = 0.62 + 0.38 * r;
  float alpha = 1.0;
  if (h > 0.001) {
    if (h > strand) discard;
    vec3 jit = (vec3(hash(id + 1.7), hash(id + 3.1), hash(id + 5.3)) - 0.5) * 0.45;
    float d = length(f - jit);
    float width = mix(0.82, 0.24, h / strand);
    alpha = smoothstep(width, width * 0.72, d);
    if (alpha < 0.02) discard;
  }
  // colour: patches (ears, tail feathers) and a lighter chest, belly and muzzle, with soft clumps and per-strand tone
  float clump = vnoise(vRest * 38.0);
  vec3 col = mix(uFur, uPatch, clamp(vMask.g, 0.0, 1.0));
  col = mix(col, uPatch, smoothstep(0.55, 0.9, vnoise(vRest * 9.0 + 3.0)) * 0.35);
  col = mix(col, uBelly, clamp(vMask.r, 0.0, 1.0));
  col *= 0.86 + 0.28 * r2 + 0.12 * (clump - 0.5);
  // dark skin showing through around the eyes and along the lips
  float ex = abs(vRest.x);
  float eyeRim = smoothstep(0.024, 0.01, length(vec3(ex - 0.038, vRest.y - 0.812, vRest.z - 0.627)));
  float mouth = smoothstep(0.0045, 0.0012, abs(vRest.y - (0.739 + 0.012 * smoothstep(0.7, 0.6, vRest.z))))
              * smoothstep(0.58, 0.64, vRest.z) * smoothstep(0.75, 0.7, vRest.z) * (1.0 - smoothstep(0.045, 0.06, ex));
  col = mix(col, vec3(0.1, 0.07, 0.05), clamp(eyeRim * 0.6 + mouth * 0.85, 0.0, 0.9) * (1.0 - h * 0.4));
  float root = mix(0.66, 1.0, pow(h, 0.6));
  col *= root;
  col += vec3(0.07) * h * (0.4 + r);
  // lighting: soft wrap diffuse + sky/ground ambient + translucent rim + a gentle strand sheen
  vec3 N = normalize(vN), V = normalize(vV), Ld = normalize(uLight);
  float ndl = dot(N, Ld) * 0.5 + 0.5; ndl *= ndl;
  float sky = N.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.5, 0.45, 0.42), vec3(0.82, 0.86, 0.95), sky);
  float ao = mix(0.72, 1.0, pow(h, 0.5));
  vec3 lit = col * (amb * 0.7 + vec3(1.0, 0.95, 0.88) * ndl * 0.85) * ao;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  lit += col * rim * 0.34 * (0.4 + h);
  vec3 H = normalize(Ld + V);
  lit += vec3(1.0, 0.96, 0.9) * pow(max(dot(N, H), 0.0), 26.0) * 0.1 * h;
  gl_FragColor = vec4(lit, alpha);
}`;

export class Dog3D {
  private constructor(private THREE: T, private canvas: HTMLCanvasElement, private opts: Required<DogOptions>) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: opts.alpha, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(opts.pixelRatio);
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
    this.clock = new THREE.Clock();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x5a4a3a, 0.9));
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.position.set(1.5, 2.6, 2.0);
    this.scene.add(this.sun);
  }

  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private root: THREE.Group;
  private sun: THREE.DirectionalLight;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private clipName: DogClip = 'idle';
  private bones = new Map<string, THREE.Bone>();
  private shells: THREE.SkinnedMesh[] = [];
  private furUniforms: Record<string, { value: unknown }>[] = [];
  private eyes: THREE.Object3D[] = [];
  private accessories?: THREE.Group;
  private yaw = 0; private yawTarget = 0;
  private gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  private blinkAt = 0; private blink = 0;
  private time = 0;
  private raf = 0;
  private running = false;
  private disposed = false;
  private fps = 60; private lastDraw = 0;
  ready = false;
  /** Normalised 0..1 horizontal / vertical focus for framing. */
  frame = { dist: 3.0, targetY: 0.4, fov: 26 };

  static supported(): boolean {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  static async create(canvas: HTMLCanvasElement, url: string, opts: DogOptions = {}): Promise<Dog3D> {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const d = new Dog3D(THREE, canvas, { shells: opts.shells ?? 24, pixelRatio: opts.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2), alpha: opts.alpha ?? true });
    const gltf = await new GLTFLoader().loadAsync(url);
    d.build(gltf.scene, gltf.animations);
    return d;
  }

  // ------------------------------------------------------------------ build
  private build(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const THREE = this.THREE;
    this.root.add(model);
    model.updateMatrixWorld(true);
    let skin: THREE.SkinnedMesh | undefined;
    model.traverse(o => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skin = o as THREE.SkinnedMesh;
      if (o.name === 'EyeL' || o.name === 'EyeR') this.eyes.push(o);
    });
    if (!skin) throw new Error('dog.glb has no skinned mesh');
    const base = skin;
    base.visible = false; // replaced by fur shells
    base.frustumCulled = false;
    const n = this.opts.shells;
    for (let i = 0; i < n; i++) {
      const h = n === 1 ? 0 : i / (n - 1);
      const u = {
        uShell: { value: h }, uFurScale: { value: 0.72 }, uGravity: { value: new THREE.Vector3(0, -0.8, 0) }, uTime: { value: 0 }, uSway: { value: 0.08 },
        uFur: { value: new THREE.Color('#e0b070') }, uPatch: { value: new THREE.Color('#b87a3d') }, uBelly: { value: new THREE.Color('#f1d9a8') },
        uLight: { value: new THREE.Vector3(0.5, 0.9, 0.8) }, uDensity: { value: 430 }, uShells: { value: n },
      };
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.FrontSide, transparent: false, alphaToCoverage: i > 0 });
      const mesh = new THREE.SkinnedMesh(base.geometry, mat);
      mesh.bind(base.skeleton, base.bindMatrix);
      mesh.frustumCulled = false;
      mesh.renderOrder = i;
      base.parent!.add(mesh);
      this.shells.push(mesh);
      this.furUniforms.push(u);
    }
    // eyes: glossy, with a little iris
    const env = this.makeEnv();
    for (const e of this.eyes) {
      const m = (e as THREE.Mesh).material as THREE.MeshStandardMaterial;
      (e as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({ color: 0x1b0f08, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 1.6 });
      void m;
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0092, 24), new THREE.MeshBasicMaterial({ color: 0x4a2a10 }));
      iris.position.set(0, 0, 0.0124); iris.name = 'iris';
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0049, 20), new THREE.MeshBasicMaterial({ color: 0x050302 }));
      pupil.position.set(0, 0, 0.0127);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.0032, 0.0038, 0.0129);
      e.add(iris, pupil, glint);
    }
    const nose = model.getObjectByName('NoseTip') as THREE.Mesh | undefined;
    if (nose) nose.material = new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.34, metalness: 0, envMap: env, envMapIntensity: 0.35 });
    // animation
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) { const a = this.mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); this.actions.set(c.name, a); }
    this.play('idle', 0);
    this.blinkAt = 2 + Math.random() * 3;
    this.applyCoat({ fur: '#e0b070', patch: '#b87a3d', bandana: '#22d3ee', accessory: 'none' });
    this.ready = true;
  }

  private makeEnv(): THREE.Texture | null {
    // a soft studio-style environment built from gradients, so wet eyes and the nose catch real-looking highlights
    const THREE = this.THREE;
    try {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 128); grad.addColorStop(0, '#dfeaff'); grad.addColorStop(0.55, '#9a9488'); grad.addColorStop(1, '#3b342c');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#ffffff'; g.fillRect(150, 18, 60, 34); g.fillRect(30, 30, 34, 22);
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    } catch { return null; }
  }

  // ------------------------------------------------------------------ look
  applyCoat(c: DogCoat) {
    const THREE = this.THREE;
    const fur = new THREE.Color(c.fur), patch = new THREE.Color(c.patch);
    const belly = c.belly ? new THREE.Color(c.belly) : fur.clone().lerp(new THREE.Color('#ffffff'), 0.4);
    // shader colours are display-referred; convert from the linear working space three gives us
    const asDisplay = (col: THREE.Color) => new THREE.Color().setRGB(col.r, col.g, col.b, THREE.SRGBColorSpace).convertLinearToSRGB();
    void asDisplay;
    for (const u of this.furUniforms) {
      (u['uFur'].value as THREE.Color).set(c.fur).convertLinearToSRGB();
      (u['uPatch'].value as THREE.Color).set(c.patch).convertLinearToSRGB();
      (u['uBelly'].value as THREE.Color).copy(belly).convertLinearToSRGB();
    }
    void fur; void patch;
    this.setAccessory(c.accessory, c.bandana);
  }

  setQuality(shells: number) {
    const keep = Math.max(1, Math.min(this.shells.length, Math.round(shells)));
    // show an evenly spaced subset of shells (the tips stay, the density thins)
    this.shells.forEach((m, i) => { m.visible = keep >= this.shells.length || i === 0 || Math.floor((i * keep) / this.shells.length) !== Math.floor(((i - 1) * keep) / this.shells.length); });
  }

  setAccessory(kind: string, bandana: string) {
    const THREE = this.THREE;
    if (this.accessories) { this.accessories.parent?.remove(this.accessories); this.accessories = undefined; }
    const head = this.bones.get('head'), neck = this.bones.get('neck1');
    if (!head || !neck) return;
    const g = new THREE.Group(); g.name = 'accessories';
    const mat = (hex: string, rough = 0.6) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.05 });
    const band = mat(bandana, 0.8);
    // bandana: always a small cloth triangle at the throat, unless a scarf replaces it
    const neckPos = new THREE.Vector3(0, 0.643, 0.377);
    const toBone = (bone: THREE.Bone, world: THREE.Vector3) => bone.worldToLocal(world.clone());
    if (kind !== 'scarf') {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4, 1), band);
      tri.rotation.set(Math.PI, Math.PI / 4, 0); tri.scale.set(1.2, 1, 0.3); tri.position.copy(toBone(neck, new THREE.Vector3(0, 0.575, 0.435)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.0105, 10, 36), band);
      ring.rotation.x = -0.69; ring.position.copy(toBone(neck, neckPos));
      g.add(ring); const tg = new THREE.Group(); tg.add(tri); neck.add(tg);
      this.bandanaParts = [tg];
    }
    const add = (bone: THREE.Bone, m: THREE.Object3D, world: [number, number, number], rot?: [number, number, number]) => { m.position.copy(toBone(bone, new THREE.Vector3(...world))); if (rot) m.rotation.set(...rot); bone.add(m); this.accParts.push(m); };
    for (const p of this.accParts) p.parent?.remove(p);
    this.accParts = [];
    switch (kind) {
      case 'bowtie': { const b = new THREE.Group(); const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 12), band); c1.rotation.z = Math.PI / 2; c1.position.x = 0.028; const c2 = c1.clone(); c2.rotation.z = -Math.PI / 2; c2.position.x = -0.028; const kn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), band); b.add(c1, c2, kn); add(neck, b, [0, 0.58, 0.405]); break; }
      case 'glasses': case 'shades': {
        const col = kind === 'shades' ? mat('#0b0f19', 0.2) : mat('#1f2937', 0.4);
        const lens = (x: number) => new THREE.Mesh(kind === 'shades' ? new THREE.CylinderGeometry(0.02, 0.02, 0.004, 24) : new THREE.TorusGeometry(0.019, 0.0021, 8, 28), col);
        const gl = new THREE.Group(); const a = lens(0.041), b = lens(-0.041);
        a.rotation.x = b.rotation.x = Math.PI / 2; a.position.x = 0.041; b.position.x = -0.041; if (kind === 'shades') { a.rotation.x = b.rotation.x = Math.PI / 2; }
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.03, 6), col); br.rotation.z = Math.PI / 2;
        gl.add(a, b, br); add(head, gl, [0, 0.82, 0.628]); break;
      }
      case 'cap': { const cap = new THREE.Group(); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.082, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), band); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 20, 1, false, -Math.PI / 2, Math.PI), mat('#111827', 0.7)); brim.position.set(0, 0.003, 0.06); brim.scale.set(1.05, 1, 0.9); cap.add(dome, brim); add(head, cap, [0, 0.826, 0.535], [-0.25, 0, 0]); break; }
      case 'crown': { const pts = []; for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(0.06 + (i % 2 ? 0.012 : 0), i * 0.008)); const crown = new THREE.Mesh(new THREE.LatheGeometry(pts, 5), mat('#fbbf24', 0.25)); crown.scale.set(1, 1, 1); add(head, crown, [0, 0.875, 0.53]); break; }
      case 'headphones': { const hp = new THREE.Group(); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.006, 8, 28, Math.PI), mat('#1f2937', 0.5)); arc.rotation.set(0, 0, 0); const cupL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 20), band), cupR = cupL.clone(); cupL.rotation.z = cupR.rotation.z = Math.PI / 2; cupL.position.set(0.098, 0, 0); cupR.position.set(-0.098, 0, 0); hp.add(arc, cupL, cupR); add(head, hp, [0, 0.8, 0.54]); break; }
      case 'party': { const hat = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 16), band); const pom = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mat('#fbbf24')); pom.position.y = 0.075; hat.add(pom); add(head, hat, [0, 0.89, 0.53], [-0.1, 0, 0]); break; }
      case 'wizard': { const hat = new THREE.Group(); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 18), mat('#5b21b6', 0.6)); cone.position.y = 0.1; cone.rotation.z = 0.2; const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.006, 24), mat('#4c1d95', 0.6)); hat.add(cone, brim); add(head, hat, [0, 0.855, 0.53], [-0.1, 0, 0]); break; }
      case 'flower': { for (const sx of [1, -1]) { const fl = new THREE.Group(); for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mat(sx > 0 ? '#fb7185' : '#a78bfa', 0.7)); p.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.016, Math.sin((i / 6) * Math.PI * 2) * 0.016, 0); fl.add(p); } const c = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), mat('#fde68a')); fl.add(c); add(head, fl, [sx * 0.07, 0.855, 0.55], [0.3, sx * 0.5, 0]); } break; }
      case 'scarf': { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.026, 12, 32), band); sc.rotation.x = -0.69; const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.014), band); tail.position.set(0.05, -0.08, 0.06); sc.add(tail); add(neck, sc, [0, 0.643, 0.377]); break; }
      default: break;
    }
    this.accessories = g;
    neck.add(g);
  }
  private accParts: THREE.Object3D[] = [];
  private bandanaParts: THREE.Object3D[] = [];

  // ------------------------------------------------------------------ animation
  play(name: DogClip, fade = 0.35) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a; this.clipName = name;
  }
  get clip() { return this.clipName; }
  setSpeed(s: number) { if (this.mixer) this.mixer.timeScale = s; }
  /** Play a clip once on top of the current one, then return (bark, sniff). */
  playOnce(name: DogClip, back: DogClip = this.clipName) {
    const a = this.actions.get(name); if (!a || !this.mixer) return;
    const prev = this.current;
    a.reset().setLoop(this.THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1).play();
    if (prev && prev !== a) prev.crossFadeTo(a, 0.15, false);
    const done = (e: { action: THREE.AnimationAction }) => { if (e.action !== a) return; this.mixer!.removeEventListener('finished', done as never); a.setLoop(this.THREE.LoopRepeat, Infinity); this.current = undefined; this.play(back, 0.25); };
    this.mixer.addEventListener('finished', done as never);
    this.current = a; this.clipName = name;
  }
  setYaw(rad: number, snap = false) { this.yawTarget = rad; if (snap) this.yaw = rad; }
  lookAt(x: number, y: number) { this.gaze.tx = Math.max(-1, Math.min(1, x)); this.gaze.ty = Math.max(-1, Math.min(1, y)); }
  setLight(x: number, y: number, z: number) { for (const u of this.furUniforms) (u['uLight'].value as THREE.Vector3).set(x, y, z); this.sun.position.set(x * 2.5, y * 2.5, z * 2.5); }
  setFurLength(scale: number) { for (const u of this.furUniforms) u['uFurScale'].value = scale; }

  // ------------------------------------------------------------------ render
  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private placeCamera() {
    const c = this.camera, f = this.frame;
    c.fov = f.fov;
    // three-quarter view from the dog's front-right, slightly above
    const ang = 0.55;
    c.position.set(Math.sin(ang) * f.dist, f.targetY + 0.38, Math.cos(ang) * f.dist);
    c.lookAt(0, f.targetY, 0.02);
    c.updateProjectionMatrix();
  }

  update(dt: number) {
    if (!this.ready) return;
    this.time += dt;
    this.mixer?.update(dt);
    // turn smoothly
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 7);
    this.root.rotation.y = this.yaw;
    // gaze: head and neck follow your finger a little
    const g = this.gaze;
    g.x += (g.tx - g.x) * Math.min(1, dt * 6); g.y += (g.ty - g.y) * Math.min(1, dt * 6);
    const head = this.bones.get('head'), neck = this.bones.get('neck2');
    const sleeping = this.clipName === 'lie';
    const amt = sleeping ? 0 : 1;
    if (head) { head.rotation.y += g.x * 0.5 * amt; head.rotation.x += -g.y * 0.3 * amt; }
    if (neck) { neck.rotation.y += g.x * 0.2 * amt; }
    // blink
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) { this.blink = 0.14; this.blinkAt = 2.2 + Math.random() * 4.5; }
    this.blink = Math.max(0, this.blink - dt);
    const closed = sleeping || this.clipName === 'sit' && false ? 1 : this.blink > 0 ? Math.sin((this.blink / 0.14) * Math.PI) : 0;
    for (const e of this.eyes) e.scale.y = 1 - 0.92 * Math.min(1, closed);
    for (const u of this.furUniforms) u['uTime'].value = this.time;
  }

  draw() {
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  /** Continuous rendering loop (call stop() when the view is hidden). */
  start(fps = 45) {
    if (this.running) return;
    this.running = true; this.fps = fps; this.clock.start();
    const loop = (t: number) => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (t - this.lastDraw < 1000 / this.fps - 2) return;
      this.lastDraw = t;
      this.update(Math.min(0.05, this.clock.getDelta()));
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  /** Render one still frame of a clip as a transparent PNG (used for the home-screen widget and the roaming overlay). */
  snapshot(clip: DogClip, time: number, opts: { size?: number; yaw?: number; side?: boolean } = {}): string {
    const size = opts.size ?? 256;
    const prevAspect = this.camera.aspect;
    const w = this.canvas.width, h = this.canvas.height, pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    const a = this.actions.get(clip);
    if (a && this.mixer) {
      for (const x of this.actions.values()) x.stop();
      a.reset().setEffectiveWeight(1).play(); a.time = time % a.getClip().duration; this.mixer.update(0);
    }
    const prevYaw = this.root.rotation.y; this.root.rotation.y = opts.yaw ?? 1.0;
    const prevFrame = { ...this.frame };
    this.frame = { dist: 3.7, targetY: 0.42, fov: 26 };
    for (const u of this.furUniforms) u['uTime'].value = 0;
    this.draw();
    const url = this.canvas.toDataURL('image/png');
    this.frame = prevFrame; this.root.rotation.y = prevYaw;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w / pr, h / pr, false);
    this.camera.aspect = prevAspect;
    if (this.current && this.mixer) { for (const x of this.actions.values()) x.stop(); this.current.paused = false; this.current.reset().play(); }
    return url;
  }

  dispose() {
    this.disposed = true; this.stop();
    this.mixer?.stopAllAction();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mt) ? mt : [mt]).forEach(x => x?.dispose?.()); } });
    this.renderer.dispose();
  }
}
