// Type declaration for neo-blessed module
declare module 'neo-blessed' {
  const blessed: {
    screen(options?: any): any;
    box(options?: any): any;
    text(options?: any): any;
    list(options?: any): any;
    listbar(options?: any): any;
    form(options?: any): any;
    input(options?: any): any;
    textarea(options?: any): any;
    textbox(options?: any): any;
    button(options?: any): any;
    checkbox(options?: any): any;
    radioset(options?: any): any;
    radiobutton(options?: any): any;
    table(options?: any): any;
    listtable(options?: any): any;
    terminal(options?: any): any;
    image(options?: any): any;
    bigtext(options?: any): any;
    log(options?: any): any;
    loading(options?: any): any;
    progressbar(options?: any): any;
    message(options?: any): any;
    question(options?: any): any;
    prompt(options?: any): any;
    filemanager(options?: any): any;
    line(options?: any): any;
    scrollablebox(options?: any): any;
    scrollabletext(options?: any): any;
    layout(options?: any): any;
    colors: {
      match(color: string): number;
      blend(attr: number, attr2: number, alpha?: number): number;
      reduce(color: number, total?: number): number;
    };
  };
  export default blessed;
}
