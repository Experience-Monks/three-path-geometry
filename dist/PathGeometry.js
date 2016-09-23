'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var buffer = require('three-buffer-vertex-data');
var vec2 = require('gl-vec2');
var arrayEqual = require('array-equal');
var defined = require('defined');

// Avoid GC by re-using all our arrays
var tmpCurrent = [];
var tmpPrevious = [];
var tmpNext = [];
var tmpDirNext = [];
var tmpDirPrevious = [];
var tmp1 = [];
var tmp2 = [];
var tmp3 = [];
var tmp4 = [];
var tmp5 = [];
var tmp6 = [];
var tmpBevel1 = [];
var tmpBevel2 = [];
var tmpBevel3 = [];
var tmpBevel4 = [];
var tmpVert1 = [];
var tmpVert2 = [];

var PathGeometry = function (_THREE$BufferGeometry) {
  _inherits(PathGeometry, _THREE$BufferGeometry);

  function PathGeometry() {
    var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, PathGeometry);

    var _this = _possibleConstructorReturn(this, (PathGeometry.__proto__ || Object.getPrototypeOf(PathGeometry)).call(this));

    _this._cellOffset = 0;
    _this._cells = [];
    _this._positions = [];
    _this.thickness = defined(opt.thickness, 1);
    _this.miterLimit = defined(opt.miterLimit, 8);
    return _this;
  }

  _createClass(PathGeometry, [{
    key: '_clearArrays',
    value: function _clearArrays() {
      this._positions.length = 0;
      this._cells.length = 0;
      this._cellOffset = 0;
    }
  }, {
    key: 'clear',
    value: function clear() {
      this._clearArrays();
      this._updateBuffers();
    }
  }, {
    key: 'update',
    value: function update(path) {
      this._clearArrays();
      this.append(path);
    }
  }, {
    key: 'append',
    value: function append(path) {
      path = this._cleanPath(path);
      if (path.length === 0) return;

      for (var i = 0; i < path.length; i++) {
        var current = path[i];
        var next = i === path.length - 1 ? current : path[i + 1];
        var previous = i === 0 ? current : path[i - 1];
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
  }, {
    key: '_updateBuffers',
    value: function _updateBuffers() {
      buffer.index(this, this._cells, 1, this._cells.length > 65535 ? 'uint32' : 'uint16');
      buffer.attr(this, 'position', this._positions, 2);
    }
  }, {
    key: '_toModelPosition',
    value: function _toModelPosition(out, position) {
      out[0] = position[0];
      out[1] = position[1];
      return out;
    }
  }, {
    key: '_cleanPath',
    value: function _cleanPath(path) {
      var output = [];
      var penStart = null;
      for (var i = 0; i < path.length; i++) {
        var current = path[i];
        if (i === 0 || current.type === 'M') {
          penStart = current;
          continue;
        }
        var next = i === path.length - 1 ? current : path[i + 1];
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
  }, {
    key: '_newSegment',
    value: function _newSegment() {
      if (this._cellOffset > 0) this._cellOffset += 2;
    }
  }, {
    key: '_addSegment',
    value: function _addSegment(currentCommand, previousCommand, nextCommand) {
      var current = this._toModelPosition(tmpCurrent, currentCommand.position);
      var previous = this._toModelPosition(tmpPrevious, previousCommand.position);
      var next = this._toModelPosition(tmpNext, nextCommand.position);

      var thickness = this.thickness;
      var dirPrevious = getDirection(tmpDirPrevious, current, previous);
      var dirNext = getDirection(tmpDirNext, next, current);
      var isStart = currentCommand === previousCommand;
      var isEnd = currentCommand === nextCommand;

      var dir = void 0;
      if (isStart || isEnd) {
        dir = isStart ? dirNext : dirPrevious;

        var len = thickness;
        var normal = vec2.set(tmp1, -dir[1], dir[0]);
        var vertexA = vec2.scaleAndAdd(tmp2, current, normal, 1 * len / 2);
        var vertexB = vec2.scaleAndAdd(tmp3, current, normal, -1 * len / 2);

        this._positions.push(vertexA.slice(), vertexB.slice());
        if (!isEnd) {
          // if we still have another edge coming up next
          var off = this._cellOffset;
          pushTris(this._cells, off, 0, 1, 2, 2, 1, 3);
          this._cellOffset += 2;
        }
      } else {
        // We are at a join.. need to add an extra triangle
        var tangent = vec2.add(tmp1, dirPrevious, dirNext);
        vec2.normalize(tangent, tangent);

        var miter = vec2.set(tmp2, -tangent[1], tangent[0]);
        var perpendicular = vec2.set(tmp3, -dirPrevious[1], dirPrevious[0]);
        var miterDot = vec2.dot(miter, perpendicular);
        var miterLen = miterDot === 0 ? 0 : thickness / miterDot;

        // bevel line end
        var miterNormal = vec2.set(tmp4, -tangent[1], tangent[0]);
        var isInside = vec2.dot(miterNormal, dirPrevious) < 0;

        // The miter points
        var miterVertexA = vec2.scaleAndAdd(tmpVert1, current, miterNormal, 1 * miterLen / 2);
        var miterVertexB = vec2.scaleAndAdd(tmpVert2, current, miterNormal, -1 * miterLen / 2);

        // bevel line next start
        var _len = thickness;
        var normalA = vec2.set(tmp5, -dirPrevious[1], dirPrevious[0]);
        var normalB = vec2.set(tmp6, -dirNext[1], dirNext[0]);
        var bevelA1 = vec2.scaleAndAdd(tmpBevel1, current, normalA, 1 * _len / 2);
        var bevelA2 = vec2.scaleAndAdd(tmpBevel2, current, normalA, -1 * _len / 2);
        var bevelB1 = vec2.scaleAndAdd(tmpBevel3, current, normalB, 1 * _len / 2);
        var bevelB2 = vec2.scaleAndAdd(tmpBevel4, current, normalB, -1 * _len / 2);

        // inside
        var _off = this._cellOffset;
        var miterLimit = this.miterLimit;
        var doJoin = miterLen !== 0 && miterLen / thickness <= miterLimit;
        if (doJoin) {
          // We want to join with miter or bevel
          if (isInside) {
            this._positions.push(miterVertexA.slice(), bevelA2.slice(), bevelB2.slice());
          } else {
            this._positions.push(bevelA1.slice(), miterVertexB.slice(), bevelB1.slice());
          }
          // bevel triangle
          pushTris(this._cells, _off, 0, 1, 2);

          if (isInside) {
            pushTris(this._cells, _off, 0, 2, 3, 3, 2, 4);
          } else {
            pushTris(this._cells, _off, 1, 2, 4, 4, 3, 2);
          }
          this._cellOffset += 3;
        } else {
          // We want to join without any miter or bevel, this
          // is useful when we have extreme edges or exactly overlapping lines
          this._positions.push(bevelA1.slice(), bevelA2.slice());
          this._positions.push(bevelB1.slice(), bevelB2.slice());
          _off += 2;
          pushTris(this._cells, _off, 0, 1, 2, 2, 1, 3);
          this._cellOffset += 4;
        }
      }
    }
  }]);

  return PathGeometry;
}(THREE.BufferGeometry);

module.exports = PathGeometry;

function pushTris(cells, offset) {
  var args = Array.prototype.slice.call(arguments, 0);
  for (var i = 2; i < args.length; i++) {
    cells.push(offset + args[i]);
  }
}

function getDirection(out, a, b) {
  vec2.subtract(out, a, b);
  return vec2.normalize(out, out);
}