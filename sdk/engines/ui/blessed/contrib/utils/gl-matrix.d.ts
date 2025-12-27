/**
 * gl-matrix - Complete 1:1 TypeScript Port
 *
 * Port from gl-matrix v2.x (vec2 and mat2d modules)
 * Used by drawille-canvas for 2D transformations
 */
export declare const EPSILON = 0.000001;
export declare const ARRAY_TYPE: ArrayConstructor | Float32ArrayConstructor;
export declare const RANDOM: () => number;
/**
 * 2D Vector [x, y]
 */
export type Vec2 = Float32Array | number[];
/**
 * 2D Transformation Matrix [a, b, c, d, tx, ty]
 * Represents: | a  c  tx |
 *             | b  d  ty |
 *             | 0  0  1  |
 */
export type Mat2d = Float32Array | number[];
export declare const vec2: {
    /**
     * Creates a new, empty vec2
     */
    create(): Vec2;
    /**
     * Creates a new vec2 initialized with values from an existing vector
     */
    clone(a: Vec2): Vec2;
    /**
     * Creates a new vec2 initialized with the given values
     */
    fromValues(x: number, y: number): Vec2;
    /**
     * Copy the values from one vec2 to another
     */
    copy(out: Vec2, a: Vec2): Vec2;
    /**
     * Set the components of a vec2 to the given values
     */
    set(out: Vec2, x: number, y: number): Vec2;
    /**
     * Adds two vec2's
     */
    add(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Subtracts vector b from vector a
     */
    subtract(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Multiplies two vec2's
     */
    multiply(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Divides two vec2's
     */
    divide(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Math.ceil the components of a vec2
     */
    ceil(out: Vec2, a: Vec2): Vec2;
    /**
     * Math.floor the components of a vec2
     */
    floor(out: Vec2, a: Vec2): Vec2;
    /**
     * Returns the minimum of two vec2's
     */
    min(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Returns the maximum of two vec2's
     */
    max(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Math.round the components of a vec2
     */
    round(out: Vec2, a: Vec2): Vec2;
    /**
     * Scales a vec2 by a scalar number
     */
    scale(out: Vec2, a: Vec2, b: number): Vec2;
    /**
     * Adds two vec2's after scaling the second operand by a scalar value
     */
    scaleAndAdd(out: Vec2, a: Vec2, b: Vec2, scale: number): Vec2;
    /**
     * Calculates the euclidian distance between two vec2's
     */
    distance(a: Vec2, b: Vec2): number;
    /**
     * Calculates the squared euclidian distance between two vec2's
     */
    squaredDistance(a: Vec2, b: Vec2): number;
    /**
     * Calculates the length of a vec2
     */
    length(a: Vec2): number;
    /**
     * Calculates the squared length of a vec2
     */
    squaredLength(a: Vec2): number;
    /**
     * Negates the components of a vec2
     */
    negate(out: Vec2, a: Vec2): Vec2;
    /**
     * Returns the inverse of the components of a vec2
     */
    inverse(out: Vec2, a: Vec2): Vec2;
    /**
     * Normalize a vec2
     */
    normalize(out: Vec2, a: Vec2): Vec2;
    /**
     * Calculates the dot product of two vec2's
     */
    dot(a: Vec2, b: Vec2): number;
    /**
     * Computes the cross product of two vec2's
     */
    cross(out: any, a: Vec2, b: Vec2): any;
    /**
     * Performs a linear interpolation between two vec2's
     */
    lerp(out: Vec2, a: Vec2, b: Vec2, t: number): Vec2;
    /**
     * Generates a random vector with the given scale
     */
    random(out: Vec2, scale?: number): Vec2;
    /**
     * Transforms the vec2 with a mat2
     */
    transformMat2(out: Vec2, a: Vec2, m: any): Vec2;
    /**
     * Transforms the vec2 with a mat2d
     */
    transformMat2d(out: Vec2, a: Vec2, m: Mat2d): Vec2;
    /**
     * Transforms the vec2 with a mat3
     */
    transformMat3(out: Vec2, a: Vec2, m: any): Vec2;
    /**
     * Transforms the vec2 with a mat4
     */
    transformMat4(out: Vec2, a: Vec2, m: any): Vec2;
    /**
     * Rotate a 2D vector
     */
    rotate(out: Vec2, a: Vec2, b: Vec2, c: number): Vec2;
    /**
     * Get the angle between two 2D vectors
     */
    angle(a: Vec2, b: Vec2): number;
    /**
     * Returns a string representation of a vector
     */
    str(a: Vec2): string;
    /**
     * Returns whether or not the vectors exactly have the same elements
     */
    exactEquals(a: Vec2, b: Vec2): boolean;
    /**
     * Returns whether or not the vectors have approximately the same elements
     */
    equals(a: Vec2, b: Vec2): boolean;
    /**
     * Alias for length
     */
    len(a: Vec2): number;
    /**
     * Alias for subtract
     */
    sub(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Alias for multiply
     */
    mul(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Alias for divide
     */
    div(out: Vec2, a: Vec2, b: Vec2): Vec2;
    /**
     * Alias for distance
     */
    dist(a: Vec2, b: Vec2): number;
    /**
     * Alias for squaredDistance
     */
    sqrDist(a: Vec2, b: Vec2): number;
    /**
     * Alias for squaredLength
     */
    sqrLen(a: Vec2): number;
    /**
     * Perform operation over an array of vec2s
     */
    forEach(a: number[], stride: number, offset: number, count: number, fn: (vec: Vec2, vec2: Vec2, arg?: any) => void, arg?: any): number[];
};
export declare const mat2d: {
    /**
     * Creates a new identity mat2d
     */
    create(): Mat2d;
    /**
     * Creates a new mat2d initialized with values from an existing matrix
     */
    clone(a: Mat2d): Mat2d;
    /**
     * Copy the values from one mat2d to another
     */
    copy(out: Mat2d, a: Mat2d): Mat2d;
    /**
     * Set a mat2d to the identity matrix
     */
    identity(out: Mat2d): Mat2d;
    /**
     * Create a new mat2d with the given values
     */
    fromValues(a: number, b: number, c: number, d: number, tx: number, ty: number): Mat2d;
    /**
     * Set the components of a mat2d to the given values
     */
    set(out: Mat2d, a: number, b: number, c: number, d: number, tx: number, ty: number): Mat2d;
    /**
     * Inverts a mat2d
     */
    invert(out: Mat2d, a: Mat2d): Mat2d | null;
    /**
     * Calculates the determinant of a mat2d
     */
    determinant(a: Mat2d): number;
    /**
     * Multiplies two mat2d's
     */
    multiply(out: Mat2d, a: Mat2d, b: Mat2d): Mat2d;
    /**
     * Rotates a mat2d by the given angle
     */
    rotate(out: Mat2d, a: Mat2d, rad: number): Mat2d;
    /**
     * Scales the mat2d by the dimensions in the given vec2
     */
    scale(out: Mat2d, a: Mat2d, v: Vec2): Mat2d;
    /**
     * Translates the mat2d by the dimensions in the given vec2
     */
    translate(out: Mat2d, a: Mat2d, v: Vec2): Mat2d;
    /**
     * Creates a matrix from a given angle
     */
    fromRotation(out: Mat2d, rad: number): Mat2d;
    /**
     * Creates a matrix from a vector scaling
     */
    fromScaling(out: Mat2d, v: Vec2): Mat2d;
    /**
     * Creates a matrix from a vector translation
     */
    fromTranslation(out: Mat2d, v: Vec2): Mat2d;
    /**
     * Returns a string representation of a mat2d
     */
    str(a: Mat2d): string;
    /**
     * Returns Frobenius norm of a mat2d
     */
    frob(a: Mat2d): number;
    /**
     * Adds two mat2d's
     */
    add(out: Mat2d, a: Mat2d, b: Mat2d): Mat2d;
    /**
     * Subtracts matrix b from matrix a
     */
    subtract(out: Mat2d, a: Mat2d, b: Mat2d): Mat2d;
    /**
     * Multiply each element of the matrix by a scalar
     */
    multiplyScalar(out: Mat2d, a: Mat2d, b: number): Mat2d;
    /**
     * Adds two mat2d's after multiplying each element of the second operand by a scalar
     */
    multiplyScalarAndAdd(out: Mat2d, a: Mat2d, b: Mat2d, scale: number): Mat2d;
    /**
     * Returns whether or not the matrices have exactly the same elements
     */
    exactEquals(a: Mat2d, b: Mat2d): boolean;
    /**
     * Returns whether or not the matrices have approximately the same elements
     */
    equals(a: Mat2d, b: Mat2d): boolean;
    /**
     * Alias for multiply
     */
    mul(out: Mat2d, a: Mat2d, b: Mat2d): Mat2d;
    /**
     * Alias for subtract
     */
    sub(out: Mat2d, a: Mat2d, b: Mat2d): Mat2d;
};
