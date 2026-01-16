"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mat2d = exports.vec2 = exports.RANDOM = exports.ARRAY_TYPE = exports.EPSILON = void 0;
exports.EPSILON = 0.000001;
exports.ARRAY_TYPE = typeof Float32Array !== 'undefined' ? Float32Array : Array;
exports.RANDOM = Math.random;
exports.vec2 = {
    create() {
        const out = new exports.ARRAY_TYPE(2);
        if (exports.ARRAY_TYPE !== Float32Array) {
            out[0] = 0;
            out[1] = 0;
        }
        return out;
    },
    clone(a) {
        const out = new exports.ARRAY_TYPE(2);
        out[0] = a[0];
        out[1] = a[1];
        return out;
    },
    fromValues(x, y) {
        const out = new exports.ARRAY_TYPE(2);
        out[0] = x;
        out[1] = y;
        return out;
    },
    copy(out, a) {
        out[0] = a[0];
        out[1] = a[1];
        return out;
    },
    set(out, x, y) {
        out[0] = x;
        out[1] = y;
        return out;
    },
    add(out, a, b) {
        out[0] = a[0] + b[0];
        out[1] = a[1] + b[1];
        return out;
    },
    subtract(out, a, b) {
        out[0] = a[0] - b[0];
        out[1] = a[1] - b[1];
        return out;
    },
    multiply(out, a, b) {
        out[0] = a[0] * b[0];
        out[1] = a[1] * b[1];
        return out;
    },
    divide(out, a, b) {
        out[0] = a[0] / b[0];
        out[1] = a[1] / b[1];
        return out;
    },
    ceil(out, a) {
        out[0] = Math.ceil(a[0]);
        out[1] = Math.ceil(a[1]);
        return out;
    },
    floor(out, a) {
        out[0] = Math.floor(a[0]);
        out[1] = Math.floor(a[1]);
        return out;
    },
    min(out, a, b) {
        out[0] = Math.min(a[0], b[0]);
        out[1] = Math.min(a[1], b[1]);
        return out;
    },
    max(out, a, b) {
        out[0] = Math.max(a[0], b[0]);
        out[1] = Math.max(a[1], b[1]);
        return out;
    },
    round(out, a) {
        out[0] = Math.round(a[0]);
        out[1] = Math.round(a[1]);
        return out;
    },
    scale(out, a, b) {
        out[0] = a[0] * b;
        out[1] = a[1] * b;
        return out;
    },
    scaleAndAdd(out, a, b, scale) {
        out[0] = a[0] + b[0] * scale;
        out[1] = a[1] + b[1] * scale;
        return out;
    },
    distance(a, b) {
        const x = b[0] - a[0];
        const y = b[1] - a[1];
        return Math.sqrt(x * x + y * y);
    },
    squaredDistance(a, b) {
        const x = b[0] - a[0];
        const y = b[1] - a[1];
        return x * x + y * y;
    },
    length(a) {
        const x = a[0];
        const y = a[1];
        return Math.sqrt(x * x + y * y);
    },
    squaredLength(a) {
        const x = a[0];
        const y = a[1];
        return x * x + y * y;
    },
    negate(out, a) {
        out[0] = -a[0];
        out[1] = -a[1];
        return out;
    },
    inverse(out, a) {
        out[0] = 1.0 / a[0];
        out[1] = 1.0 / a[1];
        return out;
    },
    normalize(out, a) {
        const x = a[0];
        const y = a[1];
        let len = x * x + y * y;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
            out[0] = a[0] * len;
            out[1] = a[1] * len;
        }
        return out;
    },
    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1];
    },
    cross(out, a, b) {
        const z = a[0] * b[1] - a[1] * b[0];
        out[0] = out[1] = 0;
        out[2] = z;
        return out;
    },
    lerp(out, a, b, t) {
        const ax = a[0];
        const ay = a[1];
        out[0] = ax + t * (b[0] - ax);
        out[1] = ay + t * (b[1] - ay);
        return out;
    },
    random(out, scale) {
        scale = scale || 1.0;
        const r = (0, exports.RANDOM)() * 2.0 * Math.PI;
        out[0] = Math.cos(r) * scale;
        out[1] = Math.sin(r) * scale;
        return out;
    },
    transformMat2(out, a, m) {
        const x = a[0];
        const y = a[1];
        out[0] = m[0] * x + m[2] * y;
        out[1] = m[1] * x + m[3] * y;
        return out;
    },
    transformMat2d(out, a, m) {
        const x = a[0];
        const y = a[1];
        out[0] = m[0] * x + m[2] * y + m[4];
        out[1] = m[1] * x + m[3] * y + m[5];
        return out;
    },
    transformMat3(out, a, m) {
        const x = a[0];
        const y = a[1];
        out[0] = m[0] * x + m[3] * y + m[6];
        out[1] = m[1] * x + m[4] * y + m[7];
        return out;
    },
    transformMat4(out, a, m) {
        const x = a[0];
        const y = a[1];
        out[0] = m[0] * x + m[4] * y + m[12];
        out[1] = m[1] * x + m[5] * y + m[13];
        return out;
    },
    rotate(out, a, b, c) {
        const p0 = a[0] - b[0];
        const p1 = a[1] - b[1];
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);
        out[0] = p0 * cosC - p1 * sinC + b[0];
        out[1] = p0 * sinC + p1 * cosC + b[1];
        return out;
    },
    angle(a, b) {
        const x1 = a[0];
        const y1 = a[1];
        const x2 = b[0];
        const y2 = b[1];
        let len1 = x1 * x1 + y1 * y1;
        if (len1 > 0) {
            len1 = 1 / Math.sqrt(len1);
        }
        let len2 = x2 * x2 + y2 * y2;
        if (len2 > 0) {
            len2 = 1 / Math.sqrt(len2);
        }
        const cosine = (x1 * x2 + y1 * y2) * len1 * len2;
        if (cosine > 1.0) {
            return 0;
        }
        else if (cosine < -1.0) {
            return Math.PI;
        }
        else {
            return Math.acos(cosine);
        }
    },
    str(a) {
        return 'vec2(' + a[0] + ', ' + a[1] + ')';
    },
    exactEquals(a, b) {
        return a[0] === b[0] && a[1] === b[1];
    },
    equals(a, b) {
        const a0 = a[0], a1 = a[1];
        const b0 = b[0], b1 = b[1];
        return (Math.abs(a0 - b0) <= exports.EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) &&
            Math.abs(a1 - b1) <= exports.EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)));
    },
    len(a) {
        return exports.vec2.length(a);
    },
    sub(out, a, b) {
        return exports.vec2.subtract(out, a, b);
    },
    mul(out, a, b) {
        return exports.vec2.multiply(out, a, b);
    },
    div(out, a, b) {
        return exports.vec2.divide(out, a, b);
    },
    dist(a, b) {
        return exports.vec2.distance(a, b);
    },
    sqrDist(a, b) {
        return exports.vec2.squaredDistance(a, b);
    },
    sqrLen(a) {
        return exports.vec2.squaredLength(a);
    },
    forEach(a, stride, offset, count, fn, arg) {
        const vec = exports.vec2.create();
        let i, l;
        if (!stride) {
            stride = 2;
        }
        if (!offset) {
            offset = 0;
        }
        if (count) {
            l = Math.min(count * stride + offset, a.length);
        }
        else {
            l = a.length;
        }
        for (i = offset; i < l; i += stride) {
            vec[0] = a[i];
            vec[1] = a[i + 1];
            fn(vec, vec, arg);
            a[i] = vec[0];
            a[i + 1] = vec[1];
        }
        return a;
    }
};
exports.mat2d = {
    create() {
        const out = new exports.ARRAY_TYPE(6);
        if (exports.ARRAY_TYPE !== Float32Array) {
            out[1] = 0;
            out[2] = 0;
            out[4] = 0;
            out[5] = 0;
        }
        out[0] = 1;
        out[3] = 1;
        return out;
    },
    clone(a) {
        const out = new exports.ARRAY_TYPE(6);
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        out[3] = a[3];
        out[4] = a[4];
        out[5] = a[5];
        return out;
    },
    copy(out, a) {
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        out[3] = a[3];
        out[4] = a[4];
        out[5] = a[5];
        return out;
    },
    identity(out) {
        out[0] = 1;
        out[1] = 0;
        out[2] = 0;
        out[3] = 1;
        out[4] = 0;
        out[5] = 0;
        return out;
    },
    fromValues(a, b, c, d, tx, ty) {
        const out = new exports.ARRAY_TYPE(6);
        out[0] = a;
        out[1] = b;
        out[2] = c;
        out[3] = d;
        out[4] = tx;
        out[5] = ty;
        return out;
    },
    set(out, a, b, c, d, tx, ty) {
        out[0] = a;
        out[1] = b;
        out[2] = c;
        out[3] = d;
        out[4] = tx;
        out[5] = ty;
        return out;
    },
    invert(out, a) {
        const aa = a[0], ab = a[1], ac = a[2], ad = a[3];
        const atx = a[4], aty = a[5];
        let det = aa * ad - ab * ac;
        if (!det) {
            return null;
        }
        det = 1.0 / det;
        out[0] = ad * det;
        out[1] = -ab * det;
        out[2] = -ac * det;
        out[3] = aa * det;
        out[4] = (ac * aty - ad * atx) * det;
        out[5] = (ab * atx - aa * aty) * det;
        return out;
    },
    determinant(a) {
        return a[0] * a[3] - a[1] * a[2];
    },
    multiply(out, a, b) {
        const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
        const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];
        out[0] = a0 * b0 + a2 * b1;
        out[1] = a1 * b0 + a3 * b1;
        out[2] = a0 * b2 + a2 * b3;
        out[3] = a1 * b2 + a3 * b3;
        out[4] = a0 * b4 + a2 * b5 + a4;
        out[5] = a1 * b4 + a3 * b5 + a5;
        return out;
    },
    rotate(out, a, rad) {
        const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
        const s = Math.sin(rad);
        const c = Math.cos(rad);
        out[0] = a0 * c + a2 * s;
        out[1] = a1 * c + a3 * s;
        out[2] = a0 * -s + a2 * c;
        out[3] = a1 * -s + a3 * c;
        out[4] = a4;
        out[5] = a5;
        return out;
    },
    scale(out, a, v) {
        const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
        const v0 = v[0], v1 = v[1];
        out[0] = a0 * v0;
        out[1] = a1 * v0;
        out[2] = a2 * v1;
        out[3] = a3 * v1;
        out[4] = a4;
        out[5] = a5;
        return out;
    },
    translate(out, a, v) {
        const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
        const v0 = v[0], v1 = v[1];
        out[0] = a0;
        out[1] = a1;
        out[2] = a2;
        out[3] = a3;
        out[4] = a0 * v0 + a2 * v1 + a4;
        out[5] = a1 * v0 + a3 * v1 + a5;
        return out;
    },
    fromRotation(out, rad) {
        const s = Math.sin(rad), c = Math.cos(rad);
        out[0] = c;
        out[1] = s;
        out[2] = -s;
        out[3] = c;
        out[4] = 0;
        out[5] = 0;
        return out;
    },
    fromScaling(out, v) {
        out[0] = v[0];
        out[1] = 0;
        out[2] = 0;
        out[3] = v[1];
        out[4] = 0;
        out[5] = 0;
        return out;
    },
    fromTranslation(out, v) {
        out[0] = 1;
        out[1] = 0;
        out[2] = 0;
        out[3] = 1;
        out[4] = v[0];
        out[5] = v[1];
        return out;
    },
    str(a) {
        return ('mat2d(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' + a[4] + ', ' + a[5] + ')');
    },
    frob(a) {
        return Math.sqrt(Math.pow(a[0], 2) +
            Math.pow(a[1], 2) +
            Math.pow(a[2], 2) +
            Math.pow(a[3], 2) +
            Math.pow(a[4], 2) +
            Math.pow(a[5], 2) +
            1);
    },
    add(out, a, b) {
        out[0] = a[0] + b[0];
        out[1] = a[1] + b[1];
        out[2] = a[2] + b[2];
        out[3] = a[3] + b[3];
        out[4] = a[4] + b[4];
        out[5] = a[5] + b[5];
        return out;
    },
    subtract(out, a, b) {
        out[0] = a[0] - b[0];
        out[1] = a[1] - b[1];
        out[2] = a[2] - b[2];
        out[3] = a[3] - b[3];
        out[4] = a[4] - b[4];
        out[5] = a[5] - b[5];
        return out;
    },
    multiplyScalar(out, a, b) {
        out[0] = a[0] * b;
        out[1] = a[1] * b;
        out[2] = a[2] * b;
        out[3] = a[3] * b;
        out[4] = a[4] * b;
        out[5] = a[5] * b;
        return out;
    },
    multiplyScalarAndAdd(out, a, b, scale) {
        out[0] = a[0] + b[0] * scale;
        out[1] = a[1] + b[1] * scale;
        out[2] = a[2] + b[2] * scale;
        out[3] = a[3] + b[3] * scale;
        out[4] = a[4] + b[4] * scale;
        out[5] = a[5] + b[5] * scale;
        return out;
    },
    exactEquals(a, b) {
        return (a[0] === b[0] &&
            a[1] === b[1] &&
            a[2] === b[2] &&
            a[3] === b[3] &&
            a[4] === b[4] &&
            a[5] === b[5]);
    },
    equals(a, b) {
        const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
        const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];
        return (Math.abs(a0 - b0) <= exports.EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) &&
            Math.abs(a1 - b1) <= exports.EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)) &&
            Math.abs(a2 - b2) <= exports.EPSILON * Math.max(1.0, Math.abs(a2), Math.abs(b2)) &&
            Math.abs(a3 - b3) <= exports.EPSILON * Math.max(1.0, Math.abs(a3), Math.abs(b3)) &&
            Math.abs(a4 - b4) <= exports.EPSILON * Math.max(1.0, Math.abs(a4), Math.abs(b4)) &&
            Math.abs(a5 - b5) <= exports.EPSILON * Math.max(1.0, Math.abs(a5), Math.abs(b5)));
    },
    mul(out, a, b) {
        return exports.mat2d.multiply(out, a, b);
    },
    sub(out, a, b) {
        return exports.mat2d.subtract(out, a, b);
    }
};
