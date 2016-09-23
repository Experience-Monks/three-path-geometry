global.THREE = require('three');

const PathGeometry = require('../');
const svgToCommands = require('./svgToCommands');
const svgPaths = require('extract-svg-path')(__dirname + '/icon.svg');

start();

function start () {
  const simplifies = [ 0, 10, 20, 30, 40, 50 ];
  const count = simplifies.length;
  const scale = 150;
  const width = scale * count;
  const height = scale;
  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.sortObjects = false;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);
  document.body.style.overflow = 'hidden';
  document.body.style.margin = '20px';

  renderer.setClearColor(new THREE.Color('hsl(0, 0%, 90%)'), 1);

  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, -height / 2, height / 2, -100, 100);
  const scene = new THREE.Scene();

  const pathGeometry = new PathGeometry({
    thickness: 2 / scale,
    miterLimit: Infinity
  });
  const pathMesh = new THREE.Mesh(pathGeometry, new THREE.MeshBasicMaterial({
    color: 'hsl(0, 0%, 15%)',
    side: THREE.DoubleSide
  }));

  // ensure frustum culling is not enabled on mesh
  pathMesh.frustumCulled = false;
  pathMesh.scale.multiplyScalar(scale * 0.40);

  // build a list of commands
  const allCommands = [];
  for (let i = 0; i < count; i++) {
    // add two paths
    const commands = svgToCommands(svgPaths, { simplify: simplifies[i] });
    const offset = ((i / (count - 1)) * 2 - 1) * (count - 1);
    commands.forEach(command => {
      command.position[0] += offset;
    });
    commands.forEach(cmd => allCommands.push(cmd));
  }

  // upload all commands at once
  pathGeometry.update(allCommands);

  scene.add(pathMesh);
  render();

  function render () {
    renderer.render(scene, camera);
  }
}
