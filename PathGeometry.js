const buffer = require('three-buffer-vertex-data');
const vec2 = require('gl-vec2');
const arrayEqual = require('array-equal');
const defined = require('defined');

// Avoid GC by re-using all our arrays
const tmpCurrent = [];
const tmpPrevious = [];
const tmpNext = [];
const tmpDirNext = [];
const tmpDirPrevious = [];
const tmp1 = [];
const tmp2 = [];
const tmp3 = [];
const tmp4 = [];
const tmp5 = [];
const tmp6 = [];
const tmpBevel1 = [];
const tmpBevel2 = [];
const tmpBevel3 = [];
const tmpBevel4 = [];
const tmpVert1 = [];
const tmpVert2 = [];

class PathGeometry extends THREE.BufferGeometry {

  constructor (opt = {}) {
    super();
    this._cellOffset = 0;
    this._cells = [];
    this._positions = [];
    this.thickness = defined(opt.thickness, 1);
    this.miterLimit = defined(opt.miterLimit, 8);
  }

  _clearArrays () {
    this._positions.length = 0;
    this._cells.length = 0;
    this._cellOffset = 0;
  }

  clear () {
    this._clearArrays();
    this._updateBuffers();
  }

  update (path) {
    this._clearArrays();
    this.append(path);
  }

  append (path) {
    path = this._cleanPath(path);
    if (path.length === 0) return;

    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      let next = i === path.length - 1 ? current : path[i + 1];
      let previous = i === 0 ? current : path[i - 1];
      if (current.type === 'M' && current !== next && next.type === 'M') {
        // skip consecutive moveTos
        continue;
      }

      // if next point is a move, end this line here
      if (next !== current && next.type === 'M') {
        next = current;
      }

      // if we need to skip to a new line segment
      if (current.type === 'M' && this._positions.length > 0) {
        this._newSegment();
        previous = current;
      }
      this._addSegment(current, previous, next);
    }

    // now update the buffers with float/short data
    this._updateBuffers();
  }

  _updateBuffers () {
    buffer.index(this, this._cells, 1, this._cells.length > 65535 ? 'uint32' : 'uint16');
    buffer.attr(this, 'position', this._positions, 2);
  }

  _toModelPosition (out, position) {
    out[0] = position[0];
    out[1] = position[1];
    return out;
  }

  _cleanPath (path) {
    const output = [];
    let penStart = null;
    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      if (i === 0 || current.type === 'M') {
        penStart = current;
        continue;
      }
      let next = i === path.length - 1 ? current : path[i + 1];
      // if next lineTo is at the same spot as current lineTo
      if (i < path.length - 1 && arrayEqual(current.position, next.position) && current.type === 'L' && next.type === 'L') {
        // just skip for next command
        continue;
      }
      if (penStart) {
        output.push({ type: 'M', position: penStart.position.slice() });
        penStart = null;
      }
      output.push(current);
    }
    return output;
  }

  _newSegment () {
    if (this._cellOffset > 0) this._cellOffset += 2;
  }

  _addSegment (currentCommand, previousCommand, nextCommand) {
    const current = this._toModelPosition(tmpCurrent, currentCommand.position);
    const previous = this._toModelPosition(tmpPrevious, previousCommand.position);
    const next = this._toModelPosition(tmpNext, nextCommand.position);

    const thickness = this.thickness;
    const dirPrevious = getDirection(tmpDirPrevious, current, previous);
    const dirNext = getDirection(tmpDirNext, next, current);
    const isStart = currentCommand === previousCommand;
    const isEnd = currentCommand === nextCommand;

    let dir;
    if (isStart || isEnd) {
      dir = isStart ? dirNext : dirPrevious;

      const len = thickness;
      const normal = vec2.set(tmp1, -dir[1], dir[0]);
      const vertexA = vec2.scaleAndAdd(tmp2, current, normal, 1 * len / 2);
      const vertexB = vec2.scaleAndAdd(tmp3, current, normal, -1 * len / 2);

      this._positions.push(vertexA.slice(), vertexB.slice());
      if (!isEnd) {
        // if we still have another edge coming up next
        const off = this._cellOffset;
        pushTris(this._cells, off, 0, 1, 2, 2, 1, 3);
        this._cellOffset += 2;
      }
    } else {
      // We are at a join.. need to add an extra triangle
      const tangent = vec2.add(tmp1, dirPrevious, dirNext);
      vec2.normalize(tangent, tangent);

      const miter = vec2.set(tmp2, -tangent[1], tangent[0]);
      const perpendicular = vec2.set(tmp3, -dirPrevious[1], dirPrevious[0]);
      const miterDot = vec2.dot(miter, perpendicular);
      const miterLen = miterDot === 0 ? 0 : (thickness / miterDot);

      // bevel line end
      const miterNormal = vec2.set(tmp4, -tangent[1], tangent[0]);
      const isInside = vec2.dot(miterNormal, dirPrevious) < 0;

      // The miter points
      const miterVertexA = vec2.scaleAndAdd(tmpVert1, current, miterNormal, 1 * miterLen / 2);
      const miterVertexB = vec2.scaleAndAdd(tmpVert2, current, miterNormal, -1 * miterLen / 2);

      // bevel line next start
      const len = thickness;
      const normalA = vec2.set(tmp5, -dirPrevious[1], dirPrevious[0]);
      const normalB = vec2.set(tmp6, -dirNext[1], dirNext[0]);
      const bevelA1 = vec2.scaleAndAdd(tmpBevel1, current, normalA, 1 * len / 2);
      const bevelA2 = vec2.scaleAndAdd(tmpBevel2, current, normalA, -1 * len / 2);
      const bevelB1 = vec2.scaleAndAdd(tmpBevel3, current, normalB, 1 * len / 2);
      const bevelB2 = vec2.scaleAndAdd(tmpBevel4, current, normalB, -1 * len / 2);

      // inside
      let off = this._cellOffset;
      const miterLimit = this.miterLimit;
      const doJoin = miterLen !== 0 && (miterLen / thickness) <= miterLimit;
      if (doJoin) {
        // We want to join with miter or bevel
        if (isInside) {
          this._positions.push(miterVertexA.slice(), bevelA2.slice(), bevelB2.slice());
        } else {
          this._positions.push(bevelA1.slice(), miterVertexB.slice(), bevelB1.slice());
        }
        // bevel triangle
        pushTris(this._cells, off, 0, 1, 2);

        if (isInside) {
          pushTris(this._cells, off, 0, 2, 3, 3, 2, 4);
        } else {
          pushTris(this._cells, off, 1, 2, 4, 4, 3, 2);
        }
        this._cellOffset += 3;
      } else {
        // We want to join without any miter or bevel, this
        // is useful when we have extreme edges or exactly overlapping lines
        this._positions.push(bevelA1.slice(), bevelA2.slice());
        this._positions.push(bevelB1.slice(), bevelB2.slice());
        off += 2;
        pushTris(this._cells, off, 0, 1, 2, 2, 1, 3);
        this._cellOffset += 4;
      }
    }
  }
}

module.exports = PathGeometry;

function pushTris (cells, offset) {
  const args = Array.prototype.slice.call(arguments, 0);
  for (let i = 2; i < args.length; i++) {
    cells.push(offset + args[i]);
  }
}

function getDirection (out, a, b) {
  vec2.subtract(out, a, b);
  return vec2.normalize(out, out);
}
