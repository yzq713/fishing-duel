import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
window.THREE.GLTFLoader = GLTFLoader;
window.THREE.skeletonClone = skeletonClone;
