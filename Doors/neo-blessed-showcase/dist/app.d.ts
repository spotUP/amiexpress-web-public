/**
 * Neo-Blessed Showcase v2.0.BUILD_TIMESTAMP
 *
 * COMPREHENSIVE interactive demo of ALL neo-blessed widgets and features.
 * Use this to test and validate neo-blessed functionality.
 *
 * Widget Categories:
 * 1. Basic Widgets: Box, Text, Line, ScrollableBox, ScrollableText
 * 2. List Widgets: List, ListTable, Listbar
 * 3. Input Widgets: Textbox, Textarea, Passbox, Checkbox, RadioButton, RadioSet
 * 4. Dialog Widgets: Message, Question, Prompt, Loading, Overlay
 * 5. Data Widgets: Table, Log, BigText
 * 6. Interactive: Button, Form, Layout
 * 7. Media Widgets: Canvas, Image, ANSIImage, Video, IFrame
 * 8. Special: FileManager, FileBox, Terminal, Viewport
 * 9. Contrib Charts: Line, Bar, StackedBar, Donut, Sparkline
 * 10. Contrib Gauges: Gauge, GaugeList, LCD
 * 11. Contrib Data: Tree, Table, Log, Map, Picture, Markdown
 * 12. Contrib Layouts: Grid, Carousel
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function createApp(session: DoorSession): Promise<{
    run(): Promise<void>;
}>;
export {};
//# sourceMappingURL=app.d.ts.map