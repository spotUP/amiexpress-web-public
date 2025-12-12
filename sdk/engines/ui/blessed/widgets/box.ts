/**
 * Box widget - Basic container with border support
 */

import { Element } from '../core/element';
import type { ElementOptions } from '../core/types';

export class Box extends Element {
  constructor(options: ElementOptions = {}) {
    super(options);
  }
}
