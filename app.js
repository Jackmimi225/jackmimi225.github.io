console.log('[app] loaded', new Date().toISOString());
window.addEventListener('error', e => console.log('[app] error', e.message));

// 使用固定版本的 Three.js CDN（ESM）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// ========== DOM ==========
const container = document.getElementById('scene');
const overlay   = document.getElementById('overlay');
const statusEl  = document.getElementById('status');
const barFill   = document.getElementById('barFill');

// 模型路径：请确保 /assets/pingpong.glb?v=2 存在
const MODEL_URL = 'assets/pingpong.glb?v=2';

// ========== 基础 ==========
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f13);

// 相机
const camera = new THREE.PerspectiveCamera(
  50,
  container.clientWidth / container.clientHeight,
  0.01,
  200
);
camera.position.set(0.8, 0.6, 1.2);

// 轨道控制
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 0.2;
controls.maxDistance = 6;
controls.target.set(0, 0, 0);

// 灯光：柔一点，避免过曝
const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(2.5, 3.0, 2.0);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
scene.add(dir);

// 地板微弱反射（可选）
const groundGeo = new THREE.CircleGeometry(5, 64);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x111216, metalness: 0.05, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.001;
ground.receiveShadow = true;
scene.add(ground);

// ========== 加载模型 ==========
const loader = new GLTFLoader();
statusEl.textContent = '开始请求模型文件…';

loader.load(
  MODEL_URL,
  (gltf) => {
    // 成功
    statusEl.textContent = '模型解析成功，正在放置…';

    const root = gltf.scene || gltf.scenes[0];
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material && obj.material.map) {
          obj.material.map.anisotropy = 8;
        }
      }
    });

    // 居中 & 适配镜头
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // 将模型中心移到世界原点，稍微抬高一点
    root.position.x += (root.position.x - center.x);
    root.position.y += (root.position.y - center.y) + size.y * 0.02;
    root.position.z += (root.position.z - center.z);

    scene.add(root);

    // 根据包围球调整相机距离
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const fov = camera.fov * (Math.PI / 180);
    const dist = (sphere.radius / Math.sin(fov / 2)) * 1.2; // 适度留白
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.9);
    controls.target.copy(new THREE.Vector3(center.x, center.y, center.z));
    controls.update();

    hideOverlay();
  },
  (xhr) => {
    // 进度
    if (xhr.lengthComputable) {
      const p = (xhr.loaded / xhr.total) * 100;
      barFill.style.width = `${p.toFixed(1)}%`;
      statusEl.textContent = `下载中 ${p.toFixed(1)}%…`;
    } else {
      statusEl.textContent = '下载中…';
    }
  },
  (err) => {
    // 失败
    console.error('GLB 加载失败：', err);
    statusEl.textContent = '加载失败：请检查路径 /assets/pingpong.glb?v=2 是否存在（大小写、目录、缓存）。';
    barFill.style.width = '0%';
    // 不再放置兜底几何体，避免“十二面体”误导
  }
);

// ========== 自适应 ==========
function onResize(){
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ========== 动画循环 ==========
function tick(){
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ========== 覆盖层控制 ==========
function hideOverlay(){
  overlay.classList.add('hidden');
  statusEl.textContent = '';
}

