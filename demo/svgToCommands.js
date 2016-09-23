const simplify = require('simplify-path');
const getContours = require('svg-path-contours');
const parseSVG = require('parse-svg-path');
const normalize = require('normalize-path-scale');
const defined = require('defined');

module.exports = function (paths, opt = {}) {
  const svg = parseSVG(paths);
  const scale = defined(opt.scale, 1);
  const simplifyThreshold = defined(opt.simplify, 0.05);
  const contours = getContours(svg, scale).map(c => {
    return simplify(c, simplifyThreshold);
  });

  let min = [ +Infinity, +Infinity ];
  let max = [ -Infinity, -Infinity ];
  for (let i = 0; i < contours.length; i++) {
    for (let p = 0; p < contours[i].length; p++) {
      const point = contours[i][p];
      if (point[0] > max[0]) max[0] = point[0];
      if (point[1] > max[1]) max[1] = point[1];
      if (point[0] < min[0]) min[0] = point[0];
      if (point[1] < min[1]) min[1] = point[1];
    }
  }

  const bounds = [ min, max ];
  const commands = contours.map(c => {
    if (opt.normalize !== false) {
      normalize(c, bounds);
    }
    return c.map((p, i) => {
      return {
        type: i === 0 ? 'M' : 'L',
        position: p
      };
    });
  }).reduce((a, b) => a.concat(b), []);
  return commands;
};

/*
// Some canvas rendering code for testing...
const paths = require('extract-svg-path')(__dirname + '/icon.svg');
const commands = module.exports(paths);
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 512;
canvas.height = 512;

ctx.translate(256, 256);
ctx.scale(256, 256);

ctx.beginPath();
commands.forEach(cmd => {
  if (cmd.type === 'M') {
    ctx.moveTo(cmd.position[0], cmd.position[1]);
  } else {
    ctx.lineTo(cmd.position[0], cmd.position[1]);
  }
});
ctx.lineWidth = 1 / 256;
ctx.stroke();

commands.forEach(cmd => {
  cmd.position[0] /= canvas.width;
  cmd.position[1] /= canvas.height;
});

window.cmds = JSON.stringify(commands);
// console.log(JSON.stringify(commands));

document.body.appendChild(canvas);
*/
