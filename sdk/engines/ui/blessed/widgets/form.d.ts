/**
 * Form widget - Container for form elements with focus management
 */
import { Element } from '../core/element';
import type { FormOptions } from '../core/types';
export declare class Form extends Element {
    private focusableChildren;
    private focusIndex;
    constructor(options?: FormOptions);
    private _onKeypress;
    append(element: Element): void;
    remove(element: Element): void;
    private _updateFocusable;
    focusNext(): void;
    focusPrevious(): void;
    focusFirst(): void;
    focusLast(): void;
    submit(): void;
    cancel(): void;
    reset(): void;
}
//# sourceMappingURL=form.d.ts.map